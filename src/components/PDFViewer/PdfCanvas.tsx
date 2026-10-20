import { Loader2 } from 'lucide-preact'
import type { RefObject } from 'preact'

interface PdfCanvasProps {
	canvasRefs: RefObject<Map<number, HTMLCanvasElement>>
	pageRefs: RefObject<Map<number, HTMLDivElement>>
	textLayerRefs: RefObject<Map<number, HTMLDivElement>>
	annotationLayerRefs: RefObject<Map<number, HTMLDivElement>>
	containerRef: RefObject<HTMLDivElement | null>
	isRendering: boolean
	totalPages: number
}

/**
 * Preact calls a function ref again on every render (its identity changes) and calls it
 * with `null` when the element goes away — a collapsed preview, or the pages a shorter
 * document drops. The page maps are therefore written idempotently, with the element as
 * its own key and `null` meaning "this page is gone".
 */
function track<T>(map: RefObject<Map<number, T>>, pageNum: number, element: T | null) {
	if (element) map.current.set(pageNum, element)
	else map.current.delete(pageNum)
}

export default function PdfCanvas({ canvasRefs, pageRefs, textLayerRefs, annotationLayerRefs, containerRef, isRendering, totalPages }: PdfCanvasProps) {
	return (
		<div className="preview-container relative flex-1 bg-gray-100">
			{isRendering && (
				<div className="absolute inset-0 flex items-center justify-center bg-white/70 z-10" role="status">
					<Loader2 className="w-8 h-8 animate-spin text-gray-600" />
				</div>
			)}
			<div 
				ref={containerRef}
				className="pdfjs-container absolute inset-0 overflow-auto p-6"
			>
				<div className="pdfViewer">
					{Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
						<div
							key={pageNum}
							ref={(el) => track(pageRefs, pageNum, el)}
							className="page mx-auto my-4 first:mt-0"
							style={{
								boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)'
							}}
						>
							<div className="canvasWrapper bg-white relative">
								<canvas
									ref={(el) => track(canvasRefs, pageNum, el)}
									className="block"
									role="presentation"
								/>
								<div
									ref={(el) => track(textLayerRefs, pageNum, el)}
									className="textLayer"
								/>
								<div
									ref={(el) => track(annotationLayerRefs, pageNum, el)}
									className="annotationLayer"
								/>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}