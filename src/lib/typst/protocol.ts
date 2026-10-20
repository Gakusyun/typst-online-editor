// ============================================================================
// Compile worker protocol
// ============================================================================

// Shared by typst.worker.ts (which answers) and typstClient.ts (which asks):
// the two shapes used to be declared field-for-field on both sides with nothing
// linking them, so a change on one side could silently break the other.

/** The binary project files (images, fonts) handed to the worker. */
export type CompileImages = Record<string, Uint8Array<ArrayBuffer>>

export type CompileRequest = {
	type: 'compile'
	id: string
	files: Record<string, string> // Map of file path to content
	mainFile: string // Which file to compile
	images?: CompileImages
	/**
	 * A version per binary, bumped by the service whenever it decodes a file
	 * afresh. The worker shadows a binary into the wasm heap on every compile
	 * otherwise (a malloc + copy per file per keystroke-triggered compile), and
	 * the arrays themselves cannot be compared: the client transfers a copy of
	 * each one, so their identity changes on every send.
	 */
	imageVersions?: Record<string, number>
}

/** A compiled document, as resolved by the client. */
export type CompilePayload = {
	pdf: Uint8Array<ArrayBuffer>
}

export type CompileResponse =
	| {
			type: 'compile-result'
			id: string
			ok: true
			pdf: ArrayBuffer
	  }
	| {
			type: 'compile-result'
			id: string
			ok: false
			error: string
			// typst.ts reports diagnostics only for *failed* compiles — a successful
			// one drops its warnings — so the failure variant is the only carrier.
			diagnostics: string[]
			// The worker never compiled this job: a newer request was already queued
			// behind it and will produce the document the caller is waiting for.
			superseded?: true
	  }