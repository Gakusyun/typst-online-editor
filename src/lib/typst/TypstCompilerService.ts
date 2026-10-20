import { CompileError, TypstWorkerClient } from './typstClient'
import type { CompileImages } from './protocol'

export type CompileStatus = 'idle' | 'compiling' | 'done' | 'error'

export interface CompileListener {
	onStatusChange?: (status: CompileStatus) => void
	onSuccess?: (pdf: Uint8Array<ArrayBuffer>, pdfUrl: string) => void
	onError?: (error: string) => void
}

/** A decoded `data:` file and the content it was decoded from. */
type CachedBinary = { content: string; bytes: Uint8Array<ArrayBuffer>; version: number }

/**
 * Splits a `data:` URL into bytes. Base64 payloads are decoded directly; every
 * other payload (a parameterised URL, a plain `data:text/plain,...`) goes
 * through `fetch`, which implements the whole `data:` grammar — those used to
 * land in neither the text nor the binary set and silently vanish, surfacing
 * later as a bogus "not part of this project" diagnostic.
 */
async function decodeDataUrl(content: string): Promise<Uint8Array<ArrayBuffer>> {
	const base64 = /^data:[^,]*;base64,(.+)$/.exec(content)
	if (base64) {
		const binaryString = atob(base64[1])
		const bytes = new Uint8Array(binaryString.length)
		for (let i = 0; i < binaryString.length; i += 1) {
			bytes[i] = binaryString.charCodeAt(i)
		}
		return bytes
	}

	const response = await fetch(content)
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`)
	}
	return new Uint8Array(await response.arrayBuffer())
}

export class TypstCompilerService {
	private client: TypstWorkerClient
	private compileSeq = 0
	private currentPdfUrl: string | null = null
	private listeners: CompileListener[] = []
	// Decoded binaries by path. Compiles fire on every debounced keystroke, and
	// re-`atob`-ing (plus byte-looping) a multi-megabyte font each time cost that
	// CPU and garbage for a file that had not changed.
	private binaries = new Map<string, CachedBinary>()
	/** Bumped per fresh decode; the worker shadows only what changed (see protocol). */
	private binaryVersion = 0

	constructor() {
		this.client = new TypstWorkerClient()
	}

	/**
	 * Add a listener for compile events
	 */
	addListener(listener: CompileListener): () => void {
		this.listeners.push(listener)
		return () => {
			const index = this.listeners.indexOf(listener)
			if (index > -1) {
				this.listeners.splice(index, 1)
			}
		}
	}

	/**
	 * Compile Typst project to PDF
	 */
	async compile(files: Record<string, string>, mainFile: string): Promise<void> {
		const seq = ++this.compileSeq

		this.notifyStatusChange('compiling')

		try {
			// Separate text files from binary files (images and fonts)
			const textFiles: Record<string, string> = {}
			const images: CompileImages = {}
			const imageVersions: Record<string, number> = {}

			for (const [path, content] of Object.entries(files)) {
				if (content.startsWith('data:')) {
					const binary = await this.decodeBinary(path, content)
					images[path] = binary.bytes
					imageVersions[path] = binary.version
				} else {
					// Regular text file
					textFiles[path] = content
				}
			}
			this.pruneBinaries(files)

			const result = await this.client.compilePdf(textFiles, mainFile, images, imageVersions)

			// A newer compile owns the outcome from here on
			if (seq !== this.compileSeq) {
				return
			}

			// Revoke old PDF URL
			if (this.currentPdfUrl) {
				URL.revokeObjectURL(this.currentPdfUrl)
			}

			// Create new blob URL
			const blob = new Blob([result.pdf], { type: 'application/pdf' })
			this.currentPdfUrl = URL.createObjectURL(blob)

			this.notifySuccess(result.pdf, this.currentPdfUrl)
			this.notifyStatusChange('done')
		} catch (error) {
			// A job the worker skipped (a newer request was already queued behind it)
			// or an outcome a newer compile replaced: nothing to report, the newer
			// compile owns the UI.
			if ((error instanceof CompileError && error.superseded) || seq !== this.compileSeq) {
				return
			}

			// The worker carries typst's diagnostics next to the summary message;
			// they are what the user can act on, so they win.
			const diagnostics = error instanceof CompileError ? error.diagnostics : []
			const errorMsg =
				diagnostics.length > 0
					? diagnostics.join('\n')
					: error instanceof Error
						? error.message
						: String(error)

			this.notifyError(errorMsg)
			this.notifyStatusChange('error')
		}
	}

	/**
	 * Clean up resources
	 */
	dispose(): void {
		this.client.dispose()
		if (this.currentPdfUrl) {
			URL.revokeObjectURL(this.currentPdfUrl)
			this.currentPdfUrl = null
		}
		this.binaries.clear()
		this.listeners = []
	}

	/**
	 * Decodes a binary, reusing the previous result while the file's content is
	 * unchanged. The project hands back the same content string for an untouched
	 * file, so the identity check is what keeps this off the hot path.
	 */
	private async decodeBinary(path: string, content: string): Promise<CachedBinary> {
		const cached = this.binaries.get(path)
		if (cached && cached.content === content) {
			return cached
		}

		try {
			const bytes = await decodeDataUrl(content)
			const binary: CachedBinary = { content, bytes, version: ++this.binaryVersion }
			this.binaries.set(path, binary)
			return binary
		} catch (error) {
			// A file typst cannot read is a compile error, not a log line: without
			// the file the compile would report the project as broken instead.
			const reason = error instanceof Error ? error.message : String(error)
			throw new Error(`Failed to decode the binary file "${path}": ${reason}`)
		}
	}

	/** Drops the cached decodes of files that left the project. */
	private pruneBinaries(files: Record<string, string>): void {
		// Deleting the current key during `Map` iteration is well-defined, so no
		// snapshot of the keys is needed.
		for (const path of this.binaries.keys()) {
			if (!Object.hasOwn(files, path)) {
				this.binaries.delete(path)
			}
		}
	}

	// A throwing listener must not turn a finished compile into an error: the new
	// PDF URL is already published by then, so every call is isolated.
	private notifyStatusChange(status: CompileStatus): void {
		for (const listener of this.listeners) {
			try {
				listener.onStatusChange?.(status)
			} catch (error) {
				console.error('[Typst] compile status listener failed:', error)
			}
		}
	}

	private notifySuccess(pdf: Uint8Array<ArrayBuffer>, pdfUrl: string): void {
		for (const listener of this.listeners) {
			try {
				listener.onSuccess?.(pdf, pdfUrl)
			} catch (error) {
				console.error('[Typst] compile success listener failed:', error)
			}
		}
	}

	private notifyError(error: string): void {
		for (const listener of this.listeners) {
			try {
				listener.onError?.(error)
			} catch (listenerError) {
				console.error('[Typst] compile error listener failed:', listenerError)
			}
		}
	}
}