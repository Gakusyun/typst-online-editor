import { useEffect } from 'preact/hooks'
import { X } from 'lucide-preact'
import { version } from '../../../package.json'
import { LANGS, LANG_LABELS, type LangSetting } from '@/lib/i18n/i18n'
import { useI18n } from '@/lib/i18n/useI18n'

interface SettingsDialogProps {
	onClose: () => void
}

export default function SettingsDialog({ onClose }: SettingsDialogProps) {
	const { t, langSetting, setLangSetting } = useI18n()

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [onClose])

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
			onClick={onClose}
		>
			<div
				className="w-full max-w-sm rounded-lg bg-gray-800 border border-gray-700 shadow-xl"
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
						<h3 className="text-sm font-semibold text-gray-300">{t('settings.about')}</h3>
						<p className="mt-1 text-sm text-gray-400">Typst Online Editor</p>
						<p className="text-sm text-gray-400">{t('settings.version', { version })}</p>
					</div>
				</div>
			</div>
		</div>
	)
}
