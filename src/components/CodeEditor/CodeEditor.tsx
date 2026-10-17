import { useEffect, useRef, useState } from 'preact/hooks'
import { EditorState, type Extension } from '@codemirror/state'
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
import { TinymistLspClient, type TinymistLspStatus } from '@/lib/lsp/tinymistClient'
import { ProjectWorkspace, pathToUri } from '@/lib/lsp/projectWorkspace'
import type { Project } from '@/lib/storage/ProjectStorage'
import { editorHighlighting, editorTheme } from './theme'

interface CodeEditorProps {
	project: Project
	activeFilePath: string
	onChange: (content: string) => void
	onFileSelect: (path: string) => void
}

const IMAGE_FILES = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']
const FONT_FILES = ['ttf', 'otf', 'woff', 'woff2']

function baseExtensions(placeholderText: string): Extension[] {
	return [
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
		cmPlaceholder(placeholderText),
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

export default function CodeEditor({
	project,
	activeFilePath,
	onChange,
	onFileSelect,
}: CodeEditorProps) {
	const { t } = useI18n()
	const hostRef = useRef<HTMLDivElement | null>(null)
	const viewRef = useRef<EditorView | null>(null)
	const lspRef = useRef<TinymistLspClient | null>(null)
	const lspClientRef = useRef<LSPClient | null>(null)
	const workspaceRef = useRef<ProjectWorkspace | null>(null)
	const projectRef = useRef(project)
	const onChangeRef = useRef(onChange)
	const onFileSelectRef = useRef(onFileSelect)
	const [lspStatus, setLspStatus] = useState<TinymistLspStatus>('loading')
	const [lspStatusDetail, setLspStatusDetail] = useState<string | undefined>()

	projectRef.current = project
	onChangeRef.current = onChange
	onFileSelectRef.current = onFileSelect

	const fileExtension = activeFilePath.split('.').pop()?.toLowerCase() || ''
	const isImageFile = IMAGE_FILES.includes(fileExtension)
	const isFontFile = FONT_FILES.includes(fileExtension)
	const isBinaryFile = isImageFile || isFontFile
	const activeFile = project.files.find((file) => file.path === activeFilePath)
	const content = activeFile?.content ?? ''
	const isTypstFile = activeFilePath.endsWith('.typ')

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
		workspaceRef.current?.applyProject(projectRef.current.files)
		client.connect(tinymist.transport)
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

	useEffect(() => {
		workspaceRef.current?.applyProject(project.files)
		lspRef.current?.setProjectFiles(project.files.map((file) => file.path))
		// Push project-driven content changes (storage load, import, undo) that
		// no editor view has synchronized yet.
		lspClientRef.current?.sync()
	}, [project])

	useEffect(() => {
		if (isBinaryFile || !hostRef.current) return
		const client = lspClientRef.current
		const extensions: Extension[] = [
			...baseExtensions(t('editor.typeHere')),
			...languageExtensions(activeFilePath),
			editorTheme,
			editorHighlighting,
			EditorView.updateListener.of((update) => {
				if (update.docChanged) onChangeRef.current(update.state.doc.toString())
			}),
		]
		if (isTypstFile && client) {
			extensions.push(lintGutter(), client.plugin(pathToUri(activeFilePath), 'typst'))
		}
		const view = new EditorView({
			state: EditorState.create({ doc: content, extensions }),
			parent: hostRef.current,
		})
		viewRef.current = view
		return () => {
			// Flush pending edits of the old file before its plugin goes away.
			lspClientRef.current?.sync()
			view.destroy()
			viewRef.current = null
		}
		// content is read from the project snapshot at (re)creation time; later
		// external edits are applied by the sync effect below.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeFilePath, isBinaryFile, isTypstFile])

	// Apply externally-driven content changes (import, undo via storage, …).
	useEffect(() => {
		const view = viewRef.current
		if (!view || isBinaryFile) return
		if (view.state.doc.toString() !== content) {
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } })
		}
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
