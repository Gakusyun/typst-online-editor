import { useCallback, useState } from 'preact/hooks'
import { loadAiSettings, normalizeAiSettings, saveAiSettings, type AiSettings } from '@/lib/ai/aiSettings'

/**
 * The AI assistant configuration.
 *
 * Owned by `TypstEditor` (the app's single orchestrator, per the architecture
 * notes) and handed down to Settings → AI and to the assistant panel, so both
 * see the same values without a global store. Every change is persisted
 * immediately — writing on change rather than on mount is what keeps a second
 * tab with stale state from clearing the first tab's configuration (the same
 * rule `@/lib/appearance/appearance` follows).
 */
export function useAiSettings() {
	const [settings, setSettings] = useState<AiSettings>(loadAiSettings)
	const updateSettings = useCallback((changes: Partial<AiSettings>) => {
		setSettings((current) => {
			const next = normalizeAiSettings({ ...current, ...changes })
			saveAiSettings(next)
			return next
		})
	}, [])
	return { settings, updateSettings }
}