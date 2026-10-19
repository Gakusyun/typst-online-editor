
import { useState, useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import { downloadPdfFromUrl } from '@/lib/utils/helpers'
import { readLayoutPreferences, writeLayoutPreferences } from '@/lib/storage/LayoutStorage'
import FileExplorer from '../FileExplorer'
import TypstEditorHeader from './TypstEditorHeader'
import SettingsDialog, { type SettingsTab } from './SettingsDialog'
import CodeEditor from '../CodeEditor'
import AiAssistantPanel from '../AiAssistant/AiAssistantPanel'
import PdfPreview from '../PDFViewer'
import ResizeHandle from './ResizeHandle'
import type { AiEditScope, AiEditTarget } from '@/lib/ai/prompt'
import { useTypstCompiler } from './hooks/useTypstCompiler'
import { useProjectManagement } from './hooks/useProjectManagement'
import { useResizePanel } from './hooks/useResizePanel'
import { useAiSettings } from './hooks/useAiSettings'
import { useEditorSelection } from './hooks/useEditorSelection'

/** `ResizeHandle` is `w-1.5`. */
const HANDLE_WIDTH = 6

const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 600
const SIDEBAR_COLLAPSED_WIDTH = 48
const SIDEBAR_MOBILE_WIDTH = 320

const EDITOR_MIN_WIDTH = 300
const PREVIEW_MIN_WIDTH = 440 // Minimum width for PDF preview (toolbar requires 400px)
const PREVIEW_COLLAPSED_WIDTH = 48

/**
 * The preview and the AI panel share the region right of the editor, half
 * each, so the editor's resize handle must not squeeze either below this.
 */
const SIDE_PANEL_MIN_WIDTH = 320

/**
 * The desktop split is halves: the file tree (the narrowest column) plus the
 * editor hold the left half, the preview plus the AI panel the right half —
 * and those two split it 50/50. Those are the *defaults*, not the rules: every
 * column stays resizable. Below this the halves cannot both hold their
 * minimums, so the panel covers the workspace instead of sharing it.
 */
const AI_DOCK_MIN_WIDTH = 1280

/** A stored width, brought back inside the bounds the drag itself respects. */
function clampWidth(width: number, min: number, max: number): number {
	return Math.min(Math.max(width, min), max)
}

export default function TypstEditor() {
	/** The arrangement the user left behind; every field falls back to the preset. */
	const storedLayout = useMemo(() => readLayoutPreferences(), [])
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(storedLayout.sidebarCollapsed ?? false)
	const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(storedLayout.previewCollapsed ?? false)
	const [isMobile, setIsMobile] = useState(false)
	const [isNarrow, setIsNarrow] = useState(false)
	/** Non-null while the settings dialog is open — and which page it opens on. */
	const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null)
	/**
	 * Closed until the user opens it: the right half shows the preview, and the
	 * panel only takes that slot over when it is asked to (header button).
	 */
	const [isAiOpen, setIsAiOpen] = useState(storedLayout.aiOpen ?? false)
	/**
	 * The default widths are fractions of the window, so the derived columns
	 * have to know it; `clientWidth` excludes the scrollbar.
	 */
	const [viewportWidth, setViewportWidth] = useState(() => document.documentElement.clientWidth)

	// Layout breakpoints: below 768px the editor stacks (mobile layout), and
	// below `AI_DOCK_MIN_WIDTH` there is no room to dock the AI panel beside
	// the editor.
	useEffect(() => {
		const mobile = window.matchMedia('(max-width: 768px)')
		const narrow = window.matchMedia(`(max-width: ${AI_DOCK_MIN_WIDTH - 1}px)`)
		const sync = () => {
			setIsMobile(mobile.matches)
			setIsNarrow(narrow.matches)
		}
		sync()
		mobile.addEventListener('change', sync)
		narrow.addEventListener('change', sync)
		return () => {
			mobile.removeEventListener('change', sync)
			narrow.removeEventListener('change', sync)
		}
	}, [])

	useEffect(() => {
		const sync = () => setViewportWidth(document.documentElement.clientWidth)
		sync()
		window.addEventListener('resize', sync)
		return () => window.removeEventListener('resize', sync)
	}, [])
	
	/**
	 * Layout changes are persisted as they happen, never from a mount effect: a
	 * second tab that mounted before the change must not write its stale
	 * arrangement back over the one the user just made.
	 */
	const setSidebarCollapsed = useCallback((collapsed: boolean) => {
		writeLayoutPreferences({ sidebarCollapsed: collapsed })
		setIsSidebarCollapsed(collapsed)
	}, [])

	const setPreviewCollapsed = useCallback((collapsed: boolean) => {
		writeLayoutPreferences({ previewCollapsed: collapsed })
		setIsPreviewCollapsed(collapsed)
	}, [])

	const setAiOpen = useCallback((open: boolean) => {
		writeLayoutPreferences({ aiOpen: open })
		setIsAiOpen(open)
	}, [])

	// Compiler management
	const {
		status,
		pdfUrl,
		errorMsg,
		hasCompiled,
		compileNow,
		compileDebounced,
	} = useTypstCompiler()
	
	// Stable callback for project changes
	const handleProjectChange = useCallback((files: Record<string, string>, mainFile: string) => {
		compileDebounced(files, mainFile)
	}, [compileDebounced])
	
	// Project and file management
	const {
		currentProject,
		activeFilePath,
		getActiveFile,
		updateActiveFileContent,
		handleFileSelect,
		handleFileCreate,
		handleFolderCreate,
		handleFileRename,
		handleFileMove,
		handleFileDelete,
		renameProject,
		handleProjectImport,
		handleProjectExport,
	} = useProjectManagement(handleProjectChange)

	const { settings: aiSettings, updateSettings: updateAiSettings } = useAiSettings()
	const selectionStore = useEditorSelection()

	// A docked panel takes its own column out of the workspace (see the desktop
	// layout below) — the preview keeps the other half of the right side, so
	// opening the panel costs the preview width, never its existence.
	const aiDocked = !isMobile && !isNarrow
	const closeAi = useCallback(() => setAiOpen(false), [setAiOpen])
	const openAi = useCallback(() => setAiOpen(true), [setAiOpen])
	/** The preview's own toggle; the AI panel keeps its slot either way. */
	const togglePreview = () => setPreviewCollapsed(!isPreviewCollapsed)

	// The AI panel reads the project lazily — it must see the buffer as of the
	// moment a request is sent, not as of the last render — so it gets refs.
	const latestRef = useRef({ files: currentProject.files, activeFilePath })
	latestRef.current = { files: currentProject.files, activeFilePath }
	const updateContentRef = useRef(updateActiveFileContent)
	updateContentRef.current = updateActiveFileContent

	/** What the model may rewrite, snapshotted when a request is sent. */
	const getAiTarget = useCallback(
		(scope: AiEditScope): AiEditTarget => {
			const { files, activeFilePath } = latestRef.current
			const content = files.find((file) => file.path === activeFilePath)?.content ?? ''
			const selection = selectionStore.get()
			if (scope === 'selection' && selection) {
				return {
					path: activeFilePath,
					files: files.map((file) => file.path),
					code: selection.text,
					scope,
					selection: { from: selection.from, to: selection.to },
				}
			}
			return {
				path: activeFilePath,
				files: files.map((file) => file.path),
				code: content,
				scope: 'document',
				selection: null,
			}
		},
		[selectionStore]
	)

	/**
	 * Write a reply back into the document: the whole file when the request was
	 * made against the whole file, otherwise exactly the range it was made
	 * against. Edits only land in the file they were requested from.
	 */
	const applyAiEdit = useCallback((code: string, target: AiEditTarget) => {
		const { files, activeFilePath } = latestRef.current
		if (target.path !== activeFilePath || code.trim() === '') return
		const content = files.find((file) => file.path === activeFilePath)?.content ?? ''
		let next = code
		if (target.scope === 'selection' && target.selection) {
			// The document may have shrunk while the model was answering.
			const from = Math.min(target.selection.from, content.length)
			const to = Math.min(target.selection.to, content.length)
			next = content.slice(0, from) + code + content.slice(to)
		}
		if (next !== content) updateContentRef.current(next)
	}, [])
	
	/** Whether the editor handle has been dragged (then its width is the user's).
	 * A width restored from the last visit is the user's too. */
	const editorTouchedRef = useRef(storedLayout.editorWidth !== undefined)

	// Sidebar resize (left panel). With nothing stored it starts at its
	// narrowest: the file tree is the smallest column, and the editor and the
	// right side need the room.
	const sidebarResize = useResizePanel({
		minValue: SIDEBAR_MIN_WIDTH,
		maxValue: SIDEBAR_MAX_WIDTH,
		initialValue: clampWidth(
			storedLayout.sidebarWidth ?? SIDEBAR_MIN_WIDTH,
			SIDEBAR_MIN_WIDTH,
			SIDEBAR_MAX_WIDTH
		),
	})

	const effectiveSidebarWidth = isSidebarCollapsed
		? SIDEBAR_COLLAPSED_WIDTH
		: (isMobile ? SIDEBAR_MOBILE_WIDTH : sidebarResize.value)

	/**
	 * The width the editor and the column right of it share: everything right
	 * of the file tree, minus the two resize handles.
	 */
	const columnRegion = Math.max(0, viewportWidth - effectiveSidebarWidth - 2 * HANDLE_WIDTH)

	/** Widest the editor may get before the slot right of it hits its floor. */
	const editorMaxWidth = Math.max(
		EDITOR_MIN_WIDTH,
		columnRegion - (aiDocked && isAiOpen ? SIDE_PANEL_MIN_WIDTH : PREVIEW_MIN_WIDTH)
	)

	/** Half the window minus the file tree: the editor's untouched width. */
	const defaultEditorWidth = Math.min(
		Math.max(EDITOR_MIN_WIDTH, Math.round(viewportWidth / 2 - effectiveSidebarWidth - HANDLE_WIDTH)),
		editorMaxWidth
	)

	// Editor resize (middle panel)
	const editorResize = useResizePanel({
		minValue: EDITOR_MIN_WIDTH,
		maxValue: editorMaxWidth,
		onResize: () => {
			editorTouchedRef.current = true
		},
		initialValue: clampWidth(
			storedLayout.editorWidth ?? defaultEditorWidth,
			EDITOR_MIN_WIDTH,
			editorMaxWidth
		),
	})

	/**
	 * The slot right of the editor's resize handle: the preview's room by
	 * default, and the AI panel's room — exactly the same width — while it is
	 * open. The two take turns in it, they never split it.
	 *
	 * `columnRegion` already excludes both handles, so what is left of it after
	 * the editor is the preview's own width, handle or no handle.
	 */
	const sideSlotWidth = Math.max(0, columnRegion - editorResize.value)

	const isAnyResizing = sidebarResize.isResizing || editorResize.isResizing

	// Persist the columns the user drags once the drag ends: not on every mouse
	// move, and never the widths the app derives on its own.
	const wasResizingRef = useRef(false)
	useEffect(() => {
		if (wasResizingRef.current && !isAnyResizing) {
			writeLayoutPreferences({ sidebarWidth: sidebarResize.value, editorWidth: editorResize.value })
		}
		wasResizingRef.current = isAnyResizing
	}, [isAnyResizing, sidebarResize.value, editorResize.value])

	// Hold the default split (file tree + editor | preview + AI panel) through
	// a window or file-tree resize, and keep the editor's drag limit honest: a
	// hand-picked width is only clamped, so a shrinking window can never starve
	// the columns right of the editor.
	useEffect(() => {
		editorResize.setMaxValue(editorMaxWidth)
		const target = editorTouchedRef.current ? editorResize.value : defaultEditorWidth
		const next = Math.min(Math.max(target, EDITOR_MIN_WIDTH), editorMaxWidth)
		if (next !== editorResize.value) editorResize.setValue(next)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [defaultEditorWidth, editorMaxWidth])

	const handleCompileNow = async () => {
		const filesMap = currentProject.files.reduce<Record<string, string>>((acc, file) => {
			acc[file.path] = file.content
			return acc
		}, {})
		await compileNow(filesMap, currentProject.mainFile)
	}

	const handleDownload = () => {
		if (pdfUrl) {
			downloadPdfFromUrl(pdfUrl, 'document.pdf')
		}
	}

	/** The docked panel holds the preview's slot; the preview steps aside. */
	const aiTakesSideSlot = aiDocked && isAiOpen
	/**
	 * The editor stretches into a collapsed preview's room — unless the panel
	 * took that room, which keeps the editor at its own width.
	 */
	const editorFillsWorkspace = isPreviewCollapsed && !aiTakesSideSlot

	return (
		<div className="flex flex-col h-screen bg-gray-900 text-white">
			{/* Global resize overlay - prevents iframe from capturing cursor */}
			{isAnyResizing && (
				<div 
					className="fixed inset-0 z-50 cursor-col-resize"
					style={{ backgroundColor: 'transparent' }}
				/>
			)}
			
			<TypstEditorHeader
				status={status}
				hasCompiled={hasCompiled}
				pdfUrl={pdfUrl}
				isMobile={isMobile}
				aiOpen={isAiOpen}
				onCompileNow={handleCompileNow}
				onDownload={handleDownload}
				onOpenSettings={() => setSettingsTab('general')}
				onToggleAi={() => (isAiOpen ? closeAi() : openAi())}
			/>

			{settingsTab && (
				<SettingsDialog
					initialTab={settingsTab}
					onClose={() => setSettingsTab(null)}
					aiSettings={aiSettings}
					onAiSettingsChange={updateAiSettings}
				/>
			)}

			{/* Mounted while closed too, so the conversation survives a close. */}
			<AiAssistantPanel
				isOpen={isAiOpen && settingsTab === null}
				onClose={closeAi}
				activeFilePath={activeFilePath}
				settings={aiSettings}
				selectionStore={selectionStore}
				docked={aiDocked}
				dockedWidth={sideSlotWidth}
				getTarget={getAiTarget}
				onApply={applyAiEdit}
				onOpenSettings={() => setSettingsTab('ai')}
			/>

			{isMobile ? (
				/* Mobile Layout: Sidebar + Editor on top, Preview below */
				<div className="flex flex-col flex-1 overflow-hidden">
					{/* Top section: Sidebar + Editor */}
					<div className="flex flex-1 min-h-0 overflow-hidden">
						{/* File Explorer Sidebar */}
						<div 
							style={{ 
								width: `${effectiveSidebarWidth}px`,
								minWidth: `${effectiveSidebarWidth}px`,
								maxWidth: `${effectiveSidebarWidth}px`,
								transition: isSidebarCollapsed ? 'width 0.2s ease-in-out' : 'none'
							}}
							className="shrink-0"
						>
							<FileExplorer
								project={currentProject}
								activeFile={activeFilePath}
								onFileSelect={handleFileSelect}
								onFileCreate={handleFileCreate}
								onFolderCreate={handleFolderCreate}
								onFileDelete={handleFileDelete}
								onFileRename={handleFileRename}
								onFileMove={handleFileMove}
								onRenameProject={renameProject}
								onImportProject={handleProjectImport}
								onExportProject={handleProjectExport}
								isCollapsed={isSidebarCollapsed}
								onToggleCollapse={() => setSidebarCollapsed(!isSidebarCollapsed)}
							/>
						</div>

						{/* Code Editor */}
						<div className="flex-1 min-w-0">
							<CodeEditor
								project={currentProject}
								activeFilePath={activeFilePath}
								onChange={updateActiveFileContent}
								onFileSelect={handleFileSelect}
								onSelectionChange={selectionStore.set}
							/>
						</div>
					</div>

					{/* Bottom section: PDF Preview */}
					<div 
						className="flex-1 min-h-0"
						style={{ minHeight: '300px' }}
					>
						<PdfPreview
							pdfUrl={pdfUrl}
							status={status}
							errorMsg={errorMsg}
							hasCompiled={hasCompiled}
							fileCount={currentProject.files.length}
							charCount={getActiveFile()?.content.length || 0}
							isCollapsed={isPreviewCollapsed}
							onToggleCollapse={togglePreview}
						/>
					</div>
				</div>
			) : (
				/* Desktop Layout: Sidebar | Editor + Preview | AI panel */
				<div
					// Reserved, not overlaid: the workspace gives up exactly the room
					// the docked panel occupies, so no control ever sits under it.
					className="flex flex-1 min-w-0 overflow-hidden"
					style={aiTakesSideSlot ? { paddingRight: `${sideSlotWidth}px` } : undefined}
				>
					{/* File Explorer Sidebar */}
					<div 
						style={{ 
							width: `${effectiveSidebarWidth}px`,
							minWidth: `${effectiveSidebarWidth}px`,
							maxWidth: `${effectiveSidebarWidth}px`,
							transition: isSidebarCollapsed ? 'width 0.2s ease-in-out' : 'none'
						}}
						className="shrink-0"
					>
						<FileExplorer
							project={currentProject}
							activeFile={activeFilePath}
							onFileSelect={handleFileSelect}
							onFileCreate={handleFileCreate}
							onFolderCreate={handleFolderCreate}
							onFileDelete={handleFileDelete}
							onFileRename={handleFileRename}
							onFileMove={handleFileMove}
							onRenameProject={renameProject}
							onImportProject={handleProjectImport}
							onExportProject={handleProjectExport}
							isCollapsed={isSidebarCollapsed}
							onToggleCollapse={() => setSidebarCollapsed(!isSidebarCollapsed)}
						/>
					</div>

					{/* Sidebar Resize Handle */}
					{!isSidebarCollapsed && (
						<ResizeHandle
							isResizing={sidebarResize.isResizing}
							onMouseDown={sidebarResize.startResize}
						/>
					)}

					{/* Editor + Preview Container - Takes remaining space */}
					<div className="flex flex-1 min-w-0 overflow-hidden">
						{/* Code Editor */}
						<div 
							className={editorFillsWorkspace ? "flex-1 min-w-0" : "shrink-0"}
							style={editorFillsWorkspace ? {
								minWidth: `${EDITOR_MIN_WIDTH}px`,
							} : { 
								width: `${editorResize.value}px`,
								minWidth: `${EDITOR_MIN_WIDTH}px`,
								maxWidth: `${editorResize.value}px`,
							}}
						>
							<CodeEditor
								project={currentProject}
								activeFilePath={activeFilePath}
								onChange={updateActiveFileContent}
								onFileSelect={handleFileSelect}
								onSelectionChange={selectionStore.set}
							/>
						</div>

						{/* Editor/Preview Resize Handle */}
						{(!isPreviewCollapsed || aiTakesSideSlot) && (
							<ResizeHandle
								isResizing={editorResize.isResizing}
								onMouseDown={editorResize.startResize}
							/>
						)}

						{/* PDF Preview — the slot right of the editor, while the panel
						    is closed. The panel takes this very slot when it is open,
						    so the preview keeps its element (and its page and zoom)
						    while it waits. */}
						<div 
							className={
								aiTakesSideSlot ? 'hidden' : isPreviewCollapsed ? 'shrink-0' : 'flex-1 min-w-0'
							}
							style={
								aiTakesSideSlot ? undefined : isPreviewCollapsed ? { 
									width: `${PREVIEW_COLLAPSED_WIDTH}px`,
									minWidth: `${PREVIEW_COLLAPSED_WIDTH}px`,
									maxWidth: `${PREVIEW_COLLAPSED_WIDTH}px`,
									transition: 'width 0.2s ease-in-out'
								} : {
									minWidth: `${PREVIEW_MIN_WIDTH}px`,
								}
							}
						>
							<PdfPreview
								pdfUrl={pdfUrl}
								status={status}
								errorMsg={errorMsg}
								hasCompiled={hasCompiled}
								fileCount={currentProject.files.length}
								charCount={getActiveFile()?.content.length || 0}
								isCollapsed={isPreviewCollapsed || aiTakesSideSlot}
								onToggleCollapse={togglePreview}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
