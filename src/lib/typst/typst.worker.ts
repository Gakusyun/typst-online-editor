/// <reference lib="webworker" />

import {
	createTypstCompiler,
	loadFonts,
	type TypstCompiler,
	FetchPackageRegistry,
	MemoryAccessModel
} from '@myriaddreamin/typst.ts';
import { withPackageRegistry, withAccessModel } from '@myriaddreamin/typst.ts/options.init';
import { CORE_FONTS, EMOJI_FONTS, CJK_FONTS } from './fonts';

// ============================================================================
// Type Definitions
// ============================================================================

type CompileRequest = {
	type: 'compile';
	id: string;
	files: Record<string, string>; // Map of file path to content
	mainFile: string; // Which file to compile
	images?: Record<string, Uint8Array<ArrayBuffer>>;
};

type CompileResponse =
	| {
			type: 'compile-result';
			id: string;
			ok: true;
			pdf: ArrayBuffer;
			diagnostics: string[];
	  }
	| {
			type: 'compile-result';
			id: string;
			ok: false;
			error: string;
			diagnostics: string[];
	  };

// ============================================================================
// Configuration
// ============================================================================

// The compiler wasm loads from a CDN mirror — nothing is self-hosted in public/,
// so compiling needs network access. Keep the pinned version in sync with the
// installed @myriaddreamin/* packages. Fonts: see ./fonts.
const TYPST_WASM_URL = 'https://cdn.jsdmirror.com/npm/@myriaddreamin/typst-ts-web-compiler@0.7.0/pkg/typst_ts_web_compiler_bg.wasm';

// ============================================================================
// State Management
// ============================================================================

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

let compilerPromise: Promise<TypstCompiler> | null = null;
let compileQueue: Promise<void> = Promise.resolve();
let emojiLoaded = false;
let cjkLoaded = false;
let lastCompileTime = Date.now();
const loadedCustomFonts: Set<string> = new Set(); // Track custom font files

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
 * Creates a compiler with specified fonts
 */
async function createCompilerWithFonts(fonts: string[]): Promise<TypstCompiler> {
	const compiler = createTypstCompiler();
	await compiler.init({
		getModule: async () => (await fetchCdn(TYPST_WASM_URL)).arrayBuffer(),
		beforeBuild: [
			// `assets: false` is required: with no options, TypstCompiler.init() appends a
			// default font loader ({assets: ['text']}) that downloads typst's default font
			// set from cdn.jsdelivr.net behind our back.
			loadFonts(fonts, { assets: false, fetcher: fetchCdn }),
			withAccessModel(accessModel),
			withPackageRegistry(packageRegistry)
		]
	});
	return compiler;
}

/**
 * Detects if text requires emoji fonts
 */
function needsEmojiFont(text: string): boolean {
	return /[\uD800-\uDFFF]|[\u2600-\u26FF]|[\u2700-\u27BF]/.test(text);
}

/**
 * Detects if text contains CJK (Chinese, Japanese, Korean) characters
 */
function needsCJKFont(text: string): boolean {
	// CJK Unified Ideographs and extensions
	return /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]|[\u3040-\u309F\u30A0-\u30FF]|[\uAC00-\uD7AF]/.test(text);
}

/**
 * Gets the current font set based on loaded fonts
 */
function getCurrentFonts(): string[] {
	const fonts = [...CORE_FONTS];
	if (emojiLoaded) fonts.push(...EMOJI_FONTS);
	if (cjkLoaded) fonts.push(...CJK_FONTS);
	return fonts;
}

/**
 * Detects custom font files in the images/fonts collection
 */
function detectCustomFonts(images: Record<string, Uint8Array<ArrayBuffer>>): string[] {
	return Object.keys(images).filter(path => 
		path.toLowerCase().endsWith('.ttf') || 
		path.toLowerCase().endsWith('.otf')
	);
}

/**
 * Converts Uint8Array font data to data URL for font loading
 */
function fontDataToUrl(data: Uint8Array<ArrayBuffer>, filename: string): string {
	const extension = filename.toLowerCase().split('.').pop();
	const mimeType = extension === 'ttf' ? 'font/ttf' : 'font/otf';
	
	// Convert Uint8Array to base64
	let binary = '';
	for (let i = 0; i < data.length; i++) {
		binary += String.fromCharCode(data[i]);
	}
	const base64 = btoa(binary);
	
	return `data:${mimeType};base64,${base64}`;
}

// ============================================================================
// Compiler Management
// ============================================================================

/**
 * Upgrades compiler with emoji fonts (lazy loading)
 */
async function upgradeCompilerWithEmoji(): Promise<void> {
	if (emojiLoaded) return;

	emojiLoaded = true;
	console.log('[Typst] Upgrading compiler with emoji fonts...');
	
	const newCompiler = await createCompilerWithFonts(getCurrentFonts());
	compilerPromise = Promise.resolve(newCompiler);
	
	console.log('[Typst] Emoji fonts loaded successfully');
}

/**
 * Upgrades compiler with CJK fonts (lazy loading)
 */
