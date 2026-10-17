import { useRef } from 'preact/hooks'
import { FilePlus, FolderPlus, Upload, Download } from 'lucide-preact'
import { useI18n } from '@/lib/i18n/useI18n'

interface FileExplorerActionsProps {
	onCreateFile: () => void
	onCreateFolder: () => void
	onImportProject: (file: File) => void
	onExportProject: () => void
}

export default function FileExplorerActions({
	onCreateFile,
	onCreateFolder,
	onImportProject,
	onExportProject,
}: FileExplorerActionsProps) {
	const { t } = useI18n()
	const zipInputRef = useRef<HTMLInputElement>(null)

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
			<button
				onClick={() => zipInputRef.current?.click()}
				className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 transition-colors"
				title={t('files.importProject')}
			>
				<Upload className="w-4 h-4" />
				{t('files.importProject')}
			</button>
			<button
				onClick={onExportProject}
				className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 transition-colors"
				title={t('files.exportProject')}
			>
				<Download className="w-4 h-4" />
				{t('files.exportProject')}
			</button>
			<input
				ref={zipInputRef}
				type="file"
				accept=".zip,application/zip"
				className="hidden"
				onChange={(e) => {
					const file = e.currentTarget.files?.[0]
					// Reset so selecting the same file again re-fires the change event
					e.currentTarget.value = ''
					if (file) onImportProject(file)
				}}
			/>
		</div>
	)
}
