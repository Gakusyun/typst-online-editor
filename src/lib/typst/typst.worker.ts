/// <reference lib="webworker" />

import {
	createTypstCompiler,
	createTypstFontBuilder,
	loadFonts,
	type TypstCompiler,
	FetchPackageRegistry,
	MemoryAccessModel
} from '@myriaddreamin/typst.ts';
import { withPackageRegistry, withAccessModel } from '@myriaddreamin/typst.ts/options.init';
import { CORE_FONTS, EMOJI_FONTS, CJK_FONTS, fontUrls } from './fonts';
import type { CompileImages, CompileRequest, CompileResponse } from './protocol';

// ============================================================================
// Configuration
// ============================================================================

// The compiler wasm loads from a CDN mirror — nothing is self-hosted in public/,
// so compiling needs network access. Keep the pinned version in sync with the
// installed @myriaddreamin/* packages (they are pinned exactly in package.json
// for that reason). Fonts: see ./fonts.
const TYPST_WASM_URL = 'https://cdn.jsdmirror.com/npm/@myriaddreamin/typst-ts-web-compiler@0.7.0/pkg/typst_ts_web_compiler_bg.wasm';

// ============================================================================
// State Management
// ============================================================================

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

let compilerPromise: Promise<TypstCompiler> | null = null;
let compileQueue: Promise<void> = Promise.resolve();
let emojiLoaded = false;
let cjkLoaded = false;
/** When the last compile *finished*; what the idle timeout is measured from. */
let lastCompileTime = Date.now();
let fontsNeedRebuild = false; // set when a dropped compiler's fonts must come back
const loadedCustomFonts: Set<string> = new Set(); // Track custom font files
/**
 * The newest request the worker has been asked for. A queued job that a later
 * request superseded is answered without compiling: its document would never be
 * rendered anyway.
 */
let latestRequestId: string | null = null;
/** Paths already handed to the current compiler, so a compile only sends the diffs. */
let sourcedFiles = new Map<string, string>();
/** Shadowed binaries, keyed by path: the version the wasm heap already holds. */
let shadowedBinaries = new Map<string, number>();

// Package registry for Typst Universe packages (mitex, cetz, fletcher, etc.)
const accessModel = new MemoryAccessModel();
const packageRegistry = new FetchPackageRegistry(accessModel);

// Compiler lifecycle: Reset after 30 minutes of inactivity to free memory
const COMPILER_IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// Helpers
// ============================================================================

/**
 * Fetcher for the CDN-hosted wasm and fonts (also used as loadFonts' `fetcher`):
 * throws on non-OK status so an error page can never reach the wasm or font parsers.
 */
const fetchCdn: typeof fetch = async (input, init) => {
	const response = await fetch(input, init);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return response;
};

/**
 * The compiler wasm bytes, fetched once per worker. Every compiler rebuild used
 * to fetch and re-read the ~27 MB module from the CDN (`LazyWasmModule`'s memo
 * is per instance), which is what made a font change expensive.
 */
let wasmBytesPromise: Promise<ArrayBuffer> | null = null;

function getWasmBytes(): Promise<ArrayBuffer> {
	wasmBytesPromise ??= fetchCdn(TYPST_WASM_URL)
		.then((response) => response.arrayBuffer())
		.catch((error) => {
			// A transient CDN failure must not be cached: the next compile retries.
			wasmBytesPromise = null;
			throw error;
		});
	return wasmBytesPromise;
}

/**
 * A font for the compiler: a URL (CDN assets), or raw font data (project font
 * files) — `loadFonts` adds bytes directly, with no base64 detour.
 */
type CompilerFont = string | Uint8Array<ArrayBuffer>

/**
 * Creates the one compiler this worker owns.
 *
 * Fonts are deliberately not installed here — `installFonts` swaps them onto the
 * live compiler instead, so a font change never needs a second compiler (and
 * never needs the memory of one). `loadFonts` below installs nothing and exists
 * only because `TypstCompiler.init` refuses to build without a font loader.
 */
