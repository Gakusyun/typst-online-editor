/**
 * Installed fonts a document asks for, read on demand for a single compilation.
 *
 * The Typst compiler cannot see the machine's fonts, so a family the source sets
 * with `#set text(font: "…")` is read through the Local Font Access API and handed
 * to the compiler as raw font data. Nothing is cached here: the data is read for
 * the compile that needs it and released as soon as that compile is done (the
 * worker drops the compiler that carried it), so system fonts never accumulate.
 *
 * Enabled per user in Settings; the enable click also grants the permission the
 * API needs, which is why the read must not require a user gesture itself.
 */
import { isSystemFontsSupported, querySystemFonts } from './localFonts'

/** `localStorage` key: document system fonts are on when it is present. */
const DOCUMENT_FONTS_KEY = 'typst-document-fonts'

/** How far past a `font:` keyword the font argument is scanned for literals. */
const FONT_ARGUMENT_WINDOW = 400

/** Faces Typst selects by style; a family's remaining weights are skipped. */
const TYPST_STYLES = ['regular', 'bold', 'italic', 'bold italic']

export interface DocumentSystemFonts {
	/** Font data for the compiler, in the order the families were resolved. */
	fonts: Uint8Array<ArrayBuffer>[]

	/** Resolved families (lowercased), for the language server's font diagnostics. */
	families: string[]
}

export function isDocumentSystemFontsEnabled(): boolean {
	return localStorage.getItem(DOCUMENT_FONTS_KEY) !== null
}

export function setDocumentSystemFontsEnabled(enabled: boolean): void {
	if (enabled) localStorage.setItem(DOCUMENT_FONTS_KEY, '1')
	else localStorage.removeItem(DOCUMENT_FONTS_KEY)
}

/**
 * Family names the source names in a `font:` argument: every quoted literal from
 * the keyword up to the closing parenthesis. Not a parser — it covers
 * `#set text(font: "X")`, `font: ("X", "Y")` and `#show …: set text(font: …)`.
 */
export function referencedFontFamilies(text: string): string[] {
	const families = new Set<string>()
	for (const keyword of text.matchAll(/\bfont\s*:/g)) {
		const from = keyword.index + keyword[0].length
		const argument = text.slice(from, from + FONT_ARGUMENT_WINDOW).split(')')[0]
		for (const quoted of argument.matchAll(/"([^"\n]*)"/g)) families.add(quoted[1])
	}
	return [...families]
}

/**
 * The faces of `family` the compiler can select: at most the four common styles,
 * falling back to a single face when the styles are named differently.
 */
function facesOfFamily(installed: LocalFontData[], family: string): LocalFontData[] {
	const faces = installed.filter((font) => font.family.toLowerCase() === family)
	const styled = faces.filter((font) =>
		TYPST_STYLES.includes(font.style.toLowerCase().replace(/\s+/g, ' '))
	)
	return styled.length > 0 ? styled : faces.slice(0, 1)
}

/**
 * Font data for every installed family the project references, or nothing when
 * the feature is off. Never throws: an unavailable or denied API just means the
 * compiler falls back, which must not break compiling.
 */
export async function loadDocumentSystemFonts(
	files: Record<string, string>
): Promise<DocumentSystemFonts> {
	const none: DocumentSystemFonts = { fonts: [], families: [] }
	if (!isDocumentSystemFontsEnabled() || !isSystemFontsSupported()) return none
	try {
		const wanted = new Set<string>()
		for (const content of Object.values(files)) {
			// `data:` entries are uploads (images, fonts), not Typst source.
			if (content.startsWith('data:')) continue
			for (const family of referencedFontFamilies(content)) wanted.add(family.toLowerCase())
		}
		if (wanted.size === 0) return none

		const installed = await querySystemFonts()
		const fonts: Uint8Array<ArrayBuffer>[] = []
		const families: string[] = []
		for (const family of wanted) {
			const faces = facesOfFamily(installed, family)
			if (faces.length === 0) continue
			for (const face of faces) {
				const blob = await face.blob()
				fonts.push(new Uint8Array(await blob.arrayBuffer()) as Uint8Array<ArrayBuffer>)
			}
			families.push(family)
		}
		console.log('[fonts] system fonts for this compile:', families.join(', ') || '(none)')
		return { fonts, families }
	} catch (error) {
		console.warn('[fonts] could not read the document system fonts', error)
		return none
	}
}