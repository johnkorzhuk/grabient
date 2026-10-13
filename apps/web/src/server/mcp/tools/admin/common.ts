import { decodePalette } from "@grabient/engine/codec.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { drawnView, isSwatchStyle, STYLES, type Style } from "@grabient/engine/view.ts";
import { SITE_AGENT } from "../../admin/personas.ts";
import { CURATION_REASONS } from "../../admin/record.ts";
import {
  type CollectionItemInput,
  type CollectionRecord,
  checkTexts,
  collectionItem,
  PALETTE_EMBED_MAX,
  PALETTE_TITLE_MAX,
  type PaletteTextInput,
  paletteTextInput,
  popularSearches,
  REFUSED_TEXT
} from "../../site.ts";
import {
  entryOf,
  type Hints,
  items,
  limited,
  list,
  shape,
  type ToolContext,
  text,
  whole
} from "../../tool.ts";

/* What the admins' tools share. They run only for a call whose account is an admin and whose connection holds the
   admin scope (server.ts), and go through the functions the site's own admin pages use, so the same rules hold: a
   palette a person liked is never changed or deleted, a palette an admin took out never comes back, every curation is
   on the record, and every change is in k_contributions with the account and the app. */

/** The admin accounts, read through the partial index of migration 0039. Their likes together are the site's
    standard of taste, while each account's hearts stay its own. */
export const ADMINS = "(SELECT id FROM auth_user WHERE role = 'admin')";

/** Who a change is logged as. */
export const who = (c: ToolContext) => ({ userId: c.grant.userId, client: c.grant.clientName });
/** How a record row says it was made through a connected app. */
export const through = (c: ToolContext) => ({ via: "mcp", app: c.grant.clientName });
/** A curation's allowance: the account's hour, shared with the site's own admin pages. */
export const curation = (c: ToolContext) =>
  limited(c, [[`curation:${c.grant.userId}`, "curation"]]);
/** The rows a write carries, counted for the day across every admin's app. */
export const carried = (c: ToolContext, n: number) =>
  limited(c, [["mcp-admin-items", "mcpAdminItemsDay", Math.max(1, Math.floor(n))]]);

/** The seeds a list names, each a palette's, once. */
export const seedList = (value: unknown, max: number): string[] => [
  ...new Set(
    items(value, max)
      .map(raw => collectionItem(entryOf(raw))?.seed)
      .filter((seed): seed is string => Boolean(seed))
  )
];

/** A palette's colors as its view draws them: every band of a swatch view, and a gradient's stops up to 8; past 8, a
    gradient lists 7 of its own stops, evenly spaced, so an answer stays small and names only colors its CSS draws. */
export function hexes(
  seed: string,
  view: { style?: string; steps?: number; angle?: number } = {}
): string[] {
  const palette = decodePalette(seed);
  if (!palette) return [];
  const drawn = drawnView(palette, view as { style?: Style; steps?: number; angle?: number });
  const colors = sampleStops(palette, drawn.steps).map(stop => stop.hex);
  if (colors.length <= 8 || isSwatchStyle(drawn.style)) return colors;
  return Array.from({ length: 7 }, (_, i) => colors[Math.round((i * (colors.length - 1)) / 6)]!);
}

/* a palette and its view as the admins' tools take them */
export const SEED = text("A palette seed, as in its address: k and 8 to 49 more characters.");
export const VIEW = {
  style: text("A gradient or hard bands, linear, angular or radial; left out, linearGradient.", {
    enum: [...STYLES]
  }),
  steps: whole("How many colors are taken; left out, 7.", 3, 100),
  angle: whole("Degrees, 90 running left to right; left out, 90.", 0, 360)
};
export const PAGE = whole("Page, from 1.", 1, 10000);
export const WHY = {
  reasons: list(
    { type: "string", enum: CURATION_REASONS.map(reason => reason.key) },
    `What is wrong with it. ${CURATION_REASONS.map(reason => `${reason.key}: ${reason.hint}`).join(". ")}.`,
    0,
    CURATION_REASONS.length
  ),
  comment: text("Why, in a sentence.", { maxLength: 500 })
};
export const LOCKED =
  "A person liked this palette, so it stays as it is. Publish an improved palette beside it instead.";

/** A palette with the words written for it, as the publishing tools take them. */
export const TITLED = shape(
  {
    seed: SEED,
    ...VIEW,
    title: text(`The palette's title, up to ${PALETTE_TITLE_MAX} characters.`, {
      maxLength: PALETTE_TITLE_MAX
    }),
    description: text(`A description for its page, up to ${PALETTE_EMBED_MAX} characters.`, {
      maxLength: PALETTE_EMBED_MAX
    })
  },
  ["seed"]
);

/** The palettes sent with their titles: the texts whose words the palettes' colors bear out, and the rest, untitled,
    with the words that fail. The palettes go ahead either way. A sentence when an entry is not valid. */
export function titled(
  value: unknown,
  max: number
):
  | {
      palettes: CollectionItemInput[];
      texts: PaletteTextInput[];
      untitled: { seed: string; words: string[] }[];
    }
  | string {
  const given = items(value, max + 1);
  if (given.length > max) return `Send at most ${max} palettes.`;
  const palettes: CollectionItemInput[] = [];
  const texts: PaletteTextInput[] = [];
  for (const [i, raw] of given.entries()) {
    const entry = entryOf(raw);
    const item = collectionItem(entry);
    if (!item)
      return `Palette ${i + 1} is not valid: a seed, and any style, steps or angle given must be valid.`;
    if (palettes.some(held => held.seed === item.seed)) continue;
    palettes.push(item);
    if (entry?.title !== undefined) {
      const words = paletteTextInput({
        seed: item.seed,
        title: entry.title,
        embed: entry.description
      });
      if (!words) {
        return `Palette ${i + 1}: a title is 1 to ${PALETTE_TITLE_MAX} characters and a description up to ${PALETTE_EMBED_MAX}.`;
      }
      texts.push(words);
    }
  }
  const { held, refused } = checkTexts(texts);
  return { palettes, texts: held, untitled: refused };
}

/** What an answer says of the titles it did not write, when there are any. */
export const untitledOf = (untitled: readonly { seed: string; words: string[] }[]) =>
  untitled.length ? { untitled, untitledWhy: REFUSED_TEXT } : {};

/** One of Grabient's own collections. */
export const siteCollection = (record: CollectionRecord | null): record is CollectionRecord =>
  record?.owner.kind === "agent" && record.owner.id === SITE_AGENT;

/** The words of the tags under the search, which are Grabient's words to translate too. */
export const searchedWords = async (c: ToolContext) =>
  (await popularSearches(c.env, 48).catch(() => [])).map(tag => tag.query);

/* The hints of the tools that write: each may replace or take away what is there, and the same call again finds its
   work done. A change to the public site reaches everyone; the queue's plans, the personas and the reviews are the
   admins' own. */
export const CHANGES_SITE: Hints = {
  readOnly: false,
  destructive: true,
  idempotent: true,
  openWorld: true
};
export const CHANGES_RECORD: Hints = {
  readOnly: false,
  destructive: true,
  idempotent: true,
  openWorld: false
};
