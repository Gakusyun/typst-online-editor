# Repository Guidelines

## Project Overview

Lightweight web-based Typst editor: compiles Typst → PDF **entirely in the browser** (Typst.ts WASM compiler in a Web Worker), renders the preview with pdf.js. No backend. Fork of [Mapaor/typst-online-editor](https://github.com/Mapaor/typst-online-editor) (`README.upstream.md` is the upstream English README, kept verbatim; `README.md` — the live doc — is Simplified Chinese, keep it that way).

Licensing: repo code MIT (`LICENSE` = this fork, `LICENSE.upstream` = upstream MIT grant); bundled `@myriaddreamin/*`, `pdfjs-dist`, and `codemirror-lang-typst` are Apache-2.0; the Tinymist WASM language server is Apache-2.0 (loaded from CDN, never bundled).

Stack: Preact 11 · Vite 8 (rolldown) · TypeScript 7 (`strict`) · Tailwind v4 (`@tailwindcss/vite`) · CodeMirror 6 + `codemirror-lang-typst` · Tinymist WASM LSP (`@codemirror/lsp-client`) · pdfjs-dist 6 · `@myriaddreamin/typst.ts` 0.7.0. Package manager: **pnpm** (`pnpm-lock.yaml` is the only lockfile).

## Architecture & Data Flow

Compile pipeline — every link is load-bearing; changing one means checking the whole chain:

1. **Edit** — `CodeEditor.tsx` (CodeMirror 6: `typst_lezer()` syntax from `codemirror-lang-typst`, plus `@codemirror/lsp-client` bound to the Tinymist WASM LSP in `src/lib/lsp/`) → `TypstEditor.tsx` → `useProjectFileOperations.updateActiveFileContent` → `useProjectState.saveProject` (localStorage via the `projectStorage` singleton).
2. **Trigger** — `useProjectState`'s `useEffect([currentProject, onProjectChange])` reduces `Project.files` to `Record<string, string>` → `useTypstCompiler.compileDebounced` (1000 ms `debounce` from `src/lib/utils/helpers.ts`).
3. **Service** — `src/lib/typst/TypstCompilerService.compile()` splits text files from `data:`-URL binaries (images **and** fonts) and calls `TypstWorkerClient.compilePdf()`.
4. **Worker** — `src/lib/typst/typst.worker.ts` owns all WASM/compiler lifecycle: fetches the compiler wasm and fonts **from CDN mirrors only** (jsdmirror; nothing is self-hosted in `public/`, so compiling needs network access), lazily upgrades the compiler with emoji/CJK fonts based on content regexes, injects user `.ttf/.otf` uploads via `mapShadow`, feeds every font (CDN, project) to `loadFonts` as a URL or as raw bytes, resolves Typst Universe packages (`FetchPackageRegistry`), serializes jobs through `compileQueue`.
5. **Result** — `{type: 'compile-result', id, ok, pdf, diagnostics}` (worker protocol; types are **duplicated** in `typstClient.ts` and `typst.worker.ts` — keep in sync). `TypstCompilerService` wraps the PDF in a blob URL and notifies `CompileListener`s; `useTypstCompiler` mirrors this into React state (`status`, `pdfUrl`, `errorMsg`, `hasCompiled`).
6. **Preview** — `PDFViewer/hooks/usePdfRenderer.ts` renders each page to canvas + pdf.js `TextLayer`/`AnnotationLayer` via lazy `getPdfjs()` (`src/lib/pdf/pdfjs.ts`).

State management: **no global store**. `TypstEditor.tsx` is the sole orchestrator; hooks live in per-component `hooks/` dirs and compose upward via props. `useProjectState` is the single source of truth for `currentProject` / `activeFilePath`; every file op immutably rebuilds `Project` and persists. Folders are virtual: created as `${path}/.gitkeep` placeholders, hidden by `buildFileTree`.

## Key Directories

|Path|Purpose|
|---|---|
|`index.html`, `src/main.tsx`|Vite entry: `index.html` mounts `#app`, `main.tsx` imports global CSS and renders `I18nProvider` > `AppearanceProvider` > `TypstEditor`|
|`src/styles/`|`globals.css` (Tailwind import + `--app-ui-font-fallback` / `--app-editor-font-fallback` default font stacks, the `font-editor` utility, and the app-wide scrollbar theming: `--app-scrollbar-*` + `::-webkit-scrollbar` / `scrollbar-width` / `scrollbar-color`) and the pdf.js `textlayer`/`annotationlayer` CSS|
|`src/components/`|`TypstEditor/` (orchestrator + header + `SettingsDialog` + hooks), `CodeEditor/` (CodeMirror 6 editor + `theme.ts`), `FileExplorer/` (virtual folder tree), `PDFViewer/` (canvas preview)|
|`src/lib/typst/`|`TypstCompilerService.ts` (main-thread facade), `typstClient.ts` (worker RPC), `typst.worker.ts` (WASM), `fonts.ts` (CDN font config + `SUPPORTED_FONT_FAMILIES` manifest)|
|`src/lib/lsp/`|Tinymist WASM LSP: `tinymist.ts` (CDN loader + wasm types), `tinymist.worker.ts` (LSP bridge, diagnostics filter, package resolution), `tinymistClient.ts` (worker + CodeMirror `Transport`), `projectWorkspace.ts` (multi-file LSP workspace)|
|`src/lib/storage/`|`ProjectStorage.ts` — localStorage singleton; keys `typst-project-<id>` + `typst-projects-list`; `LayoutStorage.ts` — the desktop split the user dragged/collapsed, one `typst-layout` JSON record|
|`src/lib/pdf/`|`pdfjs.ts` — cached dynamic import of `pdfjs-dist`|
|`src/lib/i18n/`|UI strings + `I18n` contract: `messages.ts` (zh/en/de catalogs), `i18n.ts` (`Lang`, `I18n`, `translate`), `useI18n.ts`, `I18nProvider.tsx`|
|`src/lib/appearance/`|Interface/editor fonts and the editor word wrap (Settings → Fonts / General): `appearance.ts` (localStorage choices — `typst-ui-font` / `typst-editor-font` / `typst-editor-word-wrap` — + CSS custom properties), `AppearanceProvider.tsx`, `useAppearance.ts`, `localFonts.ts` (Local Font Access API wrapper + `FontFace` registration — app chrome only, compiles never read machine fonts)|

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
- **Styling** — Tailwind v4 utilities in JSX (CSS-first config: `@import "tailwindcss"`, **no** `tailwind.config.*`; Tailwind runs through the `@tailwindcss/vite` plugin, no PostCSS config). Inline `style` only for dynamic sizing. Icons: `lucide-preact`. CodeMirror theming lives in `CodeEditor/theme.ts` (github-dark palette).
- **Typing** — `strict: true`; typed arrays as `Uint8Array<ArrayBuffer>` (TS ≥ 5.7 feature); `as unknown as` casts allowed where `pdfjs-dist`/worker typings are wrong — keep the explanatory comments. TypeScript 7 has **no JS compiler API**, which is why the lint toolchain is oxlint, not typescript-eslint.

**Recipe — add fonts:** add the CDN URL (base in `FONT_CDN_BASE`) to `CORE_FONTS` / `EMOJI_FONTS` / `CJK_FONTS` in `src/lib/typst/fonts.ts`, and the family name to `SUPPORTED_FONT_FAMILIES` (shown in the Settings dialog) — fonts are CDN-only, nothing is self-hosted in `public/`. User-uploaded fonts arrive as data URLs and are handed to the compiler as raw font bytes. These are **compiler** fonts; the interface/editor fonts of the app itself are a separate concern (see the recipe below and `src/lib/appearance/`).

**Recipe — choose app fonts:** `SettingsDialog` writes an interface font and an editor font through `useAppearance()`; `AppearanceProvider` persists them (`typst-ui-font` / `typst-editor-font`) and publishes them as `--app-ui-font` / `--app-editor-font` on `<html>`. CSS consumes the variables with the default stacks as fallback (`globals.css` sets the interface stack on `html`, defines the `font-editor` utility for editor-font surfaces outside CodeMirror, and `CodeEditor/theme.ts` sets it on the editor root). A new editor-font surface = the `font-editor` utility, not a second stack. The same `useAppearance()` carries the editor word wrap (Settings → General, `typst-editor-word-wrap`); `CodeEditor` applies it as a CodeMirror `Compartment` — it is toggled while the view lives, so it must not rebuild the view (that would drop the scroll position).

**Recipe — add a language:** add a catalog to `src/lib/i18n/messages.ts` (typed against the `en` base — a missing key fails `tsc`), then register the code in `LANGS` and its endonym in `LANG_LABELS` (`src/lib/i18n/i18n.ts`). New UI strings go in `messages.ts` only; components read them via `useI18n().t`, never as JSX literals.

## Important Files

- `index.html`, `src/main.tsx` — app entry points.
- `src/lib/typst/typst.worker.ts` — WASM + font + package resolution; heaviest file in the repo.
- `src/lib/typst/TypstCompilerService.ts` — public compile API (`addListener`, `compile`, `getCurrentPdfUrl`, `dispose`).
- `src/lib/lsp/tinymist.worker.ts` — Tinymist WASM LSP host: message bridge, diagnostics filter, package prefetch.
- `src/components/CodeEditor/CodeEditor.tsx` — CodeMirror 6 editor; owns the LSP client/workspace lifecycle.
- `src/components/TypstEditor/TypstEditor.tsx` — wiring point for all UI ↔ compiler flows, and owner of the desktop split: the file tree (narrowest column) + editor hold the left half, the right half is one slot the preview and the AI panel take turns in (the panel takes the preview's exact width; the preview stays mounted but hidden so its page/zoom survive). Dragged widths, collapse states and the AI toggle persist through `LayoutStorage` (`typst-layout`).
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

`pnpm lint` runs **oxlint** with zero config (`oxlint src`; ESLint/typescript-eslint are gone — TS 7 ships no compiler API for them to parse with). Expect one pre-existing `no-unused-vars` warning (`resetCompiler` in the worker) — it predates the Preact migration.

If tests are ever added, the hard-to-test surfaces are: the worker + WASM boundary (`typstClient.ts` uses `new Worker(new URL('./typst.worker.ts', import.meta.url), {type: 'module'})`), localStorage with SSR guards (`ProjectStorage.ts`), and canvas rendering (`usePdfRenderer.ts`). Easiest pure-logic units: `src/components/FileExplorer/utils/buildFileTree.ts`, `src/lib/utils/helpers.ts`. Prefer a throwaway smoke script over wiring tests.

## Known Quirks

- **`TYPST_WASM_CDN_URL` in `typst.worker.ts` must match the installed `@myriaddreamin/typst.ts` version.** After upgrading `@myriaddreamin/*`, bump the pin (`typst-ts-web-compiler@0.7.0`); a mismatch surfaces at compile time as `wasm.__wasm_bindgen_func_elem_N is not a function`.
- All compiler assets are **CDN-only**: wasm/fonts via `cdn.jsdmirror.com` (`typst.worker.ts`), pdf.js worker via `registry.npmmirror.com` (`src/lib/pdf/pdfjs.ts`), Tinymist LSP wasm via `cdn.jsdmirror.com` (`src/lib/lsp/tinymist.ts`). There is **no local fallback** — the app cannot compile offline, and CDN downloads are plain `fetch` with no timeout bound. Pinned CDN refs (`typst-ts-web-compiler@0.7.0`, `typst-assets@v0.13.1`, `typst-dev-assets@v0.13.1`, `noto-cjk@main`, `noto-emoji@v2.047`, `shiki-tinymist@0.1.0`) must be bumped alongside upgrades. The Tinymist pin is a third-party wasm-pack build of tinymist 0.14.18 (published inside `shiki-tinymist`); its JS glue and `tinymist_bg.wasm` **must come from the same build**. A failed Tinymist fetch is terminal for that worker: `loadTinymistModule` memoizes its promise (so the rejection is cached and re-calling it is a no-op) and the editor has no retry path — only a page reload recovers. The failure is visible as `editor.lspUnavailable` in the editor header plus `[tinymist] failed to start` / `[tinymist] language server unavailable` in the console; compilation is unaffected (separate worker).
- **Tinymist LSP quirks** (see `src/lib/lsp/tinymist.worker.ts`): the wasm server must not be re-entered from its `sendRequest`/`sendEvent` callbacks (defer replies/event pumping to a microtask or it panics on a wasm borrow); its analysis world cannot load fonts (the wasm build embeds text fonts but no math font), so the vacuous `no font could be found` error on math is filtered out of `publishDiagnostics`; binary project files (images/fonts) can never enter the analysis world and all project text files are pushed as memory documents (see `projectWorkspace.ts`), so `failed to load file (...)` diagnostics are dropped when the referenced path exists in the project (the path is recovered from the source text at the diagnostic range; the worker gets the project file list via `TinymistLspClient.setProjectFiles`); the server only publishes diagnostics for the *focused* document, so `ProjectWorkspace.openFile` reopens the attached file on every editor attach; Typst Universe packages are prefetched in `resolveFn` and published as memory documents, then recompiles are nudged once the tarball lands.
- `codemirror-lang-typst`'s `typst_lezer()` bundles its own Lezer `linter()`; `@codemirror/lint`'s `setDiagnostics` is last-writer-wins, so that linter would wipe LSP diagnostics — `CodeEditor.tsx` rebuilds the `LanguageSupport` without it (`typstLanguage()`). Also: CodeMirror's own base theme pins `.cm-scroller` to `font-family: monospace`, so a custom font family in `EditorView.theme` must be set **on `.cm-scroller` as well** as the editor root — setting it on `'&'` alone leaves the text on the default stack (this is why the editor-font setting looked dead).
- `main.typ` protections are literal string checks (`path === 'main.typ'`), not `project.mainFile`.
- **typst.ts returns `diagnostics` only for *failed* compiles** (verified with both `unix` and `full` formats): a successful compile drops its warnings, so the worker protocol's `diagnostics` is empty whenever a PDF comes out. A failed compile carries its diagnostics in the thrown error message.
- pdf.js registers a `FontFace` per embedded font while rendering a text layer (`g_d<page>_f<font>` names), and never removes them — every new PDF would add more. `usePdfRenderer` deletes those names before each render; do not widen the cleanup to arbitrary faces, it would eat the app's own registrations. The same hook owns the document lifecycle: every compile produces a new `PDFDocumentLoadingTask`, and the replaced document must be released through **that task's** `destroy()` (`PDFDocumentProxy` has no public `destroy` in the types — the tasks are paired with their documents in a `WeakMap`). Skipping it leaks the parsed document *and* its pdf.js worker per compile, which is what used to kill the tab minutes in. The same hook scales the pages to its scroll container's width, so its `ResizeObserver` re-targets by element identity: a collapsed preview unmounts the container, and the next one must not inherit the width of the one before.
- **Fonts (Settings → Fonts)** are app-chrome only (a CSS-only concern: `AppearanceProvider` sets `--app-ui-font` / `--app-editor-font` on `<html>`, `globals.css` holds the fallback stacks, and compile output in `PdfPlaceholder.tsx` wears the Tailwind `font-editor` utility so the editor font covers diagnostics/errors). The pickers use the **Local Font Access API** (`window.queryLocalFonts()`), which is Chromium-only, needs a user gesture while the permission is still in `prompt`, and distinguishes a refusal by the user (`NotAllowedError`) from one by the environment (`SecurityError`) — the Settings dialog therefore enumerates from a button, falls back to a free-text family name (datalist suggestions) where unsupported, and treats a missing/denied API as silent (CSS simply falls back). `systemFontsUnavailableReason()` additionally reports *which* environment problem hides the API — insecure context, opaque origin (`file://`), a cross-origin iframe, an in-app WebView/Electron shell, iOS (WebKit), a phone/tablet, or desktop Chromium without it (old version, flag, policy, fork) — and the Settings dialog shows that instead of a generic "unsupported". TS 7's `lib.dom` has no typings for it; they live in `src/types/local-fonts.d.ts` (`queryLocalFonts` deliberately optional). A chosen family is registered as a `FontFace` (`document.fonts.add`) only when plain `font-family` cannot render it (a width probe decides — installed fonts resolve, fonts from the *user* font directory may not); registration reads the whole font file, so replaced faces are pruned (`pruneSystemFontFaces`) and a load that takes over 5 s is abandoned. A family that cannot be registered is not fatal: the reason (`SystemFontRegistrationError`) is returned and shown under the input. App-chrome choices are persisted **in the setters, not in mount effects**: writing state back on mount let a second tab with stale (empty) state clear the other tab's choice. Machine fonts feed **only** these pickers: compiles never read them (that path was tried and rolled back) — a document gets the CDN fonts plus any font files in the project.
- **Desktop layout defaults** (`TypstEditor.tsx`): the file tree starts at its minimum (200px, the narrowest column), the editor at half the window minus the file tree, and the right half belongs to the preview — the AI panel, when the user opens it, takes that same slot (identical width, the preview hidden but mounted, its page and zoom kept). The window width must be ≥ `AI_DOCK_MIN_WIDTH` (1280) for the panel to dock at all; between 768px and that, it overlays the workspace with no reserved room. The derived widths come from `viewportWidth` (a resize listener) rather than measured DOM, so the preview's width and the panel's width cannot drift apart.
- **Mobile (≤ 768px) is the inverse**: the editor alone, and the file tree, the preview and the AI panel are full-height pages over it below the header (`--app-header-height`), one at a time, opened from the header buttons — `mobilePanel` state, deliberately *not* persisted (what `LayoutStorage` remembers is the desktop arrangement). Picking a file closes the tree so the editor comes back. `SettingsDialog` takes `isMobile` and renders as a full page there instead of a centred card. Do not wrap the mobile editor in a flex row: a flex item sizes to the code's own width and the text ends up clipped instead of scrolling inside `.cm-scroller`.
- Folder detection = "path has no dot" — extension-less files are treated as folders by rename/delete.
- Dead code: `resetCompiler()` in the worker (no message invokes it), `PdfPreviewProps.fileCount/charCount` (never used), `ProjectStorage.getStorageSize`/`isStorageNearLimit` (no call sites).
- Build noise (pre-existing): a wasm-bindgen "deprecated parameters" console warning comes from typst.ts's own `wasm-pack-shim`.
