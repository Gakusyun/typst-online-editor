import { useState } from 'preact/hooks'
import { XCircle } from 'lucide-preact'
import type { CompileStatus } from '@/lib/typst/TypstCompilerService'
import { useI18n } from '@/lib/i18n/useI18n'
import { usePdfRenderer } from './hooks/usePdfRenderer'
import PdfToolbar from './PdfToolbar'
import PdfCanvas from './PdfCanvas'
import PdfPlaceholder from './PdfPlaceholder'

interface PdfPreviewProps {
	pdfUrl: string | null
	status: CompileStatus
	errorMsg: string | null
	hasCompiled: boolean
	isCollapsed: boolean
	onToggleCollapse: () => void
}

export default function PdfPreview({ pdfUrl, status, errorMsg, hasCompiled, isCollapsed, onToggleCollapse }: PdfPreviewProps) {
	const { t } = useI18n()
	const [zoom, setZoom] = useState(100)
	const [currentPage, setCurrentPage] = useState(1)

	const { totalPages, isRendering, loadError, hasDocument, canvasRefs, pageRefs, textLayerRefs, annotationLayerRefs, containerRef, scrollToPage } = usePdfRenderer({
		pdfUrl,
		currentPage,
		zoom,
		isCollapsed,
		onPageChange: setCurrentPage
	})

	// 50–200% in 25% steps; the toolbar's disabled zoom-out matches this floor.
	const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200))
	const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50))
	const handleZoomFit = () => setZoom(100)
	const handlePrevPage = () => scrollToPage(Math.max(currentPage - 1, 1))
	const handleNextPage = () => scrollToPage(Math.min(currentPage + 1, totalPages))

	// A PDF the preview cannot show rides one card: a failed compile (the document
	// is at fault), or an engine that never started (the network is). When there is
	// no document to fall back on the card takes the canvas' place — a blank page
	// box under a red banner says nothing.
	const failure = errorMsg ? { kind: 'document' as const, detail: errorMsg } : loadError
	const engineFailed = failure?.kind === 'engine'
	const showErrorCard = Boolean(failure) && Boolean(pdfUrl) && !hasDocument

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
					{failure && pdfUrl && !showErrorCard && (
						<div className="mx-2 mt-1 px-3 py-2 bg-red-900/40 border border-red-700 rounded text-xs text-red-300 overflow-auto" style={{ maxHeight: '6rem' }}>
							<pre className="m-0 font-mono whitespace-pre-wrap break-words">{failure.detail}</pre>
						</div>
					)}
					{showErrorCard ? (
						<div className="flex-1 flex items-center justify-center p-6">
							<div className="max-w-2xl text-center text-gray-400" role="status">
								<p className="text-lg text-red-500 flex items-center justify-center gap-2">
									<XCircle className="w-5 h-5" />
									{engineFailed ? t('preview.engineFailed') : t('preview.loadFailed')}
								</p>
								<p className="mt-2 text-sm">
									{engineFailed ? t('preview.engineFailedHint') : t('preview.loadFailedHint')}
								</p>
								{/* Compiler/engine output belongs to the editor surface: editor font. */}
								<pre className="mt-4 text-xs text-left overflow-auto p-3 bg-gray-900 rounded text-gray-500 font-editor">
									{failure?.detail}
								</pre>
							</div>
						</div>
					) : pdfUrl ? (
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
