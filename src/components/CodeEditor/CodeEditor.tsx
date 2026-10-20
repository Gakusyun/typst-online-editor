import { useEffect, useRef, useState } from 'preact/hooks'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
	EditorView,
	crosshairCursor,
	drawSelection,
	dropCursor,
	highlightActiveLine,
	highlightActiveLineGutter,
	highlightSpecialChars,
	keymap,
	lineNumbers,
	placeholder as cmPlaceholder,
	rectangularSelection,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import {
	autocompletion,
	closeBrackets,
	closeBracketsKeymap,
	completionKeymap,
} from '@codemirror/autocomplete'
import {
	LanguageSupport,
	StreamLanguage,
	bracketMatching,
	foldGutter,
	foldKeymap,
	indentOnInput,
} from '@codemirror/language'
import { lintGutter, lintKeymap } from '@codemirror/lint'
import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client'
import { typst_lezer, typstLezerLinter } from 'codemirror-lang-typst/lezer'
import { markdown } from '@codemirror/lang-markdown'
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/legacy-modes/mode/yaml'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { useI18n } from '@/lib/i18n/useI18n'
import { useAppearance } from '@/lib/appearance/useAppearance'
import { TinymistLspClient, type TinymistLspStatus } from '@/lib/lsp/tinymistClient'
import { ProjectWorkspace, WORKSPACE_TEXT_FILE, languageIdForPath } from '@/lib/lsp/projectWorkspace'
import { pathToUri } from '@/lib/lsp/uri'
import type { Project } from '@/lib/storage/ProjectStorage'
import { editorHighlighting, editorTheme } from './theme'

/** The editor's current selection; `null` when it is empty (a bare cursor). */
export interface EditorSelection {
	from: number
	to: number
	text: string
}

interface CodeEditorProps {
	project: Project
	activeFilePath: string
	onChange: (content: string) => void
	onFileSelect: (path: string) => void
	/** Reported whenever the selection changes (the AI panel feeds off it). */
	onSelectionChange?: (selection: EditorSelection | null) => void
}

const IMAGE_FILES = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']
const FONT_FILES = ['ttf', 'otf', 'woff', 'woff2']

/**
 * Word wrap is toggled while the view lives (Settings stays open over it), so
 * it sits in a compartment that a reconfigure effect can swap in place instead
 * of rebuilding the whole editor.
 */
const wordWrapCompartment = new Compartment()

/**
 * The placeholder is localized, so it gets its own compartment: switching the
 * UI language swaps it in place instead of rebuilding the view (which would
 * drop the undo history and the scroll position).
 */
const placeholderCompartment = new Compartment()

function baseExtensions(placeholderText: string, wordWrap: boolean): Extension[] {
	return [
		wordWrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
		foldGutter(),
		lineNumbers(),
		highlightActiveLineGutter(),
		highlightSpecialChars(),
		history(),
		drawSelection(),
		dropCursor(),
		EditorState.allowMultipleSelections.of(true),
		indentOnInput(),
		bracketMatching(),
		closeBrackets(),
		autocompletion(),
		rectangularSelection(),
		crosshairCursor(),
		highlightActiveLine(),
		highlightSelectionMatches(),
		search({ top: true }),
		placeholderCompartment.of(cmPlaceholder(placeholderText)),
		keymap.of([
			...closeBracketsKeymap,
			...defaultKeymap,
			...searchKeymap,
			...historyKeymap,
			...foldKeymap,
			...completionKeymap,
			...lintKeymap,
			indentWithTab,
		]),
	]
}

function languageExtensions(path: string): Extension[] {
	const ext = path.split('.').pop()?.toLowerCase() ?? ''
	if (path.endsWith('.typ')) return [typstLanguage()]
	if (ext === 'md' || ext === 'mdx') return [markdown()]
	if (ext === 'json') return [json()]
	if (ext === 'yaml' || ext === 'yml') return [StreamLanguage.define(yaml)]
	if (ext === 'toml') return [StreamLanguage.define(toml)]
	return []
}

/**
 * `typst_lezer()` bundles its own Lezer-based `linter()`, which writes
 * diagnostics through `setDiagnostics` and would therefore replace the LSP's
 * diagnostics (last writer wins). LSP diagnostics are authoritative here, so
 * rebuild the support bundle without the Lezer linter.
 */
