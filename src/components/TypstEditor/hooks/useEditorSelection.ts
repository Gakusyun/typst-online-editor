import { useMemo } from 'preact/hooks'
import type { EditorSelection } from '@/components/CodeEditor'

/**
 * The code editor's current selection, published to whoever needs it.
 *
 * The AI panel needs the selection to build its request and to know whether
 * "replace the selection" is even possible, but a cursor move must not
 * re-render the editor/preview tree — so the selection lives in a store, not in
 * `TypstEditor` state, and only subscribers (the panel) re-render. `TypstEditor`
 * hands `set` straight to the editor as its `onSelectionChange`.
 */
export interface EditorSelectionStore {
	/** The selection as of the last report; `null` when the editor is not mounted. */
	get(): EditorSelection | null
	/** Called by the editor whenever the selection changes. */
	set(selection: EditorSelection | null): void
	/** Register a listener; the returned function unsubscribes. */
	subscribe(listener: () => void): () => void
}

function createEditorSelectionStore(): EditorSelectionStore {
	let current: EditorSelection | null = null
	const listeners = new Set<() => void>()
	return {
		get: () => current,
		set: (selection) => {
			if (
				current?.from === selection?.from &&
				current?.to === selection?.to &&
				current?.text === selection?.text
			) {
				return
			}
			current = selection
			for (const listener of listeners) listener()
		},
		subscribe: (listener) => {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
	}
}

/** A selection store that outlives every render of the component that owns it. */
export function useEditorSelection(): EditorSelectionStore {
	return useMemo(createEditorSelectionStore, [])
}