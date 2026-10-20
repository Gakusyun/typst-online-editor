import type { Transport } from '@codemirror/lsp-client'

export type TinymistLspStatus = 'loading' | 'ready' | 'error'

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
	/**
	 * Set once the worker is gone: a crash, a reported startup failure or a
	 * `dispose()`. `postMessage` to a terminated worker silently drops the
	 * message, so without this the LSP client keeps sending requests that can
	 * only fail at its 60 s timeout (the `initialize` handshake would hang the
	 * whole session the same way).
	 */
	#dead = false

	constructor() {
		this.#worker = new Worker(new URL('./tinymist.worker.ts', import.meta.url), { type: 'module' })
		this.#worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
			const data = e.data
			if (data.type === 'message' && typeof data.message === 'string') {
				for (const handler of this.#messageHandlers) handler(data.message)
			} else if (data.type === 'status' && data.status) {
				// The worker reports its own startup failures (CDN fetch, wasm
				// init); a failed server never answers again, so kill it here.
				if (data.status === 'error') this.#die()
				this.#setStatus(data.status, data.detail)
			}
		}
		this.#worker.onerror = (e) => {
			console.error('[tinymist] language server worker failed:', e.message || e)
			this.#die()
			this.#setStatus('error', e.message || String(e))
		}
		this.#transport = {
			send: (message: string) => {
				// The `Transport` contract expects a broken connection to throw:
				// the LSP client turns that into a rejected request instead of
				// waiting for the timeout.
				if (this.#dead) throw new Error('Tinymist language server is not running')
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

	dispose(): void {
		this.#die()
		this.#messageHandlers.clear()
		this.#statusHandlers.clear()
	}

	/**
	 * Marks the worker unusable and stops it. A terminated worker drops
	 * `postMessage` silently, so without this the transport would keep accepting
	 * requests that can only fail at the LSP client's 60 s timeout.
	 */
	#die(): void {
		if (this.#dead) return
		this.#dead = true
		this.#worker.terminate()
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
