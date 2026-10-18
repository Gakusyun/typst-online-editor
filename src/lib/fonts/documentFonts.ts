/**
 * Installed fonts a document asks for, read on demand for a single compilation.
 *
 * The Typst compiler cannot see the machine's fonts, so a family the source sets
 * with `#set text(font: "…")` is read through the Local Font Access API and handed
 * to the compiler as raw font data. Nothing is cached here: the data is read for
 * the compile that needs it and released as soon as that compile is done (the
 * worker drops the compiler that carried it), so system fonts never accumulate.
 *
 * On by default: a document that names an installed family compiles with it
 * without ceremony. Settings can switch it off, and its checkbox is also the
 * user gesture that grants the permission the API needs on first use.
 */
import { cachedSystemFonts, isSystemFontsSupported, querySystemFonts } from './localFonts'

/** `localStorage` key: document system fonts are off only when it says `'0'`. */
const DOCUMENT_FONTS_KEY = 'typst-document-fonts'

/** How far past a `font:` keyword the font argument is scanned for literals. */
const FONT_ARGUMENT_WINDOW = 400

/** Faces Typst selects by style; a family's remaining weights are skipped. */
const TYPST_STYLES = ['regular', 'bold', 'italic', 'bold italic']

export interface DocumentSystemFonts {
	/** Faces the worker does not hold yet, keyed by family. */
	fonts: Record<string, Uint8Array<ArrayBuffer>[]>

	/** Every installed family the project references (lowercased). */
	families: string[]
}

/** Families the worker already received; their data is not read again. */
const sentFamilies = new Set<string>()

/** Why a family the source names did not reach the compiler. */
export type DocumentFontMiss =
	/** The feature is switched off in Settings. */
	| 'disabled'
	/** The browser cannot read local fonts at all (non-Chromium, or hidden API). */
	| 'unsupported'
	/** The API exists but refused: permission, opaque origin, or no user gesture. */
	| 'denied'
	/** No installed family goes by that name. */
	| 'not-installed'
	/** Installed, but its font data could not be read. */
	| 'unreadable'

/**
 * Why `family` — a name the compile did not get — was left out. Used to explain
 * the language server's `unknown font family` warning instead of leaving the
 * user with a bare "not found".
 */
export function documentFontMiss(family: string): DocumentFontMiss {
	if (!isDocumentSystemFontsEnabled()) return 'disabled'
	if (!isSystemFontsSupported()) return 'unsupported'
	const installed = cachedSystemFonts()
	// Never enumerated: the API refused somewhere along the way.
	if (installed === null) return 'denied'
	const wanted = family.trim().toLowerCase()
	if (!installed.some((font) => font.family.toLowerCase() === wanted)) return 'not-installed'
	return 'unreadable'
}

/**
 * On by default — a document naming an installed family should compile with it
 * without ceremony. Reading machine fonts needs no user gesture once the
 * permission is in place, and a refusal just falls back to the CDN fonts.
 */
export function isDocumentSystemFontsEnabled(): boolean {
	return localStorage.getItem(DOCUMENT_FONTS_KEY) !== '0'
}

export function setDocumentSystemFontsEnabled(enabled: boolean): void {
	// Absent means on: opting out is explicit, opting in writes nothing.
	if (enabled) localStorage.removeItem(DOCUMENT_FONTS_KEY)
	else localStorage.setItem(DOCUMENT_FONTS_KEY, '0')
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
	const none: DocumentSystemFonts = { fonts: {}, families: [] }
	if (!isDocumentSystemFontsEnabled() || !isSystemFontsSupported()) return none
	try {
		const wanted = new Set<string>()
		for (const content of Object.values(files)) {
			// `data:` entries are uploads (images, fonts), not Typst source.
			if (content.startsWith('data:')) continue
			for (const family of referencedFontFamilies(content)) wanted.add(family.toLowerCase())
		}

		const families: string[] = []
		const fonts: Record<string, Uint8Array<ArrayBuffer>[]> = {}
		if (wanted.size > 0) {
			const installed = await querySystemFonts()
			for (const family of wanted) {
				const faces = facesOfFamily(installed, family)
				if (faces.length === 0) continue
				// The worker keeps a family's data while the document references it, so
				// it is read once here and released as soon as the reference goes away.
				if (sentFamilies.has(family)) {
					families.push(family)
					continue
				}
				const buffers: Uint8Array<ArrayBuffer>[] = []
				for (const face of faces) {
					const blob = await face.blob()
					// Some builds enumerate fonts but cannot read them (headless returns
					// an empty blob): an empty face is not a font the compiler can use.
					if (blob.size === 0) continue
					buffers.push(new Uint8Array(await blob.arrayBuffer()) as Uint8Array<ArrayBuffer>)
				}
				// Only families we actually read count as resolved: the language server
				// filter trusts this list.
				if (buffers.length === 0) continue
				fonts[family] = buffers
				families.push(family)
				sentFamilies.add(family)
			}
		}

		// Forget families the document no longer references: the worker releases
		// them on this compile, so a later reference must read them again.
		for (const family of sentFamilies) {
			if (!families.includes(family)) sentFamilies.delete(family)
		}
		if (families.length > 0) {
			console.log('[fonts] system fonts for this compile:', families.join(', '))
		}
		return { fonts, families }
	} catch (error) {
		console.warn('[fonts] could not read the document system fonts', error)
		return none
	}
}