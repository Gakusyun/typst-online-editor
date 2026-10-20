import { useState } from 'preact/hooks'
import { useI18n } from '@/lib/i18n/useI18n'
import type { CreateItemState } from '../types'
import { fileNameOf, joinPath, parentPathOf, validateName } from '../utils/paths'

export function useFileOperations(
	onFileCreate: (path: string) => void,
	onFolderCreate: (path: string) => void,
	onFileRename: (oldPath: string, newPath: string) => void,
	onExpandFolder: (path: string) => void
) {
	const { t } = useI18n()
	const [creatingItem, setCreatingItem] = useState<CreateItemState | null>(null)
	const [newItemName, setNewItemName] = useState('')
	const [renamingItem, setRenamingItem] = useState<string | null>(null)
	const [renameValue, setRenameValue] = useState('')
	const [selectedItem, setSelectedItem] = useState<{ path: string; isFolder: boolean } | null>(null)

	const handleCreateItem = () => {
		// An empty name is left alone rather than reported: the row stays open and
		// the user can see the field is empty.
		if (!newItemName.trim() || !creatingItem) return

		const name = newItemName.trim()
		const invalid = validateName(name)
		if (invalid) {
			// The row stays open so the name can be fixed in place; the reason only
			// reaches the console — the alert is the localized message.
			console.warn(`Refusing to create "${name}": ${invalid}`)
			alert(t('files.invalidName'))
			return
		}

		const fullPath = joinPath(creatingItem.parentPath, name)

		// Auto-expand parent folder
		if (creatingItem.parentPath) {
			onExpandFolder(creatingItem.parentPath)
		}

		if (creatingItem.type === 'file') {
			onFileCreate(fullPath)
		} else {
			onFolderCreate(fullPath)
		}

		setCreatingItem(null)
		setNewItemName('')
	}

	const handleCancelCreate = () => {
		setCreatingItem(null)
		setNewItemName('')
	}

	const handleStartRename = (path: string) => {
		setRenamingItem(path)
		setRenameValue(fileNameOf(path))
	}

	/**
	 * Applies the in-place rename and reports where the row ended up, so the tree
	 * can put focus back on it — `null` when nothing changed (rejected name, or
	 * the name was left as it was).
	 */
	const handleRename = (): string | null => {
		if (!renamingItem || !renameValue.trim()) return null

		const name = renameValue.trim()
		const invalid = validateName(name)
		if (invalid) {
			console.warn(`Refusing to rename "${renamingItem}" to "${name}": ${invalid}`)
			alert(t('files.invalidName'))
			return null
		}

		// A rename always stays inside the same folder here: it renames the entry,
		// it does not move it.
		const newPath = joinPath(parentPathOf(renamingItem), name)
		setRenamingItem(null)
		setRenameValue('')

		if (newPath === renamingItem) return renamingItem

		onFileRename(renamingItem, newPath)
		return newPath
	}

	const handleCancelRename = () => {
		setRenamingItem(null)
		setRenameValue('')
	}

	return {
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
	}
}