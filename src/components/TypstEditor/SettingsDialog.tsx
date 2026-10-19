import { useEffect, useState } from 'preact/hooks'
import { Info, Sliders, Sparkles, Type, X } from 'lucide-preact'
import type { ComponentType } from 'preact'
import { version } from '../../../package.json'
import { LANGS, LANG_LABELS, type LangSetting } from '@/lib/i18n/i18n'
import { useI18n } from '@/lib/i18n/useI18n'
import type { MessageKey } from '@/lib/i18n/messages'
import type { AiSettings } from '@/lib/ai/aiSettings'
import { useAppearance } from '@/lib/appearance/useAppearance'
import AiSettingsPanel from './settings/AiSettingsPanel'
import FontsSettingsPanel from './settings/FontsSettingsPanel'

/** One page of the dialog. */
export type SettingsTab = 'general' | 'fonts' | 'ai' | 'about'

interface SettingsDialogProps {
	/** Page to open on; the language/fonts pages are the default. */
	initialTab?: SettingsTab
	/**
	 * Mobile: the settings are a page of their own, not a card on a dimmed
	 * backdrop — there is no room for a card, and a tap outside should not
	 * throw away the page the user is reading.
	 */
	isMobile?: boolean
	onClose: () => void
	aiSettings: AiSettings
	onAiSettingsChange: (changes: Partial<AiSettings>) => void
}

const TABS: { id: SettingsTab; label: MessageKey; icon: ComponentType<{ className?: string }> }[] = [
	{ id: 'general', label: 'settings.tabGeneral', icon: Sliders },
	{ id: 'fonts', label: 'settings.tabFonts', icon: Type },
	{ id: 'ai', label: 'settings.tabAi', icon: Sparkles },
	{ id: 'about', label: 'settings.tabAbout', icon: Info },
]

export default function SettingsDialog({
	initialTab = 'general',
	isMobile = false,
	onClose,
	aiSettings,
	onAiSettingsChange,
}: SettingsDialogProps) {
	const { t, langSetting, setLangSetting } = useI18n()
	const { editorWordWrap, setEditorWordWrap } = useAppearance()
	const [tab, setTab] = useState<SettingsTab>(initialTab)

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [onClose])

	return (
		<div
			className={
				isMobile
					? 'fixed inset-0 z-50 flex'
					: 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'
			}
			onClick={isMobile ? undefined : onClose}
		>
			<div
				className={
					isMobile
						? 'flex h-full w-full flex-col overflow-hidden bg-gray-800'
						: 'flex h-[min(85vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-gray-800 border border-gray-700 shadow-xl'
				}
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

				<div className="flex flex-1 min-h-0 flex-col sm:flex-row">
					<nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-700 p-2 sm:w-44 sm:flex-col sm:border-b-0 sm:border-r">
						{TABS.map(({ id, label, icon: Icon }) => (
							<button
								key={id}
								onClick={() => setTab(id)}
								className={`flex shrink-0 items-center gap-2 px-3 py-2 text-sm rounded whitespace-nowrap transition-colors ${
									tab === id
										? 'bg-blue-600 text-white'
										: 'text-gray-300 hover:bg-gray-700 hover:text-gray-100'
								}`}
							>
								<Icon className="w-4 h-4" />
								{t(label)}
							</button>
						))}
					</nav>

					<div className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
						{tab === 'general' && (
							<div>
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

								<label className="mt-4 flex items-start gap-2 text-sm text-gray-300 cursor-pointer">
									<input
										type="checkbox"
										checked={editorWordWrap}
										onChange={(e) => setEditorWordWrap(e.currentTarget.checked)}
										className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500"
									/>
									<span>
										{t('settings.wordWrap')}
										<span className="block text-xs text-gray-500">{t('settings.wordWrapHint')}</span>
									</span>
								</label>
							</div>
						)}

						{tab === 'fonts' && <FontsSettingsPanel />}

						{tab === 'ai' && (
							<AiSettingsPanel settings={aiSettings} onChange={onAiSettingsChange} />
						)}

						{tab === 'about' && (
							<div>
								<h3 className="text-sm font-semibold text-gray-200">{t('settings.about')}</h3>
								<p className="mt-2 text-sm text-gray-400">Typst Online Editor</p>
								<p className="text-sm text-gray-400">{t('settings.version', { version })}</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}