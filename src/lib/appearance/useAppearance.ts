import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import type { FontChoice } from './appearance'

/**
 * The font choices made in Settings. See `./appearance` for the persistence and
 * CSS plumbing and `./AppearanceProvider` for the implementation.
 */
export interface Appearance {
	/** Interface (app chrome) font family; `null` = the built-in default stack. */
	readonly uiFont: FontChoice

	/** Editor font family — code, completion popups and compile errors. */
	readonly editorFont: FontChoice

	/** Choose the interface font; persisted and applied immediately. */
	setUiFont(font: FontChoice): void

	/** Choose the editor font; persisted and applied immediately. */
	setEditorFont(font: FontChoice): void
}

/** Deliberately `null` outside `AppearanceProvider`: a missing provider throws. */
export const AppearanceContext = createContext<Appearance | null>(null)

/** The appearance state. Must be used under `AppearanceProvider`. */
export function useAppearance(): Appearance {
	const appearance = useContext(AppearanceContext)
	if (!appearance) throw new Error('useAppearance must be used within <AppearanceProvider>')
	return appearance
}