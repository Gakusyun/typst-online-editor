import { useState, useEffect, useRef } from 'preact/hooks'
import { projectStorage, type Project } from '@/lib/storage/ProjectStorage'

const TEMP_PROJECT: Project = {
	id: 'temp',
	name: 'My Document',
	files: [{ path: 'main.typ', content: '= My Document\n\nStart writing your document here.', lastModified: 0 }],
	mainFile: 'main.typ',
	createdAt: 0,
	lastModified: 0,
}

export function useProjectState(onProjectChange?: (files: Record<string, string>, mainFile: string) => void) {
	// Always start with TEMP_PROJECT for SSR hydration compatibility
	const [currentProject, setCurrentProject] = useState<Project>(TEMP_PROJECT)
	const [activeFilePath, setActiveFilePath] = useState<string>(TEMP_PROJECT.mainFile)

	// Load from storage after hydration (client-side only)
	useEffect(() => {
		// Use setTimeout to avoid cascading renders during hydration
		const timer = setTimeout(() => {
			// Try to load most recent project from storage
			const projects = projectStorage.list()
			if (projects.length > 0) {
				const mostRecent = projects.sort((a, b) => b.lastModified - a.lastModified)[0]
				const project = projectStorage.load(mostRecent.id)
				if (project) {
					setCurrentProject(project)
					setActiveFilePath(project.mainFile)
					return
				}
			}
			
			// Create new project if none exist
			const newProject = projectStorage.createNew('My Document')
			setCurrentProject(newProject)
			setActiveFilePath(newProject.mainFile)
		}, 0)

		return () => clearTimeout(timer)
	}, [])

	// Notify parent only when the document content actually changed.
	// `onProjectChange` may change identity without a content change (e.g. parent
	// re-renders after a compile), and notifying then would loop recompiles.
	const lastChangeSignatureRef = useRef<string | null>(null)

	useEffect(() => {
		if (!onProjectChange) return

		const filesMap: Record<string, string> = {}
		let signature = ''
		for (const file of currentProject.files) {
			filesMap[file.path] = file.content
			signature += `${file.path}\u0000${file.content}\u0000`
		}
		signature += `main\u0000${currentProject.mainFile}`

		if (signature === lastChangeSignatureRef.current) return
		lastChangeSignatureRef.current = signature

		onProjectChange(filesMap, currentProject.mainFile)
	}, [currentProject, onProjectChange])

	const loadProject = (project: Project) => {
		setCurrentProject(project)
		setActiveFilePath(project.mainFile)
		projectStorage.save(project)
	}

	const saveProject = (project: Project) => {
		setCurrentProject(project)
		projectStorage.save(project)
	}

	return {
		currentProject,
		activeFilePath,
		setActiveFilePath,
		loadProject,
		saveProject,
	}
}
