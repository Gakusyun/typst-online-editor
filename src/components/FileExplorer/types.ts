import type { Project } from '@/lib/storage/ProjectStorage'

export interface FileNode {
	path: string
	isFolder: boolean
	children?: FileNode[]
}

export interface FileExplorerProps {
	project: Project
	activeFile: string
	onFileSelect: (path: string) => void
	onFileCreate: (path: string, initialContent?: string) => void
	/**
	 * Creates a whole batch in one project update. External drops read every file
	 * first and then need one write: per-file creates all start from the same
	 * render snapshot, so only the last one would survive. Optional — without it
	 * the explorer falls back to `onFileCreate` per file.
	 */
	onFilesCreate?: (entries: FileCreateEntry[]) => void
	onFolderCreate: (path: string) => void
	onFileDelete: (path: string) => void
	onFileRename: (oldPath: string, newPath: string) => void
	onFileMove: (oldPath: string, newPath: string) => void
	onRenameProject: (name: string) => void
	onImportProject: (file: File) => void
	onExportProject: () => void
	isCollapsed?: boolean
	onToggleCollapse?: () => void
}

/** A file to create, with its content already read (text, or a binary data URL). */
export interface FileCreateEntry {
	path: string
	content: string
}

export interface CreateItemState {
	type: 'file' | 'folder'
	parentPath: string
}