async function createCompiler(): Promise<TypstCompiler> {
	const compiler = createTypstCompiler();
	await compiler.init({
		getModule: async () => await getWasmBytes(),
		beforeBuild: [
			// `assets: false` is required: with no options, TypstCompiler.init() appends a
			// default font loader ({assets: ['text']}) that downloads typst's default font
			// set from cdn.jsdelivr.net behind our back.
			loadFonts([], { assets: false, fetcher: fetchCdn }),
			withAccessModel(accessModel),
			withPackageRegistry(packageRegistry)
		]
	});
	return compiler;
}

/**
 * Points `compiler` at exactly `fonts`, whatever it carried before.
 *
 * The resolver is built from the font bytes and handed over inside `build`'s
 * callback — the documented lifetime: `TypstCompiler.setFonts` keeps the
 * compiler's own reference and `build` drops the caller's once the callback
 * returns. Font bytes are read from the (cached) CDN response on every change
 * rather than kept in JS: a permanent copy would double the font memory, which
 * is the very thing this is about.
 */
async function installFonts(compiler: TypstCompiler, fonts: CompilerFont[]): Promise<void> {
	const builder = createTypstFontBuilder();
	await builder.init({ getModule: async () => await getWasmBytes() });
	// Fetch first and in parallel: `addFontData` is sequential wasm work, but the
	// network is not, and the CDN round trips are what a font change costs.
	const bytes = await Promise.all(
		fonts.map(async (font) =>
			typeof font === 'string' ? new Uint8Array(await (await fetchCdn(font)).arrayBuffer()) : font
		)
	);
	for (const font of bytes) {
		await builder.addFontData(font);
	}
	await builder.build(async (resolver) => {
		compiler.setFonts(resolver);
	});
}

/**
 * Detects if text requires emoji fonts.
 *
 * The old pattern (`/[\uD800-\uDFFF]|…/`, no `u` flag) matched *any* surrogate
 * code unit, i.e. every astral character: a single CJK extension-B ideograph or
 * a mathematical alphanumeric triggered the ~9 MB Noto Color Emoji download and
 * a full compiler rebuild.
 */
function needsEmojiFont(text: string): boolean {
	return /\p{Extended_Pictographic}|\p{Emoji_Presentation}/u.test(text);
}

/**
 * Detects if text contains CJK (Chinese, Japanese, Korean) characters
 */
function needsCJKFont(text: string): boolean {
	// CJK Unified Ideographs and extensions
	return /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]|[\u3040-\u309F\u30A0-\u30FF]|[\uAC00-\uD7AF]/.test(text);
}

/**
 * Detects custom font files in the images/fonts collection
 */
function detectCustomFonts(images: CompileImages): string[] {
	return Object.keys(images).filter(path => 
		path.toLowerCase().endsWith('.ttf') || 
		path.toLowerCase().endsWith('.otf')
	);
}

/** Whether the compiler carries exactly `paths` as project fonts. */
function carriesFonts(paths: string[]): boolean {
	return paths.length === loadedCustomFonts.size && paths.every((path) => loadedCustomFonts.has(path));
}

// ============================================================================
// Compiler Management
// ============================================================================

/**
 * The compiler's own interface has no teardown — only `reset()`, which keeps the
 * instance. The wasm handle it wraps does have `free()`, and that is what returns
 * the Rust side (font book, caches, shadow files) to the wasm allocator instead
 * of leaving it for the garbage collector.
 */
type WasmCompiler = TypstCompiler & { compiler: { free(): void } };

function freeCompiler(compiler: TypstCompiler): void {
	// `TypstCompilerDriver` exposes the wasm handle as its `compiler` field; the
	// `TypstCompiler` interface the package exports does not.
	const handle = compiler as WasmCompiler;
	handle.compiler.free();
}

/**
 * Gets the compiler instance, creating it if necessary
 */
