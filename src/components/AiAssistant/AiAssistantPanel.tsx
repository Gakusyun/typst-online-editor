import { useEffect, useRef, useState } from 'preact/hooks'
import {
	AlertTriangle,
	ArrowDownToLine,
	Check,
	Copy,
	Loader2,
	Send,
	Settings,
	Sparkles,
	Square,
	Trash2,
	X,
} from 'lucide-preact'
import { useI18n } from '@/lib/i18n/useI18n'
import type { MessageKey } from '@/lib/i18n/messages'
import { isAiConfigured, type AiSettings } from '@/lib/ai/aiSettings'
import type { AiErrorCode } from '@/lib/ai/chatCompletion'
import { extractTypstCode, type AiEditScope, type AiEditTarget } from '@/lib/ai/prompt'
import type { EditorSelection } from '@/components/CodeEditor'
import type { EditorSelectionStore } from '../TypstEditor/hooks/useEditorSelection'
import { useAiChat, type AiChatTurn } from './hooks/useAiChat'

/** Why a request failed, as a message the user can act on (`chatCompletion.ts`). */
const AI_ERROR_MESSAGE: Record<AiErrorCode, MessageKey> = {
	'not-configured': 'ai.errorNotConfigured',
	http: 'ai.errorHttp',
	network: 'ai.errorNetwork',
	empty: 'ai.errorEmpty',
	'invalid-response': 'ai.errorInvalidResponse',
	aborted: 'ai.errorAborted',
}

interface AiAssistantPanelProps {
	/** Rendered but hidden when closed, so the conversation survives a close. */
	isOpen: boolean
	onClose: () => void
	/** File the request will be built from, for the context line. */
	activeFilePath: string
	settings: AiSettings
	selectionStore: EditorSelectionStore
	/**
	 * True when the workspace reserves room for the panel (`TypstEditor`), false
	 * when there is no room and the panel covers the workspace instead.
	 */
	docked: boolean
	/**
	 * Width in pixels while docked — the workspace reserves exactly this much
	 * room for it (`TypstEditor`), so panel and workspace cannot disagree.
	 * Ignored while the panel overlays the workspace instead.
	 */
	dockedWidth: number
	/**
	 * Mobile: the panel is a page of its own over the whole screen, header
	 * included — the header's own buttons are hidden then, so the panel's title
	 * bar is what closes it. Desktop drawers leave the header visible.
	 */
	fullPage?: boolean
	/** Snapshot of what the model may rewrite, taken when a request is sent. */
	getTarget: (scope: AiEditScope) => AiEditTarget | null
	/** Put a reply back into the document, or just edit the buffer. */
	onApply: (code: string, target: AiEditTarget) => void
	/**
	 * False when the active file has no source to rewrite (an image or a font is
	 * stored as a base64 `data:` URL): the composer says why instead of sending.
	 */
	canEdit?: boolean
	onOpenSettings: () => void
}

/** The live selection; only this panel re-renders when the cursor moves. */
function useSelection(store: EditorSelectionStore): EditorSelection | null {
	const [selection, setSelection] = useState<EditorSelection | null>(store.get)
	useEffect(() => store.subscribe(() => setSelection(store.get())), [store])
	return selection
}

/** The reply as prose and code: fences become blocks, everything else paragraphs. */
function ReplyBody({ content }: { content: string }) {
	const segments = content.split('```')
	return (
		<>
			{segments.map((segment, index) => {
				if (index % 2 === 1) {
					// Drop the language line that opens the fence, if there is one.
					return (
						<pre
							key={index}
							className="mt-2 mb-2 overflow-x-auto rounded bg-gray-900 px-2 py-1.5 font-mono text-xs text-gray-200"
						>
							{segment.replace(/^[ \t]*[A-Za-z0-9_+-]*[ \t]*\r?\n/, '').replace(/\s+$/, '')}
						</pre>
					)
				}
				const text = segment.trim()
				return text === '' ? null : (
					<p key={index} className="whitespace-pre-wrap text-xs leading-relaxed">
						{text}
					</p>
				)
			})}
		</>
	)
}

