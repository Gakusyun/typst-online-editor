import type { ComponentChildren } from 'preact'
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import { AppearanceContext, type Appearance } from './useAppearance'
import {
	EDITOR_FONT_KEY,
	EDITOR_FONT_VAR,
	UI_FONT_KEY,
	UI_FONT_VAR,
	applyFontVar,
	readEditorWordWrap,
	readFontChoice,
	writeEditorWordWrap,
	writeFontChoice,
	type FontChoice,
} from './appearance'
import { pruneSystemFontFaces, registerSystemFont, type SystemFontRegistrationError } from './localFonts'

interface AppearanceProviderProps {
	children: ComponentChildren
}

/**
 * Owns the Settings → Fonts / Settings → General editor choices and publishes
 * the font families as CSS custom properties on `<html>`: `--app-ui-font` and
 * `--app-editor-font`. `globals.css` and the CodeMirror theme consume the
 * properties with the default stacks as fallback, so clearing a choice restores
 * the defaults without any CSS change. The word wrap flag is consumed directly
 * by `CodeEditor` (CodeMirror `lineWrapping`).
 *
 * The provider renders no markup: children pick the fonts up from CSS.
 */
export default function AppearanceProvider({ children }: AppearanceProviderProps) {
	const [uiFont, setUiFontState] = useState<FontChoice>(() => readFontChoice(UI_FONT_KEY))
	const [editorFont, setEditorFontState] = useState<FontChoice>(() => readFontChoice(EDITOR_FONT_KEY))
	const [editorWordWrap, setEditorWordWrapState] = useState<boolean>(() => readEditorWordWrap())
	/** Why a chosen family could not be published to CSS, per role. */
	const [fontErrors, setFontErrors] = useState<{
		ui: SystemFontRegistrationError | null
		editor: SystemFontRegistrationError | null
	}>({ ui: null, editor: null })

	// Persisted on change, never on mount: a second tab that mounted before the
	// choice was made must not write its stale (empty) state back.
	const setUiFont = useCallback((font: FontChoice) => {
		writeFontChoice(UI_FONT_KEY, font)
		setUiFontState(font)
	}, [])

	const setEditorFont = useCallback((font: FontChoice) => {
		writeFontChoice(EDITOR_FONT_KEY, font)
		setEditorFontState(font)
	}, [])

	const setEditorWordWrap = useCallback((enabled: boolean) => {
		writeEditorWordWrap(enabled)
		setEditorWordWrapState(enabled)
	}, [])

	useEffect(() => {
		applyFontVar(UI_FONT_VAR, uiFont)
	}, [uiFont])

	useEffect(() => {
		applyFontVar(EDITOR_FONT_VAR, editorFont)
	}, [editorFont])

	// A font in the user font directory is not necessarily visible to
	// `font-family`; registering it keeps a persisted choice working across
	// reloads (no-op without the API, the permission, or a font that CSS cannot
	// already see). Replaced faces are dropped: a font file can be tens of MB.
	useEffect(() => {
		let cancelled = false
		const register = async (family: FontChoice, role: 'ui' | 'editor') => {
			setFontErrors((previous) => ({ ...previous, [role]: null }))
			if (!family) return
			const error = await registerSystemFont(family)
			if (!cancelled) setFontErrors((previous) => ({ ...previous, [role]: error }))
		}
		void register(uiFont, 'ui')
		void register(editorFont, 'editor')
		pruneSystemFontFaces([uiFont, editorFont].filter((family): family is string => family !== null))
		return () => {
			cancelled = true
		}
	}, [uiFont, editorFont])

	const appearance = useMemo<Appearance>(
		() => ({
			uiFont,
			editorFont,
			editorWordWrap,
			uiFontError: fontErrors.ui,
			editorFontError: fontErrors.editor,
			setUiFont,
			setEditorFont,
			setEditorWordWrap,
		}),
		[uiFont, editorFont, editorWordWrap, fontErrors, setUiFont, setEditorFont, setEditorWordWrap]
	)

	return <AppearanceContext.Provider value={appearance}>{children}</AppearanceContext.Provider>
}