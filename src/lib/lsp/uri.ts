/**
 * The URI scheme the Tinymist worker and the CodeMirror workspace agree on:
 * a project path (`main.typ`, `img/logo.svg`) is mapped to `file:///main.typ`.
 * Both sides used to carry their own copy of this — a drift there silently
 * breaks the package documents and the missing-file diagnostic filter.
 */

/** Project path (no leading slash) → the LSP URI for it. */
export function pathToUri(path: string): string {
	const encoded = path
		.split('/')
		.filter(Boolean)
		.map(encodeURIComponent)
		.join('/')
	return `file:///${encoded}`
}

/** The LSP URI back into a project path. */
export function uriToPath(uri: string): string {
	const pathname = new URL(uri).pathname
	return decodeURIComponent(pathname).replace(/^\//, '')
}