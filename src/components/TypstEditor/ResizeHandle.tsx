import type { TargetedKeyboardEvent, TargetedPointerEvent } from 'preact'
import { useI18n } from '@/lib/i18n/useI18n'

interface ResizeHandleProps {
	isResizing: boolean
	onPointerDown: (e: TargetedPointerEvent<HTMLElement>) => void
	/** The width this divider controls, for the keyboard steps and assistive tech. */
	value: number
	min: number
	max: number
	/** One keyboard step; the hook clamps it against the same bounds as a drag. */
	onResize: (value: number) => void
}

/** Pixels per arrow key — a column is measured in tens, not ones. */
const KEYBOARD_STEP = 16

/**
 * The divider between two columns. The drag is the mouse path; the separator
 * role, the tab stop and the arrow keys are the keyboard path to the very same
 * width, which is otherwise only reachable by pointer.
 */
export default function ResizeHandle({ isResizing, onPointerDown, value, min, max, onResize }: ResizeHandleProps) {
	const { t } = useI18n()

	const onKeyDown = (e: TargetedKeyboardEvent<HTMLDivElement>) => {
		let next: number
		switch (e.key) {
			case 'ArrowLeft':
				next = value - KEYBOARD_STEP
				break
			case 'ArrowRight':
				next = value + KEYBOARD_STEP
				break
			case 'Home':
				next = min
				break
			case 'End':
				next = max
				break
			default:
				return
		}
		// The arrow keys scroll the page otherwise.
		e.preventDefault()
		onResize(next)
	}

	const label = t('layout.dragToResize')

	return (
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label={label}
			aria-valuenow={Math.round(value)}
			aria-valuemin={Math.round(min)}
			aria-valuemax={Math.round(max)}
			tabIndex={0}
			title={label}
			className={`w-1.5 cursor-col-resize transition-colors shrink-0 hover:bg-blue-400 group ${
				isResizing ? 'bg-blue-500' : 'bg-gray-700'
			}`}
			onPointerDown={onPointerDown}
			onKeyDown={onKeyDown}
			style={{ userSelect: 'none' }}
		>
			{/* Visual indicator dots */}
			<div className="h-full flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-50 transition-opacity">
				<div className="w-0.5 h-0.5 bg-gray-300 rounded-full"></div>
				<div className="w-0.5 h-0.5 bg-gray-300 rounded-full"></div>
				<div className="w-0.5 h-0.5 bg-gray-300 rounded-full"></div>
			</div>
		</div>
	)
}