
import { useState } from 'preact/hooks'
import type { CompileStatus } from '@/lib/typst/TypstCompilerService'
import { usePdfRenderer } from './hooks/usePdfRenderer'
import PdfToolbar from './PdfToolbar'
import PdfCanvas from './PdfCanvas'
import PdfPlaceholder from './PdfPlaceholder'

interface PdfPreviewProps {
	pdfUrl: string | null
	status: CompileStatus
	errorMsg: string | null
	hasCompiled: boolean
	fileCount: number
	charCount: number
	isCollapsed: boolean
	onToggleCollapse: () => void
}

export default function PdfPreview({ pdfUrl, status, errorMsg, hasCompiled, isCollapsed, onToggleCollapse }: PdfPreviewProps) {
	const [zoom, setZoom] = useState(100)
	const [currentPage, setCurrentPage] = useState(1)
	
	const { totalPages, isRendering, canvasRefs, pageRefs, textLayerRefs, annotationLayerRefs, containerRef, scrollToPage } = usePdfRenderer({
		pdfUrl,
		currentPage,
		zoom,
		isCollapsed,
		onPageChange: setCurrentPage
	})
	
	const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200))
	const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50))
	const handleZoomFit = () => setZoom(100)
	const handlePrevPage = () => scrollToPage(Math.max(currentPage - 1, 1))
	const handleNextPage = () => scrollToPage(Math.min(currentPage + 1, totalPages))
	
	return (
		<div className="h-full flex py-1 flex-col bg-gray-800">
			<PdfToolbar
				pdfUrl={pdfUrl}
				currentPage={currentPage}
				totalPages={totalPages}
				zoom={zoom}
				onPrevPage={handlePrevPage}
				onNextPage={handleNextPage}
				onZoomIn={handleZoomIn}
				onZoomOut={handleZoomOut}
				onZoomFit={handleZoomFit}
				isCollapsed={isCollapsed}
				onToggleCollapse={onToggleCollapse}
			/>
			
			{!isCollapsed && (
				<>
					{errorMsg && pdfUrl && (
						<div className="mx-2 mt-1 px-3 py-2 bg-red-900/40 border border-red-700 rounded text-xs text-red-300 overflow-auto" style={{ maxHeight: '6rem' }}>
							<pre className="m-0 font-mono whitespace-pre-wrap break-words">{errorMsg}</pre>
						</div>
					)}
					{pdfUrl ? (
						<PdfCanvas
							canvasRefs={canvasRefs}
							pageRefs={pageRefs}
							textLayerRefs={textLayerRefs}
							annotationLayerRefs={annotationLayerRefs}
							containerRef={containerRef}
							isRendering={isRendering}
							totalPages={totalPages}
						/>
					) : (
						<PdfPlaceholder
							status={status}
							errorMsg={errorMsg}
							hasCompiled={hasCompiled}
						/>
					)}
				</>
			)}
		</div>
	)
}
