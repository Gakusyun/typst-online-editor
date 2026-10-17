import type { TargetedDragEvent } from 'preact'
import { useState } from 'preact/hooks'

export function useDragAndDrop(onFileMove: (oldPath: string, newPath: string) => void) {
	const [draggedItem, setDraggedItem] = useState<string | null>(null)
	const [dropTarget, setDropTarget] = useState<string | null>(null)

	const handleDragStart = (path: string, e: TargetedDragEvent<HTMLElement>) => {
		// Don't allow dragging main.typ
		if (path === 'main.typ') {
			e.preventDefault()
			return
		}
		setDraggedItem(path)
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
	}

	const handleDragEnd = () => {
		setDraggedItem(null)
		setDropTarget(null)
	}

	const handleDragOver = (path: string, isFolder: boolean, e: TargetedDragEvent<HTMLElement>) => {
		e.preventDefault()
		e.stopPropagation()

		if (!draggedItem || draggedItem === path) return

		// Only allow dropping on folders
		if (isFolder) {
			setDropTarget(path)
		} else {
			// Allow dropping on root
			setDropTarget('')
		}
	}

	const handleDrop = (targetPath: string, isFolder: boolean, e: TargetedDragEvent<HTMLElement>) => {
		e.preventDefault()
		e.stopPropagation()

		if (!draggedItem) return

		const fileName = draggedItem.split('/').pop()
		let newPath: string

		if (isFolder) {
			// Drop into folder
			newPath = `${targetPath}/${fileName}`
		} else {
			// Drop at root
			newPath = fileName || draggedItem
		}

		if (newPath !== draggedItem) {
			onFileMove(draggedItem, newPath)
		}

		setDraggedItem(null)
		setDropTarget(null)
	}

	return {
		draggedItem,
		dropTarget,
		handleDragStart,
		handleDragEnd,
		handleDragOver,
		handleDrop,
	}
}
