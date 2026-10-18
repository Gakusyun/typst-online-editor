/**
 * AI assistant configuration (Settings → AI).
 *
 * The editor has no backend, so the assistant calls the endpoint the user
 * configures **directly from the browser**, in the OpenAI chat-completions
 * format (`./chatCompletion`). URL, key, model and prompt are persisted in
 * `localStorage` and never leave the machine except to that endpoint (the key
 * travels as its `Authorization` header and nowhere else).
 */

/** `localStorage` key holding the whole configuration as JSON. */
export const AI_SETTINGS_KEY = 'typst-ai-settings'

/** Example base URL, used as the Settings placeholder. */
export const DEFAULT_AI_BASE_URL = 'https://api.openai.com/v1'

/** Example model id, used as the Settings placeholder. */
export const DEFAULT_AI_MODEL = 'gpt-4o-mini'

export interface AiSettings {
	/** Base URL or the full `…/chat/completions` endpoint (see `chatCompletionsUrl`). */
	baseUrl: string

	/** Bearer token; empty for local servers that need none. */
	apiKey: string

	/** Model id sent in the request body. */
	model: string

	/** Custom system prompt; `null` = use `DEFAULT_SYSTEM_PROMPT`. */
	systemPrompt: string | null
}

export const EMPTY_AI_SETTINGS: AiSettings = {
	baseUrl: '',
	apiKey: '',
	model: '',
	systemPrompt: null,
}

/** Trim every field and turn a blank prompt into `null` (i.e. "use the default"). */
export function normalizeAiSettings(input: Partial<AiSettings>): AiSettings {
	const systemPrompt = input.systemPrompt?.trim() ?? ''
	return {
		baseUrl: input.baseUrl?.trim() ?? '',
		apiKey: input.apiKey?.trim() ?? '',
		model: input.model?.trim() ?? '',
		systemPrompt: systemPrompt === '' ? null : input.systemPrompt ?? null,
	}
}

export function loadAiSettings(): AiSettings {
	try {
		const raw = localStorage.getItem(AI_SETTINGS_KEY)
		if (!raw) return EMPTY_AI_SETTINGS
		const parsed: unknown = JSON.parse(raw)
		if (typeof parsed !== 'object' || parsed === null) return EMPTY_AI_SETTINGS
		return normalizeAiSettings(parsed as Partial<AiSettings>)
	} catch (error) {
		console.warn('[ai] could not read the AI settings', error)
		return EMPTY_AI_SETTINGS
	}
}

export function saveAiSettings(settings: AiSettings): void {
	try {
		localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(normalizeAiSettings(settings)))
	} catch (error) {
		console.warn('[ai] could not persist the AI settings', error)
	}
}

/**
 * Whether a request can be attempted at all: an endpoint and a model. A key is
 * deliberately *not* required — local servers (Ollama, LM Studio, …) take none.
 */
export function isAiConfigured(settings: AiSettings): boolean {
	return settings.baseUrl !== '' && settings.model !== ''
}