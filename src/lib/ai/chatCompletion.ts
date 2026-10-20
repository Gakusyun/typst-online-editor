/**
 * OpenAI-format chat client for the AI assistant.
 *
 * One request shape only — `POST <baseUrl>/chat/completions` with
 * `{ model, messages, stream: true }` and a bearer token — because that is what
 * every OpenAI-compatible provider speaks (OpenAI, Azure-style gateways,
 * DeepSeek, Moonshot, Ollama, LM Studio, vLLM, …). Anthropic's `/v1/messages`
 * format is deliberately not supported.
 *
 * The request goes straight from this browser to that endpoint: there is no
 * server to route it through, so the endpoint must allow cross-origin requests
 * (CORS) — local servers need CORS explicitly enabled.
 */

/** One conversation message; the roles OpenAI-compatible APIs accept here. */
export interface ChatMessage {
	role: 'system' | 'user' | 'assistant'
	content: string
}

/** Why a request failed, for the UI to explain. */
export type AiErrorCode =
	/** No usable endpoint/model configured. */
	| 'not-configured'
	/** The endpoint answered with a non-2xx status. */
	| 'http'
	/** Network failure — offline, wrong host, or CORS refused. */
	| 'network'
	/** 2xx but nothing to apply. */
	| 'empty'
	/** 2xx but not a completion payload. */
	| 'invalid-response'
	/** The user pressed stop. */
	| 'aborted'

export class AiError extends Error {
	readonly code: AiErrorCode

	constructor(code: AiErrorCode, message: string) {
		super(message)
		this.name = 'AiError'
		this.code = code
	}
}

export interface ChatCompletionOptions {
	/** Base URL (`https://api.openai.com/v1`) or a full `…/chat/completions` URL. */
	baseUrl: string
	/** Bearer token; empty sends no `Authorization` header. */
	apiKey: string
	model: string
	messages: ChatMessage[]
	/** Cancels the request; the promise then rejects with an `aborted` `AiError`. */
	signal?: AbortSignal
	/** Called with each streamed chunk of the reply. */
	onDelta?: (delta: string) => void
}

/** The shape of the fields we read out of an OpenAI-compatible payload. */
interface ChatCompletionPayload {
	error?: { message?: string }
	message?: string
	choices?: {
		message?: { content?: string }
		delta?: { content?: string }
		text?: string
	}[]
}

/**
 * `baseUrl` as configured by the user, resolved to a chat-completions URL:
 * a full endpoint is used as-is, a `…/v1` base gets `/chat/completions`, and
 * anything else (a bare host, say) gets `/v1/chat/completions`.
 */
export function chatCompletionsUrl(baseUrl: string): string {
	const url = baseUrl.trim().replace(/\/+$/, '')
	if (url.endsWith('/chat/completions')) return url
	if (/\/v\d+$/.test(url)) return `${url}/chat/completions`
	return `${url}/v1/chat/completions`
}

/**
 * The absolute URL a request goes to, or an `AiError` saying why the configured
 * value cannot be used.
 *
 * The bearer token rides on whatever origin this URL names, so a relative value
 * must never reach `fetch`: a scheme-less typo (`api.openai.com/v1`) would be
 * resolved against the editor's own origin and hand the key to the host that
 * serves the app — where it would land in that server's logs. A plain `http:`
 * endpoint is allowed (local servers often have no TLS), only announced.
 */
function endpointFor(baseUrl: string): { url: string; insecure: boolean } {
	const value = baseUrl.trim()
	if (value === '') throw new AiError('not-configured', 'no endpoint configured')
	let protocol: string
	try {
		protocol = new URL(value).protocol
	} catch {
		// Not absolute at all — `fetch` would resolve it against this page.
		protocol = ''
	}
	if (protocol !== 'https:' && protocol !== 'http:') {
		throw new AiError(
			'not-configured',
			`"${value}" is not an absolute http(s) URL — include the scheme, e.g. https://api.openai.com/v1`
		)
	}
	return { url: chatCompletionsUrl(value), insecure: protocol === 'http:' }
}

function asAiError(error: unknown, baseUrl: string): AiError {
	if (error instanceof AiError) return error
	if (error instanceof DOMException && error.name === 'AbortError') {
		return new AiError('aborted', 'request aborted')
	}
	const detail = error instanceof Error ? error.message : String(error)
	// A bare `fetch` TypeError is what a blocked CORS preflight or a dead host
	// looks like; the browser deliberately hides which one it was.
	return new AiError('network', `could not reach ${baseUrl}: ${detail}`)
}