export default function AiAssistantPanel({
	isOpen,
	onClose,
	activeFilePath,
	settings,
	selectionStore,
	docked,
	dockedWidth,
	fullPage = false,
	getTarget,
	onApply,
	canEdit = true,
	onOpenSettings,
}: AiAssistantPanelProps) {
	const { t } = useI18n()
	const selection = useSelection(selectionStore)
	const hasSelection = (selection?.text.trim().length ?? 0) > 0
	const [scopeOverride, setScopeOverride] = useState<AiEditScope | null>(null)
	// "Auto" until the user picks one: the selection when there is one.
	const scope: AiEditScope =
		scopeOverride === 'selection' && !hasSelection
			? 'document'
			: (scopeOverride ?? (hasSelection ? 'selection' : 'document'))
	const [instruction, setInstruction] = useState('')
	const [copiedId, setCopiedId] = useState<string | null>(null)
	const listRef = useRef<HTMLDivElement | null>(null)
	const chat = useAiChat(getTarget)
	const configured = isAiConfigured(settings)

	// An override that outlives the selection it was chosen for would quietly
	// disagree with the highlighted button (which falls back to "document").
	useEffect(() => {
		if (scopeOverride === 'selection' && !hasSelection) setScopeOverride(null)
	}, [scopeOverride, hasSelection])

	const listener = useRef<HTMLTextAreaElement | null>(null)

	useEffect(() => {
		if (!isOpen) return
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || e.defaultPrevented) return
			// Escape while writing an instruction would throw the drawer away
			// mid-sentence; the composer keeps its own Escape (the panel stays
			// mounted while hidden, so the draft survives either way).
			if (document.activeElement === listener.current) return
			onClose()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [isOpen, onClose])

	useEffect(() => {
		const node = listRef.current
		if (node) node.scrollTop = node.scrollHeight
	}, [chat.turns])

	const send = () => {
		const text = instruction.trim()
		if (text === '' || chat.isStreaming || !configured) return
		setInstruction('')
		void chat.send({ settings, scope, instruction: text })
	}

	const copy = (turn: AiChatTurn) => {
		navigator.clipboard
			.writeText(extractTypstCode(turn.content))
			.then(() => setCopiedId(turn.id))
			.catch((error: unknown) => console.warn('[ai] could not copy the reply', error))
	}

	const scopeButton = (value: AiEditScope, label: MessageKey, disabled = false) => (
		<button
			onClick={() => setScopeOverride(value)}
			disabled={disabled}
			className={`px-2 py-1 rounded transition-colors disabled:opacity-40 ${
				scope === value ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
			}`}
		>
			{t(label)}
		</button>
	)

	return (
		<aside
			className={`${isOpen ? 'flex' : 'hidden'} fixed z-40 flex-col border-l border-gray-700 bg-gray-800 shadow-2xl ${
				fullPage ? 'inset-0' : 'bottom-0 right-0 top-[var(--app-header-height,0px)]'
			}`}
			style={fullPage ? undefined : { width: docked ? `${dockedWidth}px` : '100%' }}
		>
			<div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-700">
				<h2 className="flex items-center gap-2 text-sm font-semibold">
					<Sparkles className="w-4 h-4 text-blue-400" />
					{t('ai.title')}
				</h2>
				<div className="flex items-center gap-1">
					<button
						onClick={onOpenSettings}
						className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
						title={t('settings.title')}
					>
						<Settings className="w-4 h-4" />
					</button>
					{chat.turns.length > 0 && (
						<button
							onClick={chat.clear}
							className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
							title={t('ai.clear')}
							aria-label={t('ai.clear')}
						>
							<Trash2 className="w-4 h-4" />
						</button>
					)}
					<button
						onClick={onClose}
						className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
						title={t('common.close')}
						aria-label={t('common.close')}
					>
						<X className="w-4 h-4" />
					</button>
				</div>
			</div>

			{!configured && (
				<div className="m-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2">
					<p className="text-xs text-amber-200">{t('ai.notConfigured')}</p>
					<button
						onClick={onOpenSettings}
						className="mt-2 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
					>
						{t('ai.openSettings')}
					</button>
				</div>
			)}

			<div className="px-4 py-2 border-b border-gray-700">
				<p className="truncate text-xs text-gray-400" title={activeFilePath}>
					{t('ai.fileLabel')}
					<span className="font-mono text-gray-300">{activeFilePath}</span>
					{scope === 'selection' && selection && (
						<span className="ml-2 text-gray-400">
							{hasSelection
								? t('ai.selectionCount', { count: selection.text.length })
								: t('ai.selectionEmpty')}
						</span>
					)}
				</p>
				<div className="mt-2 flex items-center gap-2 text-xs">
					<span className="text-gray-400">{t('ai.scope')}</span>
					<div className="flex items-center gap-1 rounded bg-gray-900 p-0.5">
						{scopeButton('selection', 'ai.scopeSelection', !hasSelection)}
						{scopeButton('document', 'ai.scopeDocument')}
					</div>
				</div>
			</div>

			<div
				ref={listRef}
				// A chat transcript: `role="log"` announces appended replies (and
				// their streaming growth) without re-reading the whole list.
				role="log"
				aria-busy={chat.isStreaming}
				className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
			>
				{chat.turns.length === 0 && <p className="text-xs text-gray-500">{t('ai.emptyHint')}</p>}
				{chat.turns.map((turn) =>
					turn.role === 'user' ? (
						<div key={turn.id} className="flex justify-end">
							<p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-blue-600/80 px-3 py-1.5 text-xs">
								{turn.content}
							</p>
						</div>
					) : (
						<div key={turn.id} className="rounded-lg bg-gray-900/70 px-3 py-2">
							{turn.error ? (
								<p className="flex items-start gap-2 text-xs text-red-300">
									<AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0" />
									<span>
										{t(AI_ERROR_MESSAGE[turn.error.code])}
										{turn.error.detail && (
											<span className="ml-1 text-red-400/70">{turn.error.detail}</span>
										)}
									</span>
								</p>
							) : turn.streaming && turn.content === '' ? (
								<p className="flex items-center gap-2 text-xs text-gray-400">
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
									{t('ai.streaming')}
								</p>
							) : (
								<ReplyBody content={turn.content} />
							)}
							{!turn.streaming && !turn.error && (
								<div className="mt-2 flex items-center gap-2">
									<button
										onClick={() => onApply(extractTypstCode(turn.content), turn.target)}
										disabled={turn.target.path !== activeFilePath}
										title={
											turn.target.path !== activeFilePath
												? t('ai.applyStaleFile', { path: turn.target.path })
												: undefined
										}
										className="flex items-center gap-1.5 px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
									>
										<ArrowDownToLine className="w-3.5 h-3.5" />
										{t(turn.target.scope === 'document' ? 'ai.applyDocument' : 'ai.applySelection')}
									</button>
									<button
										onClick={() => copy(turn)}
										className="flex items-center gap-1.5 px-2 py-1 bg-gray-700 text-white text-xs rounded hover:bg-gray-600 transition-colors"
									>
										{copiedId === turn.id ? (
											<Check className="w-3.5 h-3.5" />
										) : (
											<Copy className="w-3.5 h-3.5" />
										)}
										{t(copiedId === turn.id ? 'ai.copied' : 'ai.copy')}
									</button>
								</div>
							)}
						</div>
					)
				)}
			</div>

			<div className="border-t border-gray-700 px-4 py-3">
				<textarea
					ref={listener}
					value={instruction}
					onInput={(e) => setInstruction(e.currentTarget.value)}
					onKeyDown={(e) => {
						if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
							e.preventDefault()
							send()
						}
					}}
					rows={3}
					aria-label={t('ai.instructionPlaceholder')}
					placeholder={t('ai.instructionPlaceholder')}
					className="w-full resize-none bg-gray-900 text-gray-100 text-xs rounded border border-gray-600 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
				<div className="mt-2 flex items-center justify-between gap-2">
					<span className="text-xs text-gray-500">
						{canEdit ? t('ai.sendHint') : t('ai.binaryFileHint')}
					</span>
					{chat.isStreaming ? (
						<button
							onClick={chat.stop}
							className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-700 text-white text-xs rounded hover:bg-gray-600 transition-colors"
						>
							<Square className="w-3.5 h-3.5" />
							{t('ai.stop')}
						</button>
					) : (
						<button
							onClick={send}
							disabled={!canEdit || !configured || instruction.trim() === ''}
							className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
						>
							<Send className="w-3.5 h-3.5" />
							{t('ai.send')}
						</button>
					)}
				</div>
				<p className="mt-2 text-xs text-gray-500">{t('ai.privacyHint')}</p>
			</div>
		</aside>
	)
}