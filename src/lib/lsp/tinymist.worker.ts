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
import { applyContentChanges } from './documentText'
import {
	loadTinymistModule,
	type TinymistLanguageServer,
	type TinymistPackageSpec,
	type TinymistServerNotification,
	type TinymistServerRequest,
	type TinymistWasmModule,
} from './tinymist'
import { pathToUri } from './uri'

interface DocState {
	text: string
	version: number
	/** The `languageId` the document was opened with; a re-open must keep it. */
	languageId: string
}

/**
 * One Typst Universe package (`@preview/…`): being fetched, ready with its
 * virtual root, or failed. `attempts` bounds the retries — a removed version
 * must not send the analysis back to the registry on every pass.
 */
type PackageState =
	| { status: 'fetching' }
	| { status: 'ready'; root: string }
	| { status: 'failed'; attempts: number }

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
// Startup failed for good: the server never comes up in this worker, so the
// message queue below is not a buffer any more but a leak.
let failed = false
const events: number[] = []
const pending: LspMessage[] = []
const docs = new Map<string, DocState>()
const packages = new Map<string, PackageState>()
/** The memory-document URIs each package opened, so eviction can close them. */
const packageDocs = new Map<string, string[]>()
/**
 * Ready packages kept in the analysis world, oldest first. Every session that
 * touches several `@preview` packages would otherwise pile their documents up
 * for the lifetime of the worker.
 */
const PACKAGE_CACHE_LIMIT = 8
/** A package that fails is retried this many times, then left alone. */
const PACKAGE_FETCH_ATTEMPTS = 2
const projectFiles = new Set<string>()

self.onmessage = (e: MessageEvent<{ type: string; message?: string; paths?: string[] }>) => {
	const data = e.data
	if (data.type === 'files' && Array.isArray(data.paths)) {
		updateProjectFiles(data.paths)
		return
	}
	if (data.type !== 'message' || typeof data.message !== 'string') return
	const msg = JSON.parse(data.message) as LspMessage
	// The wasm server takes seconds to download and instantiate; queue client
	// messages until it is ready so nothing is lost.
	if (!ready) {
		if (failed) answerUnavailable(msg)
		else pending.push(msg)
		return
	}
	void processMessage(msg)
}

/** Answers a request from a worker whose server never started; drops events. */
function answerUnavailable(msg: LspMessage): void {
	if (msg.id === undefined) return
	post({
		jsonrpc: '2.0',
		id: msg.id,
		error: { code: -32603, message: 'tinymist language server is unavailable' },
	})
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

function docTextDocument(params: unknown): {
	uri?: unknown
	text?: unknown
	version?: unknown
	languageId?: unknown
} | null {
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
		docs.set(uri, {
			text: td.text,
			version: typeof td.version === 'number' ? td.version : 1,
			languageId: typeof td.languageId === 'string' ? td.languageId : 'typst',
		})
	} else if (method === 'textDocument/didChange') {
		const state = docs.get(uri)
		if (!state) return
		const text = changedText(params, state.text)
		if (text === null) return
		state.text = text
		// The client bumps `file.version` before it sends the change (see
		// lsp-client's `Workspace#sync`), so this already *is* the new version.
		// Mirror it verbatim: the nudge below reopens documents with the mirrored
		// version, so an invented value would desync us from the client's counter.
		state.version = typeof td.version === 'number' ? td.version : state.version
	} else if (method === 'textDocument/didClose') {
		docs.delete(uri)
	}
}

