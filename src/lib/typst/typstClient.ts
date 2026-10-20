import type { CompileImages, CompilePayload, CompileRequest, CompileResponse } from './protocol'

type Pending = {
	resolve: (value: CompilePayload) => void
	reject: (reason: unknown) => void
}

// `crypto.randomUUID` needs a secure context; the counter keeps ids unique (and
// the worker's newest-id-wins comparison meaningful) where it is missing.
let requestCounter = 0

function createRequestId(): string {
	requestCounter += 1
	return typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: `compile-${requestCounter}-${Date.now()}`
}

/**
 * Rejection produced by the worker. `diagnostics` carries typst's messages for
 * a failed compile; `superseded` marks a job the worker skipped because a newer
 * request was already queued — the caller stays silent, the newer compile owns
 * the UI.
 */
export class CompileError extends Error {
	readonly diagnostics: string[]
	readonly superseded: boolean

	constructor(message: string, diagnostics: string[] = [], superseded = false) {
		super(message)
		this.name = 'CompileError'
		this.diagnostics = diagnostics
		this.superseded = superseded
	}
}

export class TypstWorkerClient {
	#worker: Worker | null = null
	#pending = new Map<string, Pending>()
	#disposed = false

	constructor() {
		this.#worker = this.#createWorker()
	}

	/**
	 * Spawns a worker and wires its failure paths: a worker that dies (wasm
	 * trap, OOM kill, failed chunk) fires `error` and never answers, which used
	 * to leave every in-flight promise pending forever — the header and preview
	 * spun on `compiling` with no error and no retry.
	 */
	#createWorker(): Worker {
		const worker = new Worker(new URL('./typst.worker.ts', import.meta.url), { type: 'module' })
		worker.addEventListener('message', this.#handleMessage)
		worker.addEventListener('error', this.#handleWorkerFailure)
		// A response that cannot be deserialized is just as unusable as a crash.
		worker.addEventListener('messageerror', this.#handleWorkerFailure)
		return worker
	}

	#handleMessage = (event: MessageEvent<CompileResponse>): void => {
		const message = event.data
		if (!message || message.type !== 'compile-result') return

		const pending = this.#pending.get(message.id)
		if (!pending) return
		this.#pending.delete(message.id)

		if (!message.ok) {
			pending.reject(
				new CompileError(message.error, message.diagnostics, message.superseded === true)
			)
			return
		}

		pending.resolve({ pdf: new Uint8Array(message.pdf) })
	}

	#handleWorkerFailure = (event: Event): void => {
		const detail = event instanceof ErrorEvent && event.message ? `: ${event.message}` : ''
		const reason = `Typst compile worker stopped unexpectedly${detail}`
		console.error(`[Typst] ${reason}`)
		// The worker is not reusable after a crash: dropping it here is what makes
		// the next compile spawn a fresh one.
		const worker = this.#worker
		this.#worker = null
		worker?.terminate()
		this.#rejectPending(new Error(reason))
	}

	/**
	 * Terminates the worker and fails everything it still owed. Posting to a
	 * terminated worker silently no-ops, so a later `compilePdf` must not even
	 * try: it would never settle.
	 */
	dispose(): void {
		this.#disposed = true
		const worker = this.#worker
		this.#worker = null
		worker?.terminate()
		this.#rejectPending(new Error('Typst compile worker disposed'))
	}

	compilePdf(
		files: Record<string, string>,
		mainFile: string,
		images: CompileImages = {},
		imageVersions: Record<string, number> = {}
	): Promise<CompilePayload> {
		if (this.#disposed) {
			return Promise.reject(new Error('Typst compile worker disposed'))
		}

		const worker = this.#worker ?? (this.#worker = this.#createWorker())
		const id = createRequestId()

		// A per-send `slice()` of every binary, handed over in the transfer list:
		// the service caches the decoded bytes across compiles, so transferring
		// those arrays would detach them. The copy also skips the structured
		// clone the request would otherwise perform.
		const transferables: Transferable[] = []
		const transferred: CompileImages = {}
		for (const [path, bytes] of Object.entries(images)) {
			const copy = bytes.slice()
			transferred[path] = copy
			transferables.push(copy.buffer)
		}

		const request: CompileRequest = {
			type: 'compile',
			id,
			files,
			mainFile,
			images: transferred,
			imageVersions
		}
		const { promise, resolve, reject } = Promise.withResolvers<CompilePayload>()

		this.#pending.set(id, { resolve, reject })
		worker.postMessage(request, transferables)

		return promise
	}

	#rejectPending(error: Error): void {
		const pending = [...this.#pending.values()]
		this.#pending.clear()
		for (const entry of pending) {
			entry.reject(error)
		}
	}
}