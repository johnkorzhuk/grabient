import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, LOCALES, type Locale } from "./locales.ts";

/* Which of our languages a reader asked for: the language they chose in the menu (the cookie) wins over the browser's
   Accept-Language. Every Chinese is served Simplified Chinese and every Portuguese the Brazilian translation, the only
   ones Grabient speaks. */

const BY_PRIMARY = new Map<string, Locale>(LOCALES.filter(l => !l.includes("-")).map(l => [l, l]));
const ALIASES: Record<string, Locale> = { zh: "zh-Hans", pt: "pt-BR", in: "id" };

function matchLocale(tag: string): Locale | null {
  const primary = tag.trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  if (!primary || primary === "*") return null;
  return ALIASES[primary] ?? BY_PRIMARY.get(primary) ?? null;
}

/** The tags of an Accept-Language header by weight, ties in order, weight 0 left out, at most twelve. */
function acceptedTags(header: string): string[] {
  return header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map(p => /^\s*q=([0-9.]+)\s*$/i.exec(p)?.[1]).find(Boolean);
      return { tag: tag.trim(), q: q === undefined ? 1 : Math.min(1, Number(q) || 0), index };
    })
    .filter(entry => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map(entry => entry.tag)
    .slice(0, 12);
}

/** The first of the reader's languages we speak, English included, or null. */
export function negotiateLocale(header: string | null | undefined): Locale | null {
  for (const tag of acceptedTags(header ?? "")) {
    const locale = matchLocale(tag);
    if (locale) return locale;
  }
  return null;
}

/** The language the reader chose in the menu, from a Cookie header. The first cookie of that name decides. */
export function cookieLocale(cookieHeader: string | null | undefined): Locale | null {
  for (const part of (cookieHeader ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim() !== LOCALE_COOKIE) continue;
    try {
      const value = decodeURIComponent(part.slice(eq + 1).trim());
      return isLocale(value) ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** The language an unprefixed address should become for this reader, or null to stay in English. */
export function preferredLocale(headers: { get(name: string): string | null }): Locale | null {
  const chosen =
    cookieLocale(headers.get("Cookie")) ?? negotiateLocale(headers.get("Accept-Language"));
  return chosen === DEFAULT_LOCALE ? null : chosen;
}
