
import { useState, useCallback, useEffect, useRef } from 'preact/hooks'
import { downloadPdfFromUrl } from '@/lib/utils/helpers'
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

const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 600
const SIDEBAR_DEFAULT_WIDTH = 280
const SIDEBAR_COLLAPSED_WIDTH = 48
const SIDEBAR_MOBILE_WIDTH = 320

const EDITOR_MIN_WIDTH = 300
const EDITOR_DEFAULT_WIDTH = 500
const PREVIEW_MIN_WIDTH = 440 // Minimum width for PDF preview (toolbar requires 400px)
const PREVIEW_COLLAPSED_WIDTH = 48

/**
 * Below this the workspace cannot give the panel its width (`--ai-panel-width`)
 * without squeezing the editor (or clipping the preview out of the window), so
 * the panel covers the workspace instead of reserving room in it.
 */
const AI_DOCK_MIN_WIDTH = 1100

export default function TypstEditor() {
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
	const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false)
	const [isMobile, setIsMobile] = useState(false)
	const [isNarrow, setIsNarrow] = useState(false)
	/** Non-null while the settings dialog is open — and which page it opens on. */
	const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null)
	const [isAiOpen, setIsAiOpen] = useState(false)
	/** True while the preview is collapsed only because the AI panel took its room. */
	const [previewCollapsedByAi, setPreviewCollapsedByAi] = useState(false)

	// Layout breakpoints: below 768px the editor stacks (mobile layout), and
	// below 1100px there is no room to dock the AI panel beside the editor.
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

	// A docked panel takes its width from the workspace, and the only column that
	// can give it up is the preview — the sidebar and the editor are resizable
	// columns whose minimums the app already commits to. So opening the panel
	// collapses the preview and closing it hands the room back; the two never
	// overlap, which is what used to leave the preview's toolbar unclickable.
	const aiDocked = !isMobile && !isNarrow
	const closeAi = useCallback(() => {
		setIsAiOpen(false)
		if (previewCollapsedByAi) {
			setIsPreviewCollapsed(false)
			setPreviewCollapsedByAi(false)
		}
	}, [previewCollapsedByAi])
	const openAi = () => {
		if (aiDocked && !isPreviewCollapsed) {
			setIsPreviewCollapsed(true)
			setPreviewCollapsedByAi(true)
		}
		setIsAiOpen(true)
	}
	/** The preview's own toggle; expanding it hands the room back to the preview. */
	const togglePreview = () => {
		const expanding = isPreviewCollapsed
		if (expanding && isAiOpen && aiDocked) closeAi()
		setIsPreviewCollapsed(!expanding)
		if (expanding) setPreviewCollapsedByAi(false)
	}

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
	
	// Sidebar resize (left panel)
	const sidebarResize = useResizePanel({
		minValue: SIDEBAR_MIN_WIDTH,
		maxValue: SIDEBAR_MAX_WIDTH,
		initialValue: SIDEBAR_DEFAULT_WIDTH,
	})
	
	// Editor resize (middle panel)
	const editorResize = useResizePanel({
		minValue: EDITOR_MIN_WIDTH,
		maxValue: 5000, // High max, constrained dynamically
		initialValue: EDITOR_DEFAULT_WIDTH,
	})

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

	const effectiveSidebarWidth = isSidebarCollapsed 
		? SIDEBAR_COLLAPSED_WIDTH 
		: (isMobile ? SIDEBAR_MOBILE_WIDTH : sidebarResize.value)
	const effectivePreviewWidth = isPreviewCollapsed ? PREVIEW_COLLAPSED_WIDTH : PREVIEW_MIN_WIDTH
	const isAnyResizing = sidebarResize.isResizing || editorResize.isResizing

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
								onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
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
				/* Desktop Layout: Sidebar | Editor + Preview */
				<div
					// Reserved, not overlaid: the workspace is narrower while the panel
					// is docked, so no control ever sits under it.
					className={`flex flex-1 overflow-hidden ${isAiOpen && aiDocked ? 'pr-[var(--ai-panel-width)]' : ''}`}
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
							onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
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
					<div className="flex flex-1 min-w-0 overflow-hidden" id="editor-preview-container">
						{/* Code Editor */}
						<div 
							className={isPreviewCollapsed ? "flex-1 min-w-0" : "shrink-0"}
							style={isPreviewCollapsed ? {
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
						{!isPreviewCollapsed && (
							<ResizeHandle
								isResizing={editorResize.isResizing}
								onMouseDown={(e) => {
									// Dynamically calculate max width based on actual container size
									// This prevents the editor from exceeding available space
									const container = document.getElementById('editor-preview-container')
									if (container) {
										const containerWidth = container.offsetWidth
										const handleWidth = 6
										const maxEditorWidth = containerWidth - effectivePreviewWidth - handleWidth
										editorResize.setMaxValue(maxEditorWidth)
									}
									editorResize.startResize(e)
								}}
							/>
						)}

						{/* PDF Preview - Takes remaining space */}
						<div 
							className={isPreviewCollapsed ? "shrink-0" : "flex-1 min-w-0"}
							style={isPreviewCollapsed ? { 
								width: `${PREVIEW_COLLAPSED_WIDTH}px`,
								minWidth: `${PREVIEW_COLLAPSED_WIDTH}px`,
								maxWidth: `${PREVIEW_COLLAPSED_WIDTH}px`,
								transition: 'width 0.2s ease-in-out'
							} : {
								minWidth: `${PREVIEW_MIN_WIDTH}px`,
							}}
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
				</div>
			)}
		</div>
	)
}
