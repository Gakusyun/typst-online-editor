
import type { ComponentChildren } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { Settings, Loader2, CheckCircle2, XCircle, Check, Zap, Sparkles } from 'lucide-preact'
import type { CompileStatus } from '@/lib/typst/TypstCompilerService'
import { useI18n } from '@/lib/i18n/useI18n'

// lucide 1.x dropped brand icons, so the GitHub mark is inlined here (Simple Icons, CC0).
function Github({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="currentColor" role="img">
			<title>GitHub</title>
			<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
		</svg>
	)
}

interface TypstEditorHeaderProps {
	status: CompileStatus
	hasCompiled: boolean
	pdfUrl: string | null
	isMobile: boolean
	aiOpen: boolean
	onCompileNow: () => void
	onDownload: () => void
	onOpenSettings: () => void
	onToggleAi: () => void
}

export default function TypstEditorHeader({
	status,
	hasCompiled,
	pdfUrl,
	isMobile,
	aiOpen,
	onCompileNow,
	onDownload,
	onOpenSettings,
	onToggleAi,
}: TypstEditorHeaderProps) {
	const { t } = useI18n()
	const rootRef = useRef<HTMLDivElement | null>(null)

	// The AI drawer is fixed to the right edge and must not cover this bar, but
	// the bar wraps on narrow screens — so publish its live height instead of
	// hard-coding one. See `AiAssistantPanel`.
	useEffect(() => {
		const node = rootRef.current
		if (!node) return
		const publish = () =>
			document.documentElement.style.setProperty('--app-header-height', `${node.offsetHeight}px`)
		publish()
		const observer = new ResizeObserver(publish)
		observer.observe(node)
		return () => {
			observer.disconnect()
			document.documentElement.style.removeProperty('--app-header-height')
		}
	}, [])

	const getStatusText = (): ComponentChildren => {
		const textSizeClass = isMobile ? 'text-xs' : ''
		switch (status) {
			case 'compiling':
				return (
					<span className={`flex items-center gap-2 ${textSizeClass}`}>
						<Loader2 className="w-4 h-4 animate-spin" />
						{hasCompiled ? t('status.compiling') : t('status.initializing')}
					</span>
				)
			case 'done':
				return (
					<span className={`flex items-center gap-2 ${textSizeClass}`}>
						<CheckCircle2 className="w-4 h-4 text-green-500" />
						{t('status.compiled')}
					</span>
				)
			case 'error':
				return (
					<span className={`flex items-center gap-2 ${textSizeClass}`}>
						<XCircle className="w-4 h-4 text-red-500" />
						{t('status.error')}
					</span>
				)
			case 'idle':
				return hasCompiled ? (
					<span className={`flex items-center gap-2 ${textSizeClass}`}>
						<Check className="w-4 h-4 text-green-500" />
						{t('status.ready')}
					</span>
				) : (
					<span className={`flex items-center gap-2 ${textSizeClass}`}>
						<Zap className="w-4 h-4 text-blue-500" />
						{t('status.readyToCompile')}
					</span>
				)
			default:
				return t('status.ready')
		}
	}

	return (
		<div
			ref={rootRef}
			className="flex flex-col md:flex-row md:justify-between md:items-center gap-2 px-4 py-1.5 bg-gray-800 border-b border-gray-700"
		>
			<div className="flex items-center gap-4">
				<div className="flex flex-row items-center gap-2 md:justify-start md:w-auto justify-between w-full">
					<h1 className="text-base font-semibold">Typst Online Editor</h1>
					{isMobile && (
						<a
							href="https://github.com/Gakusyun/typst-online-editor"
							target="_blank"
							rel="noopener noreferrer"
							className="p-1.5 text-white rounded hover:bg-gray-600 transition-transform duration-200"
							title={t('header.viewOnGithub')}
						>
							<Github className="w-4 h-4" />
						</a>
					)}
				</div>
					{!isMobile && (
						<a
							href="https://github.com/Gakusyun/typst-online-editor"
							target="_blank"
							rel="noopener noreferrer"
							className="p-1.5 text-white rounded hover:bg-gray-600 transition-transform duration-200"
							title={t('header.viewOnGithub')}
						>
						<Github className="w-4 h-4" />
						</a>
					)}
			</div>
			<div className="flex items-center gap-4">
				<div className="flex flex-row items-center gap-2 md:justify-end md:w-auto justify-between w-full">
					{(!isMobile || !hasCompiled) && getStatusText()}
				</div>
				{!isMobile && (
					<button
						className={`px-2.5 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed ${isMobile ? 'text-xs' : ''}`}
						onClick={onCompileNow}
						disabled={status === 'compiling'}
					>
						{t('header.compileNow')}
					</button>
				)}
				{pdfUrl && (
					<button
						className={`px-2.5 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 ${isMobile ? 'text-xs' : ''} text-nowrap`}
						onClick={onDownload}
					>
						{t('header.downloadPdf')}
					</button>
				)}
				<button
					onClick={onToggleAi}
					className={`p-1.5 rounded transition-colors ${
						aiOpen ? 'bg-blue-600 text-white' : 'text-white hover:bg-gray-600'
					}`}
					title={t('header.aiAssistant')}
				>
					<Sparkles className="w-4 h-4" />
				</button>
				<button
					onClick={onOpenSettings}
					className="p-1.5 text-white rounded hover:bg-gray-600 transition-colors"
					title={t('settings.title')}
				>
					<Settings className="w-4 h-4" />
				</button>
			</div>
		</div>
	)
}
