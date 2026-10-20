import type { ComponentChildren, TargetedDragEvent, TargetedKeyboardEvent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { PanelLeft, Upload } from 'lucide-preact'
import type { FileCreateEntry, FileExplorerProps, FileNode } from './types'
import { useFileTree } from './hooks/useFileTree'
import { useFileOperations } from './hooks/useFileOperations'
import { useDragAndDrop } from './hooks/useDragAndDrop'
import { useI18n } from '@/lib/i18n/useI18n'
import { buildFileTree, flattenFileTree } from './utils/buildFileTree'
import { fileNameOf, isProtectedPath, joinPath, parentPathOf, validateName } from './utils/paths'
import FileExplorerHeader from './components/FileExplorerHeader'
import FileExplorerActions from './components/FileExplorerActions'
import CreateItemInput from './components/CreateItemInput'
import FolderTreeItem from './components/FolderTreeItem'
import FileTreeItem from './components/FileTreeItem'


const ALLOWED_EXTENSIONS = ['.typ', '.txt', '.md', '.mdx','.png', '.jpg', '.jpeg', '.svg', '.json', '.csv', '.dat', '.yml', '.yaml', '.toml', '.ttf', '.otf']

/** How long the drop hint survives without a drag event over the panel. */
const DROP_HINT_LINGER_MS = 100

/** Extensions the project stores as base64 data: URLs (the compiler and the zip export split those back into bytes). */
const BINARY_FILE_RE = /\.(png|jpg|jpeg|svg|ttf|otf)$/i

const BINARY_MIME_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	svg: 'image/svg+xml',
	ttf: 'font/ttf',
	otf: 'font/otf',
}

/**
 * Reads a dropped file into the shape the project stores: text as UTF-8, images
 * and fonts as a data: URL. Reading through `FileReader` needed callbacks, which
 * is why a failed read used to disappear — no try/catch ever awaited one.
 */
async function readDroppedFile(file: File): Promise<string> {
	if (!BINARY_FILE_RE.test(file.name)) return await file.text()

	const bytes = new Uint8Array(await file.arrayBuffer())
	const extension = fileNameOf(file.name).split('.').pop()?.toLowerCase() ?? ''
	let binary = ''
	// Chunked: a font or an image is far larger than one spread call can take.
	const CHUNK = 0x8000
	for (let index = 0; index < bytes.length; index += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
	}
	return `data:${BINARY_MIME_TYPES[extension] ?? 'application/octet-stream'};base64,${btoa(binary)}`
}

