import { ZoomIn, ZoomOut, Maximize2, Minimize2, ChevronLeft, ChevronRight, X, Eye } from 'lucide-preact'
import { useI18n } from '@/lib/i18n/useI18n'

interface PdfToolbarProps {
	pdfUrl: string | null
	currentPage: number
	totalPages: number
	zoom: number
	onPrevPage: () => void
	onNextPage: () => void
	onZoomIn: () => void
	onZoomOut: () => void
	onZoomFit: () => void
	isCollapsed: boolean
	onToggleCollapse: () => void
}

export default function PdfToolbar({
	pdfUrl,
	currentPage,
	totalPages,
	zoom,
	onPrevPage,
	onNextPage,
	onZoomIn,
	onZoomOut,
	onZoomFit,
	isCollapsed,
	onToggleCollapse
}: PdfToolbarProps) {
	const { t } = useI18n()
	if (isCollapsed) {
		return (
			<div className="h-full flex flex-col items-center justify-start bg-gray-800 border-l border-gray-700">
				<button
					onClick={onToggleCollapse}
					className="p-3 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
					title={t('preview.show')}
					aria-label={t('preview.show')}
				>
					<Eye className="w-5 h-5" />
				</button>
			</div>
		)
	}
	
	return (
		<div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex flex-wrap items-center justify-between gap-y-1">
			<span className="text-sm text-gray-400 whitespace-nowrap">{t('preview.title')}</span>
			
			{pdfUrl && (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					{/* Page Navigation */}
					<div className="flex items-center gap-1">
						<button
							onClick={onPrevPage}
							className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
							title={t('preview.prevPage')}
							aria-label={t('preview.prevPage')}
							disabled={currentPage <= 1}
						>
							<ChevronLeft className="w-4 h-4" />
						</button>
						<span className="text-xs text-gray-400 min-w-[50px] text-center">
							{currentPage} / {totalPages}
						</span>
						<button
							onClick={onNextPage}
							className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
							title={t('preview.nextPage')}
							aria-label={t('preview.nextPage')}
							disabled={currentPage >= totalPages}
						>
							<ChevronRight className="w-4 h-4" />
						</button>
					</div>

					<div className="w-px h-4 bg-gray-700"></div>

					{/* Zoom Controls */}
					<div className="flex items-center gap-1">
						{/* The floor matches `handleZoomOut` in PdfPreview: the two used to
						    disagree, which made 50–75% unreachable. */}
						<button
							onClick={onZoomOut}
							className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
							title={t('preview.zoomOut')}
							aria-label={t('preview.zoomOut')}
							disabled={zoom <= 50}
						>
							<ZoomOut className="w-4 h-4" />
						</button>
						<button
							onClick={onZoomFit}
							className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
							title={t('preview.zoomToFit')}
							aria-label={t('preview.zoomToFit')}
						>
							<Minimize2 className="w-4 h-4" />
						</button>
						<button
							onClick={onZoomIn}
							className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
							title={t('preview.zoomIn')}
							aria-label={t('preview.zoomIn')}
							disabled={zoom >= 200}
						>
							<ZoomIn className="w-4 h-4" />
						</button>
						<span className="text-xs text-gray-400 min-w-[45px] text-center">{zoom}%</span>
					</div>

					<div className="w-px h-4 bg-gray-700"></div>

					{/* Open in New Tab */}
					<button
						onClick={() => window.open(pdfUrl, '_blank')}
						className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
						title={t('preview.openInNewTab')}
						aria-label={t('preview.openInNewTab')}
					>
						<Maximize2 className="w-4 h-4" />
					</button>
					
					{/* Close Preview */}
					<button
						onClick={onToggleCollapse}
						className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
						title={t('preview.close')}
						aria-label={t('preview.close')}
					>
						<X className="w-4 h-4" />
					</button>
				</div>
			)}
		</div>
	)
}