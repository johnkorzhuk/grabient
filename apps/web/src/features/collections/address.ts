import { decodePalette } from "@grabient/engine";
import { LOCALE_SEGMENTS } from "@grabient/i18n";

/* Where a collection lives, as the server, the pages and the account's copy all write it. A public collection is its
   title's slug at the top level (/ocean-depths); a private one lives under its owner (/@ada/warm-sunsets), so it never
   takes a word someone else would type there. Pure, so every side computes the same address. */

/** The two orders of a collection's palettes: the most liked first, or the rising first. */
export type PaletteOrder = "popular" | "rising";

export const SLUG_MAX = 80;
const SLUG = /^(?:@[a-z0-9_-]{3,30}\/)?[a-z0-9]+(?:-[a-z0-9]+)*$/;
/* The site's own top-level pages and files, the language segments, and the words the lists once took: no collection may
   stand where one of them does. */
const RESERVED = new Set([
  "mine",
  "popular",
  "new",
  "suggest",
  "newest",
  "oldest",
  "saved",
  "collections",
  "palettes",
  "search",
  "login",
  "connect",
  "oauth",
  "settings",
  "unsubscribe",
  "newsletter",
  "bindings",
  "mcp-server",
  "about",
  "privacy",
  "terms",
  "contact",
  "random",
  "api",
  "assets",
  "fonts",
  "e",
  "mcp",
  "edit",
  "import",
  "sitemap",
  "robots",
  "llms",
  "og",
  "i18n",
  "cdn-cgi",
  "en",
  ...LOCALE_SEGMENTS
]);
const SEED = /^k[A-Za-z0-9_-]{8,49}$/;

/** A collection's address: lowercase words and digits joined by single hyphens, its owner's handle in front for one that
    lives under an account; never a reserved name, and never a palette's seed, whose address is the editor's. */
export const isCollectionSlug = (slug: string): boolean =>
  slug.length <= SLUG_MAX &&
  !RESERVED.has(slug) &&
  SLUG.test(slug) &&
  !(SEED.test(slug) && decodePalette(slug));

/** A title's address: its letters without their accents, lowercase, every other run a hyphen, 56 characters at most. A
    title with nothing to keep is `collection`. */
export function slugifyTitle(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56)
    .replace(/-+$/, "");
  return base || "collection";
}

/** The handle an account's private collections live under: its username, or for an account without one an underscore
    and the first ten letters and digits of its id. Only the owner sees it; who may read is decided by the id. */
export const accountHandle = (account: { id: string; username?: string | null }): string =>
  account.username?.trim()
    ? account.username.trim().toLowerCase()
    : `_${account.id
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 10)}`;

/* the title's address under the handle, cut so the address and a number after it stay within SLUG_MAX */
const privateBase = (title: string, handle: string) =>
  `@${handle}/${
    slugifyTitle(title)
      .slice(0, SLUG_MAX - handle.length - 6)
      .replace(/-+$/, "") || "collection"
  }`;

/** The first private address of this title under the handle that `taken` does not hold: the title's own, then -2, -3. */
export function privateSlug(
  title: string,
  handle: string,
  taken: (slug: string) => boolean
): string {
  const base = privateBase(title, handle);
  if (!taken(base)) return base;
  for (let n = 2; ; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`;
}

/** Whether an address is one of this title's private addresses under the handle. */
export function isPrivateSlug(slug: string, title: string, handle: string): boolean {
  const base = privateBase(title, handle);
  return (
    slug === base ||
    (slug.startsWith(`${base}-`) && /^[1-9]\d{0,3}$/.test(slug.slice(base.length + 1)))
  );
}

/** Where a collection lives, in one of its orders. */
export const collectionHref = (slug: string, order: PaletteOrder = "popular"): string =>
  `/${slug}${order === "rising" ? "/rising" : ""}`;

/** The words an address says, for the palette search it leads to when no collection lives there. */
export const slugWords = (slug: string): string => slug.replace(/^@[^/]+\//, "").replace(/-/g, " ");

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** A typed address (a path without the language, one segment or an account's two, maybe `/rising` after) as the
    collection address it means: words joined by hyphens in lowercase, a handle's underscores kept. Null when it can be no
    collection's address. An address that is a slug as it stands is that slug, so a collection titled Rising keeps it. */
export function typedCollection(path: string): { slug: string; order: PaletteOrder } | null {
  const raw = safeDecode(path.slice(1));
  if (!raw || raw.length > SLUG_MAX + 40) return null;
  const join = (words: string) =>
    words
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "");
  const slash = raw.startsWith("@") ? raw.indexOf("/") : -1;
  const whole =
    slash > 0 ? raw.slice(0, slash + 1).toLowerCase() + join(raw.slice(slash + 1)) : join(raw);
  const rising = !isCollectionSlug(whole) && whole.endsWith("/rising");
  const slug = rising ? whole.slice(0, -"/rising".length) : whole;
  return isCollectionSlug(slug) ? { slug, order: rising ? "rising" : "popular" } : null;
}

/** A collection's palettes in one of its orders: the most liked first, or the rising first and then the newest, the
    collection's own order settling a tie. The server, the page and a list's preview sort alike, so a collection opened
    from a list keeps the cards the list showed. */
export function sortCollectionItems<
  T extends { likes?: number; createdAt?: number; rising?: number; position: number }
>(items: readonly T[], order: PaletteOrder = "popular"): T[] {
  return [...items].sort(
    (a, b) =>
      (order === "rising"
        ? (b.rising ?? 0) - (a.rising ?? 0) || (b.createdAt ?? 0) - (a.createdAt ?? 0)
        : (b.likes ?? 0) - (a.likes ?? 0)) || a.position - b.position
  );
}

/** A palette as a collection holds it: its seed in one view. Two views of a palette are two items; the same view twice
    is one. The server's queries write the same text from a row. */
export const itemKey = (item: { seed: string; style: string; steps: number; angle: number }) =>
  `${item.seed} ${item.style} ${item.steps} ${item.angle}`;
