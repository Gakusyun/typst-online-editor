import type { TargetedDragEvent } from 'preact'
import { File, Star, Trash2, Edit2 } from 'lucide-preact'
import RenameInput from './RenameInput'
import { useI18n } from '@/lib/i18n/useI18n'

interface FileTreeItemProps {
	fileName: string
	depth: number
	isActive: boolean
	isMainFile: boolean
	isRenaming: boolean
	isDragging: boolean
	canDrag: boolean
	canRename: boolean
	canDelete: boolean
	renameValue: string
	onSelect: () => void
	onStartRename: () => void
	onRename: () => void
	onCancelRename: () => void
	onRenameChange: (value: string) => void
	onDelete: () => void
	onDragStart: (e: TargetedDragEvent<HTMLElement>) => void
	onDragEnd: () => void
}

export default function FileTreeItem({
	fileName,
	depth,
	isActive,
	isMainFile,
	isRenaming,
	isDragging,
	canDrag,
	canRename,
	canDelete,
	renameValue,
	onSelect,
	onStartRename,
	onRename,
	onCancelRename,
	onRenameChange,
	onDelete,
	onDragStart,
	onDragEnd,
}: FileTreeItemProps) {
	const { t } = useI18n()
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
				draggable={canDrag}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				className={`
					group flex items-center justify-between px-4 py-2 cursor-pointer
					hover:bg-gray-700 transition-colors
					${isActive ? 'bg-gray-700 border-l-2 border-blue-500' : ''}
					${isDragging ? 'opacity-50' : ''}
				`}
				style={{ paddingLeft: `${depth * 12 + 16}px` }}
				onClick={onSelect}
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

				{/* Actions (visible on hover) */}
				<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
					{canRename && (
						<button
							onClick={(e) => {
								e.stopPropagation()
								onStartRename()
							}}
							className="p-1 hover:bg-gray-600 rounded"
							title={t('files.renameFile')}
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
						>
							<Trash2 className="w-3 h-3 text-red-400" />
						</button>
					)}
				</div>
			</div>
	)
}
