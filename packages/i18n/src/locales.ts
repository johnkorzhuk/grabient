/* The sixteen languages. English is the source and keeps the unprefixed addresses; every other language lives under its
   own first path segment (/ja/palettes). Adding one takes a row here, a flag the design system draws, its file in
   messages/ and a translation of every message (`pnpm i18n pending <tag>`). */

export const LOCALES = [
  "en",
  "ar",
  "de",
  "es",
  "fa",
  "fr",
  "id",
  "ja",
  "ko",
  "pt-BR",
  "ru",
  "th",
  "tr",
  "uk",
  "vi",
  "zh-Hans"
] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
/** Remembers a language the reader chose in the menu, so an unprefixed address is not negotiated again. */
export const LOCALE_COOKIE = "grabient-locale";

/** The countries whose flags stand beside the languages' names in the menus. */
export type FlagRegion =
  | "br"
  | "cn"
  | "de"
  | "eg"
  | "fr"
  | "id"
  | "ir"
  | "jp"
  | "kr"
  | "mx"
  | "ru"
  | "th"
  | "tr"
  | "ua"
  | "us"
  | "vn";

export interface LocaleInfo {
  /** BCP 47, as `<html lang>` and Intl read it */
  tag: Locale;
  /** the first segment of every address in this language; empty for English */
  segment: string;
  /** the language in its own words, as the menu lists it */
  name: string;
  english: string;
  dir: "ltr" | "rtl";
  /** the language alone where there is one variant, so every reader of it is served */
  hreflang: string;
  /** Open Graph's language_TERRITORY */
  og: string;
  flag: FlagRegion;
}

/* A language spoken in many countries takes the flag of the one its translation is written for, or else of the one most
   of its readers are in: English the United States (the copy is American), Spanish Mexico (neutral Latin American
   Spanish), Arabic Egypt (Modern Standard Arabic; a menu's mark never carries the shahada on Saudi Arabia's flag). */
const row = (
  tag: Locale,
  name: string,
  english: string,
  og: string,
  flag: FlagRegion,
  hreflang: string = tag
): LocaleInfo => ({
  tag,
  segment: tag === DEFAULT_LOCALE ? "" : tag.toLowerCase(),
  name,
  english,
  dir: tag === "ar" || tag === "fa" ? "rtl" : "ltr",
  hreflang,
  og,
  flag
});

export const LOCALE_INFO: Readonly<Record<Locale, LocaleInfo>> = {
  en: row("en", "English", "English", "en_US", "us"),
  ar: row("ar", "العربية", "Arabic", "ar_AR", "eg"),
  de: row("de", "Deutsch", "German", "de_DE", "de"),
  es: row("es", "Español", "Spanish", "es_ES", "mx"),
  fa: row("fa", "فارسی", "Persian", "fa_IR", "ir"),
  fr: row("fr", "Français", "French", "fr_FR", "fr"),
  id: row("id", "Bahasa Indonesia", "Indonesian", "id_ID", "id"),
  ja: row("ja", "日本語", "Japanese", "ja_JP", "jp"),
  ko: row("ko", "한국어", "Korean", "ko_KR", "kr"),
  "pt-BR": row("pt-BR", "Português", "Portuguese (Brazil)", "pt_BR", "br", "pt"),
  ru: row("ru", "Русский", "Russian", "ru_RU", "ru"),
  th: row("th", "ไทย", "Thai", "th_TH", "th"),
  tr: row("tr", "Türkçe", "Turkish", "tr_TR", "tr"),
  uk: row("uk", "Українська", "Ukrainian", "uk_UA", "ua"),
  vi: row("vi", "Tiếng Việt", "Vietnamese", "vi_VN", "vn"),
  "zh-Hans": row("zh-Hans", "简体中文", "Chinese (Simplified)", "zh_CN", "cn", "zh")
};

/** The menu's order: the Latin alphabets by name, then Cyrillic, the Arabic script, Thai and the CJK scripts. */
export const MENU_ORDER: readonly Locale[] = [
  "id",
  "de",
  "en",
  "es",
  "fr",
  "pt-BR",
  "vi",
  "tr",
  "ru",
  "uk",
  "ar",
  "fa",
  "th",
  "ja",
  "ko",
  "zh-Hans"
];

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

export const dirOf = (locale: Locale): "ltr" | "rtl" => LOCALE_INFO[locale].dir;

/** The prefixed languages' segments, which no collection's address may take. */
export const LOCALE_SEGMENTS: readonly string[] = LOCALES.map(l => LOCALE_INFO[l].segment).filter(
  Boolean
);
