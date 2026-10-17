// ============================================================================
// Font Configuration
// ============================================================================

// All fonts load from CDN mirrors — nothing is self-hosted in public/. Keep the
// pinned versions in sync with TYPST_WASM_URL in typst.worker.ts.

// Font CDN bases (pinned; bump together with the wasm pin).
export const FONT_CDN_BASE = {
	// Typst's default text font set + math fonts
	typstAssets: 'https://cdn.jsdmirror.com/gh/typst/typst-assets@v0.13.1/files/fonts/',
	// IBM Plex Sans (UI fonts)
	typstDevAssets: 'https://cdn.jsdmirror.com/gh/typst/typst-dev-assets@v0.13.1/files/fonts/',
	// CJK fonts (loaded on demand)
	notoCJK: 'https://cdn.jsdmirror.com/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/',
	// Color emoji (loaded on demand)
	notoEmoji: 'https://cdn.jsdmirror.com/gh/googlefonts/noto-emoji@v2.047/fonts/'
} as const;

export const CORE_FONTS: string[] = [
	// IBM Plex Sans (modern UI fonts)
	FONT_CDN_BASE.typstDevAssets + 'IBMPlexSans-Regular.ttf',
	FONT_CDN_BASE.typstDevAssets + 'IBMPlexSans-Bold.ttf',
	// Math fonts (critical for mathematical formulas)
	FONT_CDN_BASE.typstAssets + 'NewCMMath-Regular.otf',
	FONT_CDN_BASE.typstAssets + 'NewCMMath-Book.otf',
	// Typst's default text font set (serif body, mono, NewCM10). Listed explicitly
	// because `assets: false` disables typst.ts' built-in font asset loader.
	FONT_CDN_BASE.typstAssets + 'DejaVuSansMono.ttf',
	FONT_CDN_BASE.typstAssets + 'DejaVuSansMono-Bold.ttf',
	FONT_CDN_BASE.typstAssets + 'DejaVuSansMono-Oblique.ttf',
	FONT_CDN_BASE.typstAssets + 'DejaVuSansMono-BoldOblique.ttf',
	FONT_CDN_BASE.typstAssets + 'LibertinusSerif-Regular.otf',
	FONT_CDN_BASE.typstAssets + 'LibertinusSerif-Bold.otf',
	FONT_CDN_BASE.typstAssets + 'LibertinusSerif-Italic.otf',
	FONT_CDN_BASE.typstAssets + 'LibertinusSerif-BoldItalic.otf',
	FONT_CDN_BASE.typstAssets + 'LibertinusSerif-Semibold.otf',
	FONT_CDN_BASE.typstAssets + 'LibertinusSerif-SemiboldItalic.otf',
	FONT_CDN_BASE.typstAssets + 'NewCM10-Regular.otf',
	FONT_CDN_BASE.typstAssets + 'NewCM10-Bold.otf',
	FONT_CDN_BASE.typstAssets + 'NewCM10-Italic.otf',
	FONT_CDN_BASE.typstAssets + 'NewCM10-BoldItalic.otf',
	FONT_CDN_BASE.typstAssets + 'NewCMMath-Bold.otf'
];

export const EMOJI_FONTS: string[] = [
	// Emoji support (Noto Color Emoji ~9 MB) — loaded on demand
	FONT_CDN_BASE.notoEmoji + 'NotoColorEmoji.ttf'
];

export const CJK_FONTS: string[] = [
	// CJK (Chinese/Japanese/Korean) fonts — loaded on demand
	// Note: these are large files (~15-20 MB each)
	FONT_CDN_BASE.notoCJK + 'NotoSansCJKsc-Regular.otf',
	FONT_CDN_BASE.notoCJK + 'NotoSansCJKsc-Bold.otf'
];

/**
 * Font families the bundled fonts register — what documents reference via
 * `#set text(font: "...")`. Family names come from the font files themselves;
 * keep in sync with the font lists above (shown in the Settings dialog).
 * User-uploaded .ttf/.otf files are additionally available under the family
 * name defined inside each file.
 */
export const SUPPORTED_FONT_FAMILIES: string[] = [
	'Libertinus Serif',
	'New Computer Modern',
	'New Computer Modern Math',
	'DejaVu Sans Mono',
	'IBM Plex Sans',
	'Noto Sans CJK SC',
	'Noto Color Emoji'
];
