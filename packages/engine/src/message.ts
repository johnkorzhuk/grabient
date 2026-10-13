/* The engine says names and labels in English, as messages: the English text is the key the i18n catalogs translate.
   A caller that shows words to a reader passes its own `t` and locale; files for programs keep the English. */

export type Params = Readonly<Record<string, string | number>>;
export type Translate = (message: string, params?: Params) => string;
/** How words are said: the translation of a message and the locale that capitalizes a sentence. */
export interface Language {
  t: Translate;
  locale: string;
}

/** Names an English message where it is defined, so the extractor finds it; it is translated where it is said. */
export const msg = (message: string) => message;

/* Plurals in English need only `one` and `other`; `#` is the count. */
const PLACE = /\{(\w+), plural, one \{([^}]*)\} other \{([^}]*)\}\}|\{(\w+)\}/g;
const english: Translate = (message, params = {}) =>
  message.replace(PLACE, (_, count, one, other, name) =>
    count
      ? (params[count] === 1 ? one : other).replace("#", String(params[count]))
      : String(params[name] ?? "")
  );

export const ENGLISH: Language = { t: english, locale: "en" };

/** A phrase as a title starts it. */
export const sentence = (text: string, locale = "en") =>
  text ? text[0].toLocaleUpperCase(locale) + text.slice(1) : text;
