// Tinymist WASM language server host. Runs in a module worker: owns the wasm
// instance and bridges JSON-RPC messages between @codemirror/lsp-client (main
// thread) and `TinymistLanguageServer` (wasm).
//
// Two wasm quirks drive the shape of this file (verified against the 0.14.18
// build):
// - The server object must not be re-entered from its own `sendRequest` /
//   `sendEvent` callbacks; replies and event pumping are deferred to a
//   microtask (a synchronous `on_response` triggers a wasm borrow panic).
// - The analysis world cannot load fonts (BrowserFontSearcher only sees fonts
//   embedded in the wasm build, which has text fonts but no math font), so
//   valid documents using math report a vacuous "no font could be found"
//   error. It is filtered below; the PDF pipeline compiles with real fonts.
import {
	loadTinymistModule,
	type TinymistLanguageServer,
	type TinymistPackageSpec,
	type TinymistServerNotification,
	type TinymistServerRequest,
	type TinymistWasmModule,
} from './tinymist'

interface DocState {
	text: string
	version: number
}

interface LspMessage {
	jsonrpc: '2.0'
	id?: number | string
	method?: string
	params?: unknown
	result?: unknown
	error?: { code: number; message: string }
}

const VACUOUS_FONT_DIAGNOSTIC = 'no font could be found'
const PACKAGE_TARBALL_URL = 'https://packages.typst.org'
const PACKAGE_TEXT_FILE = /\.(typ|md|bib|txt|json|ya?ml|toml|csv)$/i
const USER_DOC_URI = /^file:\/\/\//

let server: TinymistLanguageServer
let wasmModule: TinymistWasmModule
let ready = false
const events: number[] = []
const pending: LspMessage[] = []
const docs = new Map<string, DocState>()
const packages = new Map<string, string | null>()

self.onmessage = (e: MessageEvent<{ type: string; message?: string }>) => {
	const data = e.data
	if (data.type !== 'message' || typeof data.message !== 'string') return
	const msg = JSON.parse(data.message) as LspMessage
	// The wasm server takes seconds to download and instantiate; queue client
	// messages until it is ready so nothing is lost.
	if (!ready) {
		pending.push(msg)
		return
	}
	void processMessage(msg)
}

async function processMessage(msg: LspMessage): Promise<void> {
	try {
		await handleClientMessage(msg)
	} catch (error) {
		console.error('[tinymist] failed to handle message:', msg.method ?? msg.id, error)
		if (msg.id !== undefined && msg.method !== undefined) {
			post({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String(error) } })
		}
	}
	drainEvents()
}

async function handleClientMessage(msg: LspMessage): Promise<void> {
	if (msg.method !== undefined) {
		if (msg.id !== undefined) {
			const result = await Promise.resolve(server.on_request(msg.method, msg.params))
			if (isLspError(result)) {
				post({ jsonrpc: '2.0', id: msg.id, error: { code: result.code, message: result.message } })
			} else {
				post({ jsonrpc: '2.0', id: msg.id, result: result ?? null })
			}
		} else {
			trackDocument(msg.method, msg.params)
			server.on_notification(msg.method, msg.params)
		}
	} else if (msg.id !== undefined) {
		// Response to a server-initiated request.
		server.on_response({ id: Number(msg.id), result: msg.result ?? null })
	}
}

function docTextDocument(params: unknown): { uri?: unknown; text?: unknown; version?: unknown } | null {
	if (typeof params !== 'object' || params === null || !('textDocument' in params)) return null
	const td = params.textDocument
	if (typeof td !== 'object' || td === null) return null
	return td
}

function trackDocument(method: string, params: unknown): void {
	const td = docTextDocument(params)
	if (!td || typeof td.uri !== 'string') return
	const uri = td.uri
	if (method === 'textDocument/didOpen' && typeof td.text === 'string') {
		docs.set(uri, { text: td.text, version: typeof td.version === 'number' ? td.version : 1 })
	} else if (method === 'textDocument/didChange') {
		const state = docs.get(uri)
		const change = lastContentChange(params)
		if (state && change) {
			state.text = change
			state.version = (typeof td.version === 'number' ? td.version : state.version) + 1
		}
	} else if (method === 'textDocument/didClose') {
		docs.delete(uri)
	}
}

function lastContentChange(params: unknown): string | null {
	if (typeof params !== 'object' || params === null || !('contentChanges' in params)) return null
	const changes = params.contentChanges
	if (!Array.isArray(changes) || changes.length === 0) return null
	const last = changes.at(-1)
	if (typeof last !== 'object' || last === null || !('text' in last) || typeof last.text !== 'string') {
		return null
	}
	return last.text
}

function isLspError(value: unknown): value is { code: number; message: string } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'code' in value &&
		typeof value.code === 'number' &&
		'message' in value &&
		typeof value.message === 'string'
	)
}