function typstLanguage(): LanguageSupport {
	const support = typst_lezer()
	const raw = support.support
	const parts = Array.isArray(raw) ? raw.filter((part) => part !== typstLezerLinter) : []
	return new LanguageSupport(support.language, parts)
}

/** The non-empty selection of `view`, or `null` (a bare cursor is not one). */
function readSelection(view: EditorView): EditorSelection | null {
	const range = view.state.selection.main
	if (range.empty) return null
	return { from: range.from, to: range.to, text: view.state.sliceDoc(range.from, range.to) }
}

export default function CodeEditor({
	project,
	activeFilePath,
	onChange,
	onFileSelect,
	onSelectionChange,
}: CodeEditorProps) {
	const { t } = useI18n()
	const { editorWordWrap } = useAppearance()
	const hostRef = useRef<HTMLDivElement | null>(null)
	const viewRef = useRef<EditorView | null>(null)
	const lspRef = useRef<TinymistLspClient | null>(null)
	const lspClientRef = useRef<LSPClient | null>(null)
	const workspaceRef = useRef<ProjectWorkspace | null>(null)
	const projectRef = useRef(project)
	const onChangeRef = useRef(onChange)
	const onFileSelectRef = useRef(onFileSelect)
	const onSelectionChangeRef = useRef(onSelectionChange)
	const [lspStatus, setLspStatus] = useState<TinymistLspStatus>('loading')
	const [lspStatusDetail, setLspStatusDetail] = useState<string | undefined>()

	projectRef.current = project
	onChangeRef.current = onChange
	onFileSelectRef.current = onFileSelect
	onSelectionChangeRef.current = onSelectionChange

	const fileExtension = activeFilePath.split('.').pop()?.toLowerCase() || ''
	const isImageFile = IMAGE_FILES.includes(fileExtension)
	const isFontFile = FONT_FILES.includes(fileExtension)
	const isBinaryFile = isImageFile || isFontFile
	const activeFile = project.files.find((file) => file.path === activeFilePath)
	const content = activeFile?.content ?? ''
	const isTypstFile = activeFilePath.endsWith('.typ')
	/** Files the workspace opens on the server (and therefore attaches a plugin to). */
	const isTextFile = WORKSPACE_TEXT_FILE.test(activeFilePath)

	// The language server lives for the whole editor session; the view is
	// recreated when the active file changes.
	useEffect(() => {
		const tinymist = new TinymistLspClient()
		const client = new LSPClient({
			rootUri: 'file:///',
			// The wasm language server downloads from a CDN on first use; give
			// the initialization exchange enough time for a cold load.
			timeout: 60_000,
			extensions: languageServerExtensions(),
			workspace: (owner) => {
				const workspace = new ProjectWorkspace(owner, {
					getFiles: () => projectRef.current.files,
					onNavigate: (path) => onFileSelectRef.current(path),
				})
				workspaceRef.current = workspace
				return workspace
			},
		})
		client.connect(tinymist.transport)
		// `connect` alone never reports a failed handshake: the initialize
		// exchange resolves `client.initializing`, and its rejection (a 60 s
		// timeout, or the transport throwing because the worker is gone) was an
		// unhandled rejection while the UI kept claiming the server was there.
		void client.initializing.catch((error: unknown) => {
			console.error('[tinymist] language server unavailable:', error)
			setLspStatus('error')
			setLspStatusDetail(error instanceof Error ? error.message : String(error))
		})
		const unsubscribe = tinymist.onStatus((status, detail) => {
			setLspStatus(status)
			setLspStatusDetail(detail)
		})
		lspRef.current = tinymist
		lspClientRef.current = client
		return () => {
			unsubscribe()
			client.disconnect()
			tinymist.dispose()
			lspRef.current = null
			lspClientRef.current = null
			workspaceRef.current = null
		}
	}, [])

	/**
	 * Only a change to the file *set* (create, delete, rename, import) can
	 * change what the server has open: the project object is rebuilt on every
	 * keystroke, and re-sending the path list then — which re-opens documents in
	 * the workspace — is pure churn. The content itself is pushed either by the
	 * editor's own change notifications or by the `sync()` below.
	 */
	const pathKey = project.files.map((file) => file.path).join('\u0000')

	useEffect(() => {
		workspaceRef.current?.applyProject(projectRef.current.files)
		lspRef.current?.setProjectFiles(projectRef.current.files.map((file) => file.path))
	}, [pathKey])

	useEffect(() => {
		// Push project-driven content changes (storage load, import, undo) that
		// no editor view has synchronized yet.
		lspClientRef.current?.sync()
	}, [project])

	useEffect(() => {
		if (isBinaryFile || !hostRef.current) return
		const client = lspClientRef.current
		const extensions: Extension[] = [
			...baseExtensions(t('editor.typeHere'), editorWordWrap),
			...languageExtensions(activeFilePath),
			editorTheme,
			editorHighlighting,
			EditorView.updateListener.of((update) => {
				if (update.docChanged) onChangeRef.current(update.state.doc.toString())
				if (update.selectionSet || update.docChanged) {
					onSelectionChangeRef.current?.(readSelection(update.view))
				}
			}),
		]
		if (client && isTextFile) {
			// The workspace opens every text file of the project, and the plugin is
			// what tells it a document is *displayed*: attaching it only for `.typ`
			// left a go-to-definition into a project `.md`/`.json` waiting on a
			// document that never appeared (and failing 2 s later).
			extensions.push(
				lintGutter(),
				client.plugin(pathToUri(activeFilePath), languageIdForPath(activeFilePath))
			)
		}
		const view = new EditorView({
			state: EditorState.create({ doc: content, extensions }),
			parent: hostRef.current,
		})
		viewRef.current = view
		onSelectionChangeRef.current?.(readSelection(view))
		return () => {
			// Flush pending edits of the old file before its plugin goes away.
			lspClientRef.current?.sync()
			view.destroy()
			viewRef.current = null
			onSelectionChangeRef.current?.(null)
		}
		// content is read from the project snapshot at (re)creation time; later
		// external edits are applied by the sync effect below.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeFilePath, isBinaryFile, isTextFile])

	// The placeholder text follows the UI language; a compartment swap keeps the
	// view (and the scroll position) alive across the switch.
	useEffect(() => {
		viewRef.current?.dispatch({
			effects: placeholderCompartment.reconfigure(cmPlaceholder(t('editor.typeHere'))),
		})
	}, [t])

	// Word wrap toggles from Settings while the view lives; reconfigure the
	// compartment instead of rebuilding the editor (which would reset scroll).
	useEffect(() => {
		viewRef.current?.dispatch({
			effects: wordWrapCompartment.reconfigure(editorWordWrap ? EditorView.lineWrapping : []),
		})
	}, [editorWordWrap])

	// Apply externally-driven content changes (AI edits, import, undo, …).
	useEffect(() => {
		const view = viewRef.current
		if (!view || isBinaryFile) return
		const current = view.state.doc.toString()
		if (current === content) return
		// Replace only the differing middle instead of the whole document: a
		// full-document change maps the cursor to the end of the file, while a
		// localized change carries the cursor and selection along with it.
		let start = 0
		const shortest = Math.min(current.length, content.length)
		while (start < shortest && current[start] === content[start]) start += 1
		let currentEnd = current.length
		let contentEnd = content.length
		while (
			currentEnd > start &&
			contentEnd > start &&
			current[currentEnd - 1] === content[contentEnd - 1]
		) {
			currentEnd -= 1
			contentEnd -= 1
		}
		view.dispatch({
			changes: { from: start, to: currentEnd, insert: content.slice(start, contentEnd) },
		})
	}, [content, isBinaryFile])

	const lspStatusText =
		isTypstFile && lspStatus === 'loading'
			? t('editor.lspLoading')
			: isTypstFile && lspStatus === 'error'
				? t('editor.lspUnavailable')
				: ''

	return (
		<div className="flex flex-col h-full border-r border-gray-700">
			<div className="px-4 py-3 bg-gray-800 border-b border-gray-700 text-sm text-gray-400 flex items-center justify-between gap-3">
				<span className="truncate">{activeFilePath}</span>
				{lspStatusText && (
					<span className="shrink-0 text-xs" title={lspStatusDetail}>
						{lspStatusText}
					</span>
				)}
			</div>

			<div className="flex-1 overflow-hidden">
				{isBinaryFile ? (
					<div className="p-4 font-mono text-sm" style={{ color: '#fbbf24' }}>
						{isImageFile ? t('editor.imageContent') : t('editor.fontContent')}
					</div>
				) : (
					<div ref={hostRef} className="h-full overflow-hidden" />
				)}
			</div>
		</div>
	)
}
