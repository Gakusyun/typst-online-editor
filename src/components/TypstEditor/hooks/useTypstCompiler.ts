import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import { TypstCompilerService, type CompileStatus } from '@/lib/typst/TypstCompilerService'
import { debounce } from '@/lib/utils/helpers'

export function useTypstCompiler() {
	const [status, setStatus] = useState<CompileStatus>('idle')
	const [pdfUrl, setPdfUrl] = useState<string | null>(null)
	const [errorMsg, setErrorMsg] = useState<string | null>(null)
	const [hasCompiled, setHasCompiled] = useState(false)

	const compilerServiceRef = useRef<TypstCompilerService | null>(null)
	const debouncedCompileRef = useRef<((files: Record<string, string>, mainFile: string) => void) & { cancel: () => void } | null>(null)

	const compile = useCallback(async (files: Record<string, string>, mainFile: string) => {
		const compilerService = compilerServiceRef.current
		if (!compilerService) return

		await compilerService.compile(files, mainFile)
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
			onSuccess: (pdf, url) => {
				setPdfUrl(url)
				setErrorMsg(null)
				setHasCompiled(true)
			},
			onError: (error) => {
				// Keep the last successful PDF on screen: the artifact is only
				// replaced when a new compilation succeeds.
				setErrorMsg(error)
				setHasCompiled(true)
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
		hasCompiled,
		compileNow,
		compileDebounced,
	}
}
