/**
 * The document mirror of the Tinymist LSP worker: applies the content changes
 * of a `textDocument/didChange` notification to the worker's copy of a file.
 *
 * `@codemirror/lsp-client` sends a single whole-document change only for
 * documents below 1024 characters; longer ones — and every document once the
 * server advertises incremental sync, which tinymist does — arrive as *ranged*
 * changes. Taking just the last change's `text` therefore replaced the mirror
 * with one inserted fragment.
 *
 * Positions follow the LSP convention: `line` is 0-based and `character` counts
 * UTF-16 code units, which is exactly the unit a JavaScript string is indexed
 * by, so the offsets are plain string arithmetic — no code-point conversion is
 * involved and surrogate pairs need no special treatment.
 *
 * Pure and dependency-free (no worker globals), so the mirror semantics can be
 * exercised on their own.
 */

interface LspPosition {
	line: number
	character: number
}

interface ChangeSpan {
	start: LspPosition
	end: LspPosition
}

/**
 * Applies `contentChanges` to `text` in order. A change without a `range`
 * replaces the whole document; a change with a range replaces its `[start, end)`
 * slice. Positions that fall outside the text are clamped instead of rejected:
 * the server counts a line/character the mirror may not have yet, and refusing
 * the change would lose every change after it.
 */
export function applyContentChanges(text: string, contentChanges: unknown): string {
	if (!Array.isArray(contentChanges)) return text
	let result = text
	for (const change of contentChanges) {
		if (typeof change !== 'object' || change === null) continue
		const { range, text: inserted } = change as { range?: unknown; text?: unknown }
		if (typeof inserted !== 'string') continue
		const span = changeSpan(range)
		if (span === null) {
			// No range (or an unreadable one): the change carries the whole
			// document, which is also the only safe reading of a broken range.
			result = inserted
			continue
		}
		const from = offsetAt(result, span.start)
		const to = offsetAt(result, span.end)
		// `Math.max` also covers a reversed span, which is then a insertion at
		// `from` rather than a slice of negative length.
		result = result.slice(0, from) + inserted + result.slice(Math.max(from, to))
	}
	return result
}

/** The range of a change, or null when it has none (or an unreadable one). */
function changeSpan(range: unknown): ChangeSpan | null {
	if (typeof range !== 'object' || range === null || !('start' in range) || !('end' in range)) {
		return null
	}
	const start = asPosition(range.start)
	const end = asPosition(range.end)
	return start && end ? { start, end } : null
}

/** A position with finite, whole, non-negative line and character numbers. */
function asPosition(value: unknown): LspPosition | null {
	if (typeof value !== 'object' || value === null) return null
	const { line, character } = value as { line?: unknown; character?: unknown }
	if (typeof line !== 'number' || typeof character !== 'number') return null
	if (!Number.isFinite(line) || !Number.isFinite(character)) return null
	return { line: Math.max(0, Math.trunc(line)), character: Math.max(0, Math.trunc(character)) }
}

/** Offset of `position` in `text`, clamped to the end of its own line. */
function offsetAt(text: string, position: LspPosition): number {
	let start = 0
	for (let line = 0; line < position.line; line++) {
		const lineBreak = nextLineBreak(text, start)
		// The requested line does not exist: the position is past the document.
		if (lineBreak < 0) return text.length
		// Every LSP line break ends one line: a `\r\n` pair counts as one break.
		const crlf = text.charCodeAt(lineBreak) === 13 && text.charCodeAt(lineBreak + 1) === 10
		start = lineBreak + (crlf ? 2 : 1)
	}
	const lineBreak = nextLineBreak(text, start)
	const limit = lineBreak < 0 ? text.length : lineBreak
	return Math.max(start, Math.min(start + position.character, limit))
}

/** Offset of the next `\n` or `\r`, or -1 when there is none. */
function nextLineBreak(text: string, from: number): number {
	for (let index = from; index < text.length; index++) {
		const code = text.charCodeAt(index)
		if (code === 10 /* \n */ || code === 13 /* \r */) return index
	}
	return -1
}