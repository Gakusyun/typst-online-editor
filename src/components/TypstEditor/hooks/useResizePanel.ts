import type { TargetedPointerEvent } from 'preact'
import { useState, useEffect, useCallback, useRef } from 'preact/hooks'

interface UseResizePanelOptions {
	minValue: number
	maxValue: number
	initialValue: number
	onResize?: (value: number) => void
}

export function useResizePanel(options: UseResizePanelOptions) {
	const { minValue, initialValue, onResize } = options
	const [value, setValue] = useState(initialValue)
	const [isResizing, setIsResizing] = useState(false)
	const [dynamicMaxValue, setDynamicMaxValue] = useState(options.maxValue)
	const startXRef = useRef(0)
	const startValueRef = useRef(initialValue)
	/** The pointer being tracked, and the element that captured it. */
	const pointerIdRef = useRef<number | null>(null)
	const handleRef = useRef<HTMLElement | null>(null)
	/** The value on screen, so a drag or a key press starts from the latest one
	 * even before the render that follows a `setValue`. */
	const valueRef = useRef(initialValue)
	/**
	 * The drag listeners outlive the render that installed them, so the bounds
	 * and the callback are read through a ref: a window or collapse change
	 * mid-drag must clamp with the *current* bounds, not the ones the drag
	 * started with.
	 */
	const boundsRef = useRef({ minValue, maxValue: options.maxValue, onResize })
	boundsRef.current = { minValue, maxValue: dynamicMaxValue, onResize }

	valueRef.current = value

	/**
	 * The one write path for user-driven resizes — the drag and the arrow keys
	 * both land here, so both clamp against the same bounds and both notify
	 * `onResize` (which is what marks the width as the user's). Returns the
	 * clamped width, since a caller that persists it must not store a raw one.
	 */
	const resizeTo = useCallback((next: number): number => {
		const bounds = boundsRef.current
		const clamped = Math.min(Math.max(next, bounds.minValue), bounds.maxValue)
		valueRef.current = clamped
		setValue(clamped)
		bounds.onResize?.(clamped)
		return clamped
	}, [])

	/** Stop tracking the pointer, however the drag ends. */
	const endResize = useCallback(() => {
		const pointerId = pointerIdRef.current
		const handle = handleRef.current
		pointerIdRef.current = null
		handleRef.current = null
		if (handle && pointerId !== null && handle.hasPointerCapture(pointerId)) {
			handle.releasePointerCapture(pointerId)
		}
		setIsResizing(false)
	}, [])

	const startResize = useCallback((e: TargetedPointerEvent<HTMLElement>) => {
		// Only a primary-button press drags: a right-button drag used to start a
		// resize, and the release it never delivers would stick.
		if (e.button !== 0 || !e.isPrimary) return
		e.preventDefault()
		const handle = e.currentTarget
		handleRef.current = handle
		pointerIdRef.current = e.pointerId
		startXRef.current = e.clientX
		startValueRef.current = valueRef.current
		try {
			// Capture retargets the drag to the handle, so the moves and the
			// release keep arriving after the pointer leaves the handle (and the
			// window) — and `lostpointercapture` reports a cancel we would
			// otherwise only notice on the next click.
			handle.setPointerCapture(e.pointerId)
		} catch {
			// Best effort: the document listeners below still drive the drag.
		}
		setIsResizing(true)
	}, [])

	useEffect(() => {
		if (!isResizing) return

		const handlePointerMove = (e: PointerEvent) => {
			if (e.pointerId !== pointerIdRef.current) return
			resizeTo(startValueRef.current + (e.clientX - startXRef.current))
		}

		const handlePointerEnd = (e: PointerEvent) => {
			if (e.pointerId !== pointerIdRef.current) return
			endResize()
		}

		document.addEventListener('pointermove', handlePointerMove)
		document.addEventListener('pointerup', handlePointerEnd)
		document.addEventListener('pointercancel', handlePointerEnd)
		// A release that never arrives — pointer released outside the window, the
		// window losing focus, the browser cancelling the drag — must not leave
		// `isResizing` on: the app-wide overlay would swallow every click until a
		// reload. `blur` and `lostpointercapture` are the two signals that a
		// `pointerup` is not coming, so both end the drag.
		// Capture-phase: `lostpointercapture` does not bubble.
		document.addEventListener('lostpointercapture', endResize, true)
		window.addEventListener('blur', endResize)
		document.body.style.cursor = 'col-resize'
		document.body.style.userSelect = 'none'

		return () => {
			document.removeEventListener('pointermove', handlePointerMove)
			document.removeEventListener('pointerup', handlePointerEnd)
			document.removeEventListener('pointercancel', handlePointerEnd)
			document.removeEventListener('lostpointercapture', endResize, true)
			window.removeEventListener('blur', endResize)
			document.body.style.cursor = ''
			document.body.style.userSelect = ''
		}
	}, [isResizing, resizeTo, endResize])

	return {
		value,
		isResizing,
		startResize,
		endResize,
		/** Programmatic width (a derived default): never marks the width as the user's. */
		setValue,
		resizeTo,
		setMaxValue: setDynamicMaxValue,
		/** The live bounds, for the divider's `aria-valuemin` / `aria-valuemax`. */
		minValue,
		maxValue: dynamicMaxValue,
	}
}