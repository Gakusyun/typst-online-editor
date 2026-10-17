import { FilePlus, FolderPlus } from 'lucide-preact'
import { useI18n } from '@/lib/i18n/useI18n'

interface FileExplorerActionsProps {
	onCreateFile: () => void
	onCreateFolder: () => void
}

export default function FileExplorerActions({
	onCreateFile,
	onCreateFolder,
}: FileExplorerActionsProps) {
	const { t } = useI18n()

	return (
		<div className="p-4 border-t border-gray-700 space-y-2">
			<button
				onClick={onCreateFile}
				className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
				title={t('files.newFile')}
			>
				<FilePlus className="w-4 h-4" />
				{t('files.newFile')}
			</button>
			<button
				onClick={onCreateFolder}
				className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 transition-colors"
				title={t('files.newFolder')}
			>
				<FolderPlus className="w-4 h-4" />
				{t('files.newFolder')}
			</button>
		</div>
	)
}
