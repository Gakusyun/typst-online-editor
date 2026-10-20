import { useState, useEffect, useRef } from 'preact/hooks'
import { getPdfjs, PreviewEngineError, PreviewWorker } from '@/lib/pdf/pdfjs'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, PageViewport, RenderTask, TextLayer } from 'pdfjs-dist'

/**
 * Why the preview shows nothing: the engine (pdf.js or its worker) is missing,
 * or this particular PDF could not be loaded. Only the second is something the
 * user can fix in the document; the first wants a network check and a retry.
 */
export interface PreviewLoadError {
	kind: 'engine' | 'document'
	/** The underlying message, shown under the localized headline. */
	detail: string
}

interface UsePdfRendererProps {
	pdfUrl: string | null
	currentPage: number
	zoom: number
	isCollapsed: boolean
	onPageChange?: (page: number) => void
}

/** A page's display box at one zoom and container width, in CSS pixels. */
interface PageLayout {
	width: number
	height: number
}

/** What one render pass started, so a superseded pass can cancel all of it. */
interface RenderPass {
	renderTasks: Map<number, RenderTask>
	textLayers: Map<number, TextLayer>
}

/** A canvas that is already up to date for one document, scale and container width. */
interface RenderedPage {
	doc: PDFDocumentProxy
	canvas: HTMLCanvasElement
	key: string
}

/** Font faces pdf.js registers for a PDF's embedded fonts (`g_d<page>_f<font>`). */
const PDFJS_FONT_FACE = /^g_d\d+_f\d+$/

/** The scroll container's own padding (`p-6`): 24 CSS px on each side. */
const CONTAINER_PADDING = 48

/** Width changes below this are sub-pixel jitter, not a resize worth re-rendering for. */
const WIDTH_EPSILON = 1

