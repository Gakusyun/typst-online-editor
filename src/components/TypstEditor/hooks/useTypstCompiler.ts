import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import { TypstCompilerService, type CompileStatus } from '@/lib/typst/TypstCompilerService'
import {
	explainUnknownFontLine,
	isDocumentSystemFontsEnabled,
	loadDocumentSystemFonts,
	setDocumentSystemFontsEnabled,
} from '@/lib/fonts/documentFonts'
import { debounce } from '@/lib/utils/helpers'

export function useTypstCompiler() {
	const [status, setStatus] = useState<CompileStatus>('idle')
	const [pdfUrl, setPdfUrl] = useState<string | null>(null)
	const [errorMsg, setErrorMsg] = useState<string | null>(null)
	/** Compiler warnings of the last compile — shown next to the PDF. */
	const [diagnostics, setDiagnostics] = useState<string[]>([])
	const [hasCompiled, setHasCompiled] = useState(false)
	/** Whether a compile reads the installed fonts the source asks for. */
	const [documentSystemFonts, setDocumentSystemFontsState] = useState(isDocumentSystemFontsEnabled)
	/** Families the last compile took from the machine (for the language server). */
	const [documentFontFamilies, setDocumentFontFamilies] = useState<string[]>([])

	const compilerServiceRef = useRef<TypstCompilerService | null>(null)
	const debouncedCompileRef = useRef<((files: Record<string, string>, mainFile: string) => void) & { cancel: () => void } | null>(null)
	const documentSystemFontsRef = useRef(documentSystemFonts)
	/** Font problems of the compile in flight — added to its diagnostics. */
	const fontWarningsRef = useRef<string[]>([])
	documentSystemFontsRef.current = documentSystemFonts

	/**
	 * The ref is updated eagerly: the toggle recompiles the document right away,
	 * and that compile has to see the new setting.
	 */
	const setDocumentSystemFonts = useCallback((enabled: boolean) => {
		documentSystemFontsRef.current = enabled
		setDocumentSystemFontsState(enabled)
		setDocumentSystemFontsEnabled(enabled)
	}, [])

	/**
	 * Resolves the machine's fonts the source references, compiles with them, and
	 * lets go of them again: nothing here is cached, and the worker drops the
	 * compiler that carried them once the compile is done.
	 */
	const compile = useCallback(async (files: Record<string, string>, mainFile: string) => {
		const compilerService = compilerServiceRef.current
		if (!compilerService) return

		const { fonts, families, missing } = documentSystemFontsRef.current
			? await loadDocumentSystemFonts(files)
			: { fonts: {}, families: [], missing: [] }
		fontWarningsRef.current = missing
		setDocumentFontFamilies((previous) =>
			previous.length === families.length && previous.every((family, index) => family === families[index])
				? previous
				: families
		)

		await compilerService.compile(files, mainFile, families, fonts)
	}, [])

	useEffect(() => {
		// Initialize compiler service
		const compilerService = new TypstCompilerService()
		compilerServiceRef.current = compilerService

		// Listen to compile events
		const unsubscribe = compilerService.addListener({
			onStatusChange: (newStatus) => {
				setStatus(newStatus)
			},
			onSuccess: (pdf, url, warnings) => {
				setPdfUrl(url)
				setErrorMsg(null)
				setHasCompiled(true)
				// A PDF existing does not mean the compile was clean: warnings go
				// on screen next to the artifact, not only in the console.
				setDiagnostics([...warnings.map(explainUnknownFontLine), ...fontWarningsRef.current])
			},
			onError: (error) => {
				// Keep the last successful PDF on screen: the artifact is only
				// replaced when a new compilation succeeds.
				setErrorMsg(error)
				setHasCompiled(true)
				// The error box already carries the failed compile's diagnostics.
				setDiagnostics([])
			},
		})

		// Create debounced compile function
		debouncedCompileRef.current = debounce((files: Record<string, string>, mainFile: string) => {
			void compile(files, mainFile)
		}, 1000)

		return () => {
			debouncedCompileRef.current?.cancel()
			unsubscribe()
			compilerService.dispose()
		}
	}, [compile])

	// Stable identities: callers (useProjectState) re-run change effects on
	// callback identity changes, which would otherwise trigger endless recompiles.
	const compileNow = useCallback(
		async (files: Record<string, string>, mainFile: string) => {
			await compile(files, mainFile)
		},
		[compile]
	)

	const compileDebounced = useCallback((files: Record<string, string>, mainFile: string) => {
		if (debouncedCompileRef.current) {
			debouncedCompileRef.current(files, mainFile)
		}
	}, [])

	return {
		status,
		pdfUrl,
		errorMsg,
		diagnostics,
		hasCompiled,
		documentSystemFonts,
		setDocumentSystemFonts,
		documentFontFamilies,
		compileNow,
		compileDebounced,
	}
}