// ============================================================================
// Font Configuration
// ============================================================================

// All fonts load from CDN mirrors — nothing is self-hosted in public/. Keep the
// pinned versions in sync with TYPST_WASM_URL in typst.worker.ts.

/**
 * One font file and the family name it registers. The pair travels together so
 * the manifest the Settings dialog shows (`SUPPORTED_FONT_FAMILIES`) cannot
 * drift from the list the compiler actually loads — adding a font used to mean
 * editing a second, unlinked list as well.
 */
interface FontAsset {
	/** CDN URL of the font file. */
	url: string
	/** Family name a document uses: `#set text(font: "…")`. */
	family: string
}

// Font CDN bases (pinned; bump together with the wasm pin).
export const FONT_CDN_BASE = {
	// Typst's default text font set + math fonts
	typstAssets: 'https://cdn.jsdmirror.com/gh/typst/typst-assets@v0.13.1/files/fonts/',
	// IBM Plex Sans (UI fonts)
	typstDevAssets: 'https://cdn.jsdmirror.com/gh/typst/typst-dev-assets@v0.13.1/files/fonts/',
	// CJK fonts (loaded on demand). Pinned to the `Sans2.004` release: the
	// branch `@main` used to be pinned here, which made the two ~20 MB CJK fonts
	// the compiler pulls a moving target.
	notoCJK: 'https://cdn.jsdmirror.com/gh/notofonts/noto-cjk@Sans2.004/Sans/OTF/SimplifiedChinese/',
	// Color emoji (loaded on demand)
	notoEmoji: 'https://cdn.jsdmirror.com/gh/googlefonts/noto-emoji@v2.047/fonts/'
} as const;

export const CORE_FONTS: FontAsset[] = [
	// Typst's default text font set (serif body, mono, NewCM10). Listed explicitly
	// because `assets: false` disables typst.ts' built-in font asset loader.
	// Grouped in the order the Settings dialog lists the families (the manifest is
	// derived from this list by first appearance).
	{ url: FONT_CDN_BASE.typstAssets + 'LibertinusSerif-Regular.otf', family: 'Libertinus Serif' },
	{ url: FONT_CDN_BASE.typstAssets + 'LibertinusSerif-Bold.otf', family: 'Libertinus Serif' },
	{ url: FONT_CDN_BASE.typstAssets + 'LibertinusSerif-Italic.otf', family: 'Libertinus Serif' },
	{ url: FONT_CDN_BASE.typstAssets + 'LibertinusSerif-BoldItalic.otf', family: 'Libertinus Serif' },
	{ url: FONT_CDN_BASE.typstAssets + 'LibertinusSerif-Semibold.otf', family: 'Libertinus Serif' },
	{ url: FONT_CDN_BASE.typstAssets + 'LibertinusSerif-SemiboldItalic.otf', family: 'Libertinus Serif' },
	{ url: FONT_CDN_BASE.typstAssets + 'NewCM10-Regular.otf', family: 'New Computer Modern' },
	{ url: FONT_CDN_BASE.typstAssets + 'NewCM10-Bold.otf', family: 'New Computer Modern' },
	{ url: FONT_CDN_BASE.typstAssets + 'NewCM10-Italic.otf', family: 'New Computer Modern' },
	{ url: FONT_CDN_BASE.typstAssets + 'NewCM10-BoldItalic.otf', family: 'New Computer Modern' },
	// Math fonts (critical for mathematical formulas)
	{ url: FONT_CDN_BASE.typstAssets + 'NewCMMath-Regular.otf', family: 'New Computer Modern Math' },
	{ url: FONT_CDN_BASE.typstAssets + 'NewCMMath-Book.otf', family: 'New Computer Modern Math' },
	{ url: FONT_CDN_BASE.typstAssets + 'NewCMMath-Bold.otf', family: 'New Computer Modern Math' },
	{ url: FONT_CDN_BASE.typstAssets + 'DejaVuSansMono.ttf', family: 'DejaVu Sans Mono' },
	{ url: FONT_CDN_BASE.typstAssets + 'DejaVuSansMono-Bold.ttf', family: 'DejaVu Sans Mono' },
	{ url: FONT_CDN_BASE.typstAssets + 'DejaVuSansMono-Oblique.ttf', family: 'DejaVu Sans Mono' },
	{ url: FONT_CDN_BASE.typstAssets + 'DejaVuSansMono-BoldOblique.ttf', family: 'DejaVu Sans Mono' },
	// IBM Plex Sans (modern UI fonts)
	{ url: FONT_CDN_BASE.typstDevAssets + 'IBMPlexSans-Regular.ttf', family: 'IBM Plex Sans' },
	{ url: FONT_CDN_BASE.typstDevAssets + 'IBMPlexSans-Bold.ttf', family: 'IBM Plex Sans' }
];

export const EMOJI_FONTS: FontAsset[] = [
	// Emoji support (Noto Color Emoji ~9 MB) — loaded on demand
	{ url: FONT_CDN_BASE.notoEmoji + 'NotoColorEmoji.ttf', family: 'Noto Color Emoji' }
];

export const CJK_FONTS: FontAsset[] = [
	// CJK (Chinese/Japanese/Korean) fonts — loaded on demand
	// Note: these are large files (~15-20 MB each)
	{ url: FONT_CDN_BASE.notoCJK + 'NotoSansCJKsc-Regular.otf', family: 'Noto Sans CJK SC' },
	{ url: FONT_CDN_BASE.notoCJK + 'NotoSansCJKsc-Bold.otf', family: 'Noto Sans CJK SC' }
];

/** The CDN URLs of a font list, for `loadFonts`. */
export function fontUrls(assets: readonly FontAsset[]): string[] {
	return assets.map((asset) => asset.url)
}

/**
 * Font families the bundled fonts register — what documents reference via
 * `#set text(font: "...")`. Derived from the lists above, in the order the
 * Settings dialog shows them, so a new font cannot be half-added.
 * User-uploaded .ttf/.otf files are additionally available under the family
 * name defined inside each file.
 */
export const SUPPORTED_FONT_FAMILIES: string[] = [
	...new Set([...CORE_FONTS, ...CJK_FONTS, ...EMOJI_FONTS].map((asset) => asset.family))
];