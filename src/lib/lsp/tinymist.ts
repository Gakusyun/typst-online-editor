// Tinymist WASM language server loader.
//
// The prebuilt artifacts are published inside the `shiki-tinymist` npm package
// (a wasm-pack build of tinymist 0.14.18); like every other compiler asset in
// this app they are fetched from a CDN mirror at runtime and never bundled.
// Keep the version in TINYMIST_CDN_BASE pinned — the JS glue and the wasm must
// come from the same build.
export const TINYMIST_CDN_BASE = 'https://cdn.jsdmirror.com/npm/shiki-tinymist@0.1.0/dist/tinymist'
export const TINYMIST_JS_URL = `${TINYMIST_CDN_BASE}/tinymist.js`
export const TINYMIST_WASM_URL = `${TINYMIST_CDN_BASE}/tinymist_bg.wasm`

export interface TinymistPackageSpec {
	namespace: string
	name: string
	version: string
}

export interface TinymistServerRequest {
	id: number
	method: string
	params: unknown
}

export interface TinymistServerNotification {
	method: string
	params: unknown
}

export interface TinymistServerSender {
	/** Queued internal event ids; must be pumped via `on_event`, never inline. */
	sendEvent(eventId: number): void
	/** Server-initiated request; the host must later answer with `on_response`. */
	sendRequest(request: TinymistServerRequest): void
	sendNotification(notification: TinymistServerNotification): void
	/** Resolve a Typst Universe package to a virtual directory of open files. */
	resolveFn(spec: TinymistPackageSpec): string | undefined
}

export interface TinymistLanguageServer {
	/** LSP request; may return the result directly or as a promise. */
	on_request(method: string, params: unknown): unknown
	on_notification(method: string, params: unknown): void
	on_response(response: { id: number; result: unknown }): void
	on_event(eventId: number): void
}

export interface TinymistWasmModule {
	TinymistLanguageServer: new (sender: TinymistServerSender) => TinymistLanguageServer
	ProxyContext: new (context: unknown) => {
		/** Untar a .tar.gz archive, calling cb(path, data, mtime) per file. */
		untar(data: Uint8Array, cb: (path: string, value: Uint8Array, mtime: number) => void): void
	}
	default(init?: { module_or_path: unknown }): Promise<unknown>
}

let modulePromise: Promise<TinymistWasmModule> | null = null

export function loadTinymistModule(): Promise<TinymistWasmModule> {
	modulePromise ??= (async () => {
		// Dynamic import is required here: TINYMIST_JS_URL is a remote CDN URL
		// that must stay out of the bundle, so no static import can name it.
		const mod = (await import(/* @vite-ignore */ TINYMIST_JS_URL)) as TinymistWasmModule
		await mod.default({ module_or_path: TINYMIST_WASM_URL })
		return mod
	})()
	return modulePromise
}
