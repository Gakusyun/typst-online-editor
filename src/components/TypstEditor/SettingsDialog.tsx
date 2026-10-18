import { useEffect, useState } from 'preact/hooks'
import { X, Type, ChevronUp, ChevronDown, Loader2, RefreshCw } from 'lucide-preact'
import { SUPPORTED_FONT_FAMILIES } from '@/lib/typst/fonts'
import { version } from '../../../package.json'
import { LANGS, LANG_LABELS, type LangSetting } from '@/lib/i18n/i18n'
import { useI18n } from '@/lib/i18n/useI18n'
import { normalizeFontChoice, type FontChoice } from '@/lib/appearance/appearance'
import {
	cachedSystemFonts,
	fontFamilies,
	isFontAccessBlocked,
	isFontAccessDenied,
	isSystemFontsSupported,
	querySystemFonts,
	systemFontsUnavailableReason,
	type SystemFontRegistrationError,
	type SystemFontsUnavailableReason,
} from '@/lib/fonts/localFonts'
import type { MessageKey } from '@/lib/i18n/messages'
import { useAppearance } from '@/lib/appearance/useAppearance'

interface SettingsDialogProps {
	onClose: () => void
	/** Whether the compiler reads installed fonts the document references. */
	documentSystemFonts: boolean
	onDocumentSystemFontsChange(enabled: boolean): void
}

/** Outcome of the last attempt to enumerate the machine's fonts. */
type SystemFontsState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'ready'; families: string[] }
	/** The user refused the permission. */
	| { status: 'denied' }
	/** The environment refused it (permissions policy, origin, no gesture). */
	| { status: 'blocked' }
	| { status: 'failed' }

/** The failure that explains why listing the fonts did not work. */
function failureState(error: unknown): SystemFontsState {
	if (isFontAccessDenied(error)) return { status: 'denied' }
	if (isFontAccessBlocked(error)) return { status: 'blocked' }
	return { status: 'failed' }
}

/** Why the API is missing, as a message the user can act on (`localFonts.ts`). */
const FONTS_UNAVAILABLE_MESSAGE: Record<SystemFontsUnavailableReason, MessageKey> = {
	'insecure-context': 'settings.fontsInsecureContext',
	'opaque-origin': 'settings.fontsOpaqueOrigin',
	embedded: 'settings.fontsEmbedded',
	webview: 'settings.fontsWebViewBrowser',
	ios: 'settings.fontsIosBrowser',
	mobile: 'settings.fontsMobileBrowser',
	unsupported: 'settings.fontsUnsupported',
}

/** Why a family could not be applied (`localFonts.ts`), as a message. */
const FONT_ERROR_MESSAGE: Record<SystemFontRegistrationError, MessageKey> = {
	'not-found': 'settings.fontNotFound',
	denied: 'settings.fontDenied',
	unreadable: 'settings.fontUnreadable',
	timeout: 'settings.fontUnreadable',
	failed: 'settings.fontUnreadable',
}

