/**
 * `localStorage` access that cannot throw.
 *
 * Safari's private mode, a blocked-cookie policy, a sandboxed iframe or a full
 * quota all make `localStorage` throw (`SecurityError` / `QuotaExceededError`),
 * and this app reads its preferences during the first render — where a throw
 * means a blank page. Every failure falls back to an in-memory map for the rest
 * of the session, so the app keeps working (it just forgets on reload).
 */

const memory = new Map<string, string>()
let unavailable = false

/** True once a `localStorage` access has failed in this session. */
export function storageUnavailable(): boolean {
	return unavailable
}

export function safeGet(key: string): string | null {
	try {
		return localStorage.getItem(key) ?? memory.get(key) ?? null
	} catch (error) {
		unavailable = true
		console.warn(`[storage] could not read "${key}":`, error)
		return memory.get(key) ?? null
	}
}

/** Returns `false` when the value could not be persisted (quota, blocked storage). */
export function safeSet(key: string, value: string): boolean {
	memory.set(key, value)
	try {
		localStorage.setItem(key, value)
		return true
	} catch (error) {
		unavailable = true
		console.warn(`[storage] could not persist "${key}":`, error)
		return false
	}
}

export function safeRemove(key: string): void {
	memory.delete(key)
	try {
		localStorage.removeItem(key)
	} catch (error) {
		unavailable = true
		console.warn(`[storage] could not remove "${key}":`, error)
	}
}