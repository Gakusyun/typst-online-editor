import type { ComponentChildren } from 'preact'
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import { AppearanceContext, type Appearance } from './useAppearance'
import {
	EDITOR_FONT_KEY,
	EDITOR_FONT_VAR,
	UI_FONT_KEY,
	UI_FONT_VAR,
	applyFontVar,
	readFontChoice,
	writeFontChoice,
	type FontChoice,
} from './appearance'
import { registerSystemFont } from '@/lib/fonts/localFonts'

interface AppearanceProviderProps {
	children: ComponentChildren
}

/**
 * Owns the font choices (Settings → Fonts) and publishes them as CSS custom
 * properties on `<html>`: `--app-ui-font` and `--app-editor-font`. `globals.css`
 * and the CodeMirror theme consume the properties with the default stacks as
 * fallback, so clearing a choice restores the defaults without any CSS change.
 *
 * The provider renders no markup: children pick the fonts up from CSS.
 */
export default function AppearanceProvider({ children }: AppearanceProviderProps) {
	const [uiFont, setUiFontState] = useState<FontChoice>(() => readFontChoice(UI_FONT_KEY))
	const [editorFont, setEditorFontState] = useState<FontChoice>(() => readFontChoice(EDITOR_FONT_KEY))

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

	useEffect(() => {
		applyFontVar(UI_FONT_VAR, uiFont)
		// A font in the user font directory is not necessarily visible to
		// `font-family`; registering it keeps a persisted choice working across
		// reloads (no-op without the API or the permission).
		if (uiFont) void registerSystemFont(uiFont)
	}, [uiFont])

	useEffect(() => {
		applyFontVar(EDITOR_FONT_VAR, editorFont)
		if (editorFont) void registerSystemFont(editorFont)
	}, [editorFont])

	const appearance = useMemo<Appearance>(
		() => ({ uiFont, editorFont, setUiFont, setEditorFont }),
		[uiFont, editorFont, setUiFont, setEditorFont]
	)

	return <AppearanceContext.Provider value={appearance}>{children}</AppearanceContext.Provider>
}