import { useState } from 'preact/hooks'
import { PanelLeftClose, Edit2 } from 'lucide-preact'
import type { Project } from '@/lib/storage/ProjectStorage'
import { useI18n } from '@/lib/i18n/useI18n'
import RenameInput from './RenameInput'

interface FileExplorerHeaderProps {
	project: Project
	onRenameProject: (name: string) => void
	onToggleCollapse: () => void
}

export default function FileExplorerHeader({ project, onRenameProject, onToggleCollapse }: FileExplorerHeaderProps) {
	const { t } = useI18n()
	const [isRenaming, setIsRenaming] = useState(false)
	const [renameValue, setRenameValue] = useState('')
	const visibleFileCount = project.files.filter(f => !f.path.endsWith('.gitkeep')).length

	const startRename = () => {
		setRenameValue(project.name)
		setIsRenaming(true)
	}

	const confirmRename = () => {
		const name = renameValue.trim()
		if (name && name !== project.name) {
			onRenameProject(name)
		}
		setIsRenaming(false)
	}

	return (
		<div className="p-4 border-b border-gray-700 flex items-start justify-between gap-2">
			<div className="flex-1 min-w-0">
				{isRenaming ? (
					<div className="flex items-center gap-1">
						<RenameInput
							value={renameValue}
							onChange={setRenameValue}
							onRename={confirmRename}
							onCancel={() => setIsRenaming(false)}
						/>
					</div>
				) : (
					<div className="flex items-center gap-1 group/name">
						<h2 className="text-sm font-semibold text-gray-200 truncate">{project.name}</h2>
						<button
							onClick={startRename}
							className="p-1 rounded opacity-0 group-hover/name:opacity-100 hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-opacity"
							title={t('files.renameProject')}
						>
							<Edit2 className="w-3 h-3" />
						</button>
					</div>
				)}
				<p className="text-xs text-gray-400 mt-1">{t('files.count', { count: visibleFileCount })}</p>
			</div>
			<button
				onClick={onToggleCollapse}
				className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-gray-200 transition-colors"
				title={t('files.hide')}
			>
				<PanelLeftClose className="w-4 h-4" />
			</button>
		</div>
	)
}