export default function SettingsDialog({
	onClose,
	documentSystemFonts,
	onDocumentSystemFontsChange,
}: SettingsDialogProps) {
	const { t, langSetting, setLangSetting } = useI18n()
	const { uiFont, editorFont, uiFontError, editorFontError, setUiFont, setEditorFont } = useAppearance()
	const [showFontFamilies, setShowFontFamilies] = useState(false)
	const [systemFonts, setSystemFonts] = useState<SystemFontsState>(() => {
		// Already enumerated in this session (a previous dialog, or the compile
		// path): show the names again instead of asking for another click.
		const cached = cachedSystemFonts()
		return cached ? { status: 'ready', families: fontFamilies(cached) } : { status: 'idle' }
	})
	// The inputs are controlled by their own draft so a half-typed family name
	// is not applied (and persisted) on every keystroke.
	const [uiFontDraft, setUiFontDraft] = useState(uiFont ?? '')
	const [editorFontDraft, setEditorFontDraft] = useState(editorFont ?? '')
	const fontsSupported = isSystemFontsSupported()
	const unavailableReason = systemFontsUnavailableReason()
	const unavailableNotice = unavailableReason ? t(FONTS_UNAVAILABLE_MESSAGE[unavailableReason]) : null
	const families = systemFonts.status === 'ready' ? systemFonts.families : []

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [onClose])

	/** Commit a typed/picked name: normalize, echo back, apply. */
	const commitFont = (
		value: string,
		setDraft: (draft: string) => void,
		apply: (font: FontChoice) => void
	) => {
		const choice = normalizeFontChoice(value)
		setDraft(choice ?? '')
		apply(choice)
	}

	const loadSystemFonts = async (options?: { refresh?: boolean }) => {
		setSystemFonts({ status: 'loading' })
		try {
			setSystemFonts({
				status: 'ready',
				families: fontFamilies(await querySystemFonts(options)),
			})
			return true
		} catch (error) {
			console.warn('[settings] could not list system fonts', error)
			setSystemFonts(failureState(error))
			return false
		}
	}

	/**
	 * The document fonts are read through the same permission as the pickers, and
	 * only a user gesture can grant it — so the toggle itself performs the first
	 * enumeration and reports the outcome; without it the feature cannot work, so
	 * a failure leaves the toggle off.
	 */
	const toggleDocumentSystemFonts = async () => {
		if (documentSystemFonts) {
			onDocumentSystemFontsChange(false)
			return
		}
		if (!fontsSupported) return
		if (systemFonts.status === 'ready' || (await loadSystemFonts())) {
			onDocumentSystemFontsChange(true)
		}
	}

	let systemFontsMessage = ''
	switch (systemFonts.status) {
		case 'loading':
			systemFontsMessage = t('settings.fontsLoading')
			break
		case 'ready':
			systemFontsMessage = t('settings.fontsLoaded', { count: systemFonts.families.length })
			break
		case 'denied':
			systemFontsMessage = t('settings.fontsDenied')
			break
		case 'blocked':
			systemFontsMessage = t('settings.fontsBlocked')
			break
		case 'failed':
			systemFontsMessage = t('settings.fontsFailed')
			break
		case 'idle':
			break
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
			onClick={onClose}
		>
			<div
				className="w-full max-w-sm max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg bg-gray-800 border border-gray-700 shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
					<h2 className="text-base font-semibold">{t('settings.title')}</h2>
					<button
						onClick={onClose}
						className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
						title={t('common.close')}
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				<div className="px-5 py-4">
					<label className="block text-sm text-gray-300 mb-2" htmlFor="settings-language">
						{t('settings.language')}
					</label>
					<select
						id="settings-language"
						value={langSetting}
						onChange={(e) => setLangSetting(e.currentTarget.value as LangSetting)}
						className="w-full bg-gray-700 text-gray-100 text-sm rounded border border-gray-600 px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<option value="system">{t('settings.followSystem')}</option>
						{LANGS.map((code) => (
							<option key={code} value={code}>
								{LANG_LABELS[code]}
							</option>
						))}
					</select>

					<div className="mt-5 pt-4 border-t border-gray-700">
						<h3 className="text-sm font-semibold text-gray-300">{t('settings.fonts')}</h3>

						{unavailableNotice && (
							<p className="mt-2 text-xs text-amber-400/90">{unavailableNotice}</p>
						)}

						<label className="block text-sm text-gray-300 mt-2 mb-1" htmlFor="settings-ui-font">
							{t('settings.uiFont')}
						</label>
						<input
							id="settings-ui-font"
							type="text"
							list="system-font-families"
							value={uiFontDraft}
							placeholder={t('settings.fontDefault')}
							autoComplete="off"
							spellcheck={false}
							onInput={(e) => setUiFontDraft(e.currentTarget.value)}
							onChange={(e) => commitFont(e.currentTarget.value, setUiFontDraft, setUiFont)}
							className="w-full bg-gray-700 text-gray-100 text-sm rounded border border-gray-600 px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
						{uiFontError && (
							<p className="mt-1 text-xs text-red-400/90">{t(FONT_ERROR_MESSAGE[uiFontError])}</p>
						)}

						<label className="block text-sm text-gray-300 mt-3 mb-1" htmlFor="settings-editor-font">
							{t('settings.editorFont')}
						</label>
						<input
							id="settings-editor-font"
							type="text"
							list="system-font-families"
							value={editorFontDraft}
							placeholder={t('settings.fontDefault')}
							autoComplete="off"
							spellcheck={false}
							onInput={(e) => setEditorFontDraft(e.currentTarget.value)}
							onChange={(e) => commitFont(e.currentTarget.value, setEditorFontDraft, setEditorFont)}
							className="w-full bg-gray-700 text-gray-100 text-sm rounded border border-gray-600 px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
						{editorFontError && (
							<p className="mt-1 text-xs text-red-400/90">{t(FONT_ERROR_MESSAGE[editorFontError])}</p>
						)}

						<datalist id="system-font-families">
							{families.map((family) => (
								<option key={family} value={family} />
							))}
						</datalist>

						<div className="mt-3 flex items-center gap-2">
							{fontsSupported && (
								<button
									onClick={() => loadSystemFonts({ refresh: true })}
									disabled={systemFonts.status === 'loading'}
									className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 text-white text-xs rounded hover:bg-gray-600 disabled:opacity-60 transition-colors"
								>
									{systemFonts.status === 'loading' ? (
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
									) : (
										<RefreshCw className="w-3.5 h-3.5" />
									)}
									{t('settings.loadSystemFonts')}
								</button>
							)}
							{systemFontsMessage && (
								<span className="text-xs text-gray-400">{systemFontsMessage}</span>
							)}
						</div>
						<p className="mt-2 text-xs text-gray-500">{t('settings.fontFamilyHint')}</p>

						<label className="flex items-start gap-2 mt-4 cursor-pointer">
							<input
								type="checkbox"
								checked={documentSystemFonts}
								disabled={!fontsSupported}
								onChange={() => void toggleDocumentSystemFonts()}
								className="mt-0.5 accent-blue-500"
							/>
							<span className="text-sm text-gray-300">{t('settings.documentFontsAuto')}</span>
						</label>
						{fontsSupported && (
							<p className="mt-2 text-xs text-gray-500">{t('settings.documentFontsHint')}</p>
						)}
					</div>

					<div className="mt-5 pt-4 border-t border-gray-700">
						<button
							onClick={() => setShowFontFamilies((show) => !show)}
							className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 transition-colors"
							title={t('settings.fontFamilies')}
						>
							<span className="flex items-center gap-2">
								<Type className="w-4 h-4" />
								{t('settings.fontFamilies')}
							</span>
							{showFontFamilies ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
						</button>
						{showFontFamilies && (
							<div className="mt-2 rounded border border-gray-700 bg-gray-900/50 px-3 py-2">
								<ul className="space-y-1">
									{SUPPORTED_FONT_FAMILIES.map((family) => (
										<li key={family} className="text-sm font-mono text-gray-200">
											{family}
										</li>
									))}
								</ul>
								<p className="mt-2 text-xs text-gray-400">{t('settings.fontFamiliesHint')}</p>

								<div className="mt-3 pt-2 border-t border-gray-700">
									{systemFonts.status === 'ready' ? (
										<>
											<p className="text-xs text-gray-300">
												{t('settings.systemFontFamilies', { count: families.length })}
											</p>
											<ul className="mt-1 max-h-48 overflow-y-auto space-y-0.5">
												{families.map((family) => (
													<li key={family} className="text-sm font-mono text-gray-200">
														{family}
													</li>
												))}
											</ul>
										</>
									) : (
										<p className="text-xs text-gray-500">
											{t('settings.systemFontFamiliesHint')}
										</p>
									)}
								</div>
							</div>
						)}
					</div>

					<div className="mt-5 pt-4 border-t border-gray-700">
						<h3 className="text-sm font-semibold text-gray-300">{t('settings.about')}</h3>
						<p className="mt-1 text-sm text-gray-400">Typst Online Editor</p>
						<p className="text-sm text-gray-400">{t('settings.version', { version })}</p>
					</div>
				</div>
			</div>
		</div>
	)
}