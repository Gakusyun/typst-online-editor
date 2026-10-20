import { useRef } from 'preact/hooks'
import { type Project, type ProjectFile } from '@/lib/storage/ProjectStorage'
import { useI18n } from '@/lib/i18n/useI18n'
import type { FileCreateEntry } from '@/components/FileExplorer/types'
import {
	fileNameOf,
	isDescendantPath,
	isFolderPath,
	isProtectedPath,
	validateName,
} from '@/components/FileExplorer/utils/paths'

interface UseFileOperationsProps {
	currentProject: Project
	activeFilePath: string
	setActiveFilePath: (path: string) => void
	saveProject: (project: Project) => void
}

export function useProjectFileOperations({
	currentProject,
	activeFilePath,
	setActiveFilePath,
	saveProject,
}: UseFileOperationsProps) {
	const { t } = useI18n()

	/**
	 * The freshest committed project. A drop reads its files before it writes, so
	 * several operations can be requested between two renders; composing on the
	 * render snapshot would make each one overwrite the previous result.
	 */
	const latestProjectRef = useRef(currentProject)
	// Step the ref to a project the parent adopted on its own (an import, a load)
	// during render rather than in an effect: effects run after paint, and a write
	// landing in that window would compose on the older project.
	if (latestProjectRef.current !== currentProject) latestProjectRef.current = currentProject

	/** The single write path: record the result before the next operation reads it. */
	const commit = (project: Project) => {
		latestProjectRef.current = project
		saveProject(project)
	}

	const rejectInvalidName = (path: string, reason: string) => {
		console.warn(`Refusing "${path}": ${reason}`)
		alert(t('files.invalidName'))
	}

	const getActiveFile = (): ProjectFile | null => {
		return currentProject.files.find(f => f.path === activeFilePath) || null
	}

	const updateActiveFileContent = (content: string) => {
		const project = latestProjectRef.current
		const updatedFiles = project.files.map(file =>
			file.path === activeFilePath
				? { ...file, content, lastModified: 0 }
				: file
		)

		commit({ ...project, files: updatedFiles })
	}

	const handleFileSelect = (path: string) => {
		setActiveFilePath(path)
	}

	const handleFileCreate = (path: string, initialContent?: string) => {
		const project = latestProjectRef.current

		const invalid = validateName(fileNameOf(path))
		if (invalid) {
			rejectInvalidName(path, invalid)
			return
		}

		if (project.files.some(f => f.path === path)) {
			alert(t('dialog.fileExists'))
			return
		}

		// A folder exists as the prefix of the files under it: a file of the same
		// path would sit next to every entry inside it.
		if (isFolderPath(project, path)) {
			alert(t('dialog.folderExists'))
			return
		}

		const newFile: ProjectFile = {
			path,
			content: initialContent ?? `// ${path}\n\n`,
			lastModified: 0,
		}

		commit({ ...project, files: [...project.files, newFile] })
		setActiveFilePath(path)
	}

	/**
	 * Creates a whole batch — one external drop — in a single project update. The
	 * contents are already read when this runs; the overwrite question was asked
	 * by the caller, so an entry that exists is replaced in place.
	 */
	const handleFilesCreate = (entries: FileCreateEntry[]) => {
		const project = latestProjectRef.current
		let files = project.files
		let lastCreated: string | null = null

		for (const entry of entries) {
			const invalid = validateName(fileNameOf(entry.path))
			if (invalid) {
				rejectInvalidName(entry.path, invalid)
				continue
			}

			if (isFolderPath(project, entry.path)) {
				alert(t('dialog.folderExists'))
				continue
			}

			const created: ProjectFile = { path: entry.path, content: entry.content, lastModified: 0 }
			const existing = files.findIndex(file => file.path === entry.path)
			files = existing >= 0
				? files.map((file, index) => (index === existing ? created : file))
				: [...files, created]
			lastCreated = entry.path
		}

		if (lastCreated === null) return

		commit({ ...project, files })
		setActiveFilePath(lastCreated)
	}

	const handleFolderCreate = (path: string) => {
		const project = latestProjectRef.current

		const invalid = validateName(fileNameOf(path))
		if (invalid) {
			rejectInvalidName(path, invalid)
			return
		}

		if (isFolderPath(project, path) || project.files.some(f => f.path === path)) {
			alert(t('dialog.folderExists'))
			return
		}

		const newFile: ProjectFile = {
			path: `${path}/.gitkeep`,
			content: '// Placeholder file to maintain folder structure\n',
			lastModified: 0,
		}

		commit({ ...project, files: [...project.files, newFile] })
	}

	/**
	 * Moves a file, or a whole folder subtree, to `newPath`. A rename is a move to
	 * a new name inside the same folder, so both run the same checks: the name has
	 * to be usable, the destination must be free of entries that are not part of
	 * the move, and the move must not land inside the subtree it moves.
	 */
	const moveEntry = (oldPath: string, newPath: string, conflictMessage: 'dialog.fileExists' | 'dialog.fileExistsAtDestination') => {
		if (!oldPath || oldPath === newPath) return

		const project = latestProjectRef.current

		if (isProtectedPath(oldPath)) {
			console.warn(`Refusing to move the protected path "${oldPath}"`)
			return
		}

		if (isDescendantPath(newPath, oldPath)) {
			console.warn(`Refusing to move "${oldPath}" inside itself (${newPath})`)
			return
		}

		const invalid = validateName(fileNameOf(newPath))
		if (invalid) {
			rejectInvalidName(newPath, invalid)
			return
		}

		const moving = new Set(project.files.filter(file => isDescendantPath(file.path, oldPath)).map(file => file.path))
		if (project.files.some(file => !moving.has(file.path) && isDescendantPath(file.path, newPath))) {
			alert(t(conflictMessage))
			return
		}

		const updatedFiles = project.files.map(file =>
			moving.has(file.path) ? { ...file, path: newPath + file.path.slice(oldPath.length) } : file
		)

		const updatedMainFile = isDescendantPath(project.mainFile, oldPath)
			? newPath + project.mainFile.slice(oldPath.length)
			: project.mainFile

		commit({ ...project, files: updatedFiles, mainFile: updatedMainFile })

		if (isDescendantPath(activeFilePath, oldPath)) {
			setActiveFilePath(newPath + activeFilePath.slice(oldPath.length))
		}
	}

	const handleFileRename = (oldPath: string, newPath: string) => {
		moveEntry(oldPath, newPath, 'dialog.fileExists')
	}

	const handleFileMove = (oldPath: string, newPath: string) => {
		moveEntry(oldPath, newPath, 'dialog.fileExistsAtDestination')
	}

	const handleFileDelete = (path: string) => {
		const project = latestProjectRef.current
		const isFolder = isFolderPath(project, path)

		let updatedFiles: ProjectFile[]

		if (isFolder) {
			updatedFiles = project.files.filter(file => !isDescendantPath(file.path, path))
		} else {
			if (project.files.length <= 1) {
				return
			}
			updatedFiles = project.files.filter(file => file.path !== path)
		}

		if (updatedFiles.length === 0) {
			return
		}

		const updatedMainFile = isDescendantPath(project.mainFile, path) ? updatedFiles[0].path : project.mainFile

		commit({ ...project, files: updatedFiles, mainFile: updatedMainFile })

		if (isDescendantPath(activeFilePath, path)) {
			setActiveFilePath(updatedMainFile)
		}
	}

	return {
		getActiveFile,
		updateActiveFileContent,
		handleFileSelect,
		handleFileCreate,
		handleFilesCreate,
		handleFolderCreate,
		handleFileRename,
		handleFileMove,
		handleFileDelete,
	}
}