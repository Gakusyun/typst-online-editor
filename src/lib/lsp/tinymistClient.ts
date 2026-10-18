import type { Transport } from '@codemirror/lsp-client'
import { currentLang, translate, type MessageKey } from '@/lib/i18n/i18n'
import { documentFontMiss, type DocumentFontMiss } from '@/lib/fonts/documentFonts'

export type TinymistLspStatus = 'loading' | 'ready' | 'error'

const UNKNOWN_FONT_FAMILY = /^unknown font family: (.+)$/

const FONT_HINT_KEYS: Record<DocumentFontMiss, MessageKey> = {
	disabled: 'editor.fontHintDisabled',
	unsupported: 'editor.fontHintUnsupported',
	denied: 'editor.fontHintDenied',
	'not-installed': 'editor.fontHintNotInstalled',
	unreadable: 'editor.fontHintUnreadable',
}

/**
 * Replaces the bare `unknown font family: X` wording with *why* this compile
 * could not use the machine's font and what to do about it. The language server
 * only knows the family is missing; the browser-side font plumbing knows the
 * reason (feature off, no access, not installed, unreadable).
 */
function explainUnknownFonts(message: string): string {
	if (!message.includes('unknown font family')) return message
	let payload: unknown
	try {
		payload = JSON.parse(message)
	} catch {
		return message
	}
	if (typeof payload !== 'object' || payload === null || !('params' in payload)) return message
	const { params } = payload
	if (typeof params !== 'object' || params === null || !('diagnostics' in params)) return message
	const { diagnostics } = params
	if (!Array.isArray(diagnostics)) return message

	let changed = false
	for (const diagnostic of diagnostics) {
		if (typeof diagnostic !== 'object' || diagnostic === null || !('message' in diagnostic)) continue
		const text = diagnostic.message
		if (typeof text !== 'string') continue
		const match = UNKNOWN_FONT_FAMILY.exec(text)
		if (!match) continue
		const family = match[1].trim().replace(/^["']|["']$/g, '')
		const lang = currentLang()
		diagnostic.message = translate(lang, 'editor.fontFamilyUnknown', {
			family,
			hint: translate(lang, FONT_HINT_KEYS[documentFontMiss(family)]),
		})
		changed = true
	}
	return changed ? JSON.stringify(payload) : message
}

interface WorkerMessage {
	type: 'message' | 'status'
	message?: string
	status?: TinymistLspStatus
	detail?: string
}

type MessageHandler = (message: string) => void
type StatusHandler = (status: TinymistLspStatus, detail?: string) => void

/**
 * Owns the Tinymist WASM language server worker and exposes its JSON-RPC
 * stream as a CodeMirror LSP `Transport`.
 */
export class TinymistLspClient {
	#worker: Worker
	#messageHandlers = new Set<MessageHandler>()
	#statusHandlers = new Set<StatusHandler>()
	#transport: Transport
	#status: TinymistLspStatus = 'loading'
	#statusDetail: string | undefined

	constructor() {
		this.#worker = new Worker(new URL('./tinymist.worker.ts', import.meta.url), { type: 'module' })
		this.#worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
			const data = e.data
			if (data.type === 'message' && typeof data.message === 'string') {
				const message = explainUnknownFonts(data.message)
				for (const handler of this.#messageHandlers) handler(message)
			} else if (data.type === 'status' && data.status) {
				this.#setStatus(data.status, data.detail)
			}
		}
		this.#worker.onerror = (e) => {
			console.error('[tinymist] language server worker failed:', e.message || e)
			this.#setStatus('error', e.message || String(e))
		}
		this.#transport = {
			send: (message: string) => {
				this.#worker.postMessage({ type: 'message', message })
			},
			subscribe: (handler: MessageHandler) => {
				this.#messageHandlers.add(handler)
			},
			unsubscribe: (handler: MessageHandler) => {
				this.#messageHandlers.delete(handler)
			},
		}
	}

	get transport(): Transport {
		return this.#transport
	}

	get status(): TinymistLspStatus {
		return this.#status
	}

	get statusDetail(): string | undefined {
		return this.#statusDetail
	}

	onStatus(handler: StatusHandler): () => void {
		this.#statusHandlers.add(handler)
		handler(this.#status, this.#statusDetail)
		return () => {
			this.#statusHandlers.delete(handler)
		}
	}

	/** Project file paths (any type) — used to suppress missing-file false positives. */
	setProjectFiles(paths: string[]): void {
		this.#worker.postMessage({ type: 'files', paths })
	}

	/**
	 * Families the compile pipeline reads from the machine. The language server
	 * cannot load them (see `./tinymist.worker`), so it only needs to stop
	 * reporting them as unknown.
	 */
	setSystemFontFamilies(families: string[]): void {
		this.#worker.postMessage({ type: 'system-fonts', families })
	}

	dispose(): void {
		this.#worker.terminate()
		this.#messageHandlers.clear()
		this.#statusHandlers.clear()
	}

	#setStatus(status: TinymistLspStatus, detail?: string): void {
		this.#status = status
		this.#statusDetail = detail
		if (status === 'error') {
			console.error('[tinymist] language server unavailable:', detail ?? 'unknown error')
		}
		for (const handler of this.#statusHandlers) handler(status, detail)
	}
}