function getCompiler(): Promise<TypstCompiler> {
	// Check if compiler should be reset due to inactivity
	if (compilerPromise && Date.now() - lastCompileTime > COMPILER_IDLE_TIMEOUT) {
		console.log('[Typst] Resetting compiler after idle timeout');
		dropCompiler();
	}

	if (compilerPromise) return compilerPromise;

	console.log('[Typst] Initializing new compiler instance');
	const created = createCompiler().catch((error) => {
		// A rejected promise must not be cached: a single CDN hiccup used to make
		// every later compile re-await the same rejection.
		compilerPromise = null;
		throw error;
	});
	compilerPromise = created;
	return created;
}

/**
 * Drops the current compiler and returns its memory to the wasm allocator. The
 * next compile builds a fresh one.
 */
function dropCompiler(): void {
	const dropped = compilerPromise;
	compilerPromise = null;
	emojiLoaded = false;
	cjkLoaded = false;
	loadedCustomFonts.clear();
	fontsNeedRebuild = true;
	sourcedFiles = new Map();
	shadowedBinaries = new Map();
	void dropped?.then(freeCompiler).catch(() => {
		// It never came up, so there is nothing to free.
	});
}

/**
 * Makes the compiler carry exactly the fonts this document needs: the CDN
 * assets, the lazily added emoji/CJK sets, and the project's own font files.
 *
 * This is a hot swap (`TypstCompiler.setFonts`), not a rebuild: the compiler
 * instance — and the wasm instance behind it — lives until it is dropped, so a
 * font change allocates no second compiler and leaks no first one.
 *
 * `wants` is the set the caller is aiming at, not the flags as they stand: the
 * flags are committed here, *after* the fonts are in, so one failed CDN fetch
 * leaves the worker retrying instead of claiming fonts it never got.
 */
async function loadFontAssets(images: CompileImages, wants: { emoji: boolean; cjk: boolean }): Promise<void> {
	const customFontPaths = detectCustomFonts(images);
	const fonts: CompilerFont[] = [...fontUrls(CORE_FONTS)];
	if (wants.emoji) fonts.push(...fontUrls(EMOJI_FONTS));
	if (wants.cjk) fonts.push(...fontUrls(CJK_FONTS));
	fonts.push(...customFontPaths.map((path) => images[path]));
	console.log('[Typst] Loading', fonts.length, 'fonts,', customFontPaths.length, 'of them project fonts');

	const compiler = await getCompiler();
	// `reset()` drops the caches a replaced font book would otherwise leave behind
	// ("loaded fonts" among them). It is documented as independent of the shadow
	// files, but the tracking maps below are cleared either way so every source
	// and binary is re-sent: `reset()` may also drop what `addSource` filed away.
	await compiler.reset();
	await installFonts(compiler, fonts);

	emojiLoaded = wants.emoji;
	cjkLoaded = wants.cjk;
	loadedCustomFonts.clear();
	customFontPaths.forEach(path => loadedCustomFonts.add(path));
	fontsNeedRebuild = false;
	sourcedFiles = new Map();
	shadowedBinaries = new Map();

	console.log('[Typst] Fonts loaded successfully');
}

// ============================================================================
// Compilation
// ============================================================================

// typst.ts reports a source file that is absent from the virtual file system as
// "access denied" and points at typst's CLI `--root` flag, which does not exist
// in a browser editor. `clarifyLoadErrors` turns that into what actually
// happened and names the referenced file.
const ACCESS_DENIED_HINT = /, hints: cannot read file outside of project root, you can adjust the project root with the --root argument/;

/**
 * Rewrites the misleading "access denied" wording of missing-file diagnostics.
 */
function clarifyLoadErrors(diagnostics: string[], files: Record<string, string>): string[] {
	return diagnostics.map((diagnostic) => {
		if (!diagnostic.includes('failed to load file (access denied)')) return diagnostic;
		const ref = referencedFile(files, diagnostic);
		const reason = ref ? `"${ref}" is not part of this project` : 'the file is not part of this project';
		return diagnostic
			.replace(ACCESS_DENIED_HINT, '')
			.replace('failed to load file (access denied)', `failed to load file (${reason})`);
	});
}

