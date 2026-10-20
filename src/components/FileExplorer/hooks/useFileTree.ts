import { useState } from 'preact/hooks'

export function useFileTree() {
	// Folders start collapsed; nothing is expanded until the user opens a folder.
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

	const toggleFolder = (path: string) => {
		setExpandedFolders(prev => {
			const next = new Set(prev)
			if (next.has(path)) {
				next.delete(path)
			} else {
				next.add(path)
			}
			return next
		})
	}

	const expandFolder = (path: string) => {
		setExpandedFolders(prev => {
			const next = new Set(prev)
			next.add(path)
			return next
		})
	}

	return {
		expandedFolders,
		toggleFolder,
		expandFolder,
	}
}