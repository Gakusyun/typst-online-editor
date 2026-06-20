import { Loader2, CheckCircle2, XCircle, Check, Zap, ExternalLink } from 'lucide-react'
import type { CompileStatus } from '@/lib/typst/TypstCompilerService'
import LoadExamplesButton from './LoadExamplesButton'

interface TypstEditorHeaderProps {
	status: CompileStatus
	hasCompiled: boolean
	pdfUrl: string | null
	showExamples: boolean
	isMobile: boolean
	onToggleExamples: () => void
	onCompileNow: () => void
	onDownload: () => void
	onLoadExample: (exampleId: string) => void
}

export default function TypstEditorHeader({
	status,
	hasCompiled,
	pdfUrl,
	showExamples,
	isMobile,
	onToggleExamples,
	onCompileNow,
	onDownload,
	onLoadExample,
}: TypstEditorHeaderProps) {
	const getStatusText = (): React.ReactNode => {
		const textSizeClass = isMobile ? 'text-xs' : ''
		switch (status) {
			case 'compiling':
				return (
					<span className={`flex items-center gap-2 ${textSizeClass}`}>
						<Loader2 className="w-4 h-4 animate-spin" />
						{hasCompiled ? '编译中...' : '正在初始化编译器...'}
					</span>
				)
			case 'done':
				return (
					<span className={`flex items-center gap-2 ${textSizeClass}`}>
						<CheckCircle2 className="w-4 h-4 text-green-500" />
						编译完成
					</span>
				)
			case 'error':
				return (
					<span className={`flex items-center gap-2 ${textSizeClass}`}>
						<XCircle className="w-4 h-4 text-red-500" />
						编译错误
					</span>
				)
			case 'idle':
				return hasCompiled ? (
					<span className={`flex items-center gap-2 ${textSizeClass}`}>
						<Check className="w-4 h-4 text-green-500" />
						准备编译
					</span>
				) : (
					<span className={`flex items-center gap-2 ${textSizeClass}`}>
						<Zap className="w-4 h-4 text-blue-500" />
						准备就绪
					</span>
				)
			default:
				return '就绪'
		}
	}

	return (
		<div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700">
			<div className="flex items-center gap-4">
				<div className="flex flex-row items-center gap-2 md:justify-start md:w-auto justify-between w-full">
					<h1 className="text-xl font-semibold">Typst 在线编辑器</h1>
					{isMobile && (
						<a
							href="https://github.com/Gakusyun/typst-online-editor"
							target="_blank"
							rel="noopener noreferrer"
							className="p-2 text-white rounded hover:bg-gray-600 transition-transform duration-200"
							title="在 GitHub 上查看"
						>
							<ExternalLink className="w-5 h-5" />
						</a>
					)}
				</div>
				{!isMobile && (
					<LoadExamplesButton
						isMobile={isMobile}
						showExamples={showExamples}
						onToggleExamples={onToggleExamples}
						onLoadExample={onLoadExample}
					/>
				)}

				{!isMobile && (
					<a
						href="https://github.com/Gakusyun/typst-online-editor"
						target="_blank"
						rel="noopener noreferrer"
						className="p-2 text-white rounded hover:bg-gray-600 transition-transform duration-200"
						title="在 GitHub 上查看"
					>
						<ExternalLink className="w-5 h-5" />
					</a>
				)}


			</div>
			<div className="flex items-center gap-4">
				<div className="flex flex-row items-center gap-2 md:justify-end md:w-auto justify-between w-full">

					{isMobile && (
						<LoadExamplesButton
							isMobile={isMobile}
							showExamples={showExamples}
							onToggleExamples={onToggleExamples}
							onLoadExample={onLoadExample}
						/>
					)}
					{(!isMobile || !hasCompiled) && getStatusText()}
				</div>
				{!isMobile && (
					<button
						className={`px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed ${isMobile ? 'text-xs' : ''}`}
						onClick={onCompileNow}
						disabled={status === 'compiling'}
					>
						编译
					</button>
				)}
				{pdfUrl && (
					<button
						className={`px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 ${isMobile ? 'text-xs' : ''} text-nowrap`}
						onClick={onDownload}
					>
						下载 PDF
					</button>
				)}
			</div>
		</div>
	)
}
