import { Loader2, XCircle } from 'lucide-preact'
import type { CompileStatus } from '@/lib/typst/TypstCompilerService'
import { useI18n } from '@/lib/i18n/useI18n'

interface PdfPlaceholderProps {
	status: CompileStatus
	errorMsg: string | null
	hasCompiled: boolean
}

export default function PdfPlaceholder({ status, errorMsg, hasCompiled }: PdfPlaceholderProps) {
	const { t } = useI18n()

	return (
		<div className="flex items-center justify-center h-full">
			<div className="text-center text-gray-400">
				{status === 'compiling' && (
					<p className="text-lg flex items-center justify-center gap-2">
						<Loader2 className="w-5 h-5 animate-spin" />
						{hasCompiled ? t('status.compiling') : t('status.initializing')}
					</p>
				)}
				{status === 'error' && (
					<>
						<p className="text-lg text-red-500 flex items-center justify-center gap-2">
							<XCircle className="w-5 h-5" />
							{t('status.error')}
						</p>
						{/* Compiler output belongs to the editor surface: editor font. */}
						<pre className="mt-2 text-sm text-left max-w-2xl overflow-auto p-4 bg-gray-800 rounded font-editor">
							{errorMsg}
						</pre>
					</>
				)}
				{status === 'idle' && (
					<p className="text-lg">
						{hasCompiled
							? t('preview.idleHint')
							: t('preview.idleStart')}
					</p>
				)}
				{status === 'done' && (
					<p className="text-lg text-gray-400">{t('preview.done')}</p>
				)}
			</div>
		</div>
	)
}
