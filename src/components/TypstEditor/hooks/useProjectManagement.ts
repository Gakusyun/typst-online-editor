import { downloadBlob } from '@/lib/utils/helpers'
import { projectToZip, projectZipName, zipToProject } from '@/lib/utils/projectZip'
import { useI18n } from '@/lib/i18n/useI18n'
import { useProjectState } from './useProjectState'
import { useProjectFileOperations } from './useProjectFileOperations'

/**
 * Main hook for managing Typst projects
 * Coordinates project state, file operations and project import/export
 */
export function useProjectManagement(onProjectChange?: (files: Record<string, string>, mainFile: string) => void) {
	const { t } = useI18n()

	// Project state management
	const {
		currentProject,
		activeFilePath,
		setActiveFilePath,
		loadProject,
		saveProject,
		renameProject,
	} = useProjectState(onProjectChange)

	// File operations
	const fileOperations = useProjectFileOperations({
		currentProject,
		activeFilePath,
		setActiveFilePath,
		saveProject,
	})

	const handleProjectImport = async (file: File) => {
		try {
			const archive = new Uint8Array(await file.arrayBuffer())
			loadProject(zipToProject(archive, file.name))
		} catch (error) {
			console.error('Failed to import project:', error)
			alert(t('dialog.importFailed', { error: error instanceof Error ? error.message : String(error) }))
		}
	}

	const handleProjectExport = () => {
		try {
			const archive = projectToZip(currentProject)
			// fflate types its output as Uint8Array<ArrayBufferLike>, but zipSync
			// always allocates a plain ArrayBuffer.
			downloadBlob(new Blob([archive as unknown as BlobPart]), projectZipName(currentProject))
		} catch (error) {
			console.error('Failed to export project:', error)
			alert(t('dialog.exportFailed', { error: error instanceof Error ? error.message : String(error) }))
		}
	}

	return {
		currentProject,
		activeFilePath,
		loadProject,
		renameProject,
		handleProjectImport,
		handleProjectExport,
		...fileOperations,
	}
}
