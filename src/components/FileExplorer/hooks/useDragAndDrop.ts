import type { TargetedDragEvent } from 'preact'
import { useState } from 'preact/hooks'
import { fileNameOf, isDescendantPath, isProtectedPath, joinPath, parentPathOf } from '../utils/paths'

export function useDragAndDrop(onFileMove: (oldPath: string, newPath: string) => void) {
	const [draggedItem, setDraggedItem] = useState<string | null>(null)
	// The hovered row, not the destination folder: a file row has to light up as
	// the drop target too, and it resolves to its own folder only on drop.
	const [dropTarget, setDropTarget] = useState<string | null>(null)

	const handleDragStart = (path: string, e: TargetedDragEvent<HTMLElement>) => {
		// main.typ and the .gitkeep placeholders are not movable.
		if (isProtectedPath(path)) {
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

	const handleDragOver = (rowPath: string, isFolder: boolean, e: TargetedDragEvent<HTMLElement>) => {
		e.preventDefault()
		e.stopPropagation()

		if (!draggedItem || draggedItem === rowPath) return
		// A file row stands for its own folder — the destination the drop resolves to.
		if (isDescendantPath(isFolder ? rowPath : parentPathOf(rowPath), draggedItem)) return

		setDropTarget(rowPath)
	}

	const handleDrop = (rowPath: string, isFolder: boolean, e: TargetedDragEvent<HTMLElement>) => {
		e.preventDefault()
		e.stopPropagation()

		if (draggedItem) {
			const newPath = joinPath(isFolder ? rowPath : parentPathOf(rowPath), fileNameOf(draggedItem))
			if (newPath !== draggedItem && !isDescendantPath(newPath, draggedItem)) {
				onFileMove(draggedItem, newPath)
			}
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