/** The failure text of a non-2xx response: the provider's message when there is one. */
async function describeHttpError(response: Response): Promise<string> {
	const body = (await response.text().catch(() => '')).trim()
	let detail = body
	try {
		const payload = JSON.parse(body) as ChatCompletionPayload
		detail = payload.error?.message?.trim() || payload.message?.trim() || detail
	} catch {
		// Not JSON (an HTML error page, say) — the raw body is the best detail.
	}
	if (detail.length > 500) detail = `${detail.slice(0, 500)}…`
	const status = `${response.status} ${response.statusText}`.trim()
	return detail === '' ? status : `${status} — ${detail}`
}

function completionFromJson(payload: ChatCompletionPayload): string {
	const choice = payload.choices?.[0]
	const content = choice?.message?.content ?? choice?.text
	if (typeof content !== 'string') {
		throw new AiError('invalid-response', 'the response has no completion content')
	}
	return content
}

/** One SSE line → the text it carries, `'[DONE]'`, or `null` for anything else. */
function parseEventLine(line: string): string | null {
	if (!line.startsWith('data:')) return null
	const payload = line.slice('data:'.length).trim()
	if (payload === '') return null
	if (payload === '[DONE]') return '[DONE]'
	let parsed: ChatCompletionPayload
	try {
		parsed = JSON.parse(payload) as ChatCompletionPayload
	} catch {
		// Keep-alive comments and stray frames are not errors.
		return null
	}
	const streamError = parsed.error?.message
	if (streamError) throw new AiError('http', streamError)
	const choice = parsed.choices?.[0]
	const delta = choice?.delta?.content ?? choice?.message?.content ?? choice?.text
	return typeof delta === 'string' ? delta : null
}

async function readEventStream(
	body: ReadableStream<Uint8Array>,
	onDelta?: (delta: string) => void
): Promise<string> {
	const reader = body.getReader()
	try {
		const decoder = new TextDecoder()
		let buffer = ''
		let reply = ''
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			buffer += decoder.decode(value, { stream: true })
			// Only complete lines are consumed; a chunk boundary can split one.
			const lines = buffer.split(/\r?\n/)
			buffer = lines.pop() ?? ''
			for (const line of lines) {
				const delta = parseEventLine(line)
				if (delta === null) continue
				if (delta === '[DONE]') return reply
				reply += delta
				onDelta?.(delta)
			}
		}
		return reply
	} finally {
		// `[DONE]`, a stop and a failure all leave the reader holding the rest of
		// the response open; cancelling is what tells the endpoint to stop. An
		// aborted request has already errored the stream, so the rejection is
		// expected there too.
		await reader.cancel().catch(() => {})
	}
}

/**
 * Send one chat-completions request and resolve with the reply text.
 *
 * Streaming is requested; an endpoint that answers with plain JSON anyway is
 * handled too. Rejects with an {@link AiError}.
 */
export async function chatCompletion(options: ChatCompletionOptions): Promise<string> {
	const { baseUrl, apiKey, model, messages, signal, onDelta } = options
	if (baseUrl.trim() === '' || model.trim() === '') {
		throw new AiError('not-configured', 'no endpoint or model configured')
	}
	const endpoint = endpointFor(baseUrl)
	if (endpoint.insecure) {
		// Legitimate for a local server, but the request body — the document and
		// the token, when there is one — is readable by every hop.
		console.warn(`[ai] the endpoint ${endpoint.url} uses plain http; the request is not encrypted`)
	}
	let response: Response
	try {
		response = await fetch(endpoint.url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(apiKey === '' ? {} : { Authorization: `Bearer ${apiKey}` }),
			},
			body: JSON.stringify({ model, messages, stream: true }),
			signal,
		})
	} catch (error) {
		throw asAiError(error, baseUrl)
	}
	if (!response.ok) {
		throw new AiError('http', await describeHttpError(response))
	}
	const contentType = response.headers.get('content-type') ?? ''
	if (!response.body || !contentType.includes('text/event-stream')) {
		const payload = (await response.json().catch(() => null)) as ChatCompletionPayload | null
		if (!payload) throw new AiError('invalid-response', 'the response is not JSON')
		const reply = completionFromJson(payload)
		onDelta?.(reply)
		return reply
	}
	const reply = await readEventStream(response.body, onDelta).catch((error: unknown) => {
		throw asAiError(error, baseUrl)
	})
	if (reply.trim() === '') throw new AiError('empty', 'the model returned an empty reply')
	return reply
}