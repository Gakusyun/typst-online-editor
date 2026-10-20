/**
 * The desktop layout the user adjusted by hand: the file tree and editor
 * widths, and the panels they collapsed or left open. Persisted so a reload
 * restores the arrangement instead of resetting it to the preset split.
 *
 * One JSON record rather than a key per field: the fields are *one* arrangement
 * the user built, and a record that cannot be read must fall back to the preset
 * as a whole. The values are raw pixels/booleans — the bounds (and the window
 * they must fit in) belong to the layout that reads them (`TypstEditor`).
 */

import { safeGet, safeSet } from './safeStorage'

const LAYOUT_KEY = 'typst-layout'

/** The persisted arrangement; a field that is absent keeps its preset value. */
export interface LayoutPreferences {
	/** File tree width in pixels. */
	sidebarWidth?: number
	/** Editor width in pixels. */
	editorWidth?: number
	/** The file tree is collapsed to its strip. */
	sidebarCollapsed?: boolean
	/** The preview is collapsed to its strip. */
	previewCollapsed?: boolean
	/** The AI assistant panel is open (it holds the preview's slot then). */
	aiOpen?: boolean
}

/** Keep only the fields that are of the type the layout expects. */
function sanitize(value: unknown): LayoutPreferences {
	if (typeof value !== 'object' || value === null) return {}
	const record = value as Record<string, unknown>
	const width = (field: unknown): number | undefined =>
		typeof field === 'number' && Number.isFinite(field) && field > 0 ? Math.round(field) : undefined
	const flag = (field: unknown): boolean | undefined => (typeof field === 'boolean' ? field : undefined)
	return {
		sidebarWidth: width(record.sidebarWidth),
		editorWidth: width(record.editorWidth),
		sidebarCollapsed: flag(record.sidebarCollapsed),
		previewCollapsed: flag(record.previewCollapsed),
		aiOpen: flag(record.aiOpen),
	}
}

/** The stored arrangement; `{}` when there is none (or it is unreadable). */
export function readLayoutPreferences(): LayoutPreferences {
	if (typeof window === 'undefined') return {}
	const data = safeGet(LAYOUT_KEY)
	if (!data) return {}
	try {
		return sanitize(JSON.parse(data))
	} catch (error) {
		// The record stays where it is: the next write replaces it, and until
		// then the preset is what the user sees.
		console.error('[layout] could not read the saved layout', error)
		return {}
	}
}

/** Merge `changes` into the stored arrangement. */
export function writeLayoutPreferences(changes: LayoutPreferences): void {
	if (typeof window === 'undefined') return
	// `safeSet` swallows a full/blocked store; a layout that cannot be saved is
	// not worth interrupting the drag for.
	safeSet(LAYOUT_KEY, JSON.stringify({ ...readLayoutPreferences(), ...changes }))
}