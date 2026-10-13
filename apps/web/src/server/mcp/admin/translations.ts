import { DEFAULT_LOCALE, isLocale, type Locale } from "@grabient/i18n";

/* Stand-in for the MCP area's module of the same path, which reads Grabient's translated words (k_translations). Until
   it merges, every collection reads as written. */

type DB = { DB: D1Database | D1DatabaseSession };
export type TranslatedLocale = Exclude<Locale, "en">;
export const translatedLocale = (value: unknown): TranslatedLocale | null =>
  isLocale(value) && value !== DEFAULT_LOCALE ? (value as TranslatedLocale) : null;
export const askedLocale = (url: URL): TranslatedLocale | null =>
  translatedLocale(url.searchParams.get("lang"));
interface Collectionish {
  slug: string;
  title: string;
  description?: string;
  tags?: readonly string[];
  owner?: { kind: string };
}
export async function localizeCollections<T extends Collectionish>(
  _env: DB,
  _locale: TranslatedLocale | null,
  list: readonly T[]
): Promise<T[]> {
  return [...list];
}
export async function localizeDocument<T extends Collectionish>(
  _env: DB,
  _locale: TranslatedLocale | null,
  doc: T
): Promise<{ doc: T; languages: TranslatedLocale[] }> {
  return { doc, languages: [] };
}
export async function localizeTags<T extends { label: string; href: string; query?: string }>(
  _env: DB,
  _locale: TranslatedLocale | null,
  tags: readonly T[]
): Promise<T[]> {
  return [...tags];
}
