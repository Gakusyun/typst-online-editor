import { MESSAGES, type MessageKey, type Messages } from './messages'

export type { MessageKey, Messages } from './messages'

/**
 * The i18n interface: everything the UI needs to render localized text.
 *
 * Usage in a component or hook:
 *
 * ```tsx
 * const { t, lang, setLang } = useI18n()
 * <button title={t('files.newFile')}>{t('files.newFile')}</button>
 * <p>{t('files.count', { count: 3 })}</p>
 * ```
 *
 * Adding a language = add a catalog to `./messages` and an entry to `LANGS`
 * and `LANG_LABELS` here. Nothing else changes: keys are checked against the
 * `en` base catalog at compile time.
 */

/** Languages the UI is available in. Order is the order in the switcher. */
export const LANGS = ['zh', 'en', 'de'] as const

export type Lang = (typeof LANGS)[number]

/** A language choice: a concrete language, or `system` to follow the browser. */
export type LangSetting = 'system' | Lang

/**
 * Endonyms (a language's name in that language) for the switcher — deliberately
 * not translated: a user who cannot read the current UI must still recognize
 * their own language.
 */
export const LANG_LABELS: Record<Lang, string> = {
	zh: '中文',
	en: 'English',
	de: 'Deutsch',
}

/** Where the language choice is persisted; `system` follows the browser. */
export const LANG_STORAGE_KEY = 'typst-lang'

/** The browser language mapped onto a supported language. */
export function browserLang(): Lang {
	const preferred = navigator.language.toLowerCase()
	return LANGS.find((lang) => preferred.startsWith(lang)) ?? 'en'
}

/** Values for the `{placeholder}` slots of a message. */
export type MessageVars = Record<string, string | number>

export interface I18n {
	/** Effective UI language messages render in — `langSetting` resolved to a language. */
	readonly lang: Lang

	/** The language choice made in Settings. */
	readonly langSetting: LangSetting

	/**
	 * Localized message for `key`, with `{placeholder}` slots filled from `vars`.
	 *
	 * When `vars.count` is a number, the plural form matching that count is used
	 * (`<key>_<plural category>`, e.g. `files.count_one`), falling back to `key`
	 * when the locale has no such variant.
	 */
	t(key: MessageKey, vars?: MessageVars): string

	/** Choose the language. Persisted; `system` follows the browser language. */
	setLangSetting(setting: LangSetting): void
}

const PLURAL_RULES: Record<Lang, Intl.PluralRules> = {
	zh: new Intl.PluralRules('zh'),
	en: new Intl.PluralRules('en'),
	de: new Intl.PluralRules('de'),
}

function pluralCategory(lang: Lang, count: number): string {
	return PLURAL_RULES[lang].select(count)
}

/** Resolve `key` in `lang`. See {@link I18n.t} for the plural rules. */
export function translate(lang: Lang, key: MessageKey, vars?: MessageVars): string {
	const catalog: Messages = MESSAGES[lang]
	const count = vars?.count
	const template =
		typeof count === 'number'
			? (catalog[`${key}_${pluralCategory(lang, count)}` as MessageKey] ?? catalog[key])
			: catalog[key]

	if (!vars) return template
	return template.replace(/\{(\w+)\}/g, (slot, name: string) =>
		name in vars ? String(vars[name]) : slot
	)
}
