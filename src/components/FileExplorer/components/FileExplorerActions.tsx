import { useRef } from 'preact/hooks'
import { FilePlus, FolderPlus, Upload, Download } from 'lucide-preact'
import { useI18n } from '@/lib/i18n/useI18n'

interface FileExplorerActionsProps {
	onCreateFile: () => void
	onCreateFolder: () => void
	onImportProject: (file: File) => void
	onExportProject: () => void
}

/**
 * Icon-only action row; the visible label lives in each button's tooltip.
 */
export default function FileExplorerActions({
	onCreateFile,
	onCreateFolder,
	onImportProject,
	onExportProject,
}: FileExplorerActionsProps) {
	const { t } = useI18n()
	const zipInputRef = useRef<HTMLInputElement>(null)

	return (
		<div className="p-2 border-t border-gray-700">
			<div className="flex items-center gap-2">
				<button
					onClick={onCreateFile}
					className="flex-1 flex items-center justify-center p-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
					title={t('files.newFile')}
					aria-label={t('files.newFile')}
				>
					<FilePlus className="w-4 h-4" />
				</button>
				<button
					onClick={onCreateFolder}
					className="flex-1 flex items-center justify-center p-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
					title={t('files.newFolder')}
					aria-label={t('files.newFolder')}
				>
					<FolderPlus className="w-4 h-4" />
				</button>
				<button
					onClick={() => zipInputRef.current?.click()}
					className="flex-1 flex items-center justify-center p-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
					title={t('files.importProject')}
					aria-label={t('files.importProject')}
				>
					<Upload className="w-4 h-4" />
				</button>
				<button
					onClick={onExportProject}
					className="flex-1 flex items-center justify-center p-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
					title={t('files.exportProject')}
					aria-label={t('files.exportProject')}
				>
					<Download className="w-4 h-4" />
				</button>
			</div>
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