/** The text a `didChange` produces, or null when the params carry no change. */
function changedText(params: unknown, previous: string): string | null {
	if (typeof params !== 'object' || params === null || !('contentChanges' in params)) return null
	const changes = params.contentChanges
	if (!Array.isArray(changes) || changes.length === 0) return null
	// Fast path: below lsp-client's 1024-character sync threshold a change is a
	// single whole-document replacement, which needs no range arithmetic.
	if (changes.length === 1) {
		const only = changes[0]
		if (typeof only === 'object' && only !== null && !('range' in only)) {
			const text = (only as { text?: unknown }).text
			return typeof text === 'string' ? text : null
		}
	}
	// Longer documents arrive as ranged changes (the server advertises
	// incremental sync, and tinymist does); applying only the last one used to
	// shred the mirror.
	return applyContentChanges(previous, changes)
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

/** Applies the diagnostic filters and forwards the result to the client. */
function publishDiagnostics(params: unknown): void {
	const diagnostics = keptDiagnostics(params)
	if (diagnostics && typeof params === 'object' && params !== null) {
		post({
			jsonrpc: '2.0',
			method: 'textDocument/publishDiagnostics',
			params: { ...params, diagnostics },
		})
	} else {
		post({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params })
	}
}

/** Drop vacuous diagnostics; returns null when params are malformed. */
function keptDiagnostics(params: unknown): unknown[] | null {
	if (typeof params !== 'object' || params === null || !('diagnostics' in params)) return null
	const diagnostics = params.diagnostics
	if (!Array.isArray(diagnostics)) return null
	const uri = typeof params === 'object' && 'uri' in params && typeof params.uri === 'string' ? params.uri : null
	const text = uri ? docs.get(uri)?.text : undefined
	return diagnostics.filter((d) => {
		if (isVacuousFontDiagnostic(d)) return false
		// Files that exist in the project but cannot enter the analysis world
		// (binary files, or files added after the document was analyzed) must
		// not report "failed to load file".
		if (text && uri && isMissingProjectFileDiagnostic(d, uri, text)) return false
		return true
	})
}

function isVacuousFontDiagnostic(d: unknown): boolean {
	if (typeof d !== 'object' || d === null || !('severity' in d) || !('message' in d)) return false
	return d.severity === 1 && d.message === VACUOUS_FONT_DIAGNOSTIC
}

function isMissingProjectFileDiagnostic(d: unknown, uri: string, text: string): boolean {
	if (typeof d !== 'object' || d === null || !('message' in d) || !('range' in d)) return false
	if (typeof d.message !== 'string' || !d.message.startsWith('failed to load file')) return false
	const refs = referencedPaths(text, d.range)
	// Nothing to check means nothing was understood, and an ununderstood
	// diagnostic is kept: a real missing file must never be swallowed.
	if (refs.length === 0) return false
	// A range can name several paths (`#include("a.typ", "b.typ")` is one call with
	// two candidates), and the diagnostic does not say which one failed. Suppress
	// only when *every* candidate is a project file: whatever it is about then
	// exists in the project, so the failure is one of the false positives this
	// filter exists for. Suppressing on "some" would hide a genuine missing file.
	return refs.every((ref) => isProjectFile(uri, ref))
}

interface LspPosition {
	line: number
	character: number
}

function asPosition(value: unknown): LspPosition | null {
	if (typeof value !== 'object' || value === null || !('line' in value) || !('character' in value)) {
		return null
	}
	if (typeof value.line !== 'number' || typeof value.character !== 'number') return null
	return { line: value.line, character: value.character }
}

/**
 * Every path a diagnostic's range may name, in source order: its quoted string
 * literals, or the range text itself when it *is* the path (a reference whose
 * range covers the value rather than the literal). An empty slice means the
 * mirror and the server disagree about the document — which is why callers get
 * no candidate at all rather than a guessed one.
 */
function referencedPaths(text: string, range: unknown): string[] {
	if (typeof range !== 'object' || range === null || !('start' in range) || !('end' in range)) {
		return []
	}
	const start = asPosition(range.start)
	const end = asPosition(range.end)
	if (!start || !end) return []
	const slice = text.slice(docOffset(text, start), docOffset(text, end))
	const literals = Array.from(slice.matchAll(/["']([^"']+)["']/g), (match) => match[1])
	if (literals.length > 0) return literals
	const bare = slice.trim()
	return bare ? [bare] : []
}

function docOffset(text: string, pos: LspPosition): number {
	let offset = 0
	for (let line = 0; line < pos.line; line++) {
		const next = text.indexOf('\n', offset)
		if (next < 0) return text.length
		offset = next + 1
	}
	return Math.min(offset + pos.character, text.length)
}

function isProjectFile(uri: string, ref: string): boolean {
	const slash = uri.lastIndexOf('/')
	const base = decodeURIComponent(uri.slice('file://'.length, slash < 0 ? undefined : slash)) || '/'
	const joined = ref.startsWith('/') ? ref : `${base}/${ref}`
	return projectFiles.has(normalizePath(joined))
}

function normalizePath(path: string): string {
	const parts: string[] = []
	for (const segment of path.split('/')) {
		if (!segment || segment === '.') continue
		if (segment === '..') parts.pop()
		else parts.push(segment)
	}
	return '/' + parts.join('/')
}

function updateProjectFiles(paths: string[]): void {
	const next = new Set(paths.map((p) => normalizePath(`/${p.replace(/^\/+/, '')}`)))
	let changed = next.size !== projectFiles.size
	if (!changed) {
		for (const path of next) {
			if (!projectFiles.has(path)) {
				changed = true
				break
			}
		}
	}
	if (!changed) return
	projectFiles.clear()
	for (const path of next) projectFiles.add(path)
	// New files must be visible to the analysis of open documents.
	nudgeUserDocsSoon()
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
	const state = packages.get(key)
	if (state?.status === 'ready') return state.root
	// A version that cannot be fetched (removed, mistyped, registry down) must
	// not put the registry back on the path of every later analysis pass.
	if (state?.status === 'failed' && state.attempts >= PACKAGE_FETCH_ATTEMPTS) return undefined
	if (state === undefined || state.status === 'failed') {
		const attempts = state?.status === 'failed' ? state.attempts + 1 : 1
		packages.set(key, { status: 'fetching' })
		void fetchPackage(spec, key, attempts).catch((error) => {
			console.warn('[tinymist] failed to load package', key, error)
			packages.set(key, { status: 'failed', attempts })
		})
	}
	return undefined
}

async function fetchPackage(spec: TinymistPackageSpec, key: string, attempt: number): Promise<void> {
	const url = `${PACKAGE_TARBALL_URL}/${spec.namespace}/${spec.name}-${spec.version}.tar.gz`
	const response = await fetch(url)
	if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
	const data = new Uint8Array(await response.arrayBuffer())
	const root = `/pkg/${spec.namespace}/${spec.name}/${spec.version}`
	const ctx = new wasmModule.ProxyContext({})
	// One memory document per text file: remember them so the package can be
	// evicted as a whole later.
	const opened: string[] = []
	ctx.untar(data, (path, value) => {
		if (!PACKAGE_TEXT_FILE.test(path)) return
		opened.push(openMemoryDoc(`${root}/${path}`, new TextDecoder().decode(value)))
	})
	packages.set(key, { status: 'ready', root })
	packageDocs.set(key, opened)
	evictPackages()
	console.log('[tinymist] package ready', key, `attempt ${attempt}`, `${opened.length} files`)
	nudgeUserDocsSoon()
}

/**
 * Drops the packages that were fetched longest ago once the cap is exceeded,
 * closing their memory documents with them.
 */
function evictPackages(): void {
	const ready = [...packages].filter(([, state]) => state.status === 'ready')
	if (ready.length <= PACKAGE_CACHE_LIMIT) return
	for (const [key] of ready.slice(0, ready.length - PACKAGE_CACHE_LIMIT)) {
		for (const uri of packageDocs.get(key) ?? []) {
			docs.delete(uri)
			server.on_notification('textDocument/didClose', { textDocument: { uri } })
		}
		packageDocs.delete(key)
		packages.delete(key)
		console.log('[tinymist] evicted package', key)
	}
}

/** Opens a package document in the analysis world; returns its URI. */
function openMemoryDoc(path: string, text: string): string {
	const uri = pathToUri(path)
	docs.set(uri, { text, version: 1, languageId: 'typst' })
	server.on_notification('textDocument/didOpen', {
		textDocument: { uri, languageId: 'typst', version: 1, text },
	})
	return uri
}

let nudgeTimer: number | undefined

/**
 * Re-runs the analysis of the open documents after something the server cannot
 * see changed: project files appearing or disappearing, and a package's
 * documents arriving after the document was already analyzed.
 *
 * Each document is closed and re-opened rather than sent as a `didChange`: LSP
 * requires a strictly increasing version, and inventing one here would put our
 * counter above the one `@codemirror/lsp-client` keeps — it sends its own
 * version with the very next keystroke. A re-open restarts the analysis just as
 * well, with the version both sides already agree on.
 */
function nudgeUserDocsSoon(): void {
	clearTimeout(nudgeTimer)
	nudgeTimer = self.setTimeout(() => {
		if (!ready) return
		for (const [uri, state] of docs) {
			if (!USER_DOC_URI.test(uri) || uri.startsWith('file:///pkg/')) continue
			server.on_notification('textDocument/didClose', { textDocument: { uri } })
			server.on_notification('textDocument/didOpen', {
				textDocument: { uri, languageId: state.languageId, version: state.version, text: state.text },
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
				publishDiagnostics(notification.params)
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
	// Terminal for this worker: `failed` stops the message buffer from growing
	// for a server that will never read it (the client tears the worker down
	// when it sees this status).
	failed = true
	;(self as unknown as Worker).postMessage({
		type: 'status',
		status: 'error',
		detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
	})
})
