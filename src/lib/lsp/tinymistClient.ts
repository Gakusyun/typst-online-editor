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

	constructor() {
		this.#worker = new Worker(new URL('./tinymist.worker.ts', import.meta.url), { type: 'module' })
		this.#worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
			const data = e.data
			if (data.type === 'message' && typeof data.message === 'string') {
				for (const handler of this.#messageHandlers) handler(data.message)
			} else if (data.type === 'status' && data.status) {
				this.#setStatus(data.status, data.detail)
			}
		}
		this.#worker.onerror = (e) => {
			this.#setStatus('error', e.message)
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

	dispose(): void {
		this.#worker.terminate()
		this.#messageHandlers.clear()
		this.#statusHandlers.clear()
	}

	#setStatus(status: TinymistLspStatus, detail?: string): void {
		this.#status = status
		this.#statusDetail = detail
		for (const handler of this.#statusHandlers) handler(status, detail)
	}
}
