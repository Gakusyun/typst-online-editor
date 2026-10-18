/**
 * System fonts through the Local Font Access API (`window.queryLocalFonts()`).
 *
 * Chromium-only and permission-gated: the first call needs a user gesture, and a
 * denied permission rejects with `NotAllowedError`/`SecurityError`. Enumeration
 * is the point — a font installed in the *user* font directory is not always
 * reachable by `font-family` alone, so a chosen family is also registered as a
 * `FontFace` ({@link registerSystemFont}).
 *
 * Consumers: the app-chrome font pickers only (Settings → Fonts); the compile
 * pipeline never reads machine fonts.
 */

/** The API bound to `window`, or `null` when unavailable (non-Chromium). */
function queryFn(): (() => Promise<LocalFontData[]>) | null {
	const query = typeof window === 'undefined' ? undefined : window.queryLocalFonts
	return typeof query === 'function' ? query.bind(window) : null
}

export function isSystemFontsSupported(): boolean {
	return queryFn() !== null
}

/**
 * Why the API is missing here — `null` when it is available.
 *
 * The API is desktop-Chromium-only (Chrome/Edge 103+: `chrome_android`,
 * `webview_*`, Firefox and Safari all report no support) *and* needs a secure
 * context, so every case below is one the user can act on.
 */
export type SystemFontsUnavailableReason =
	/** `http://` on a non-localhost host: the API is never exposed. */
	| 'insecure-context'
	/** Opaque origin (e.g. the page opened as `file://`): access is refused. */
	| 'opaque-origin'
	/** Cross-origin iframe whose parent did not allow `local-fonts`. */
	| 'embedded'
	/** In-app browser / WebView / Electron shell (IDE preview panes). */
	| 'webview'
	/** iOS and iPadOS: every browser there is WebKit, Chrome included. */
	| 'ios'
	/** Phone/tablet: the API was never implemented for mobile. */
	| 'mobile'
	/** Desktop Chromium that still lacks it (old version, flag, policy, fork). */
	| 'unsupported'

