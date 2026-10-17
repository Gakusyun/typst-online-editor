import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import type { I18n } from './i18n'

/**
 * Deliberately `null` outside `I18nProvider`: a missing provider throws instead
 * of silently rendering one hard-coded language.
 */
export const I18nContext = createContext<I18n | null>(null)

/** The i18n instance for the active language. Must be used under `I18nProvider`. */
export function useI18n(): I18n {
	const i18n = useContext(I18nContext)
	if (!i18n) throw new Error('useI18n must be used within <I18nProvider>')
	return i18n
}
