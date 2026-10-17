# Repository Guidelines

## Project Overview

Lightweight web-based Typst editor: compiles Typst → PDF **entirely in the browser** (Typst.ts WASM compiler in a Web Worker), renders the preview with pdf.js. No backend. Fork of [Mapaor/typst-online-editor](https://github.com/Mapaor/typst-online-editor) (`README.upstream.md` is the upstream English README, kept verbatim; `README.md` — the live doc — is Simplified Chinese, keep it that way).

Licensing: repo code MIT (`LICENSE` = this fork, `LICENSE.upstream` = upstream MIT grant); bundled `@myriaddreamin/*` and `pdfjs-dist` are Apache-2.0.

Stack: Preact 11 · Vite 8 (rolldown) · TypeScript 7 (`strict`) · Tailwind v4 (`@tailwindcss/vite`) · Shiki 4 · pdfjs-dist 6 · `@myriaddreamin/typst.ts` 0.7.0. Package manager: **pnpm** (`pnpm-lock.yaml` is the only lockfile).

## Architecture & Data Flow

Compile pipeline — every link is load-bearing; changing one means checking the whole chain:

1. **Edit** — `CodeEditor.tsx` (transparent `<textarea>` over a Shiki-highlighted `<pre>`; live text is wired via **`onInput`**, see Preact idioms) → `TypstEditor.tsx` → `useProjectFileOperations.updateActiveFileContent` → `useProjectState.saveProject` (localStorage via the `projectStorage` singleton).
2. **Trigger** — `useProjectState`'s `useEffect([currentProject, onProjectChange])` reduces `Project.files` to `Record<string, string>` → `useTypstCompiler.compileDebounced` (1000 ms `debounce` from `src/lib/utils/helpers.ts`).
3. **Service** — `src/lib/typst/TypstCompilerService.compile()` splits text files from `data:`-URL binaries (images **and** fonts) and calls `TypstWorkerClient.compilePdf()`.
4. **Worker** — `src/lib/typst/typst.worker.ts` owns all WASM/compiler lifecycle: fetches the compiler wasm and fonts **from CDN mirrors only** (jsdmirror; nothing is self-hosted in `public/`, so compiling needs network access), lazily upgrades the compiler with emoji/CJK fonts based on content regexes, injects user `.ttf/.otf` uploads via `mapShadow`, resolves Typst Universe packages (`FetchPackageRegistry`), serializes jobs through `compileQueue`.
5. **Result** — `{type: 'compile-result', id, ok, pdf, diagnostics}` (worker protocol; types are **duplicated** in `typstClient.ts` and `typst.worker.ts` — keep in sync). `TypstCompilerService` wraps the PDF in a blob URL and notifies `CompileListener`s; `useTypstCompiler` mirrors this into React state (`status`, `pdfUrl`, `errorMsg`, `hasCompiled`).
6. **Preview** — `PDFViewer/hooks/usePdfRenderer.ts` renders each page to canvas + pdf.js `TextLayer`/`AnnotationLayer` via lazy `getPdfjs()` (`src/lib/pdf/pdfjs.ts`).

State management: **no global store**. `TypstEditor.tsx` is the sole orchestrator; hooks live in per-component `hooks/` dirs and compose upward via props. `useProjectState` is the single source of truth for `currentProject` / `activeFilePath`; every file op immutably rebuilds `Project` and persists. Folders are virtual: created as `${path}/.gitkeep` placeholders, hidden by `buildFileTree`.

## Key Directories

|Path|Purpose|
|---|---|
|`index.html`, `src/main.tsx`|Vite entry: `index.html` mounts `#app`, `main.tsx` imports global CSS and renders `I18nProvider` > `TypstEditor`|
|`src/styles/`|`globals.css` (Tailwind import + Shiki wrap override) and the pdf.js `textlayer`/`annotationlayer` CSS|
|`src/components/`|`TypstEditor/` (orchestrator + header + `SettingsDialog` + hooks), `CodeEditor/` (Shiki + textarea), `FileExplorer/` (virtual folder tree), `PDFViewer/` (canvas preview)|
|`src/lib/typst/`|`TypstCompilerService.ts` (main-thread facade), `typstClient.ts` (worker RPC), `typst.worker.ts` (WASM), `fonts.ts` (CDN font config + `SUPPORTED_FONT_FAMILIES` manifest)|
|`src/lib/storage/`|`ProjectStorage.ts` — localStorage singleton; keys `typst-project-<id>` + `typst-projects-list`|
|`src/lib/pdf/`|`pdfjs.ts` — cached dynamic import of `pdfjs-dist`|
|`src/lib/i18n/`|UI strings + `I18n` contract: `messages.ts` (zh/en/de catalogs), `i18n.ts` (`Lang`, `I18n`, `translate`), `useI18n.ts`, `I18nProvider.tsx`|
|`public/textmate-sintax/`|Typst TextMate grammar for Shiki — spelling is *sic*, don't "fix" it|

## Development Commands

```bash
pnpm install            # install (pnpm only — pnpm-lock.yaml is the sole lockfile)
pnpm dev                # dev server (localhost:5173)
pnpm build              # tsc --noEmit + vite build → dist/
pnpm preview            # serve the production build
pnpm lint               # oxlint (zero config; scope = src/)
pnpm exec tsc --noEmit  # type-check only
```

Static deploy (GitHub Pages): `pnpm build` emits a fully static `dist/`; for subpath hosting build with `pnpm build -- --base=/typst-online-editor-static/`, publish the **contents** of `dist/`, add `.nojekyll`. No config file edits required.

## Code Conventions & Common Patterns

- **Naming** — PascalCase for component/class files (`TypstEditor.tsx`, `TypstCompilerService.ts`); camelCase for hooks (`useXxx.ts`) and plain modules (`typstClient.ts`, `helpers.ts`). `<Component>Props` interfaces colocated in the component file. Default export for components; named exports for hooks/lib. Barrels exist only at `TypstEditor/index.ts`, `PDFViewer/index.ts`, `CodeEditor/index.ts`, `FileExplorer/hooks/index.ts` — `FileExplorer/index.tsx` **is** the component, not a barrel.
- **Imports** — `@/*` → `src/*` alias for cross-module (`@/lib/...`), relative within a module (`./hooks/useX`, `../types`). `import type` for type-only imports. Preact hooks come from `preact/hooks`; Preact types (`ComponentChildren`, `TargetedDragEvent`, `TargetedMouseEvent`, `RefObject`, …) from `preact`.
- **Preact idioms** — this is an SPA: no `'use client'` directives, no server components. Preact maps `onChange` to the **native `change` event** (fires on blur), so live text inputs/textarea MUST use `onInput` and read `e.currentTarget.value`. `e.dataTransfer` is nullable in DOM typings (`e.dataTransfer?.types…`). Icons: `lucide-preact` (lucide 1.x dropped brand icons — the GitHub mark is inlined in `TypstEditorHeader.tsx`).
- **Error handling** — `try/catch` + `console.error/warn`; normalize with `error instanceof Error ? error.message : String(error)`. User-visible errors only via `errorMsg` state (rendered in `PdfPlaceholder.tsx`) or sparing `alert()`/`confirm()`. Compile outcomes are `CompileResult {success, error?}`, not a Result type.
- **Async** — worker RPC correlates `crypto.randomUUID()` ids through a `#pending` Map; FIFO `compileQueue` in the worker; `compileSeq` supersede guard drops stale compiles silently; debounce with `.cancel()` (cancelling does not abort an in-flight worker job).
- **State updates** — rebuild `Project` immutably; `lastModified: 0` on edits is deliberate (`ProjectStorage.save` stamps only falsy timestamps).
- **Styling** — Tailwind v4 utilities in JSX (CSS-first config: `@import "tailwindcss"`, **no** `tailwind.config.*`; Tailwind runs through the `@tailwindcss/vite` plugin, no PostCSS config). Inline `style` only for dynamic sizing; `src/styles/globals.css` holds the Shiki `pre-wrap` override. Icons: `lucide-preact`.
- **Typing** — `strict: true`; typed arrays as `Uint8Array<ArrayBuffer>` (TS ≥ 5.7 feature); `as unknown as` casts allowed where `pdfjs-dist`/worker typings are wrong — keep the explanatory comments. TypeScript 7 has **no JS compiler API**, which is why the lint toolchain is oxlint, not typescript-eslint.

**Recipe — add fonts:** add the CDN URL (base in `FONT_CDN_BASE`) to `CORE_FONTS` / `EMOJI_FONTS` / `CJK_FONTS` in `src/lib/typst/fonts.ts`, and the family name to `SUPPORTED_FONT_FAMILIES` (shown in the Settings dialog) — fonts are CDN-only, nothing is self-hosted in `public/`. User-uploaded fonts arrive as data URLs and re-create the compiler via `reinitializeWithCustomFonts`.

**Recipe — add a language:** add a catalog to `src/lib/i18n/messages.ts` (typed against the `en` base — a missing key fails `tsc`), then register the code in `LANGS` and its endonym in `LANG_LABELS` (`src/lib/i18n/i18n.ts`). New UI strings go in `messages.ts` only; components read them via `useI18n().t`, never as JSX literals.

## Important Files

- `index.html`, `src/main.tsx` — app entry points.
- `src/lib/typst/typst.worker.ts` — WASM + font + package resolution; heaviest file in the repo.
- `src/lib/typst/TypstCompilerService.ts` — public compile API (`addListener`, `compile`, `getCurrentPdfUrl`, `dispose`).
- `src/components/TypstEditor/TypstEditor.tsx` — wiring point for all UI ↔ compiler flows.
- `vite.config.ts` — `@preact/preset-vite`, `@tailwindcss/vite`, `@` → `src` alias. Subpath deploys use the `--base` CLI flag, not config edits.
- `tsconfig.json` — `strict`, `jsx: react-jsx` + `jsxImportSource: preact`, `types: ["vite/client", "node"]`, `@/*` alias; the compiler wasm is fetched from the CDN pin at runtime, never imported by the bundler.

## Runtime / Tooling Preferences

- **pnpm** — `pnpm-lock.yaml` is the only lockfile; no npm/yarn/bun lockfiles. Dependency changes go through commands (`pnpm add` / `pnpm remove` / `pnpm up` / `pnpm pkg set`), never hand-edited version fields; `ncu` (npm-check-updates, installed globally) + `ncu -u` for bulk bumps.
- **Node ≥ 20.19** [inferred from `vite@8` engines; no `engines`/`.nvmrc` in repo].
- `node_modules/` is not checked in — run `pnpm install` before any verification.
- `@myriaddreamin/typst-ts-renderer` has no import sites (role unclear — [inference] unused).
- No test runner, no formatter (no Prettier/Biome), no CI, no git hooks. Match surrounding formatting manually.

## Testing & QA

There **are no tests, no coverage, no CI** (verified across the tree). The pre-yield QA gate is:

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm build   # runs tsc --noEmit + vite build
```

`pnpm lint` runs **oxlint** with zero config (`oxlint src`; ESLint/typescript-eslint are gone — TS 7 ships no compiler API for them to parse with). Expect two pre-existing `no-unused-vars` warnings (`CodeEditor.tsx`'s `isDatFile`, `resetCompiler` in the worker) — they predate the Preact migration.

If tests are ever added, the hard-to-test surfaces are: the worker + WASM boundary (`typstClient.ts` uses `new Worker(new URL('./typst.worker.ts', import.meta.url), {type: 'module'})`), localStorage with SSR guards (`ProjectStorage.ts`), and canvas rendering (`usePdfRenderer.ts`). Easiest pure-logic units: `src/components/FileExplorer/utils/buildFileTree.ts`, `src/lib/utils/helpers.ts`. Prefer a throwaway smoke script over wiring tests.

## Known Quirks

- `public/textmate-sintax/` is misspelled (*sic*) — `CodeEditor.tsx`'s fetch path depends on it.
- **`TYPST_WASM_CDN_URL` in `typst.worker.ts` must match the installed `@myriaddreamin/typst.ts` version.** After upgrading `@myriaddreamin/*`, bump the pin (`typst-ts-web-compiler@0.7.0`); a mismatch surfaces at compile time as `wasm.__wasm_bindgen_func_elem_N is not a function`.
- All compiler assets are **CDN-only**: wasm/fonts via `cdn.jsdmirror.com` (`typst.worker.ts`), pdf.js worker via `registry.npmmirror.com` (`src/lib/pdf/pdfjs.ts`). There is **no local fallback** — the app cannot compile offline, and CDN downloads are plain `fetch` with no timeout bound. Pinned CDN refs (`typst-ts-web-compiler@0.7.0`, `typst-assets@v0.13.1`, `typst-dev-assets@v0.13.1`, `noto-cjk@main`, `noto-emoji@v2.047`) must be bumped alongside upgrades.
- `main.typ` protections are literal string checks (`path === 'main.typ'`), not `project.mainFile`.
- Folder detection = "path has no dot" — extension-less files are treated as folders by rename/delete.
- Dead code: `resetCompiler()` in the worker (no message invokes it), `PdfPreviewProps.fileCount/charCount` (never used), `ProjectStorage.getStorageSize`/`isStorageNearLimit` (no call sites).
- Build noise (pre-existing): `[INEFFECTIVE_DYNAMIC_IMPORT]` — `shiki` is both statically and dynamically imported in `CodeEditor.tsx`; and a wasm-bindgen "deprecated parameters" console warning comes from typst.ts's own `wasm-pack-shim`.