async function upgradeCompilerWithCJK(): Promise<void> {
	if (cjkLoaded) return;

	cjkLoaded = true;
	console.log('[Typst] Upgrading compiler with CJK fonts...');
	
	const newCompiler = await createCompilerWithFonts(getCurrentFonts());
	compilerPromise = Promise.resolve(newCompiler);
	
	console.log('[Typst] CJK fonts loaded successfully');
}

/**
 * Gets the compiler instance, creating it if necessary
 */
function getCompiler(): Promise<TypstCompiler> {
	// Check if compiler should be reset due to inactivity
	if (compilerPromise && Date.now() - lastCompileTime > COMPILER_IDLE_TIMEOUT) {
		console.log('[Typst] Resetting compiler after idle timeout');
		compilerPromise = null;
		emojiLoaded = false;
		cjkLoaded = false;
		loadedCustomFonts.clear();
	}

	if (compilerPromise) return compilerPromise;

	console.log('[Typst] Initializing new compiler instance');
	compilerPromise = createCompilerWithFonts(CORE_FONTS);
	return compilerPromise;
}

/**
 * Reinitializes compiler with custom fonts included
 */
async function reinitializeWithCustomFonts(
	images: Record<string, Uint8Array<ArrayBuffer>>,
	customFontPaths: string[]
): Promise<void> {
	console.log('[Typst] Reinitializing compiler with custom fonts:', customFontPaths);
	
	// Convert custom font data to data URLs
	const customFontUrls = customFontPaths.map(path => 
		fontDataToUrl(images[path], path)
	);
	
	// Combine all fonts: core + optional (emoji/cjk) + custom
	const allFonts = [
		...getCurrentFonts(),
		...customFontUrls
	];
	
	// Create new compiler with all fonts
	const newCompiler = await createCompilerWithFonts(allFonts);
	compilerPromise = Promise.resolve(newCompiler);
	
	// Track loaded custom fonts
	customFontPaths.forEach(path => loadedCustomFonts.add(path));
	
	console.log('[Typst] Custom fonts loaded successfully');
}

/**
 * Manually reset compiler (useful for memory management)
 */
function resetCompiler(): void {
	console.log('[Typst] Manual compiler reset');
	compilerPromise = null;
	emojiLoaded = false;
	cjkLoaded = false;
	loadedCustomFonts.clear();
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

async function compilePdf(
	files: Record<string, string>,
	mainFile: string,
	images: Record<string, Uint8Array<ArrayBuffer>> = {}
): Promise<{ pdf: Uint8Array; diagnostics: string[] }> {
	// Update last compile time for lifecycle management
	lastCompileTime = Date.now();

	// Check for custom fonts in uploaded files
	const customFontPaths = detectCustomFonts(images);
	const hasNewCustomFonts = customFontPaths.some(path => !loadedCustomFonts.has(path));
	
	// If new custom fonts are detected, reinitialize compiler
	if (hasNewCustomFonts) {
		await reinitializeWithCustomFonts(images, customFontPaths);
	}

	// Check content for special font requirements and upgrade compiler if needed
	const allContent = Object.values(files).join('\n');
	
	// Lazy load emoji fonts (only if no custom fonts were just loaded)
	if (!hasNewCustomFonts && needsEmojiFont(allContent)) {
		await upgradeCompilerWithEmoji();
	}
	
	// Lazy load CJK fonts (only if no custom fonts were just loaded)
	if (!hasNewCustomFonts && needsCJKFont(allContent)) {
		await upgradeCompilerWithCJK();
	}

	const compiler = await getCompiler();
	
	// Add all source files to the virtual file system
	for (const [path, content] of Object.entries(files)) {
		// Ensure paths start with /
		const normalizedPath = path.startsWith('/') ? path : '/' + path;
		compiler.addSource(normalizedPath, content);
	}

	// Add images to virtual file system
	for (const [path, data] of Object.entries(images)) {
		const normalizedPath = path.startsWith('/') ? path : '/' + path;
		compiler.mapShadow(normalizedPath, data);
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
		throw new Error(errorMessage);
	}

	// Log warnings if present (even on successful compilation)
	if (diagnostics.length > 0) {
		console.warn('[Typst] Compilation warnings:', diagnostics.join('\n'));
	}

	return { pdf: result.result, diagnostics };
}

// ============================================================================
// Message Handler
// ============================================================================

ctx.onmessage = (event: MessageEvent<CompileRequest>) => {
	const message = event.data;
	if (!message || message.type !== 'compile') return;

	compileQueue = compileQueue.then(async () => {
		try {
			const { pdf, diagnostics } = await compilePdf(message.files, message.mainFile, message.images);
			const pdfCopy = new Uint8Array(pdf.length);
			pdfCopy.set(pdf);
			ctx.postMessage(
				{
					type: 'compile-result',
					id: message.id,
					ok: true,
					pdf: pdfCopy.buffer,
					diagnostics
				} satisfies CompileResponse,
				[pdfCopy.buffer]
			);
		} catch (error) {
			ctx.postMessage({
				type: 'compile-result',
				id: message.id,
				ok: false,
				error: error instanceof Error ? error.message : String(error),
				diagnostics: []
			} satisfies CompileResponse);
		}
	});
};
