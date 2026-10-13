import {
  formatMessage,
  formatRich,
  intlTag,
  numberFormat,
  type Params,
  type RichTags
} from "./format.ts";
import { DEFAULT_LOCALE, dirOf, type Locale } from "./locales.ts";
import { contextKey, messageKey } from "./message-key.ts";
import { localizePath } from "./path.ts";

/* The reader's language, the catalogs and t(). A message's English is its key, so a changed sentence never shows a
   stale translation: until it is translated again the reader sees the new English. The app says once, at startup,
   where the language comes from: the request on the server, so concurrent requests never share one, and the document
   in the browser, which never changes language without a load. The Worker holds every catalog and parses one when a
   request first needs it; the browser fetches only its own before the app starts. */

/** A language's translations, keyed by messageKey(English). */
export type Catalog = Readonly<Record<string, string>>;

const catalogs = new Map<Locale, Catalog>();
const loaders = new Map<Locale, () => Catalog>();
let current: () => Locale = () => DEFAULT_LOCALE;

/** Where the reader's language comes from. */
export function setLocaleSource(source: () => Locale): void {
  current = source;
}

export function addCatalog(locale: Locale, catalog: Catalog): void {
  catalogs.set(locale, catalog);
  loaders.delete(locale);
}

/** A catalog read the first time something asks for its language. */
export function addCatalogLoader(locale: Locale, load: () => Catalog): void {
  if (!catalogs.has(locale)) loaders.set(locale, load);
}

function catalogOf(locale: Locale): Catalog | undefined {
  const load = loaders.get(locale);
  if (load) addCatalog(locale, load());
  return catalogs.get(locale);
}

/** The language this request or this page is in. */
export const locale = (): Locale => current();
export const dir = (): "ltr" | "rtl" => dirOf(current());

/** Runs `write` in another language: a file for programs is English whoever's page it is made on. `write` must not
    wait, or another request could read that language. */
export function inLocale<T>(locale: Locale, write: () => T): T {
  const was = current;
  current = () => locale;
  try {
    return write();
  } finally {
    current = was;
  }
}

/** A link as a page draws it: a page's address in the reader's language, anything else as it is. */
export const localHref = <T extends string | undefined>(href: T): T =>
  (href === undefined ? href : localizePath(href, current())) as T;

const contextOf = (params?: Params) =>
  typeof params?.$context === "string" ? params.$context : undefined;

function translation(message: string, locale: Locale, params?: Params): [string, Locale] {
  if (locale !== DEFAULT_LOCALE) {
    const text = catalogOf(locale)?.[messageKey(contextKey(message, contextOf(params)))];
    if (text !== undefined) return [text, locale];
  }
  // an untranslated message is English and formatted as English, so a count still says "1 palette"
  return [message, DEFAULT_LOCALE];
}

/** The message in the reader's language with its values in: `t("Copy link")`,
    `t("{count, plural, one {# palette} other {# palettes}}", { count })`. A context picks one of two translations
    of the same English: `t("Saved", { $context: "order" })`. */
export function t(message: string, params?: Params): string {
  const [text, as] = translation(message, current(), params);
  return formatMessage(text, params, as);
}

/** The message in a named language: an email, or the language menu's own entries. */
export function translate(locale: Locale, message: string, params?: Params): string {
  const [text, as] = translation(message, locale, params);
  return formatMessage(text, params, as);
}

/** Names a message where no reader is yet (a module's constant, a server's error) for t() to translate later. The
    extractor finds it by this name; a context is the second argument. */
export const msg = (message: string, _context?: string): string => message;

/** A message with parts the page draws: `rich("Read the <link>terms</link>.", { link: words => <a>{words}</a> })`.
    The translator moves the tags with the words. */
export function rich<T>(message: string, tags: RichTags<T>, params?: Params): (string | T)[] {
  const [text, as] = translation(message, current(), params);
  return formatRich(text, params, as, tags);
}

export const formatNumber = (value: number, options?: Intl.NumberFormatOptions): string =>
  numberFormat(current(), options).format(value);

const dateFormats = new Map<string, Intl.DateTimeFormat>();
export function formatDate(
  value: Date | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }
): string {
  const locale = current();
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(intlTag(locale), options);
    dateFormats.set(key, format);
  }
  return format.format(value);
}