/**
 * Reads the file name out of a missing-file diagnostic. Unix-format diagnostics
 * point at the reference (`/main.typ:1:10: error: ...`), so the literal that
 * names the missing file is taken from the source at that position.
 */
function referencedFile(files: Record<string, string>, diagnostic: string): string | null {
	const match = /^(.*?):(\d+):(\d+): /.exec(diagnostic);
	if (!match) return null;
	const source = files[match[1].replace(/^\//, '')];
	if (source === undefined) return null;
	const line = source.split('\n')[Number(match[2]) - 1];
	if (line === undefined) return null;
	const quoted = /["']([^"']+)["']/.exec(line.slice(Number(match[3]) - 1));
	return quoted ? quoted[1] : null;
}

/**
 * A failed compile with the diagnostics that explain it. `runCompile` used to
 * join them into a string and throw, and the handler then posted an empty
 * `diagnostics: []` — so the one thing a user could act on never arrived.
 */
class CompileFailure extends Error {
	readonly diagnostics: string[];

	constructor(message: string, diagnostics: string[]) {
		super(message);
		this.name = 'CompileFailure';
		this.diagnostics = diagnostics;
	}
}

/**
 * Compiles one job.
 */
async function compilePdf(
	files: Record<string, string>,
	mainFile: string,
	images: CompileImages = {},
	imageVersions: Record<string, number> = {}
): Promise<Uint8Array<ArrayBuffer>> {
	try {
		const customFontPaths = detectCustomFonts(images);
		// The scan copies the whole project text, so it runs only while one of the
		// lazily loaded font sets is still missing.
		const allContent = emojiLoaded && cjkLoaded ? '' : Object.values(files).join('\n');
		const wantEmoji = emojiLoaded || needsEmojiFont(allContent);
		const wantCjk = cjkLoaded || needsCJKFont(allContent);
		// A project font appeared or disappeared, a lazily loaded set is now needed,
		// or the compiler was dropped: each of those changes the font set.
		if (fontsNeedRebuild || !carriesFonts(customFontPaths) || wantEmoji !== emojiLoaded || wantCjk !== cjkLoaded) {
			await loadFontAssets(images, { emoji: wantEmoji, cjk: wantCjk });
		}

		return await runCompile(files, mainFile, images, imageVersions);
	} finally {
		// Stamped when the compile settles: stamping it *before* the work made the
		// idle reset below unreachable (the check inside `getCompiler` compares
		// against a timestamp the current compile had just refreshed).
		lastCompileTime = Date.now();
	}
}

/** Adds the sources to the compiler and compiles the document. */
async function runCompile(
	files: Record<string, string>,
	mainFile: string,
	images: CompileImages,
	imageVersions: Record<string, number>
): Promise<Uint8Array<ArrayBuffer>> {
	const compiler = await getCompiler();

	// Add the source files that changed since the last compile: each `addSource`
	// copies the text into the wasm world, and a compile fires on every debounced
	// keystroke.
	for (const [path, content] of Object.entries(files)) {
		const normalizedPath = path.startsWith('/') ? path : '/' + path;
		if (sourcedFiles.get(normalizedPath) === content) continue;
		compiler.addSource(normalizedPath, content);
		sourcedFiles.set(normalizedPath, content);
	}

	// Add the binaries the compiler does not have yet, and drop the ones that
	// left the project: `mapShadow` marshals the bytes into wasm memory (a malloc
	// + copy per file), and a stale shadow keeps a deleted image resolvable —
	// Typst would find the file instead of reporting it as missing.
	const present = new Set<string>()
	for (const [path, data] of Object.entries(images)) {
		const normalizedPath = path.startsWith('/') ? path : '/' + path;
		present.add(normalizedPath);
		// Version 0 is never stored, so a caller that sends none re-shadows
		// every time instead of silently reusing an old array.
		const version = imageVersions[path] ?? 0;
		if (shadowedBinaries.get(normalizedPath) === version) continue;
		compiler.mapShadow(normalizedPath, data);
		shadowedBinaries.set(normalizedPath, version);
	}
	for (const path of shadowedBinaries.keys()) {
		if (present.has(path)) continue;
		compiler.unmapShadow(path);
		shadowedBinaries.delete(path);
	}

	// Ensure mainFile path starts with /
	const normalizedMainFile = mainFile.startsWith('/') ? mainFile : '/' + mainFile;

	// Compile the document
	const result = await compiler.compile({
		mainFilePath: normalizedMainFile,
		format: 1, // PDF format
		diagnostics: 'unix' // Unix-style diagnostic messages
	});

	// Process diagnostics
	const diagnostics = clarifyLoadErrors((result.diagnostics ?? []).map(String), files);

	// Enhanced error reporting
	if (!result.result) {
		const errorMessage = diagnostics.length > 0
			? diagnostics.join('\n')
			: 'Typst compilation failed with no diagnostic information';

		console.error('[Typst] Compilation failed:', errorMessage);
		throw new CompileFailure(errorMessage, diagnostics);
	}

	// Log warnings if present (even on successful compilation)
	if (diagnostics.length > 0) {
		console.warn('[Typst] Compilation warnings:', diagnostics.join('\n'));
	}

	return result.result as Uint8Array<ArrayBuffer>;
}

/**
 * The PDF bytes ready for transfer: typst.ts hands out a fresh JS-owned array
 * (its wasm shim copies out of wasm memory), so its buffer can be transferred
 * as it is. Only a view into a wider buffer needs its own copy — the old code
 * copied the whole document every time.
 */
function transferablePdf(pdf: Uint8Array<ArrayBuffer>): ArrayBuffer {
	const { buffer, byteOffset, byteLength } = pdf;
	if (byteOffset === 0 && byteLength === buffer.byteLength) return buffer;
	return pdf.slice().buffer;
}

// ============================================================================
// Message Handler
// ============================================================================

ctx.onmessage = (event: MessageEvent<CompileRequest>) => {
	const message = event.data;
	if (!message || message.type !== 'compile') return;

	// Newest wins: a job that is no longer the latest is answered without
	// compiling — its document would be dropped by the caller's own seq guard.
	latestRequestId = message.id;

	compileQueue = compileQueue
		.then(async () => {
			if (message.id !== latestRequestId) {
				postResult({
					type: 'compile-result',
					id: message.id,
					ok: false,
					error: 'superseded',
					diagnostics: [],
					superseded: true
				});
				return;
			}

			try {
				const pdf = await compilePdf(message.files, message.mainFile, message.images, message.imageVersions);
				const buffer = transferablePdf(pdf);
				ctx.postMessage(
					{ type: 'compile-result', id: message.id, ok: true, pdf: buffer } satisfies CompileResponse,
					[buffer]
				);
			} catch (error) {
				const diagnostics = error instanceof CompileFailure ? error.diagnostics : [];
				const reason = error instanceof Error ? error.message : String(error);
				console.error('[Typst] Compilation failed:', reason);
				postResult({
					type: 'compile-result',
					id: message.id,
					ok: false,
					error: reason,
					diagnostics
				});
			}
		})
		// The chain must never stay rejected: one throw outside the `try` above
		// would make every later job skip its callback and the worker go silent.
		.catch((error: unknown) => {
			const reason = error instanceof Error ? error.message : String(error);
			console.error('[Typst] compile queue failed:', error);
			postResult({ type: 'compile-result', id: message.id, ok: false, error: reason, diagnostics: [] });
		});
};

/** Posts a failure reply. */
function postResult(response: CompileResponse): void {
	ctx.postMessage(response);
}