import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { projectStorage, type Project, type ProjectFile } from '@/lib/storage/ProjectStorage'
import { useI18n } from '@/lib/i18n/useI18n'

/**
 * How long a burst of edits may go unwritten. A throttle rather than a pure
 * debounce: the write happens at a fixed cadence while the user types, so the
 * worst-case loss on a crash is bounded (and the last words are flushed on
 * `pagehide` anyway).
 */
const PERSIST_THROTTLE_MS = 400

/** The document shown before the stored project has been read (client-side only). */
function temporaryProject(name: string): Project {
	return {
		id: 'temp',
		name,
		files: [{ path: 'main.typ', content: '= My Document\n\nStart writing your document here.', lastModified: 0 }],
		mainFile: 'main.typ',
		createdAt: 0,
		lastModified: 0,
	}
}

export function useProjectState(onProjectChange?: (files: Record<string, string>, mainFile: string) => void) {
	const { t } = useI18n()
	// Always start with a temporary document for SSR hydration compatibility.
	const [currentProject, setCurrentProject] = useState<Project>(() =>
		temporaryProject(t('files.defaultProjectName'))
	)
	const [activeFilePath, setActiveFilePath] = useState<string>('main.typ')
	/**
	 * Set when the browser refused a write (quota, blocked storage). The editor
	 * shows it: silently failing to persist is how a document gets lost.
	 */
	const [storageError, setStorageError] = useState<string | null>(null)

	// Load from storage after hydration (client-side only)
	useEffect(() => {
		// Use setTimeout to avoid cascading renders during hydration
		const timer = setTimeout(() => {
			// Newest first, and a record that fails validation is *skipped* rather
			// than replaced: the next candidate — or a fresh project — is used and
			// the unreadable record stays on disk instead of being overwritten.
			const candidates = projectStorage.list().sort((a, b) => b.lastModified - a.lastModified)
			for (const candidate of candidates) {
				const project = projectStorage.load(candidate.id)
				if (project) {
					setCurrentProject(project)
					setActiveFilePath(project.mainFile)
					return
				}
			}

			// Create new project if none of them can be read
			const newProject = projectStorage.createNew(t('files.defaultProjectName'))
			setCurrentProject(newProject)
			setActiveFilePath(newProject.mainFile)
		}, 0)

		return () => clearTimeout(timer)
		// Runs once: the name of a project created at startup is the one the
		// language had when the app mounted, which is the language the rest of
		// that first render used anyway.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// --- Persistence ---------------------------------------------------------
	const timerRef = useRef<number | null>(null)
	/** The newest project waiting to be written; what a flush persists. */
	const pendingRef = useRef<Project | null>(null)

	/** Write the newest project now, cancelling a scheduled write. */
	const flushPersistence = useCallback(() => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current)
			timerRef.current = null
		}
		const project = pendingRef.current
		pendingRef.current = null
		if (!project) return

		const { persisted } = projectStorage.save(project)
		setStorageError(persisted ? null : t('files.storageFailed'))
	}, [t])

	/** Queue `project` for the next write; the cadence is one write per window. */
	const schedulePersistence = useCallback(
		(project: Project) => {
			pendingRef.current = project
			if (timerRef.current !== null) return
			timerRef.current = window.setTimeout(() => {
				timerRef.current = null
				flushPersistence()
			}, PERSIST_THROTTLE_MS)
		},
		[flushPersistence]
	)

	useEffect(() => {
		// A reload, a tab close or a backgrounded tab must not cost the pending
		// writes: flush before the page goes away and on unmount.
		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') flushPersistence()
		}
		window.addEventListener('pagehide', flushPersistence)
		document.addEventListener('visibilitychange', onVisibilityChange)
		return () => {
			window.removeEventListener('pagehide', flushPersistence)
			document.removeEventListener('visibilitychange', onVisibilityChange)
			flushPersistence()
		}
	}, [flushPersistence])

	// Notify the parent only when the document content actually changed.
	// `onProjectChange` may change identity without a content change (e.g. parent
	// re-renders after a compile), and notifying then would loop recompiles.
	// The file array is rebuilt immutably on every change, so its *identity* is a
	// correct and O(1) answer — the previous version concatenated every file's
	// full content on every keystroke to ask the same question.
	const lastNotifiedRef = useRef<{ files: ProjectFile[]; mainFile: string } | null>(null)

	useEffect(() => {
		if (!onProjectChange) return

		const previous = lastNotifiedRef.current
		if (
			previous &&
			previous.files === currentProject.files &&
			previous.mainFile === currentProject.mainFile
		) {
			return
		}
		lastNotifiedRef.current = { files: currentProject.files, mainFile: currentProject.mainFile }

		const filesMap: Record<string, string> = {}
		for (const file of currentProject.files) {
			filesMap[file.path] = file.content
		}
		onProjectChange(filesMap, currentProject.mainFile)
	}, [currentProject, onProjectChange])

	const loadProject = (project: Project) => {
		setCurrentProject(project)
		setActiveFilePath(project.mainFile)
		// An import is a deliberate, one-off change: write it through instead of
		// letting a crash in the next few hundred milliseconds lose it.
		pendingRef.current = project
		flushPersistence()
	}

	const saveProject = (project: Project) => {
		setCurrentProject(project)
		schedulePersistence(project)
	}

	const renameProject = (name: string) => {
		saveProject({ ...currentProject, name })
	}

	return {
		currentProject,
		activeFilePath,
		setActiveFilePath,
		loadProject,
		saveProject,
		renameProject,
		storageError,
	}
}