export default function FileExplorer({
	project,
	activeFile,
	onFileSelect,
	onFileCreate,
	onFilesCreate,
	onFolderCreate,
	onFileDelete,
	onFileRename,
	onFileMove,
	onRenameProject,
	onImportProject,
	onExportProject,
	isCollapsed = false,
	onToggleCollapse,
}: FileExplorerProps) {
	const [isDraggingExternal, setIsDraggingExternal] = useState(false)
	const [focusedPath, setFocusedPath] = useState<string | null>(null)
	// A rename replaces its row, so the row to focus again may only exist in the
	// next render — the focus request has to wait for it.
	const [pendingFocusPath, setPendingFocusPath] = useState<string | null>(null)
	const listRef = useRef<HTMLDivElement>(null)
	const dragLeaveTimerRef = useRef<number | null>(null)

	const { expandedFolders, toggleFolder, expandFolder } = useFileTree()

	const {
		creatingItem,
		setCreatingItem,
		newItemName,
		setNewItemName,
		renamingItem,
		renameValue,
		setRenameValue,
		selectedItem,
		setSelectedItem,
		handleCreateItem,
		handleCancelCreate,
		handleStartRename,
		handleRename,
		handleCancelRename,
	} = useFileOperations(onFileCreate, onFolderCreate, onFileRename, expandFolder)

	const {
		draggedItem,
		dropTarget,
		handleDragStart,
		handleDragEnd,
		handleDragOver,
		handleDrop,
	} = useDragAndDrop(onFileMove)

	const { t } = useI18n()

	// The tree depends on the shape of the project, not on its contents: memoized
	// on the project object it would rebuild every folder on each keystroke.
	const structureKey = useMemo(
		() => `${project.mainFile}\n${project.files.map(file => file.path).join('\n')}`,
		[project.files, project.mainFile]
	)
	const fileTree = useMemo(() => buildFileTree(project), [structureKey])
	// Exactly one row is tabbable: the focused one, or the first row until the
	// tree has been focused at all (roving tabindex).
	const visibleRows = useMemo(() => flattenFileTree(fileTree, expandedFolders), [fileTree, expandedFolders])
	const rovingPath = visibleRows.some(row => row.path === focusedPath) ? focusedPath : visibleRows[0]?.path

	useEffect(() => {
		if (!pendingFocusPath) return
		listRef.current?.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(pendingFocusPath)}"]`)?.focus()
		setPendingFocusPath(null)
	}, [pendingFocusPath, fileTree])

	// A panel closed mid-drag must not hide the hint of a component that is gone.
	useEffect(() => () => {
		if (dragLeaveTimerRef.current !== null) window.clearTimeout(dragLeaveTimerRef.current)
	}, [])

	/** Restart the hint's countdown. Only a moment without a drag event over the
	 *  panel may clear it: a nested tree keeps firing dragenter/dragleave pairs
	 *  as the pointer crosses between rows, and each pair would otherwise flicker
	 *  the hint off. */
	function postponeDropHintHide() {
		if (dragLeaveTimerRef.current !== null) window.clearTimeout(dragLeaveTimerRef.current)
		dragLeaveTimerRef.current = window.setTimeout(() => {
			dragLeaveTimerRef.current = null
			setIsDraggingExternal(false)
		}, DROP_HINT_LINGER_MS)
	}

	/** Focus a row, once the tree has rendered it. */
	function requestRowFocus(path: string) {
		setFocusedPath(path)
		setPendingFocusPath(path)
	}

	function selectRow(node: FileNode) {
		setSelectedItem({ path: node.path, isFolder: node.isFolder })
		if (!node.isFolder) onFileSelect(node.path)
	}

	/** Keyboard parity with the mouse: rows are treeitems, so Enter/Space opens a
	 *  file (a folder toggles), F2 renames, Delete removes, Escape drops an
	 *  in-place edit and the arrow keys walk the visible rows. */
	function handleRowKeyDown(node: FileNode, e: TargetedKeyboardEvent<HTMLDivElement>) {
		switch (e.key) {
			case 'Enter':
			case ' ':
				e.preventDefault()
				selectRow(node)
				if (node.isFolder) toggleFolder(node.path)
				break
			case 'F2':
				e.preventDefault()
				if (!isProtectedPath(node.path)) handleStartRename(node.path)
				break
			case 'Delete':
				e.preventDefault()
				if (!isProtectedPath(node.path)) onFileDelete(node.path)
				break
			case 'Escape':
				// An in-place edit only ever covers one row, so cancelling it is what
				// Escape means inside the tree.
				if (creatingItem) handleCancelCreate()
				else if (renamingItem) cancelRowRename(renamingItem)
				break
			case 'ArrowUp':
			case 'ArrowDown': {
				e.preventDefault()
				const index = visibleRows.findIndex(row => row.path === node.path)
				const next = visibleRows[index + (e.key === 'ArrowDown' ? 1 : -1)]
				if (next) requestRowFocus(next.path)
				break
			}
			case 'ArrowRight':
				if (node.isFolder && !expandedFolders.has(node.path)) {
					e.preventDefault()
					toggleFolder(node.path)
				}
				break
			case 'ArrowLeft':
				if (node.isFolder && expandedFolders.has(node.path)) {
					e.preventDefault()
					toggleFolder(node.path)
				}
				break
		}
	}

	function confirmRowRename(node: FileNode) {
		const renamedTo = handleRename()
		if (renamedTo === null) return
		setSelectedItem({ path: renamedTo, isFolder: node.isFolder })
		requestRowFocus(renamedTo)
	}

	/** Cancelling puts the row back, so it takes the focus the input is leaving. */
	function cancelRowRename(path: string) {
		handleCancelRename()
		requestRowFocus(path)
	}

	// Helper function to determine parent path for new items
	function getParentPathForNewItem(): string {
		if (!selectedItem) {
			// No selection -> create in root
			return ''
		}
		if (selectedItem.isFolder) {
			// Folder selected -> create inside folder
			return selectedItem.path
		}
		// File selected -> create in same directory as file
		return parentPathOf(selectedItem.path)
	}

	// Helper function to check if file extension is allowed
	function isAllowedFile(fileName: string): boolean {
		return ALLOWED_EXTENSIONS.some(ext => fileName.toLowerCase().endsWith(ext))
	}

	/**
	 * Reads every dropped file first, then creates the whole batch in one project
	 * update. Creating while each read resolved gave every add the same project
	 * snapshot as its base, so each one overwrote the previous add and only the
	 * last dropped file ever appeared.
	 */
	async function handleExternalFileDrop(files: File[], targetPath: string) {
		const failures: string[] = []
		const entries: FileCreateEntry[] = []

		for (const file of files) {
			if (!isAllowedFile(file.name)) {
				console.warn(`File ${file.name} has unsupported extension. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`)
				failures.push(t('files.unsupportedType', { name: file.name }))
				continue
			}

			const invalid = validateName(file.name)
			if (invalid) {
				console.warn(`Refusing to import "${file.name}": ${invalid}`)
				failures.push(`${file.name}: ${t('files.invalidName')}`)
				continue
			}

			const filePath = joinPath(targetPath, file.name)

			// Check if file already exists
			const fileExists = project.files.some(f => f.path === filePath)
			if (fileExists) {
				const overwrite = confirm(t('dialog.overwriteFile', { name: file.name }))
				if (!overwrite) continue
			}

			try {
				entries.push({ path: filePath, content: await readDroppedFile(file) })
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error)
				console.error(`Failed to read ${file.name}:`, error)
				failures.push(t('files.uploadFailed', { name: file.name, error: reason }))
			}
		}

		if (failures.length > 0) alert(failures.join('\n'))
		if (entries.length === 0) return

		if (onFilesCreate) {
			onFilesCreate(entries)
			return
		}
		// Without the batch callback each file is created on its own; those writes
		// still compose, because the project hook writes from its latest project.
		for (const entry of entries) onFileCreate(entry.path, entry.content)
	}

	// Handle external drag events
	function handleExternalDragEnter(e: TargetedDragEvent<HTMLElement>) {
		if (e.dataTransfer?.types.includes('Files')) {
			e.preventDefault()
			e.stopPropagation()
			if (dragLeaveTimerRef.current !== null) {
				window.clearTimeout(dragLeaveTimerRef.current)
				dragLeaveTimerRef.current = null
			}
			setIsDraggingExternal(true)
		}
	}

	function handleExternalDragLeave(e: TargetedDragEvent<HTMLElement>) {
		if (e.dataTransfer?.types.includes('Files')) {
			e.preventDefault()
			e.stopPropagation()
			postponeDropHintHide()
		}
	}

	function handleExternalDragOver(e: TargetedDragEvent<HTMLElement>) {
		if (e.dataTransfer?.types.includes('Files')) {
			e.preventDefault()
			e.stopPropagation()
			e.dataTransfer.dropEffect = 'copy'
			// dragover keeps firing while the pointer is inside: it is the signal
			// that the drag is still here, so it re-arms the hint.
			if (isDraggingExternal) postponeDropHintHide()
		}
	}

	async function handleExternalDrop(e: TargetedDragEvent<HTMLElement>, targetPath: string = '') {
		if (e.dataTransfer?.types.includes('Files')) {
			e.preventDefault()
			e.stopPropagation()
			if (dragLeaveTimerRef.current !== null) {
				window.clearTimeout(dragLeaveTimerRef.current)
				dragLeaveTimerRef.current = null
			}
			setIsDraggingExternal(false)

			const files = Array.from(e.dataTransfer.files)
			if (files.length > 0) {
				await handleExternalFileDrop(files, targetPath)
			}
		}
	}

	function renderFileTree(nodes: FileNode[], depth = 0): ComponentChildren {
		return nodes.map(node => {
			const isFocused = node.path === rovingPath

			if (node.isFolder) {
				const isExpanded = expandedFolders.has(node.path)
				const isRenaming = renamingItem === node.path
				const isDropTarget = dropTarget === node.path
				const isSelected = selectedItem?.path === node.path

				return (
					<FolderTreeItem
						key={node.path}
						node={node}
						depth={depth}
						isExpanded={isExpanded}
						isRenaming={isRenaming}
						isDropTarget={isDropTarget}
						isSelected={isSelected}
						isFocused={isFocused}
						renameValue={renameValue}
						onToggle={() => toggleFolder(node.path)}
						onSelect={() => setSelectedItem({ path: node.path, isFolder: true })}
						onFocus={() => setFocusedPath(node.path)}
						onKeyDown={(e) => handleRowKeyDown(node, e)}
						onStartRename={() => handleStartRename(node.path)}
						onRename={() => confirmRowRename(node)}
						onCancelRename={() => cancelRowRename(node.path)}
						onRenameChange={setRenameValue}
						onDelete={() => onFileDelete(node.path)}
						onDragOver={(e) => handleDragOver(node.path, true, e)}
						onDrop={(e) => handleDrop(node.path, true, e)}
						onExternalDrop={handleExternalDrop}
					>
						{isExpanded && node.children && renderFileTree(node.children, depth + 1)}
						{isExpanded && creatingItem?.parentPath === node.path && (
							<CreateItemInput
								type={creatingItem.type}
								value={newItemName}
								onChange={setNewItemName}
								onConfirm={handleCreateItem}
								onCancel={handleCancelCreate}
								depth={depth + 1}
							/>
						)}
					</FolderTreeItem>
				)
			}

			const isActive = node.path === activeFile
			const isMainFile = node.path === project.mainFile
			const isRenaming = renamingItem === node.path
			const isDragging = draggedItem === node.path
			const isDropTarget = dropTarget === node.path
			const isSelected = selectedItem?.path === node.path
			const isProtected = isProtectedPath(node.path)

			return (
				<FileTreeItem
					key={node.path}
					path={node.path}
					depth={depth}
					isActive={isActive}
					isMainFile={isMainFile}
					isRenaming={isRenaming}
					isDragging={isDragging}
					isDropTarget={isDropTarget}
					isSelected={isSelected}
					isFocused={isFocused}
					canDrag={!isProtected}
					canRename={!isProtected}
					canDelete={!isProtected}
					renameValue={renameValue}
					onSelect={() => {
						selectRow(node)
					}}
					onFocus={() => setFocusedPath(node.path)}
					onKeyDown={(e) => handleRowKeyDown(node, e)}
					onStartRename={() => handleStartRename(node.path)}
					onRename={() => confirmRowRename(node)}
					onCancelRename={() => cancelRowRename(node.path)}
					onRenameChange={setRenameValue}
					onDelete={() => onFileDelete(node.path)}
					onDragStart={(e) => handleDragStart(node.path, e)}
					onDragEnd={handleDragEnd}
					onDragOver={(e) => handleDragOver(node.path, false, e)}
					onDrop={(e) => handleDrop(node.path, false, e)}
					onExternalDrop={(e) => handleExternalDrop(e, parentPathOf(node.path))}
				/>
			)
		})
	}

	if (isCollapsed) {
		return (
			<div className="h-full flex flex-col items-center justify-start bg-gray-900 border-r border-gray-700">
				<button
					onClick={onToggleCollapse}
					className="p-3 hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
					title={t('files.show')}
					aria-label={t('files.show')}
				>
					<PanelLeft className="w-5 h-5" />
				</button>
			</div>
		)
	}

	return (
		<div className="relative h-full flex flex-col w-full bg-gray-900 border-r border-gray-700">
			<FileExplorerHeader project={project} onRenameProject={onRenameProject} onToggleCollapse={onToggleCollapse || (() => {})} />

			{/* Files List */}
			<div 
				ref={listRef}
				className={`flex-1 overflow-y-auto relative transition-colors ${
					isDraggingExternal ? 'bg-blue-900/20 border-2 border-dashed border-blue-500' : ''
				}`}
				onDragEnter={handleExternalDragEnter}
				onDragLeave={handleExternalDragLeave}
				onDragOver={(e) => {
					if (e.dataTransfer?.types.includes('Files')) {
						handleExternalDragOver(e)
					} else if (draggedItem && !e.defaultPrevented) {
						handleDragOver('', false, e)
					}
				}}
				onDrop={(e) => {
					if (e.dataTransfer?.types.includes('Files')) {
						handleExternalDrop(e, '')
					} else if (draggedItem && !e.defaultPrevented) {
						handleDrop('', false, e)
					}
				}}
			>
				{isDraggingExternal && (
					<div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-gray-900/80 pointer-events-none z-10">
						<div className="text-center">
							<Upload className="w-12 h-12 text-blue-400 mx-auto mb-2" />
							<p className="text-blue-300 font-medium">{t('files.dropToUpload')}</p>
							<p className="text-gray-400 text-sm mt-1">
								{t('files.supported', { extensions: ALLOWED_EXTENSIONS.join(', ') })}
							</p>
						</div>
					</div>
				)}
				<div role="tree" aria-label={project.name}>
					{renderFileTree(fileTree)}
				</div>
				{creatingItem?.parentPath === '' && (
					<CreateItemInput
						type={creatingItem.type}
						value={newItemName}
						onChange={setNewItemName}
						onConfirm={handleCreateItem}
						onCancel={handleCancelCreate}
						depth={0}
					/>
				)}
			</div>

			<FileExplorerActions
				onCreateFile={() => {
					const parentPath = getParentPathForNewItem()
					if (parentPath) expandFolder(parentPath)
					setCreatingItem({ type: 'file', parentPath })
				}}
				onCreateFolder={() => {
					const parentPath = getParentPathForNewItem()
					if (parentPath) expandFolder(parentPath)
					setCreatingItem({ type: 'folder', parentPath })
				}}
				onImportProject={onImportProject}
				onExportProject={onExportProject}
			/>
		</div>
	)
}