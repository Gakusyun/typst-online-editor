import type { TargetedDragEvent, TargetedKeyboardEvent } from 'preact'
import { File, Star, Trash2, Edit2 } from 'lucide-preact'
import RenameInput from './RenameInput'
import { useI18n } from '@/lib/i18n/useI18n'
import { fileNameOf } from '../utils/paths'

interface FileTreeItemProps {
	path: string
	depth: number
	isActive: boolean
	isMainFile: boolean
	isRenaming: boolean
	isDragging: boolean
	isDropTarget: boolean
	isSelected: boolean
	isFocused: boolean
	canDrag: boolean
	canRename: boolean
	canDelete: boolean
	renameValue: string
	onSelect: () => void
	onFocus: () => void
	onKeyDown: (e: TargetedKeyboardEvent<HTMLDivElement>) => void
	onStartRename: () => void
	onRename: () => void
	onCancelRename: () => void
	onRenameChange: (value: string) => void
	onDelete: () => void
	onDragStart: (e: TargetedDragEvent<HTMLElement>) => void
	onDragEnd: () => void
	onDragOver: (e: TargetedDragEvent<HTMLElement>) => void
	onDrop: (e: TargetedDragEvent<HTMLElement>) => void
	/** Dropped foreign files land beside this file, i.e. in its folder. */
	onExternalDrop?: (e: TargetedDragEvent<HTMLElement>) => void
}

export default function FileTreeItem({
	path,
	depth,
	isActive,
	isMainFile,
	isRenaming,
	isDragging,
	isDropTarget,
	isSelected,
	isFocused,
	canDrag,
	canRename,
	canDelete,
	renameValue,
	onSelect,
	onFocus,
	onKeyDown,
	onStartRename,
	onRename,
	onCancelRename,
	onRenameChange,
	onDelete,
	onDragStart,
	onDragEnd,
	onDragOver,
	onDrop,
	onExternalDrop,
}: FileTreeItemProps) {
	const { t } = useI18n()
	const fileName = fileNameOf(path)

	if (isRenaming) {
		return (
			<div className="px-4 py-2 bg-gray-800" style={{ paddingLeft: `${depth * 12 + 16}px` }}>
				<div className="flex items-center gap-2">
					<File className="w-4 h-4 text-blue-400 shrink-0" />
					<RenameInput value={renameValue} onChange={onRenameChange} onRename={onRename} onCancel={onCancelRename} />
				</div>
			</div>
		)
	}

	return (
			<div
				role="treeitem"
				aria-selected={isSelected}
				tabIndex={isFocused ? 0 : -1}
				data-tree-path={path}
				draggable={canDrag}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onDragOver={(e) => {
					if (e.dataTransfer?.types.includes('Files')) {
						e.preventDefault()
						e.dataTransfer.dropEffect = 'copy'
					} else {
						onDragOver(e)
					}
				}}
				onDrop={(e) => {
					if (e.dataTransfer?.types.includes('Files') && onExternalDrop) {
						onExternalDrop(e)
					} else {
						onDrop(e)
					}
				}}
				className={`
					group flex items-center justify-between px-4 py-2 cursor-pointer
					hover:bg-gray-700 transition-colors
					${isActive ? 'bg-gray-700 border-l-2 border-blue-500' : ''}
					${isDropTarget ? 'bg-gray-700 border-l-2 border-blue-500' : ''}
					${isDragging ? 'opacity-50' : ''}
				`}
				style={{ paddingLeft: `${depth * 12 + 16}px` }}
				onClick={onSelect}
				onFocus={onFocus}
				onKeyDown={onKeyDown}
			>
				<div className="flex items-center gap-2 flex-1 min-w-0">
					<File className="w-4 h-4 text-gray-400 shrink-0" />
					<span
						className={`
							text-sm truncate
							${isActive ? 'text-blue-300 font-medium' : 'text-gray-300'}
						`}
						title={fileName}
					>
						{fileName}
					</span>
					{isMainFile && (
						<Star className="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" />
					)}
				</div>

				{/* Actions: hidden until the row is hovered, and it takes keyboard
				    focus too — `invisible` keeps them out of the tab order, which
				    `opacity-0` did not. */}
				<div className="flex items-center gap-1 invisible group-hover:visible group-focus-within:visible transition-opacity">
					{canRename && (
						<button
							onClick={(e) => {
								e.stopPropagation()
								onStartRename()
							}}
							className="p-1 hover:bg-gray-600 rounded"
							title={t('files.renameFile')}
							aria-label={t('files.renameFile')}
						>
							<Edit2 className="w-3 h-3 text-gray-300" />
						</button>
					)}
					{canDelete && (
						<button
							onClick={(e) => {
								e.stopPropagation()
								onDelete()
							}}
							className="p-1 hover:bg-red-900/50 rounded"
							title={t('files.deleteFile')}
							aria-label={t('files.deleteFile')}
						>
							<Trash2 className="w-3 h-3 text-red-400" />
						</button>
					)}
				</div>
			</div>
	)
}