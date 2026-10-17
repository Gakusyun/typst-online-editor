import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { LANGS, translate, type I18n, type Lang, type LangSetting } from './i18n'
import { I18nContext } from './useI18n'

const LANG_STORAGE_KEY = 'typst-lang'

function isLang(value: string | null): value is Lang {
	return value !== null && (LANGS as readonly string[]).includes(value)
}

function isLangSetting(value: string | null): value is LangSetting {
	return value === 'system' || isLang(value)
}

/** The browser language mapped onto a supported language. */
function browserLang(): Lang {
	const preferred = navigator.language.toLowerCase()
	return LANGS.find((lang) => preferred.startsWith(lang)) ?? 'en'
}

/** Saved choice wins; a fresh install follows the system language. */
function readLangSetting(): LangSetting {
	const saved = localStorage.getItem(LANG_STORAGE_KEY)
	return isLangSetting(saved) ? saved : 'system'
}

interface I18nProviderProps {
	children: ComponentChildren
}

export default function I18nProvider({ children }: I18nProviderProps) {
	const [langSetting, setLangSetting] = useState<LangSetting>(readLangSetting)
	const lang = langSetting === 'system' ? browserLang() : langSetting

	useEffect(() => {
		document.documentElement.lang = lang
		localStorage.setItem(LANG_STORAGE_KEY, langSetting)
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
