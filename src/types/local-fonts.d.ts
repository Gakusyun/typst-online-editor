/**
 * Local Font Access API (W3C draft, Chromium-only) — `navigator.queryLocalFonts()`.
 *
 * TypeScript 7's `lib.dom` does not declare it, so the parts this app uses are
 * declared here (this file has no imports, so it augments the global scope).
 * `queryLocalFonts` is optional on purpose: the API is missing on non-Chromium
 * browsers and in insecure contexts, and callers must feature-detect it.
 */

/** One installed font; `family` is the CSS family name. */
interface LocalFontData {
	readonly family: string
	readonly fullName: string
	readonly postscriptName: string
	readonly style: string
	/** The font file; reading it needs the same permission as the lookup. */
	blob(): Promise<Blob>
}

interface QueryLocalFontsOptions {
	postscriptNames?: string[]
}

interface Navigator {
	queryLocalFonts?(options?: QueryLocalFontsOptions): Promise<LocalFontData[]>
}