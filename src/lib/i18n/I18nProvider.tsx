import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { LANGS, translate, type I18n, type Lang } from './i18n'
import { I18nContext } from './useI18n'

const LANG_STORAGE_KEY = 'typst-lang'

function isLang(value: string | null): value is Lang {
	return value !== null && (LANGS as readonly string[]).includes(value)
}

/** Saved choice wins, then the browser language, then English. */
function detectLang(): Lang {
	const saved = localStorage.getItem(LANG_STORAGE_KEY)
	if (isLang(saved)) return saved
	const preferred = navigator.language.toLowerCase()
	return LANGS.find((lang) => preferred.startsWith(lang)) ?? 'en'
}

interface I18nProviderProps {
	children: ComponentChildren
}

export default function I18nProvider({ children }: I18nProviderProps) {
	const [lang, setLang] = useState<Lang>(detectLang)

	useEffect(() => {
		document.documentElement.lang = lang
		localStorage.setItem(LANG_STORAGE_KEY, lang)
	}, [lang])

	const i18n = useMemo<I18n>(
		() => ({
			lang,
			t: (key, vars) => translate(lang, key, vars),
			setLang,
		}),
		[lang]
	)

	return <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>
}