/** Chromium's own device hint; TS 7's `lib.dom` may not declare it, hence the cast. */
function isMobileDevice(): boolean {
	const hint = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
	// Either signal suffices: a phone user agent with a stale client hint must
	// still count as mobile.
	return hint?.mobile === true || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

/** iOS/iPadOS — iPadOS 13+ sends a desktop Macintosh UA and only touch points give it away. */
function isIosDevice(): boolean {
	const ua = navigator.userAgent
	return (
		/iPhone|iPad|iPod|CriOS|FxiOS|EdgiOS/.test(ua) ||
		(/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
	)
}

/** In-app browsers, WebViews and Electron shells — none of them ship this API. */
function isEmbeddedBrowser(): boolean {
	return /; wv\)|WebView|Electron\/|MicroMessenger|QQBrowser|Quark|UCBrowser|Lark|DingTalk/i.test(
		navigator.userAgent
	)
}

export function systemFontsUnavailableReason(): SystemFontsUnavailableReason | null {
	if (isSystemFontsSupported()) return null
	if (!window.isSecureContext) return 'insecure-context'
	if (window.location.origin === 'null') return 'opaque-origin'
	if (window.self !== window.top) return 'embedded'
	if (isEmbeddedBrowser()) return 'webview'
	if (isIosDevice()) return 'ios'
	if (isMobileDevice()) return 'mobile'
	return 'unsupported'
}

/** Last enumeration: font metadata only (no font data), safe to keep around. */
let cachedFonts: LocalFontData[] | null = null

/** Why the last enumeration failed — kept so every compile does not retry. */
let cachedFailure: unknown = null

/**
 * Every installed font. Throws when the API is unsupported or the permission is
 * denied; requires a user gesture while the permission is still in `prompt`.
 *
 * The result is cached — both the pickers and every compile ask for it — until
 * `refresh` re-reads the machine's list. A failure is cached too: a compile runs
 * on every keystroke and must not hammer an API that already said no (the
 * Settings dialog retries with `refresh` from an actual user gesture).
 */
export async function querySystemFonts(options?: { refresh?: boolean }): Promise<LocalFontData[]> {
	if (cachedFonts && !options?.refresh) return cachedFonts
	if (cachedFailure && !options?.refresh) throw cachedFailure
	const query = queryFn()
	if (!query) throw new Error('Local Font Access API is not available')
	try {
		cachedFonts = await query()
		cachedFailure = null
		return cachedFonts
	} catch (error) {
		cachedFailure = error
		throw error
	}
}

/**
 * What this session already enumerated, or `null` — UI that must not trigger a
 * permission prompt on its own (Settings) seeds its list from here.
 */
export function cachedSystemFonts(): LocalFontData[] | null {
	return cachedFonts
}

/** Distinct family names of `fonts`, in the user's locale order. */
export function fontFamilies(fonts: LocalFontData[]): string[] {
	const families = new Set(fonts.map((font) => font.family).filter((family) => family !== ''))
	return [...families].sort((a, b) => a.localeCompare(b))
}

/** Whether an error from {@link querySystemFonts} means the user said no. */
export function isFontAccessDenied(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'NotAllowedError'
}

/**
 * Whether an error means the browser refused for a reason the user did not
 * choose: a permissions policy, an opaque origin, or a call that no user
 * gesture triggered (`SecurityError` per the spec).
 */
export function isFontAccessBlocked(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'SecurityError'
}

/** Families already published to the document; registration is not idempotent. */
const registeredFaces = new Map<string, FontFace>()

/** A font that never finishes loading must not hold the flow up. */
const FONT_LOAD_TIMEOUT_MS = 5000

/** Why a family could not be published to CSS — `null` when it worked. */
export type SystemFontRegistrationError =
	/** The API gave us a font file we could not use (empty or unparsable). */
	| 'unreadable'
	/** The machine does not have a font by that name. */
	| 'not-found'
	/** The user has not granted the font permission. */
	| 'denied'
	/** The font did not finish loading in time. */
	| 'timeout'
	| 'failed'

/**
 * Whether `family` already renders through plain `font-family`: installed fonts
 * do, so registering them would only cost a full read of the file (tens of MB,
 * seconds of work). Fonts from the user's font directory may not resolve, which
 * is what registration is for.
 */
function familyResolves(family: string): boolean {
	const probe = document.createElement('span')
	probe.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:nowrap;font-size:72px'
	probe.textContent = 'mmmmmmmmmmlli'
	document.body.append(probe)
	probe.style.fontFamily = `"${family}"`
	const matched = probe.offsetWidth
	probe.style.fontFamily = '__font_probe_missing__'
	const fallback = probe.offsetWidth
	probe.remove()
	return matched !== fallback
}

/**
 * Publish an installed font family to CSS as a loaded `FontFace`, so a family
 * from the user font directory renders even where `font-family` alone misses it.
 *
 * `fonts` is an already-fetched enumeration (the Settings dialog has one);
 * without it, the API is queried again. Never throws: a failure reason is
 * returned so the UI can say what happened, and CSS falls back either way.
 */
export async function registerSystemFont(
	family: string,
	fonts?: LocalFontData[]
): Promise<SystemFontRegistrationError | null> {
	if (registeredFaces.has(family)) return null
	// Without the API the family is still usable through plain `font-family`;
	// only enumeration needs the permission, so its absence is not a failure.
	if (!fonts && !isSystemFontsSupported()) return 'not-found'
	try {
		if (familyResolves(family)) return null
		const list = fonts ?? (await querySystemFonts())
		const wanted = family.toLowerCase()
		const match = list.find((font) => font.family.toLowerCase() === wanted)
		if (!match) return 'not-found'
		// `FontFace` wants a `BufferSource`, not the `Blob` the API hands out.
		const file = await match.blob()
		// A build that enumerates fonts without being able to read them returns an
		// empty blob; there is nothing to register then.
		if (file.size === 0) return 'unreadable'
		const face = new FontFace(family, await file.arrayBuffer())
		const loaded = await Promise.race([
			face.load().then(() => true),
			new Promise<boolean>((resolve) => setTimeout(() => resolve(false), FONT_LOAD_TIMEOUT_MS)),
		])
		if (!loaded) return 'timeout'
		document.fonts.add(face)
		registeredFaces.set(family, face)
		return null
	} catch (error) {
		// A denied permission is a normal choice; anything else is worth telling
		// the user about.
		if (isFontAccessDenied(error)) return 'denied'
		if (isFontAccessBlocked(error)) return 'denied'
		console.warn('[local-fonts] could not register font', family, error)
		return 'failed'
	}
}

/**
 * Drop registered faces whose family is no longer used: a font file can be tens
 * of MB, so replacing one family with another must not keep both.
 */
export function pruneSystemFontFaces(keep: string[]): void {
	for (const [family, face] of registeredFaces) {
		if (keep.includes(family)) continue
		document.fonts.delete(face)
		registeredFaces.delete(family)
	}
}