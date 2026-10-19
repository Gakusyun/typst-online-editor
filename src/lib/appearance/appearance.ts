/**
 * Editor/appearance choices (Settings → Fonts and Settings → General).
 *
 * A font choice is a CSS font family *name* that must resolve on the user's
 * machine. It never touches the Typst compiler — the compiled PDF uses the
 * CDN/uploaded fonts in `@/lib/typst/fonts` — it only styles the interface and
 * the code editor (diagnostics included). The word wrap flag likewise only
 * affects the code editor's display.
 *
 * The state itself lives in `./AppearanceProvider`; this module holds the pure
 * parts: persistence, normalization, and the CSS custom properties the choice
 * is published as.
 */

/** `localStorage` key holding the interface font family. */
export const UI_FONT_KEY = 'typst-ui-font'

/** `localStorage` key holding the editor font family. */
export const EDITOR_FONT_KEY = 'typst-editor-font'

/** `localStorage` key holding whether the editor wraps long lines. */
export const EDITOR_WORD_WRAP_KEY = 'typst-editor-word-wrap'

/** Custom property the interface font family is published as (see `globals.css`). */
export const UI_FONT_VAR = '--app-ui-font'

/** Custom property the editor font family is published as (see `globals.css`). */
export const EDITOR_FONT_VAR = '--app-editor-font'

/**
 * `var()` reference for the interface font, falling back to
 * `--app-ui-font-fallback` (the default stack, declared in `globals.css`).
 */
export const UI_FONT_STACK = `var(${UI_FONT_VAR}, var(--app-ui-font-fallback))`

/** `var()` reference for the editor font, falling back to the monospace stack. */
export const EDITOR_FONT_STACK = `var(${EDITOR_FONT_VAR}, var(--app-editor-font-fallback))`

/** A chosen font family, or `null` for the built-in default stack. */
export type FontChoice = string | null

/**
 * A user-entered value as a choice: trimmed, with quotes and backslashes
 * removed so the name is safe to quote in CSS; empty means "default".
 */
export function normalizeFontChoice(value: string): FontChoice {
	const cleaned = value.replace(/["'\\]/g, '').trim()
	return cleaned === '' ? null : cleaned
}

export function readFontChoice(key: string): FontChoice {
	return normalizeFontChoice(localStorage.getItem(key) ?? '')
}

export function writeFontChoice(key: string, choice: FontChoice): void {
	if (choice === null) localStorage.removeItem(key)
	else localStorage.setItem(key, choice)
}

/**
 * Editor word wrap. Absent key = off, which is also CodeMirror's default
 * (long lines scroll horizontally).
 */
export function readEditorWordWrap(): boolean {
	return localStorage.getItem(EDITOR_WORD_WRAP_KEY) === 'true'
}

export function writeEditorWordWrap(enabled: boolean): void {
	if (enabled) localStorage.setItem(EDITOR_WORD_WRAP_KEY, 'true')
	else localStorage.removeItem(EDITOR_WORD_WRAP_KEY)
}

/** Publish `choice` as custom property `name` on `<html>`; `null` clears it. */
export function applyFontVar(name: string, choice: FontChoice): void {
	const root = document.documentElement
	// Always quoted: family names contain spaces (`JetBrains Mono`).
	if (choice === null) root.style.removeProperty(name)
	else root.style.setProperty(name, `'${choice}'`)
}