import { PanelLeftClose } from 'lucide-preact'
import type { Project } from '@/lib/storage/ProjectStorage'
import { useI18n } from '@/lib/i18n/useI18n'

interface FileExplorerHeaderProps {
	project: Project
	onToggleCollapse: () => void
}

export default function FileExplorerHeader({ project, onToggleCollapse }: FileExplorerHeaderProps) {
	const { t } = useI18n()
	const visibleFileCount = project.files.filter(f => !f.path.endsWith('.gitkeep')).length
	
	return (
		<div className="p-4 border-b border-gray-700 flex items-start justify-between">
			<div>
				<h2 className="text-sm font-semibold text-gray-200">{project.name}</h2>
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