/** Drop the vacuous font diagnostic; returns null when params are malformed. */
function keptDiagnostics(params: unknown): unknown[] | null {
	if (typeof params !== 'object' || params === null || !('diagnostics' in params)) return null
	const diagnostics = params.diagnostics
	if (!Array.isArray(diagnostics)) return null
	return diagnostics.filter((d) => {
		if (typeof d !== 'object' || d === null) return true
		if (!('severity' in d) || !('message' in d)) return true
		return !(d.severity === 1 && d.message === VACUOUS_FONT_DIAGNOSTIC)
	})
}

function post(message: LspMessage): void {
	;(self as unknown as Worker).postMessage({ type: 'message', message: JSON.stringify(message) })
}

function drainEvents(): void {
	while (events.length > 0) {
		const eventId = events.shift()
		if (eventId !== undefined) server.on_event(eventId)
	}
}

// --- Typst Universe packages ------------------------------------------------
// `resolveFn` must answer synchronously with a virtual directory that the
// analysis world can read (as open memory documents). Unknown packages return
// undefined (a "package not found" diagnostic) and are fetched in the
// background; once their files are open a recompile nudge converges to a clean
// analysis. Transitive dependencies arrive through the same path.

function packageKey(spec: TinymistPackageSpec): string {
	return `${spec.namespace}/${spec.name}:${spec.version}`
}

function resolvePackage(spec: TinymistPackageSpec): string | undefined {
	const key = packageKey(spec)
	const root = packages.get(key)
	if (typeof root === 'string') return root
	if (root === undefined) {
		packages.set(key, null)
		void fetchPackage(spec, key).catch((error) => {
			console.warn('[tinymist] failed to load package', key, error)
			packages.delete(key)
		})
	}
	return undefined
}

async function fetchPackage(spec: TinymistPackageSpec, key: string): Promise<void> {
	const url = `${PACKAGE_TARBALL_URL}/${spec.namespace}/${spec.name}-${spec.version}.tar.gz`
	const response = await fetch(url)
	if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
	const data = new Uint8Array(await response.arrayBuffer())
	const root = `/pkg/${spec.namespace}/${spec.name}/${spec.version}`
	const ctx = new wasmModule.ProxyContext({})
	ctx.untar(data, (path, value) => {
		if (!PACKAGE_TEXT_FILE.test(path)) return
		openMemoryDoc(`${root}/${path}`, new TextDecoder().decode(value))
	})
	packages.set(key, root)
	nudgeUserDocsSoon()
}

function openMemoryDoc(path: string, text: string): void {
	const uri = pathToUri(path)
	docs.set(uri, { text, version: 1 })
	server.on_notification('textDocument/didOpen', {
		textDocument: { uri, languageId: 'typst', version: 1, text },
	})
}

function pathToUri(path: string): string {
	return `file:///${path.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`
}

let nudgeTimer: number | undefined

function nudgeUserDocsSoon(): void {
	clearTimeout(nudgeTimer)
	nudgeTimer = self.setTimeout(() => {
		for (const [uri, state] of docs) {
			if (!USER_DOC_URI.test(uri) || uri.startsWith('file:///pkg/')) continue
			state.version += 1
			server.on_notification('textDocument/didChange', {
				textDocument: { uri, version: state.version },
				contentChanges: [{ text: state.text }],
			})
		}
		drainEvents()
	}, 150)
}

// --- Startup ----------------------------------------------------------------

async function main(): Promise<void> {
	;(self as unknown as Worker).postMessage({ type: 'status', status: 'loading' })
	wasmModule = await loadTinymistModule()
	server = new wasmModule.TinymistLanguageServer({
		sendEvent(eventId: number) {
			events.push(eventId)
		},
		sendRequest(request: TinymistServerRequest) {
			// Deferred: re-entering the server from this callback panics.
			queueMicrotask(() => {
				if (request.method === 'tinymist/fs/watch' || request.method === 'workspace/configuration') {
					try {
						server.on_response({ id: request.id, result: null })
					} catch (error) {
						console.warn('[tinymist] failed to answer', request.method, error)
					}
					drainEvents()
					return
				}
				post({ jsonrpc: '2.0', id: request.id, method: request.method, params: request.params })
			})
		},
		sendNotification(notification: TinymistServerNotification) {
			if (notification.method === 'tmLog') return
			if (notification.method === 'textDocument/publishDiagnostics') {
				const diagnostics = keptDiagnostics(notification.params)
				const params = notification.params
				if (diagnostics && typeof params === 'object' && params !== null) {
					post({
						jsonrpc: '2.0',
						method: notification.method,
						params: { ...params, diagnostics },
					})
				} else {
					post({ jsonrpc: '2.0', method: notification.method, params: notification.params })
				}
				return
			}
			post({ jsonrpc: '2.0', method: notification.method, params: notification.params })
		},
		resolveFn: resolvePackage,
	})
	ready = true
	for (const msg of pending.splice(0)) await processMessage(msg)
	;(self as unknown as Worker).postMessage({ type: 'status', status: 'ready' })
}

main().catch((error) => {
	console.error('[tinymist] failed to start:', error)
	;(self as unknown as Worker).postMessage({
		type: 'status',
		status: 'error',
		detail: error instanceof Error ? error.message : String(error),
	})
})