export function usePdfRenderer({ pdfUrl, currentPage, zoom, isCollapsed, onPageChange }: UsePdfRendererProps) {
	const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
	// Loading task per loaded document: only it can destroy what it created. The
	// worker rides along because pdf.js was handed it as a port and therefore
	// cannot stop it either.
	const loadingTasks = useRef(new WeakMap<PDFDocumentProxy, { task: PDFDocumentLoadingTask; worker: PreviewWorker }>())
	const [totalPages, setTotalPages] = useState(1)
	const [isRendering, setIsRendering] = useState(false)
	const [loadError, setLoadError] = useState<PreviewLoadError | null>(null)
	const [containerWidth, setContainerWidth] = useState(0)
	const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
	const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map())
	const annotationLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map())
	const containerRef = useRef<HTMLDivElement | null>(null)
	const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
	const resizeObserverRef = useRef<ResizeObserver | null>(null)
	/** The element the resize observer currently watches; null until it exists. */
	const observerTargetRef = useRef<HTMLElement | null>(null)
	/** The page the toolbar shows; the page observer reads it through this ref so that
	 *  the pages it reports cannot rebuild it (and race the jump below). */
	const currentPageRef = useRef(currentPage)
	currentPageRef.current = currentPage
	/** Target of a button jump until the scroll effect has moved the container. */
	const pendingScrollRef = useRef<number | null>(null)
	/** Canvas → the document/scale it was drawn for, so a pass can skip it. */
	const renderedPagesRef = useRef<Map<number, RenderedPage>>(new Map())
	/** The one pass allowed to write right now; null while no pass runs. */
	const activePassRef = useRef<RenderPass | null>(null)
	/** The last view a pass worked on (`zoom|width` of one document) and the page box it
	 *  measured: the pages a pass cannot measure are laid out with it. */
	const lastViewRef = useRef<{ doc: PDFDocumentProxy; key: string; layout: PageLayout } | null>(null)
	/** Latest width the resize observer reported, waiting for the next frame. */
	const pendingWidthRef = useRef(0)
	const widthFrameRef = useRef(0)
	/** Last width handed to the render effect: jitter below the epsilon never lands. */
	const writtenWidthRef = useRef(0)

	/**
	 * One width write per animation frame, and only when the width really changed: the
	 * observer ticks on boxes the pages do not care about, and `containerWidth` is a
	 * render-effect dependency — dragging the split handle must not re-render the pages
	 * once per tick.
	 */
	const queueContainerWidth = (width: number) => {
		pendingWidthRef.current = width
		if (widthFrameRef.current) return
		widthFrameRef.current = requestAnimationFrame(() => {
			widthFrameRef.current = 0
			const next = pendingWidthRef.current
			if (Math.abs(writtenWidthRef.current - next) < WIDTH_EPSILON) return
			writtenWidthRef.current = next
			setContainerWidth(next)
		})
	}

	/** Cancel what a pass started; the pass itself stops on its next `isCurrent` check. */
	const cancelPass = (pass: RenderPass) => {
		for (const renderTask of pass.renderTasks.values()) {
			try {
				renderTask.cancel()
			} catch {
				// Already finished: nothing left to cancel.
			}
		}
		pass.renderTasks.clear()
		for (const textLayer of pass.textLayers.values()) {
			try {
				textLayer.cancel()
			} catch {
				// Already finished: nothing left to cancel.
			}
		}
		pass.textLayers.clear()
	}

	// Load PDF document when URL changes
	useEffect(() => {
		if (!pdfUrl) return

		let mounted = true

		const loadPdf = async () => {
			// The worker is per document and *ours*: pdf.js is handed it as a port, so
			// a worker that never starts must be reported from here (see PreviewWorker).
			// Ownership moves to `loadingTasks` once a document exists, and `finally`
			// cleans up whatever never got that far.
			let worker: PreviewWorker | null = null
			try {
				const pdfjs = await getPdfjs()
				worker = new PreviewWorker()
				// Before the port changes hands: pdf.js sends to it as soon as it is
				// handed over, and a module worker drops messages posted before its
				// handler exists.
				await worker.ready
				// Read synchronously by `getDocument`, so no other load can slip its own
				// port in between this assignment and the call.
				pdfjs.GlobalWorkerOptions.workerPort = worker.port
				const loadingTask = pdfjs.getDocument({ url: pdfUrl })
				// pdf.js resolves its own worker promise as soon as it is handed a port
				// and then waits for a reply; a dead worker would leave this pending
				// forever, hence the race against the worker's failure.
				const pdf = await Promise.race([loadingTask.promise, worker.failure])

				if (mounted) {
					loadingTasks.current.set(pdf, { task: loadingTask, worker })
					worker = null
					setLoadError(null)
					setPdfDoc(pdf)
					setTotalPages(pdf.numPages)
					// A shorter document cannot keep the page the toolbar still shows: the
					// render window is clamped either way, but the counter would read "12 / 4".
					if (currentPageRef.current > pdf.numPages) onPageChange?.(pdf.numPages)
				} else {
					// Replaced or unmounted while loading: nothing will ever render it.
					void loadingTask.destroy()
				}
			} catch (error) {
				console.error('Failed to load PDF:', error)
				if (mounted) {
					setLoadError({
						kind: error instanceof PreviewEngineError ? 'engine' : 'document',
						detail: error instanceof Error ? error.message : String(error)
					})
				}
			} finally {
				worker?.dispose()
			}
		}

		loadPdf()

		return () => {
			mounted = false
		}
		// `onPageChange` is the page state setter of the parent and never changes identity.
	}, [pdfUrl])

	// Button-driven page changes: `scrollToPage` marks the target and updates the page,
	// and this effect is the only place that moves the container — the page observer
	// never touches the flag, so it cannot consume a jump before it happened (which is
	// what used to make "next page" do nothing).
	useEffect(() => {
		const target = pendingScrollRef.current
		if (target === null) return
		pendingScrollRef.current = null
		if (target !== currentPage) return
		// Instant on purpose: a smooth animation would report every page in between, and
		// the observer would drag the window and the counter back with it.
		pageRefs.current.get(target)?.scrollIntoView({ block: 'start' })
	}, [currentPage])

	// Rendering model — this effect is the only writer of the canvas, text and
	// annotation layers.
	//
	// It runs when the document changes, the layout changes (zoom, container width,
	// collapse) or the visible page moves, and draws the window around that page (the
	// visible one ±1) — never the whole document. Pages outside the window keep the
	// current layout's box with their pixels released: the page observer, the counter,
	// the button jumps and the scrollbar all work off the layout, so the layout has to
	// be right for every page even though only the window holds a buffer. A page already
	// drawn for this document/scale/width is skipped, which is what makes scrolling
	// cheap — a pass draws the pages that just came into view.
	//
	// Every pass owns what it starts (`activePassRef`): a superseded pass returns at its
	// next await boundary and has its render tasks and text layers cancelled, so two
	// passes never write into the same containers.
	useEffect(() => {
		// A collapsed preview unmounts every canvas and a shorter document drops its last
		// pages; their render records are the only thing left holding those elements (and
		// the buffers behind them), so they go before this pass does anything else.
		for (const [pageNum, drawn] of renderedPagesRef.current) {
			if (canvasRefs.current.get(pageNum) !== drawn.canvas) renderedPagesRef.current.delete(pageNum)
		}
		if (!pdfDoc || isCollapsed || !containerRef.current) return

		// Track the scroll container's width — the page scale is derived from it — and
		// re-target when the container is replaced: a collapsed preview unmounts it, and
		// the next one is a different element that must not inherit the width of the one
		// before.
		const parentElement = containerRef.current.parentElement
		if (parentElement && observerTargetRef.current !== parentElement) {
			resizeObserverRef.current?.disconnect()
			resizeObserverRef.current = new ResizeObserver((entries) => {
				for (const entry of entries) queueContainerWidth(entry.contentRect.width)
			})
			resizeObserverRef.current.observe(parentElement)
			observerTargetRef.current = parentElement
			queueContainerWidth(parentElement.clientWidth)
		}

		const doc = pdfDoc
		const pass: RenderPass = { renderTasks: new Map(), textLayers: new Map() }
		activePassRef.current = pass
		// The window this pass draws: the visible page ±1, clamped to the document (a
		// shorter document can leave the toolbar on a page that no longer exists).
		const visiblePage = Math.min(currentPage, totalPages)
		const bounds = { first: Math.max(1, visiblePage - 1), last: Math.min(totalPages, visiblePage + 1) }

		const isCurrent = () => activePassRef.current === pass

		/** Drop the pixels of one page; its element and its box stay. */
		const releasePage = (pageNum: number, canvas: HTMLCanvasElement) => {
			renderedPagesRef.current.delete(pageNum)
			canvas.width = 1
			canvas.height = 1
			const textLayerDiv = textLayerRefs.current.get(pageNum)
			if (textLayerDiv) textLayerDiv.innerHTML = ''
			const annotationLayerDiv = annotationLayerRefs.current.get(pageNum)
			if (annotationLayerDiv) annotationLayerDiv.innerHTML = ''
		}

		/** Give a page the current layout's box without drawing anything into it. */
		const placePage = (pageNum: number, canvas: HTMLCanvasElement, layout: PageLayout) => {
			const width = `${layout.width}px`
			const height = `${layout.height}px`
			for (const element of [canvas, textLayerRefs.current.get(pageNum), annotationLayerRefs.current.get(pageNum)]) {
				// Already this box (a scroll before any resize): writing it again would
				// invalidate the layout of every page for nothing.
				if (!element || (element.style.width === width && element.style.height === height)) continue
				element.style.width = width
				element.style.height = height
			}
		}

		/** Display size and scale of a page at this pass's zoom and container width. */
		const measurePage = async (pageNum: number, availableWidth: number) => {
			const page = (await doc.getPage(pageNum)) as PDFPageProxy
			const baseViewport = page.getViewport({ scale: 1 })
			const scale = (zoom / 100) * (availableWidth / baseViewport.width)
			return { page, scale, viewport: page.getViewport({ scale }) }
		}

		const drawPage = async (pageNum: number, page: PDFPageProxy, scale: number, viewport: PageViewport, key: string) => {
			const canvas = canvasRefs.current.get(pageNum)
			if (!canvas) return

			const canvasContext = canvas.getContext('2d', {
				alpha: false,
				desynchronized: true
			}) as CanvasRenderingContext2D | null
			if (!canvasContext) return

			// Backing store in device pixels, box in CSS pixels. The ratio is capped: a 4×
			// store quadruples the buffer (a page at 2× is already ~8 MB) for detail the
			// display cannot show.
			const pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)
			const deviceViewport = page.getViewport({ scale: scale * pixelRatio })

			// Set canvas actual size (device pixels) and display size (CSS pixels)
			canvas.width = deviceViewport.width
			canvas.height = deviceViewport.height
			canvas.style.width = `${viewport.width}px`
			canvas.style.height = `${viewport.height}px`

			// Disable image smoothing for crisp text rendering
			canvasContext.imageSmoothingEnabled = false

			const renderTask = page.render({
				canvasContext,
				viewport: deviceViewport,
				canvas
			})
			pass.renderTasks.set(pageNum, renderTask)
			await renderTask.promise
			pass.renderTasks.delete(pageNum)
			if (!isCurrent()) return
			renderedPagesRef.current.set(pageNum, { doc, canvas, key })

			// Render text layer for text selection
			const textLayerDiv = textLayerRefs.current.get(pageNum)
			if (textLayerDiv) {
				// Clear previous text layer content
				textLayerDiv.innerHTML = ''
				textLayerDiv.style.width = `${viewport.width}px`
				textLayerDiv.style.height = `${viewport.height}px`

				try {
					const textContent = await page.getTextContent()
					if (!isCurrent()) return
					const pdfjs = await getPdfjs()
					if (!isCurrent()) return

					// Create and render text layer using PDF.js TextLayer class
					const textLayer = new pdfjs.TextLayer({
						textContentSource: textContent,
						container: textLayerDiv,
						viewport
					})
					pass.textLayers.set(pageNum, textLayer)

					await textLayer.render()
					pass.textLayers.delete(pageNum)
				} catch (error) {
					console.error('Failed to render text layer:', error)
				}
			}
			if (!isCurrent()) return

			// Render annotation layer for clickable links
			const annotationLayerDiv = annotationLayerRefs.current.get(pageNum)
			if (annotationLayerDiv) {
				// Clear previous annotation layer content
				annotationLayerDiv.innerHTML = ''
				annotationLayerDiv.style.width = `${viewport.width}px`
				annotationLayerDiv.style.height = `${viewport.height}px`

				try {
					const annotations = await page.getAnnotations()
					if (!isCurrent()) return
					const pdfjs = await getPdfjs()
					if (!isCurrent()) return

					// Create annotation layer instance
					const annotationLayer = new pdfjs.AnnotationLayer({
						div: annotationLayerDiv,
						page,
						viewport: viewport.clone({ dontFlip: true }),
						annotationStorage: null,
						accessibilityManager: null,
						annotationCanvasMap: null,
						annotationEditorUIManager: null,
						structTreeLayer: null,
						commentManager: null,
						linkService: {
							externalLinkTarget: 2, // LINK_TARGET.BLANK - open in new tab
							externalLinkRel: 'noopener noreferrer nofollow',
							externalLinkEnabled: true,
							getDestinationHash: () => '',
							getAnchorUrl: (hash: string) => hash,
							addLinkAttributes: (link: HTMLAnchorElement, url: string) => {
								link.href = url
								link.target = '_blank'
								link.rel = 'noopener noreferrer nofollow'
							}
						}
					})

					// Type assertion needed due to incorrect TypeScript definitions in pdfjs-dist
					// The render method actually accepts these parameters (see PDF.js source)
					await annotationLayer.render({
						annotations,
						imageResourcesPath: '',
						renderForms: false,
						enableScripting: false,
						hasJSActions: false,
						fieldObjects: null
					} as unknown as Parameters<typeof annotationLayer.render>[0])
				} catch (error) {
					console.error('Failed to render annotation layer:', error)
				}
			}
		}

		const runPass = async () => {
			let announced = false
			try {
				const container = containerRef.current
				if (!container || !isCurrent()) return

				// Use the tracked container width, fallback to current width if not yet set
				const availableWidth = (containerWidth || container.clientWidth) - CONTAINER_PADDING
				if (availableWidth <= 0) return

				const key = `${zoom}|${availableWidth}`
				const previous = lastViewRef.current
				// Whether this pass rebuilds a view that is already on screen (a new
				// document, a new zoom or width) or just extends it (a scroll, a jump): the
				// whole-pane spinner belongs to the first kind, or it would flicker on every
				// step of a scroll.
				const repaints = previous?.doc !== doc || previous.key !== key
				let layout = previous?.key === key ? previous.layout : null

				// pdf.js injects a FontFace per embedded font while rendering the text layer,
				// named `g_d<page>_f<font>`; a new PDF would otherwise accumulate them
				// forever (a font file is easily tens of MB). Only its own names are
				// dropped — faces the app registered must stay.
				for (const face of document.fonts) {
					if (PDFJS_FONT_FACE.test(face.family)) document.fonts.delete(face)
				}

				if (repaints) {
					setIsRendering(true)
					announced = true
				}

				for (let pageNum = bounds.first; pageNum <= bounds.last; pageNum++) {
					if (!isCurrent()) return
					const canvas = canvasRefs.current.get(pageNum)
					const drawn = renderedPagesRef.current.get(pageNum)
					if (!canvas || (drawn?.doc === doc && drawn.canvas === canvas && drawn.key === key)) continue

					const measured = await measurePage(pageNum, availableWidth)
					if (!isCurrent()) return
					// One page's box stands in for the pages this pass does not draw: Typst
					// pages share one size in practice, and a page that differs is corrected
					// the moment a pass draws it.
					layout ??= { width: measured.viewport.width, height: measured.viewport.height }
					lastViewRef.current = { doc, key, layout }

					await drawPage(pageNum, measured.page, measured.scale, measured.viewport, key)
					if (!isCurrent()) return
				}

				// Pages outside the window: laid out at the current scale, empty. Without a
				// box a canvas is its default 300×150 — and the page observer, the scrollbar
				// and a button jump all measure that box, so it has to be right everywhere,
				// not only where the pixels are.
				if (!layout) return
				for (const [pageNum, canvas] of canvasRefs.current) {
					if (!isCurrent()) return
					if (pageNum >= bounds.first && pageNum <= bounds.last) continue
					if (renderedPagesRef.current.get(pageNum)?.canvas === canvas) releasePage(pageNum, canvas)
					placePage(pageNum, canvas, layout)
				}
			} catch (error: unknown) {
				const err = error as { name?: string }
				if (err?.name !== 'RenderingCancelledException') {
					console.error('Failed to render pages:', error)
				}
			} finally {
				if (announced && isCurrent()) setIsRendering(false)
			}
		}

		void runPass()

		return () => {
			// Superseded: this pass may not write another byte. Its own `isCurrent` checks
			// stop it at the next await, and everything it started is cancelled so the next
			// pass alone owns the layers.
			if (activePassRef.current === pass) {
				activePassRef.current = null
				cancelPass(pass)
				setIsRendering(false)
			}
		}
	}, [pdfDoc, zoom, containerWidth, isCollapsed, currentPage, totalPages])

	// A loaded document holds the parsed PDF, its pages and its fonts, and every
	// successful compile produces a new one: the replaced one must be destroyed or the
	// tab grows until it dies. pdf.js exposes destruction on the loading task rather
	// than on `PDFDocumentProxy`, hence the pairing. Declared after the render effect on
	// purpose — that one cancels the in-flight render tasks first.
	useEffect(() => {
		const owned = pdfDoc ? loadingTasks.current.get(pdfDoc) : undefined
		return () => {
			if (!owned) return
			void owned.task.destroy()
			owned.worker.dispose()
		}
	}, [pdfDoc])

	// The page observer tracks the page the user is looking at, which is also what
	// decides the render window. It is created per document and reads the current page
	// through a ref, so the pages it reports can neither rebuild it nor be swallowed by
	// a stale closure.
	useEffect(() => {
		const container = containerRef.current
		if (!pdfDoc || !container || isCollapsed || !onPageChange) return

		const options = {
			root: container,
			rootMargin: '-20% 0px -20% 0px', // Trigger when page is in middle 60% of viewport
			threshold: 0
		}

		const observer = new IntersectionObserver((entries) => {
			// A jump is pending: the pages on the way to the target are not the user
			// scrolling, and reporting them would drag the counter and the window back.
			if (pendingScrollRef.current !== null) return

			// Find the most visible page
			let mostVisiblePage = currentPageRef.current
			let maxVisibility = 0

			entries.forEach((entry) => {
				if (!entry.isIntersecting) return
				const pageNum = parseInt(entry.target.getAttribute('data-page-num') || '0')
				if (pageNum && entry.intersectionRatio > maxVisibility) {
					maxVisibility = entry.intersectionRatio
					mostVisiblePage = pageNum
				}
			})

			if (maxVisibility > 0 && mostVisiblePage !== currentPageRef.current) {
				onPageChange(mostVisiblePage)
			}
		}, options)

		// Observe all page elements
		pageRefs.current.forEach((pageElement, pageNum) => {
			pageElement.setAttribute('data-page-num', pageNum.toString())
			observer.observe(pageElement)
		})

		return () => {
			observer.disconnect()
		}
	}, [pdfDoc, totalPages, isCollapsed, onPageChange])

	// The resize observer and the pending width frame live as long as the hook does: the
	// render effect re-targets them but must not tear them down with every pass.
	useEffect(() => {
		return () => {
			resizeObserverRef.current?.disconnect()
			if (widthFrameRef.current) cancelAnimationFrame(widthFrameRef.current)
		}
	}, [])

	// Function to trigger programmatic page change (from buttons)
	const scrollToPage = (page: number) => {
		// The page is already the one on screen: a jump could not move the container, and
		// the pending target would stay set (muting the observer) forever.
		if (page === currentPageRef.current) return
		pendingScrollRef.current = page
		onPageChange?.(page)
	}

	return {
		totalPages,
		isRendering,
		loadError,
		/** A document is loaded and renderable; false while loading or after a failure. */
		hasDocument: pdfDoc !== null,
		canvasRefs,
		pageRefs,
		textLayerRefs,
		annotationLayerRefs,
		containerRef,
		scrollToPage
	}
}