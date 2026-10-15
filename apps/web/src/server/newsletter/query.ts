import { DEFAULT_LOCALE, isLocale, type Locale } from "@grabient/i18n";

/* What a request for the published issues names, read alike by their answer (routes.ts) and by the edge cache's key,
   which reads it for every request and so never loads the issues to do it. */

/** The `before` a request names, or null for the newest page. */
export function beforeOf(params: URLSearchParams): number | null {
  const asked = params.get("before") ?? "";
  return /^[1-9]\d{0,5}$/.test(asked) ? Number(asked) : null;
}
/** The language a request names, English for anything else. */
export function languageOf(params: URLSearchParams): Locale {
  const asked = params.get("lang");
  return isLocale(asked) ? asked : DEFAULT_LOCALE;
}
/** The query `/api/newsletter` is kept at the edge by: its `before` and a language other than English, as read. */
export function issuesKey(params: URLSearchParams): URLSearchParams {
  const key = new URLSearchParams();
  const before = beforeOf(params);
  const locale = languageOf(params);
  if (before) key.set("before", String(before));
  if (locale !== DEFAULT_LOCALE) key.set("lang", locale);
  return key;
}
