import { useCallback, useRef, useState } from 'preact/hooks'
import type { AiSettings } from '@/lib/ai/aiSettings'
import {
	AiError,
	chatCompletion,
	type AiErrorCode,
	type ChatMessage,
} from '@/lib/ai/chatCompletion'
import {
	DEFAULT_SYSTEM_PROMPT,
	buildEditUserMessage,
	type AiEditScope,
	type AiEditTarget,
} from '@/lib/ai/prompt'

/** Earlier turns sent back as context; the rest is dropped to bound the request. */
const MAX_HISTORY_TURNS = 8

/** One user or assistant message of the assistant conversation. */
export interface AiChatTurn {
	id: string
	role: 'user' | 'assistant'
	/** The instruction (user) or the reply as received so far (assistant). */
	content: string
	/** What the reply is meant to replace — captured when the request was sent. */
	target: AiEditTarget
	/** True while the reply is still streaming in. */
	streaming: boolean
	/** Why the turn failed, if it did; a failed reply is not applicable. */
	error?: { code: AiErrorCode; detail: string }
}

/**
 * The assistant conversation: sends one instruction at a time, streams the
 * reply into its turn, and aborts on demand.
 *
 * Only one request runs at a time (the composer is disabled meanwhile). The
 * source of truth for the code being edited is *not* the history — every
 * request re-reads the current file through `getTarget` — so applying a reply
 * and then asking for a follow-up works on the updated document.
 */
export function useAiChat(getTarget: (scope: AiEditScope) => AiEditTarget) {
	const [turns, setTurns] = useState<AiChatTurn[]>([])
	const [isStreaming, setIsStreaming] = useState(false)
	const turnsRef = useRef(turns)
	const streamingRef = useRef(false)
	const abortRef = useRef<AbortController | null>(null)
	turnsRef.current = turns

	const updateTurn = (id: string, change: (turn: AiChatTurn) => AiChatTurn) => {
		setTurns((current) => current.map((turn) => (turn.id === id ? change(turn) : turn)))
	}

	const send = useCallback(
		async (request: { settings: AiSettings; scope: AiEditScope; instruction: string }) => {
			if (streamingRef.current) return
			const target = getTarget(request.scope)
			const messages: ChatMessage[] = [
				// An empty custom prompt means "use the bundled condensed one".
				{ role: 'system', content: request.settings.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
				// History carries the instructions and replies verbatim; the code
				// itself always comes fresh from `target`.
				...turnsRef.current
					.filter((turn) => !turn.error)
					.slice(-MAX_HISTORY_TURNS)
					.map((turn) => ({ role: turn.role, content: turn.content })),
				{ role: 'user', content: buildEditUserMessage(target, request.instruction) },
			]
			const replyId = crypto.randomUUID()
			setTurns((current) => [
				...current,
				{
					id: crypto.randomUUID(),
					role: 'user',
					content: request.instruction,
					target,
					streaming: false,
				},
				{ id: replyId, role: 'assistant', content: '', target, streaming: true },
			])
			streamingRef.current = true
			setIsStreaming(true)
			const controller = new AbortController()
			abortRef.current = controller
			try {
				const reply = await chatCompletion({
					baseUrl: request.settings.baseUrl,
					apiKey: request.settings.apiKey,
					model: request.settings.model,
					messages,
					signal: controller.signal,
					onDelta: (delta) =>
						updateTurn(replyId, (turn) => ({ ...turn, content: turn.content + delta })),
				})
				updateTurn(replyId, (turn) => ({ ...turn, content: reply, streaming: false }))
			} catch (error) {
				const failure =
					error instanceof AiError
						? error
						: new AiError('network', error instanceof Error ? error.message : String(error))
				updateTurn(replyId, (turn) => ({
					...turn,
					streaming: false,
					// An abort is a normal outcome, not a failure to explain.
					error: {
						code: failure.code,
						detail: failure.code === 'aborted' ? '' : failure.message,
					},
				}))
			} finally {
				streamingRef.current = false
				abortRef.current = null
				setIsStreaming(false)
			}
		},
		[getTarget]
	)

	const stop = useCallback(() => abortRef.current?.abort(), [])
	const clear = useCallback(() => {
		abortRef.current?.abort()
		setTurns([])
	}, [])

	return { turns, isStreaming, send, stop, clear }
}