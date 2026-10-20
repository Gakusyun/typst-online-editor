import type * as pdfjs from 'pdfjs-dist'

// pdf.js is ~460 KB that only the preview needs, so it is imported on the first
// document rather than at boot — hence the dynamic import and the memo below.
// A static import cannot work here: it would pull the whole viewer library into
// the boot bundle for a feature the user may never open.
let pdfjsPromise: Promise<typeof pdfjs> | null = null

/** The worker script pdf.js is pointed at; set by {@link getPdfjs}. */
let workerSrc = ''

/**
 * The preview engine (the pdf.js library, or its worker) is not there.
 *
 * Distinct from a document pdf.js refused to parse: the user cannot fix this one
 * by editing the document — it is the CDN, the network or a blocker.
 */
export class PreviewEngineError extends Error {
	constructor(message: string, cause?: unknown) {
		super(message, cause === undefined ? undefined : { cause })
		this.name = 'PreviewEngineError'
	}
}

export function getPdfjs() {
	if (!pdfjsPromise) {
		pdfjsPromise = import('pdfjs-dist')
			.then((mod) => {
				// The worker is served from a CDN mirror (mainland-China npm mirror,
				// fastest and most stable there; jsdelivr is unreliable without a
				// proxy) rather than bundled: CDN dependencies are preferred here, and
				// the worker is ~1.26 MB that only the preview needs.
				// Tradeoff, accepted deliberately: pdf.js rewrites a cross-origin
				// `workerSrc` into a blob module worker whose body is `await import(<cdn
				// url>)`, and a blob worker runs with *this page's* origin — so the
				// mirror's code can read what the app keeps in `localStorage` (the AI
				// bearer token). Trust the mirror as a build dependency; see the
				// leftovers note if this ever has to harden.
				workerSrc = `https://registry.npmmirror.com/pdfjs-dist/${mod.version}/files/build/pdf.worker.min.mjs`
				mod.GlobalWorkerOptions.workerSrc = workerSrc
				return mod
			})
			.catch((error: unknown) => {
				// Never memoize the rejection: one failed chunk fetch would otherwise
				// poison every later attempt for the rest of the session.
				pdfjsPromise = null
				throw new PreviewEngineError('Could not load the pdf.js library', error)
			})
	}

	return pdfjsPromise
}

/**
 * What the worker wrapper posts once the pdf.js module is up. Addressed at this
 * module rather than at pdf.js (`targetName` is pdf.js's routing key), so pdf.js's
 * own handler drops it as not for itself.
 */
const READY_PING = { targetName: 'preview-worker', action: 'ready' }

/**
 * The pdf.js worker, created here instead of by pdf.js.
 *
 * Why not let pdf.js spawn it: when its worker cannot start, pdf.js falls back to
 * a *main-thread* "fake worker", memoizes that attempt as a rejected promise on
 * the `PDFWorker` class and leaves `#isWorkerDisabled` set for good. One
 * unreachable CDN response would therefore keep the preview dead for the rest of
 * the page even after the network came back. Owning the worker makes a startup
 * failure observable (a `Worker` reports `error`) and a retry a *new* worker
 * instead of pdf.js's memoized rejection.
 *
 * The blob wrapper is pdf.js's own (`PDFWorker._createCDNWrapper`) plus one
 * readiness ping, because that `await import(<cdn url>)` is what runs the worker
 * module and registers its message handler. The URL stays cross-origin, so this
 * is the same CDN trust as the `workerSrc` above — not a new one.
 */
export class PreviewWorker {
	/** The port handed to pdf.js (`GlobalWorkerOptions.workerPort`). */
	readonly port: Worker
	/**
	 * Resolves once the worker module has evaluated and is listening — the point
	 * at which the port may be handed to pdf.js. Handing it over earlier hangs:
	 * a module worker drops messages posted before its handler exists (measured),
	 * which is why pdf.js only sends after its own worker's "ready" ping.
	 */
	readonly ready: Promise<void>
	/**
	 * Rejects when the worker cannot start or dies. pdf.js has no error path for
	 * that when it is handed a port: it resolves its own worker promise
	 * immediately and would then wait for a reply that never comes.
	 */
	readonly failure: Promise<never>

	constructor() {
		if (!workerSrc) {
			throw new PreviewEngineError('The pdf.js worker location is not configured yet (call getPdfjs first)')
		}
		const script = [
			`await import(${JSON.stringify(workerSrc)});`,
			`self.postMessage(${JSON.stringify(READY_PING)});`,
		].join('\n')
		const url = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }))
		this.port = new Worker(url, { type: 'module' })
		// The worker has taken its script by the time `Worker()` returns, so the
		// blob can go immediately; keeping it would leak one URL per document.
		URL.revokeObjectURL(url)

		let resolveReady!: () => void
		let rejectReady!: (reason: unknown) => void
		let rejectFailure!: (reason: unknown) => void
		this.ready = new Promise<void>((resolve, rej) => {
			resolveReady = resolve
			rejectReady = rej
		})
		this.failure = new Promise<never>((_, rej) => {
			rejectFailure = rej
		})
		// A load can give up on both promises before they settle (a document error,
		// an unmounted preview), so give them handlers here: a late worker death
		// must not surface as an unhandled rejection.
		void this.ready.catch(() => {})
		void this.failure.catch(() => {})

		this.port.addEventListener('message', (event: MessageEvent) => {
			if (isReadyPing(event.data)) resolveReady()
		})
		const fail = (event: Event) => {
			const detail = event instanceof ErrorEvent && event.message ? event.message : 'the worker stopped unexpectedly'
			const error = new PreviewEngineError(`pdf.js worker failed: ${detail}`)
			rejectReady(error)
			rejectFailure(error)
		}
		this.port.addEventListener('error', fail)
		this.port.addEventListener('messageerror', fail)
	}

	/** Stops the worker. pdf.js cannot: it only ever saw the port. */
	dispose(): void {
		this.port.terminate()
	}
}

function isReadyPing(data: unknown): boolean {
	if (!data || typeof data !== 'object') return false
	if (!('targetName' in data) || !('action' in data)) return false
	return data.targetName === READY_PING.targetName && data.action === READY_PING.action
}
