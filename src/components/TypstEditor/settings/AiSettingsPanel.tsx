import { useState } from 'preact/hooks'
import { Eye, EyeOff, RotateCcw, Trash2 } from 'lucide-preact'
import { useI18n } from '@/lib/i18n/useI18n'
import { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL, type AiSettings } from '@/lib/ai/aiSettings'
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/ai/prompt'

interface AiSettingsPanelProps {
	settings: AiSettings
	/** Persisted (and normalized) immediately. */
	onChange: (changes: Partial<AiSettings>) => void
}

const FIELD_CLASS =
	'w-full bg-gray-700 text-gray-100 text-sm rounded border border-gray-600 px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500'

/** Settings → AI: the endpoint the assistant talks to, and its prompt. */
export default function AiSettingsPanel({ settings, onChange }: AiSettingsPanelProps) {
	const { t } = useI18n()
	// Drafts: a half-typed URL is not persisted (or sent) on every keystroke.
	const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
	const [apiKey, setApiKey] = useState(settings.apiKey)
	const [model, setModel] = useState(settings.model)
	// The prompt box shows the effective prompt; the default text means "follow
	// the built-in one", so an untouched box keeps tracking future updates.
	const [prompt, setPrompt] = useState(settings.systemPrompt ?? DEFAULT_SYSTEM_PROMPT)
	const [showKey, setShowKey] = useState(false)
	// Preact types `type` as a discriminated union; a union of two of its members
	// does not narrow, so it is pinned to one of them here.
	const apiKeyInputType = (showKey ? 'text' : 'password') as 'text'

	const commitPrompt = (value: string) => {
		const trimmed = value.trim()
		const usesDefault = trimmed === '' || trimmed === DEFAULT_SYSTEM_PROMPT.trim()
		setPrompt(usesDefault ? DEFAULT_SYSTEM_PROMPT : value)
		onChange({ systemPrompt: usesDefault ? '' : value })
	}

	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-sm font-semibold text-gray-200">{t('settings.tabAi')}</h3>
				<p className="mt-1 text-xs text-gray-400">{t('settings.aiFormatNote')}</p>
			</div>

			<div>
				<label className="block text-sm text-gray-300 mb-1" htmlFor="settings-ai-base-url">
					{t('settings.aiBaseUrl')}
				</label>
				<input
					id="settings-ai-base-url"
					type="text"
					value={baseUrl}
					placeholder={DEFAULT_AI_BASE_URL}
					autoComplete="off"
					spellcheck={false}
					onInput={(e) => setBaseUrl(e.currentTarget.value)}
					onChange={(e) => {
						setBaseUrl(e.currentTarget.value)
						onChange({ baseUrl: e.currentTarget.value })
					}}
					className={FIELD_CLASS}
				/>
				<p className="mt-1 text-xs text-gray-500">{t('settings.aiBaseUrlHint')}</p>
			</div>

			<div>
				<label className="block text-sm text-gray-300 mb-1" htmlFor="settings-ai-api-key">
					{t('settings.aiApiKey')}
				</label>
				<div className="flex items-center gap-2">
					<input
						id="settings-ai-api-key"
						type={apiKeyInputType}
						value={apiKey}
						autoComplete="off"
						spellcheck={false}
						onInput={(e) => setApiKey(e.currentTarget.value)}
						onChange={(e) => {
							setApiKey(e.currentTarget.value)
							onChange({ apiKey: e.currentTarget.value })
						}}
						className={FIELD_CLASS}
					/>
					<button
						onClick={() => setShowKey((show) => !show)}
						className="shrink-0 p-2 text-gray-400 rounded hover:bg-gray-700 hover:text-gray-200 transition-colors"
						title={t(showKey ? 'settings.aiHideKey' : 'settings.aiShowKey')}
						aria-label={t(showKey ? 'settings.aiHideKey' : 'settings.aiShowKey')}
					>
						{showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
					</button>
					<button
						// The token sits in plain `localStorage`; forgetting it must not
						// depend on the user clearing a masked field by hand.
						onClick={() => {
							setApiKey('')
							onChange({ apiKey: '' })
						}}
						className="shrink-0 p-2 text-gray-400 rounded hover:bg-gray-700 hover:text-gray-200 transition-colors"
						title={t('settings.aiClearKey')}
						aria-label={t('settings.aiClearKey')}
					>
						<Trash2 className="w-4 h-4" />
					</button>
				</div>
				<p className="mt-1 text-xs text-gray-500">{t('settings.aiApiKeyHint')}</p>
			</div>

			<div>
				<label className="block text-sm text-gray-300 mb-1" htmlFor="settings-ai-model">
					{t('settings.aiModel')}
				</label>
				<input
					id="settings-ai-model"
					type="text"
					value={model}
					placeholder={DEFAULT_AI_MODEL}
					autoComplete="off"
					spellcheck={false}
					onInput={(e) => setModel(e.currentTarget.value)}
					onChange={(e) => {
						setModel(e.currentTarget.value)
						onChange({ model: e.currentTarget.value })
					}}
					className={FIELD_CLASS}
				/>
				<p className="mt-1 text-xs text-gray-500">{t('settings.aiModelHint')}</p>
			</div>

			<div>
				<div className="flex items-center justify-between gap-2 mb-1">
					<label className="block text-sm text-gray-300" htmlFor="settings-ai-system-prompt">
						{t('settings.aiSystemPrompt')}
					</label>
					<button
						onClick={() => commitPrompt(DEFAULT_SYSTEM_PROMPT)}
						className="flex items-center gap-1.5 px-2 py-1 bg-gray-700 text-white text-xs rounded hover:bg-gray-600 transition-colors"
					>
						<RotateCcw className="w-3.5 h-3.5" />
						{t('settings.aiResetPrompt')}
					</button>
				</div>
				<textarea
					id="settings-ai-system-prompt"
					value={prompt}
					rows={10}
					spellcheck={false}
					onInput={(e) => setPrompt(e.currentTarget.value)}
					onChange={(e) => commitPrompt(e.currentTarget.value)}
					className={`${FIELD_CLASS} font-mono text-xs`}
				/>
				<p className="mt-1 text-xs text-gray-500">{t('settings.aiSystemPromptHint')}</p>
			</div>
		</div>
	)
}