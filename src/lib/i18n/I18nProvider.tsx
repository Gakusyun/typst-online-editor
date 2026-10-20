import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { safeGet, safeSet } from '@/lib/storage/safeStorage'
import {
	LANGS,
	LANG_STORAGE_KEY,
	browserLang,
	translate,
	type I18n,
	type Lang,
	type LangSetting,
} from './i18n'
import { I18nContext } from './useI18n'

function isLang(value: string | null): value is Lang {
	return value !== null && (LANGS as readonly string[]).includes(value)
}

function isLangSetting(value: string | null): value is LangSetting {
	return value === 'system' || isLang(value)
}

/** Saved choice wins; a fresh install follows the system language. */
function readLangSetting(): LangSetting {
	const saved = safeGet(LANG_STORAGE_KEY)
	return isLangSetting(saved) ? saved : 'system'
}

/**
 * The language the browser prefers, re-read whenever the browser's language
 * changes — so "follow system" reacts without a reload. `languagechange` does
 * not fire on this page in every browser, but the listener is cheap and the
 * `enabled` dependency re-resolves the language as soon as the setting flips
 * back to `system`.
 */
function useSystemLang(enabled: boolean): Lang {
	const [systemLang, setSystemLang] = useState<Lang>(browserLang)

	useEffect(() => {
		if (!enabled) return
		const onLanguageChange = () => setSystemLang(browserLang())
		onLanguageChange()
		window.addEventListener('languagechange', onLanguageChange)
		return () => window.removeEventListener('languagechange', onLanguageChange)
	}, [enabled])

	return systemLang
}

interface I18nProviderProps {
	children: ComponentChildren
}

export default function I18nProvider({ children }: I18nProviderProps) {
	const [langSetting, setLangSetting] = useState<LangSetting>(readLangSetting)
	const systemLang = useSystemLang(langSetting === 'system')
	const lang = langSetting === 'system' ? systemLang : langSetting

	useEffect(() => {
		document.documentElement.lang = lang
		document.title = translate(lang, 'app.title')
		safeSet(LANG_STORAGE_KEY, langSetting)
	}, [lang, langSetting])

	const i18n = useMemo<I18n>(
		() => ({
			lang,
			langSetting,
			t: (key, vars) => translate(lang, key, vars),
			setLangSetting,
		}),
		[lang, langSetting]
	)

	return <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>
}