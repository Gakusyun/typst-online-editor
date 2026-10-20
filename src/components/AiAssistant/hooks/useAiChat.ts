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
	/**
	 * The user stopped this reply. Not a failure: whatever arrived before the
	 * stop stays in `content`, readable and applicable.
	 */
	stopped?: boolean
}

/**
 * The assistant conversation: sends one instruction at a time, streams the
 * reply into its turn, and aborts on demand.
 *
 * Only one request runs at a time (the composer is disabled meanwhile). The
 * source of truth for the code being edited is *not* the history — every
 * request re-reads the current file through `getTarget` — so applying a reply
 * and then asking for a follow-up works on the updated document.
 *
 * `getTarget` returns `null` when the active file has no source to rewrite (a
 * binary asset, say); the request is then skipped rather than sent empty.
 */
export function useAiChat(getTarget: (scope: AiEditScope) => AiEditTarget | null) {
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
			// A file without source (a binary asset) has nothing to rewrite; the
			// panel disables Send for it, but the keyboard shortcut could still
			// reach this point.
			const target = getTarget(request.scope)
			if (!target) return
			const messages: ChatMessage[] = [
				// An empty custom prompt means "use the bundled condensed one".
				{ role: 'system', content: request.settings.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
				// History carries the instructions and replies verbatim; the code
				// itself always comes fresh from `target`. A failed or stopped
				// reply is partial, so it is not worth sending back as context.
				...turnsRef.current
					.filter((turn) => !turn.error && !turn.stopped)
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
			// Deltas arrive one token at a time; buffering them and writing the
			// turn once per frame keeps one long reply from re-rendering the
			// panel (and re-parsing the reply text) hundreds of times.
			let pending = ''
			let frame: number | null = null
			// Idempotent: cancels a scheduled write and applies what it holds, so
			// a finished request cannot leave a stale frame behind to be applied
			// to the final reply.
			const flushPending = () => {
				if (frame !== null) {
					cancelAnimationFrame(frame)
					frame = null
				}
				if (pending === '') return
				const delta = pending
				pending = ''
				updateTurn(replyId, (turn) => ({ ...turn, content: turn.content + delta }))
			}
			try {
				const reply = await chatCompletion({
					baseUrl: request.settings.baseUrl,
					apiKey: request.settings.apiKey,
					model: request.settings.model,
					messages,
					signal: controller.signal,
					onDelta: (delta) => {
						pending += delta
						if (frame === null) frame = requestAnimationFrame(flushPending)
					},
				})
				flushPending()
				updateTurn(replyId, (turn) => ({ ...turn, content: reply, streaming: false }))
			} catch (error) {
				// Whatever streamed before the failure stays readable.
				flushPending()
				const failure =
					error instanceof AiError
						? error
						: new AiError('network', error instanceof Error ? error.message : String(error))
				updateTurn(replyId, (turn) => {
					// A stop is a normal outcome, not a failure to explain: the
					// partial reply must remain readable, copyable and applicable.
					if (failure.code === 'aborted') return { ...turn, streaming: false, stopped: true }
					return {
						...turn,
						streaming: false,
						error: { code: failure.code, detail: failure.message },
					}
				})
			} finally {
				// `clear()` and the next request both take the ref over; only the
				// request that still owns it may reset the streaming state.
				if (abortRef.current === controller) {
					streamingRef.current = false
					abortRef.current = null
					setIsStreaming(false)
				}
			}
		},
		[getTarget]
	)

	const stop = useCallback(() => abortRef.current?.abort(), [])
	const clear = useCallback(() => {
		abortRef.current?.abort()
		// The aborted request takes a round trip to settle, and the conversation
		// is already gone: its streaming state goes with it right now.
		abortRef.current = null
		streamingRef.current = false
		setIsStreaming(false)
		setTurns([])
	}, [])

	return { turns, isStreaming, send, stop, clear }
}