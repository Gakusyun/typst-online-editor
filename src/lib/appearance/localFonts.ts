/**
 * System fonts through the Local Font Access API (`navigator.queryLocalFonts()`).
 *
 * Chromium-only and permission-gated: the first call needs a user gesture, and a
 * denied permission rejects with `NotAllowedError`/`SecurityError`. Enumeration
 * is the point — a font installed in the *user* font directory is not always
 * reachable by `font-family` alone, so a chosen family is also registered as a
 * `FontFace` ({@link registerSystemFont}).
 */

/** The API bound to `navigator`, or `null` when unavailable (non-Chromium). */
function queryFn(): (() => Promise<LocalFontData[]>) | null {
	const query = typeof navigator === 'undefined' ? undefined : navigator.queryLocalFonts
	return typeof query === 'function' ? query.bind(navigator) : null
}

export function isSystemFontsSupported(): boolean {
	return queryFn() !== null
}

/**
 * Every installed font. Throws when the API is unsupported or the permission is
 * denied; requires a user gesture while the permission is still in `prompt`.
 */
export async function querySystemFonts(): Promise<LocalFontData[]> {
	const query = queryFn()
	if (!query) throw new Error('Local Font Access API is not available')
	return await query()
}

/** Distinct family names of `fonts`, in the user's locale order. */
export function fontFamilies(fonts: LocalFontData[]): string[] {
	const families = new Set(fonts.map((font) => font.family).filter((family) => family !== ''))
	return [...families].sort((a, b) => a.localeCompare(b))
}

/** Whether an error from {@link querySystemFonts} means the user said no. */
export function isFontAccessDenied(error: unknown): boolean {
	return (
		error instanceof DOMException &&
		(error.name === 'NotAllowedError' || error.name === 'SecurityError')
	)
}

/** Families already published to the document; registration is not idempotent. */
const registered = new Set<string>()

/**
 * Publish an installed font family to CSS as a loaded `FontFace`, so a family
 * from the user font directory renders even where `font-family` alone misses it.
 *
 * `fonts` is an already-fetched enumeration (the Settings dialog has one);
 * without it, the API is queried again. Never throws: `false` just means CSS
 * falls back to the default stack.
 */
export async function registerSystemFont(family: string, fonts?: LocalFontData[]): Promise<boolean> {
	if (registered.has(family)) return true
	// Without the API the family is still usable through plain `font-family`;
	// only enumeration needs the permission, so its absence is not a failure.
	if (!fonts && !isSystemFontsSupported()) return false
	try {
		const list = fonts ?? (await querySystemFonts())
		const wanted = family.toLowerCase()
		const match = list.find((font) => font.family.toLowerCase() === wanted)
		if (!match) return false
		// `FontFace` wants a `BufferSource`, not the `Blob` the API hands out.
		const file = await match.blob()
		const face = new FontFace(family, await file.arrayBuffer())
		await face.load()
		document.fonts.add(face)
		registered.add(family)
		return true
	} catch (error) {
		// A denied permission is a normal choice; anything else is worth telling
		// the user about.
		if (!isFontAccessDenied(error)) {
			console.warn('[local-fonts] could not register font', family, error)
		}
		return false
	}
}