import { decodePalette, encodePalette } from "@grabient/engine/codec.ts";
import { paletteTitle, readPalette } from "@grabient/engine/name.ts";
import { isStyle, STEPS_MAX, STEPS_MIN, STYLES, type Style } from "@grabient/engine/view.ts";
import { splitLocale } from "@grabient/i18n";
import { QUERY_MAX } from "@grabient/search/text.ts";
import { first } from "@grabient/server/db/d1.ts";
import { flagOff } from "@grabient/server/flags/flags.ts";
import { PALETTE_TITLE_MAX } from "../../../features/account/wire.ts";
import { itemKey } from "../../../features/collections/address.ts";
import {
  type CollectionItemInput,
  MAX_COLLECTION_ITEMS,
  MAX_OWN_COLLECTIONS,
  validateCollection
} from "../../../features/collections/schema.ts";
import type { CollectionSummary } from "../../../features/collections/types.ts";
import { SHEET_MAX } from "../../../mcp-view/tiles.ts";
import { heldWords, texts as paletteTexts } from "../../collections/files.ts";
import {
  collectionBySlug,
  collectionRecord,
  collectionsHoldingEach,
  ownedBy
} from "../../collections/read.ts";
import { ownerCollections, publicCollections } from "../../collections/search.ts";
import {
  addressAfter,
  collectionWriteLimits,
  createCollection,
  deleteCollection,
  ownCollectionCount,
  ownCollectionsFull,
  updateCollection
} from "../../collections/write.ts";
import { colorNames } from "../../files/names.ts";
import {
  likeLimits,
  likeTitle,
  markText,
  publishLimits,
  readMark,
  savedAfter,
  savedCount,
  setLike
} from "../../gallery/likes.ts";
import { galleryItems, listPalettes } from "../../gallery/list.ts";
import { countSearch } from "../../search/counts.ts";
import { searchableItems } from "../../search/items.ts";
import { type SearchResult, searchPalettes, unreadPalette } from "../../search/search.ts";
import { adjustPalette, readChange } from "../adjust.ts";
import { paletteNamed } from "../args.ts";
import {
  addressOf,
  card,
  colorsOf,
  fileOf,
  madeCard,
  type PaletteGiven,
  raised,
  type Shown,
  shown,
  type ViewGiven
} from "../cards.ts";
import { colorsToPalette, details, hexColor, paletteNotes, quoted } from "../colors.ts";
import {
  ALWAYS_LOAD,
  answer,
  day,
  flag,
  type Grant,
  limited,
  list,
  READS,
  refuse,
  shape,
  type Tool,
  type ToolContext,
  text,
  waitWords,
  whole,
  writeLimited
} from "../tool.ts";
import { viewData } from "../view.ts";

/* The tools every connection has: the public gallery read, palettes made, changed and shown, and the account's own
   saved palettes and private collections. Each call comes with its arguments read as the tool's schema says (args.ts),
   and works through the same functions and allowances as the site's pages. Nothing here names the admins' tools.

   Apps find a tool by its words (claude.ai drops the instructions and searches names and descriptions), so each
   description opens with the words people ask with and says what the tool does; the order of work is the
   instructions'. Claude asks again before a tool whose words changed: change them together. */

const place = (c: ToolContext, path: string) => `${c.origin}/${path}`;
const savedPage = (c: ToolContext) => place(c, "palettes/saved");
type PaletteText = Awaited<ReturnType<typeof paletteTexts>>[number];
/** What a palette is called: its written title where its colors bear it out and it is drawn as it was saved, or what
    its colors call it in its view. */
const titleOf = (s: Shown, written?: PaletteText) =>
  heldWords(written, s.palette, s)?.title ??
  paletteTitle(readPalette(s.palette, s.style, s.steps), s.style);
/** A palette a call named, in the view an answer draws it in. */
const drawn = (given: PaletteGiven, held?: ViewGiven): Shown =>
  shown(given.seed, decodePalette(given.seed)!, given, held);

/** Rows a list read, as its cards: each in the view it is kept in, under its title on Grabient. */
async function cardsOf<Row extends { kseed: string; style: string; steps: number; angle: number }>(
  c: ToolContext,
  rows: readonly Row[],
  more: (row: Row) => Record<string, unknown>
) {
  const written = new Map(
    (
      await paletteTexts(
        c.env,
        rows.map(row => row.kseed)
      )
    ).map(t => [t.seed, t])
  );
  return rows.flatMap(row => {
    const palette = decodePalette(row.kseed);
    if (!palette) return [];
    const s = shown(row.kseed, palette, {
      style: row.style as Style,
      steps: Number(row.steps),
      angle: Number(row.angle)
    });
    return [card(c.origin, s, titleOf(s, written.get(row.kseed)), more(row))];
  });
}

const summaryOf = (c: ToolContext, s: Omit<CollectionSummary, "preview">) => ({
  slug: s.slug,
  url: place(c, s.slug),
  title: s.title,
  description: s.description,
  tags: s.tags,
  palettes: s.itemCount,
  visibility: s.visibility,
  updatedAt: day(s.updatedAt)
});
/** A batch's answer: its palettes in the order asked, one that could not be made standing in its place as the reason.
    A batch none of whose palettes could be made is refused with every reason. */
const eachMade = (
  made: readonly unknown[],
  refused: readonly string[],
  more: Record<string, unknown> = {}
) =>
  refused.length && refused.length === made.length
    ? refuse(refused.join(" "))
    : answer({ ...more, palettes: made });
/** A write's palettes under `key`, each once, left out when there are none. */
const listedAs = (key: string, named: readonly string[]) =>
  named.length ? { [key]: [...new Set(named)] } : {};
/** An ordinary account's collections are private; an admin's own may be public, and a change then shows on the site. */
const ownMayBePublic = (grant: Grant | null) => grant?.role === "admin";
/** A collection's slug as a call names it: the slug, or its address on any origin and in any of the site's languages. */
const slugOf = (value: unknown): string => {
  const path = String(value ?? "")
    .replace(/[?#].*$/s, "")
    .replace(/^https?:\/\/[^/]*/i, "")
    .replace(/^\/+/, "");
  return splitLocale(`/${path}`)
    .path.replace(/^\/+|\/+$/g, "")
    .slice(0, 120);
};

const PLAINER = " The search reads common color, mood and theme words, hex codes and seeds.";
const WORDS = new Intl.ListFormat("en-US", { type: "conjunction" });
/** What a search says of words only the model read: it places any words near something, nonsense too. */
const guessed = (words: readonly string[], found: string) =>
  `The search does not know ${WORDS.format(words.map(word => `"${word}"`))}, so the search model read the query whole: these ${found} are its best guess and may not fit.`;
/** What a search has to say beside its palettes: what it could not leave out, words only the model read, a color
    nothing comes near, and why nothing answered, where an empty answer alone would read as "no such palettes". */
async function searchNote(c: ToolContext, result: SearchResult, total: number): Promise<string> {
  const said: string[] = [];
  if (result.read.excluded.length)
    said.push(
      `A search leaves nothing out: it looked for ${result.read.excluded.join(" and ")} too.`
    );
  if (result.tier === "model" && total && result.read.unread.length)
    said.push(guessed(result.read.unread, "palettes"));
  if (result.far) said.push(`No palette here comes close to ${result.far.join(" or ")}.`);
  if (!total) {
    if (result.tier === "unavailable")
      said.push("The search could not load its index just now. Try again shortly.");
    else if (result.limited) {
      said.push(
        `These words need the search model, which is at its limit for now. Try again in ${waitWords(result.retryAfter ?? 60)}.${PLAINER}`
      );
    } else if (result.tier === "account") {
      const reads = c.env.AI && !(await flagOff(c.env, "model-search"));
      said.push(
        `${reads ? "None of these words could be read." : "Reading new words with the search model is turned off."}${PLAINER}`
      );
    } else if (unreadPalette(result.query)) {
      said.push(
        `This is an old grabient.com palette that only its page can read: ${place(c, result.query)}.`
      );
    } else said.push("No public palette answers this query.");
  }
  return said.join(" ");
}

/* A palette is taken by its seed or its address, with any of its view. A view field left out is the one Grabient shows
   the palette in, and the answer names the view used. */
const PALETTE_SEED = text("A palette's seed, or its address, which carries its view.");
const VIEW_FIELDS = {
  style: text("A gradient or hard bands: linear, angular or radial.", { enum: [...STYLES] }),
  steps: whole("How many colors the view draws.", STEPS_MIN, STEPS_MAX),
  angle: whole("Degrees, 90 running left to right.", 0, 360)
};
const PAGE = whole("Page, from 1.", 1, 10000);
/** The orders a search with neither words nor colors lists the gallery in. */
const ORDERS = ["popular", "rising", "newest", "hot"] as const;
/** A palette and its view, as a tool's list holds one: `more` is what else the tool reads of it. */
const paletteItem = (more: Record<string, Record<string, unknown>> = {}) =>
  shape({ seed: PALETTE_SEED, ...VIEW_FIELDS, ...more }, ["seed"]);
const HEX = text("A hex color: #rrggbb or #rgb.");
const KEEPS_VIEW =
  "A palette named without a view keeps the one it has here, else the one Grabient shows it in.";
/** A number of a change, without a range here: adjust.ts reads it, and its refusals say what it means. */
const amount = (description: string) => ({ type: "number", description });
const VARIANT = shape({
  lighten: amount("-1 to 1: the share of the way to white, or below 0 to black."),
  chromaScale: amount("0 to 3, multiplying chroma: under 1 is calmer, over 1 more vivid."),
  hueShift: amount("Degrees every hue turns, -360 to 360."),
  warmth: amount("-1 (cooler) to 1 (warmer)."),
  reverse: flag("The opposite order."),
  colorCount: whole("Resamples the palette to this many colors.", 2, 8),
  hold: list(HEX, "Colors of the palette that stay as they are.", 1, 8)
});

export const accountTools: readonly Tool[] = [
  {
    name: "get_account",
    title: "Who is connected",
    hints: READS,
    description:
      "The Grabient account this connection keeps color palettes and collections in: its name and username. It also says how many palettes it has saved, how many collections it keeps, and where its Saved page is.",
    inputSchema: shape({}),
    async run(_args, c) {
      const [row, saved, collections] = await Promise.all([
        first<{ name: string | null; username: string | null }>(
          c.env.DB,
          "SELECT name, username FROM auth_user WHERE id = ?",
          c.grant.userId
        ),
        savedCount(c.env, c.grant.userId),
        ownCollectionCount(c.env, c.grant.userId)
      ]);
      return answer({
        name: row?.name?.trim() || null,
        username: row?.username ?? null,
        saved,
        collections,
        savedPage: savedPage(c),
        ...(c.admin ? { admin: true } : {})
      });
    }
  },
  {
    name: "search_palettes",
    title: "Search palettes",
    hints: READS,
    meta: ALWAYS_LOAD,
    description:
      "Search Grabient's gallery of color palettes and gradients by color, mood, theme or brand colors, or browse its popular, rising, newest and hot ones. `query` takes words in any language, hex codes, or a palette's seed or address for palettes like it. `colors` takes up to 5 hex colors the palettes come near. With neither, `order` lists the gallery. `read` gives the `words` understood and the ones `notRead`, and `page` reads on to `total`.",
    inputSchema: shape({
      query: text(
        `Up to ${QUERY_MAX} characters of words or hex codes, or a palette's seed or address.`,
        {
          maxLength: 400
        }
      ),
      colors: list(HEX, "Colors the palettes come near.", 1, 5),
      order: text(
        "The gallery's order without query or colors. Default popular, the most liked first; rising, what gained likes lately; hot, what was liked lately, and new.",
        { enum: [...ORDERS] }
      ),
      limit: whole("How many, default 12.", 1, 48),
      page: PAGE
    }),
    async run(args, c) {
      const typed = (args.query as string | undefined) ?? "";
      const asked = (args.colors as string[] | undefined) ?? [];
      const colors = asked.map(hexColor);
      const bad = colors.indexOf(null);
      if (bad >= 0)
        return refuse(
          `color ${bad + 1} is ${quoted(asked[bad])}, and a color is taken as hex: #rrggbb or #rgb.`
        );
      const limit = (args.limit as number | undefined) ?? 12;
      const order = args.order as (typeof ORDERS)[number] | undefined;
      if (!typed && !colors.length) {
        const gallery = await listPalettes(c.env, {
          sort: order ?? "popular",
          page: args.page as number | undefined,
          limit
        });
        return answer({
          order: order ?? "popular",
          total: gallery.total,
          page: gallery.page,
          limit: gallery.limit,
          palettes: await cardsOf(c, gallery.items, item => ({ likes: item.likes }))
        });
      }
      const page = (args.page as number | undefined) ?? 1;
      const before = (page - 1) * limit;
      const named = paletteNamed(typed);
      let result: SearchResult;
      /* a palette's address may be longer than words may be; the model reads new words within the account's own
         allowance; and a palette asked about is left out of its own answer */
      try {
        result = await searchPalettes(c.env, named?.seed ?? typed, {
          limit,
          offset: before,
          request: c.request,
          ctx: c.ctx,
          payer: { app: c.grant.userId },
          self: false,
          colors: colors.filter(color => color !== null)
        });
      } catch (error) {
        if (error instanceof RangeError)
          return refuse(`query is at most ${QUERY_MAX} characters of words or hex codes.`);
        throw error;
      }
      /* a person's words, counted once per account and words a day as the site counts its readers' searches; an
         admin's apps search for the site's own work, and a palette or colors are nobody's words */
      if (typed && page === 1 && c.grant.role !== "admin" && !named) {
        c.ctx.waitUntil(
          countSearch(c.env, "mcp", typed, `account:${c.grant.userId}`).catch(() => {})
        );
      }
      // the search counts by its snapshot until the site is asked: a page that came up short is where the answer ends
      const found = result.items.length;
      const total =
        found >= limit ? result.total : found ? before + found : Math.min(result.total, before);
      const { phrases, unread } = result.read;
      const note = [
        await searchNote(c, result, total),
        order
          ? "order lists the gallery when no query or colors are sent: a search's best come first."
          : ""
      ]
        .filter(Boolean)
        .join(" ");
      return answer({
        query: result.query,
        ...(phrases.length || unread.length
          ? { read: { words: phrases, ...(unread.length ? { notRead: unread } : {}) } }
          : {}),
        total,
        page,
        limit,
        palettes: await cardsOf(c, result.items, item => ({ likes: item.likes })),
        ...(note ? { note } : {})
      });
    }
  },
  {
    name: "search_collections",
    title: "Search collections",
    hints: READS,
    description: `Search Grabient's public collections of color palettes and gradients by theme or use, or list the most popular. Each is an ordered list of up to ${MAX_COLLECTION_ITEMS} palettes with a title, a description and tags. \`first\` is the addresses of its first six, each in its view there.`,
    inputSchema: shape({
      query: text("Words: a theme, a use or a brand; left out, the most popular.", {
        maxLength: 100
      }),
      page: PAGE,
      limit: whole("How many a page, default 12.", 1, 24)
    }),
    async run(args, c) {
      const query = (args.query as string | undefined) ?? "";
      /* the most saved first; words are read as a list's search reads them, the model within the account's own
         allowance; each collection's first palettes are read by position, since no card is drawn of them */
      const page = await publicCollections(
        c.env,
        {
          query,
          sort: "popular",
          page: args.page as number | undefined,
          limit: (args.limit as number | undefined) ?? 12
        },
        { model: !!query, request: c.request, ctx: c.ctx, who: c.grant.userId, previews: "first" }
      );
      return answer({
        total: page.total,
        page: page.page,
        limit: page.limit,
        collections: page.items.map(s => ({
          ...summaryOf(c, s),
          first: s.preview.flatMap(p =>
            decodePalette(p.seed) ? [addressOf(c.origin, drawn(p))] : []
          )
        })),
        ...(page.guessed && page.total ? { note: guessed(page.guessed, "collections") } : {})
      });
    }
  },
  {
    name: "get_collection",
    title: "Read a collection",
    hints: READS,
    description:
      "Read one collection of color palettes and gradients in order, each palette with its colors and view. A public collection or one of the account's own, by its slug or its address. `total` counts its palettes, which `page` reads on.",
    inputSchema: shape(
      {
        slug: text("The collection's slug or address."),
        page: PAGE,
        limit: whole("How many palettes a page, default 48.", 1, 48)
      },
      ["slug"]
    ),
    async run(args, c) {
      const slug = slugOf(args.slug);
      const record = slug ? await collectionRecord(c.env, slug) : null;
      const mine = !!record && ownedBy(record, { kind: "user", id: c.grant.userId });
      const doc = record && (await collectionBySlug(c.env, slug, mine));
      if (!doc) return refuse("No collection of yours and no public one has this address.");
      const page = (args.page as number | undefined) ?? 1;
      const limit = (args.limit as number | undefined) ?? 48;
      const { palettes: total, ...summary } = summaryOf(c, doc);
      return answer({
        ...summary,
        mine,
        total,
        page,
        limit,
        palettes: await cardsOf(c, doc.items.slice((page - 1) * limit, page * limit), item => ({
          likes: item.likes
        }))
      });
    }
  },
  {
    name: "compose_palette",
    title: "Make a palette",
    hints: READS,
    meta: ALWAYS_LOAD,
    description:
      "Make color palettes and CSS gradients from 2 to 8 hex colors each, such as brand colors, in order. Each comes with its seed, its address, its colors and the CSS that draws it as Grabient does in the view given: `colors` are the bands a Swatches view draws, else the colors a gradient blends between. Steps left out show every color. Nothing is saved. Each color is held as its hex.",
    inputSchema: shape(
      {
        palettes: list(
          shape({ colors: list(HEX, "Its colors, in order.", 2, 8), ...VIEW_FIELDS }, ["colors"]),
          "The palettes to make.",
          1,
          8
        )
      },
      ["palettes"]
    ),
    async run(args, c) {
      const made: unknown[] = [];
      const refused: string[] = [];
      for (const [i, one] of (args.palettes as (ViewGiven & { colors: string[] })[]).entries()) {
        const read = colorsToPalette(one.colors);
        if ("error" in read) {
          refused.push(`palette ${i + 1}: ${read.error}`);
          made.push({ error: refused.at(-1) });
          continue;
        }
        const s = shown(encodePalette(read.palette), read.palette, one);
        made.push(
          madeCard(c.origin, s, titleOf(s), [...read.notes, ...raised(s, one.steps)], {}, c.view)
        );
      }
      return eachMade(made, refused);
    }
  },
  {
    name: "adjust_palette",
    title: "Change a palette",
    hints: READS,
    description:
      "Change a color palette or gradient from its seed: lighter, darker, calmer, more vivid, warmer, cooler, reversed, or with fewer or more colors. Each of `variants` makes one new palette, its fields applied together, and `hold` keeps colors such as a brand color as they are. Nothing is saved. `from` is the palette asked about, and a `note` says what a change could not reach.",
    inputSchema: shape(
      {
        seed: PALETTE_SEED,
        ...VIEW_FIELDS,
        variants: list(VARIANT, "The palettes to make from it.", 1, 8)
      },
      ["seed", "variants"]
    ),
    async run(args, c) {
      const given = args as unknown as PaletteGiven & { variants: unknown[] };
      const [views, [written]] = await Promise.all([
        searchableItems(c.env, [given.seed]),
        paletteTexts(c.env, [given.seed])
      ]);
      const held = views.get(given.seed);
      const from = drawn(given, held);
      const made: unknown[] = [];
      const refused: string[] = [];
      for (const [i, variant] of given.variants.entries()) {
        const change = readChange(variant, from.palette);
        if ("error" in change) {
          refused.push(`variant ${i + 1}: ${change.error}`);
          made.push({ error: refused.at(-1) });
          continue;
        }
        const { palette, notes } = adjustPalette(from.palette, change);
        const resampled = palette.anchors.length !== from.palette.anchors.length;
        // a variant comes in the view its source is shown in; resampled to another number of colors, in its own steps
        const own = resampled ? { steps: undefined } : {};
        const s = shown(encodePalette(palette), palette, { ...given, ...own }, { ...held, ...own });
        const lines = [
          ...notes,
          ...paletteNotes(palette),
          ...raised(s, resampled ? undefined : given.steps)
        ];
        made.push(madeCard(c.origin, s, titleOf(s), lines, {}, c.view));
      }
      // the palette asked about goes by its title on Grabient, as every list and tile names it
      return eachMade(made, refused, { from: card(c.origin, from, titleOf(from, written)) });
    }
  },
  {
    name: "inspect_palettes",
    title: "Inspect palettes",
    hints: READS,
    description:
      "Read color palettes in full, up to 12: each color's hex, its name and its WCAG 2 contrast on white and on black, with the CSS. Each is read in the view given, else the one Grabient shows it in: the colors of a Swatches view are its bands, and of a gradient the ones it blends between. `gallery` is null for a palette the gallery lacks, and `collections` are the public ones that hold it.",
    inputSchema: shape(
      { palettes: list(paletteItem(), "The palettes, each in the view to read it in.", 1, 12) },
      ["palettes"]
    ),
    async run(args, c) {
      const given = args.palettes as PaletteGiven[];
      const seeds = [...new Set(given.map(one => one.seed))];
      const [views, gallery, texts, holding, names] = await Promise.all([
        searchableItems(c.env, seeds),
        galleryItems(c.env.DB, seeds),
        paletteTexts(c.env, seeds),
        collectionsHoldingEach(c.env, seeds, 6),
        colorNames(c.env)
      ]);
      const written = new Map(texts.map(t => [t.seed, t]));
      return answer({
        palettes: given.map(one => {
          const row = gallery.get(one.seed);
          const s = drawn(one, views.get(one.seed));
          return madeCard(
            c.origin,
            s,
            titleOf(s, written.get(s.seed)),
            [...paletteNotes(s.palette), ...raised(s, one.steps)],
            {
              details: details(colorsOf(s), names),
              gallery: row
                ? {
                    likes: row.likes,
                    style: row.style,
                    steps: row.steps,
                    angle: row.angle,
                    since: day(row.createdAt)
                  }
                : null,
              collections: (holding.get(s.seed) ?? []).map(held => held.slug)
            },
            c.view
          );
        })
      });
    }
  },
  {
    name: "show_palettes",
    title: "Show palettes",
    hints: READS,
    description: `Show color palettes and gradients side by side as numbered tiles, up to ${SHEET_MAX}, each in the view given, else the one Grabient shows it in. One palette may come in several views. An app that draws Grabient's view shows each with its colors, and copies its address, CSS, SVG or PNG in full screen; in any other, each tile has \`png\`, its picture's address. \`own\` marks a title given or written for the palette on Grabient; any other names its colors.`,
    inputSchema: shape(
      {
        palettes: list(
          paletteItem({ title: text("A name for its tile.", { maxLength: PALETTE_TITLE_MAX }) }),
          "The palettes, in tile order.",
          1,
          SHEET_MAX
        )
      },
      ["palettes"]
    ),
    async run(args, c) {
      const asked = args.palettes as (PaletteGiven & { title?: string })[];
      /* a tile the call gave no title takes a written one its colors bear out; a database that cannot answer leaves
         those and the held views out, never the answer */
      const [views, texts] = await Promise.all([
        searchableItems(
          c.env,
          asked.map(one => one.seed)
        ).catch(() => new Map<string, ViewGiven>()),
        paletteTexts(
          c.env,
          asked.filter(one => !one.title).map(one => one.seed)
        ).catch(() => [])
      ]);
      const written = new Map(texts.map(t => [t.seed, t]));
      /* one tile for each palette in a view, under the first title given for it: the view numbers them so before the
         answer comes, from the views the call names alone (mcp-view/tiles.ts) */
      const placed: { s: Shown; title: string | null }[] = [];
      const notes: string[] = [];
      for (const one of asked) {
        const s = drawn(one, views.get(one.seed));
        const title = likeTitle(one.title);
        const tile = placed.find(other => itemKey(other.s) === itemKey(s));
        if (tile) tile.title ??= title;
        else {
          placed.push({ s, title });
          notes.push(...raised(s, one.steps).map(said => `Tile ${placed.length}: ${said}`));
        }
      }
      const tiles = placed.map(({ s, title }, i) => {
        const own = title ?? heldWords(written.get(s.seed), s.palette, s)?.title;
        return {
          tile: i + 1,
          ...card(c.origin, s, own ?? titleOf(s)),
          ...(own ? { own: true } : {}),
          ...(c.view ? {} : { png: fileOf(c.origin, s, "png") })
        };
      });
      // the words stand alone where the view never draws; the view's data rides beside them
      return {
        ...answer({ tiles, ...(notes.length ? { note: notes.join(" ") } : {}) }),
        ...(c.view ? { _meta: viewData(c.origin, tiles) } : {})
      };
    }
  },
  {
    name: "list_saved_palettes",
    title: "Saved palettes",
    hints: READS,
    description:
      "The color palettes and gradients saved to the Grabient account, newest first, each in the view it was saved in. `total` counts them all, and `next` reads on from the last. `named` marks a title the account gave; any other is its title on Grabient. `savedPage` is the page that lists them.",
    inputSchema: shape({
      after: text("The `next` of the answer before, to read on from it."),
      limit: whole("How many a page, default 24.", 1, 48)
    }),
    async run(args, c) {
      const limit = (args.limit as number | undefined) ?? 24;
      const mark = args.after === undefined ? undefined : readMark(args.after);
      if (mark === null) return refuse("after is the `next` of an earlier answer.");
      // one more than the page, so the answer knows whether another follows
      const [total, rows] = await Promise.all([
        savedCount(c.env, c.grant.userId),
        savedAfter(c.env, c.grant.userId, limit + 1, mark)
      ]);
      const shownRows = rows.slice(0, limit);
      const last = rows.length > limit ? shownRows.at(-1) : undefined;
      // a title the account gave is marked, so a model never tells a person that a name Grabient made is theirs
      return answer({
        total,
        limit,
        savedPage: savedPage(c),
        palettes: await cardsOf(c, shownRows, row => ({
          ...(row.title ? { title: row.title, named: true } : {}),
          likes: Number(row.likes),
          savedAt: day(row.at)
        })),
        ...(last ? { next: markText({ at: Number(last.at), seed: last.kseed }) } : {})
      });
    }
  },
  {
    name: "save_palette",
    title: "Save a palette",
    // `saved` false takes a save away, a new title replaces the one it has, and a palette new to the site joins the
    // public gallery; the same call again finds it done
    hints: { readOnly: false, destructive: true, idempotent: true, openWorld: true },
    description:
      "Save a color palette or gradient to the Grabient account in the view given, else the one Grabient shows it in, or take it out with `saved` false. The first save of a palette new to Grabient adds it to the public gallery, where anyone can find it, without the account's name: `published` says so. A palette saved before keeps its first view. `title` is the account's own name for it, shown to nobody else.",
    inputSchema: shape(
      {
        seed: PALETTE_SEED,
        ...VIEW_FIELDS,
        title: text("The account's name for it. A new one renames it; left out, its name stays.", {
          maxLength: PALETTE_TITLE_MAX
        }),
        saved: flag("False takes it out of the saved palettes. Default true.")
      },
      ["seed"]
    ),
    async run(args, c) {
      const given = args as unknown as PaletteGiven & { title?: string; saved?: boolean };
      const saving = given.saved !== false;
      /* the account's own label for its own like: nobody else reads it, so its words are not held to the colors as the
         gallery's titles are. Only a save reads it, so a refused title never keeps a palette saved */
      const title = saving && given.title !== undefined ? likeTitle(given.title) : undefined;
      if (title === null) return refuse(`title is 1 to ${PALETTE_TITLE_MAX} characters.`);
      const stopped = await writeLimited(c, likeLimits(c.grant.userId, "mcp"));
      if (stopped) return stopped;
      // a palette a public collection holds joins the gallery in its view there, so no save redraws it for others
      const held = saving
        ? (await searchableItems(c.env, [given.seed])).get(given.seed)
        : undefined;
      const asked = drawn(given, held);
      const named = title ? { title } : {};
      // a palette new to the site joins the public gallery: an account's apps bring fifty a day, an admin's any number
      if (saving && !held && c.grant.role !== "admin") {
        const full = await limited(c, publishLimits(c.grant.userId));
        if (full) return full;
      }
      const done = await setLike(
        c.env,
        { id: c.grant.userId, role: c.grant.role },
        {
          seed: asked.seed,
          style: asked.style,
          steps: asked.steps,
          angle: asked.angle,
          liked: saving,
          via: "mcp",
          shown: held,
          ...named
        }
      );
      // the view the like is kept in, which for a palette saved before is its first
      const s = shown(asked.seed, asked.palette, {
        style: isStyle(done.style) ? done.style : asked.style,
        steps: done.steps ?? asked.steps,
        angle: done.angle ?? asked.angle
      });
      const moved = (["style", "steps", "angle"] as const).some(
        key => given[key] !== undefined && asked[key] !== s[key]
      );
      const note = saving
        ? moved && "It was saved before and keeps the view it was first saved in."
        : done.change === "removed" &&
          done.inGallery &&
          "It is out of the saved palettes and stays in the public gallery.";
      return answer({
        seed: s.seed,
        url: addressOf(c.origin, s),
        style: s.style,
        steps: s.steps,
        angle: s.angle,
        saved: done.liked,
        ...named,
        ...(done.likesCount === null ? {} : { likes: done.likesCount }),
        ...(done.joined && !held ? { published: true } : {}),
        ...(note ? { note } : {})
      });
    }
  },
  {
    name: "list_my_collections",
    title: "My collections",
    hints: READS,
    description: `The Grabient account's own collections of color palettes and gradients, latest change first, each with its \`visibility\`: only the account sees a private one, and everyone a public one. An account keeps up to ${MAX_OWN_COLLECTIONS}.`,
    inputSchema: shape({ page: PAGE, limit: whole("How many a page, default 12.", 1, 48) }),
    async run(args, c) {
      const page = await ownerCollections(
        c.env,
        { kind: "user", id: c.grant.userId },
        { page: args.page as number | undefined, limit: (args.limit as number | undefined) ?? 12 },
        { previews: false }
      );
      return answer({
        total: page.total,
        page: page.page,
        limit: page.limit,
        collections: page.items.map(s => summaryOf(c, s))
      });
    }
  },
  {
    name: "save_collection",
    title: "Make or change a collection",
    // with a slug it replaces what it is given; without one, every call makes another collection
    hints: { readOnly: false, destructive: true, idempotent: false, openWorld: ownMayBePublic },
    description: `Make a private collection of color palettes, such as a brand's colors or a theme's gradients, or change one of the account's own, which everyone sees at once when it is public. Without a slug it makes one from a title and 1 to ${MAX_COLLECTION_ITEMS} palettes. With a slug it changes that one: a field given replaces what is there, \`palettes\` replaces the whole list in order, \`remove\` takes palettes out and \`add\` puts palettes at the end.`,
    inputSchema: shape({
      slug: text("The collection to change, by its slug or address; left out, a new one is made."),
      title: text("1 to 80 characters.", { maxLength: 80 }),
      description: text("Up to 500 characters.", { maxLength: 500 }),
      tags: list(
        text("2 to 32 letters, digits, spaces or hyphens."),
        "Up to 12 tags, replacing the ones it has.",
        0,
        12
      ),
      palettes: list(
        paletteItem(),
        `The whole list, in order. ${KEEPS_VIEW}`,
        1,
        MAX_COLLECTION_ITEMS
      ),
      add: list(
        paletteItem(),
        `Palettes to add at the end. ${KEEPS_VIEW}`,
        1,
        MAX_COLLECTION_ITEMS
      ),
      remove: list(
        PALETTE_SEED,
        "Palettes to take out: a seed in every view it has here, an address in the view it names.",
        1,
        MAX_COLLECTION_ITEMS
      )
    }),
    async run(args, c) {
      const owner = { kind: "user" as const, id: c.grant.userId };
      const slug = slugOf(args.slug);
      const record = slug ? await collectionRecord(c.env, slug) : null;
      if (args.slug !== undefined && !(record && ownedBy(record, owner)))
        return refuse("No collection of yours has this address.");
      const before = record?.input.items ?? [];
      const has = (seed: string) => before.find(item => item.seed === seed);
      /* a palette named without a view keeps the one the collection holds it in; one new to it, the one Grabient
         shows it in */
      const sent = [args.palettes, args.add].flatMap(
        given => (given as PaletteGiven[] | undefined) ?? []
      );
      const views = await searchableItems(c.env, [
        ...new Set(sent.map(one => one.seed).filter(seed => !has(seed)))
      ]);
      const itemsOf = (given: unknown): CollectionItemInput[] | undefined =>
        (given as PaletteGiven[] | undefined)?.map(one => {
          const s = drawn(one, has(one.seed) ?? views.get(one.seed));
          return { seed: s.seed, style: s.style, steps: s.steps, angle: s.angle };
        });
      const listed = itemsOf(args.palettes);
      const added = itemsOf(args.add) ?? [];
      // a seed takes a palette out in every view it has here, an address in the view it names alone
      const remove = ((args.remove as string[] | undefined) ?? []).map(named => ({
        named,
        one: paletteNamed(named)
      }));
      const takes = (one: PaletteGiven | null, item: CollectionItemInput) =>
        !!one &&
        one.seed === item.seed &&
        (one.style === undefined || itemKey(drawn(one, item)) === itemKey(item));
      const from = listed ?? before;
      const notIn = remove.filter(({ one }) => !from.some(item => takes(one, item)));
      /* the list as given, or as it stands, less what is taken out, then what is added; a palette joins once in each
         view, and another view of one already here is an item of its own */
      const palettes: CollectionItemInput[] = [];
      for (const item of [
        ...from.filter(held => !remove.some(({ one }) => takes(one, held))),
        ...added
      ]) {
        if (!palettes.some(held => itemKey(held) === itemKey(item))) palettes.push(item);
      }
      if (record && !palettes.length)
        return refuse(
          "This would empty the collection, and a collection keeps at least one palette."
        );
      if (palettes.length > MAX_COLLECTION_ITEMS)
        return refuse(`A collection holds ${MAX_COLLECTION_ITEMS} palettes at most.`);
      const fields: Record<string, unknown> = { items: palettes };
      for (const key of ["title", "description", "tags"] as const)
        if (args[key] !== undefined) fields[key] = args[key];
      const valid = validateCollection(fields, record?.input);
      if (!valid.ok) return refuse(valid.error);
      // a full account is told so before its allowance is spent on a collection it cannot make
      if (!record && (await ownCollectionsFull(c.env, owner.id)))
        return refuse(
          `This account already keeps ${MAX_OWN_COLLECTIONS} collections. Delete one first.`
        );
      const stopped = await writeLimited(c, collectionWriteLimits(owner.id, "mcp"));
      if (stopped) return stopped;
      // who sees it stays as it is: making one public is the site's own form's, for an admin
      const input = {
        ...valid.input,
        visibility: record?.input.visibility ?? ("private" as const)
      };
      let at = record?.slug ?? "";
      if (!record) at = (await createCollection(c.env, owner, input)).slug;
      else {
        // a private one renamed moves to its new title's address under its owner; the write holds to the owner
        at = (await addressAfter(c.env, record, input)) ?? at;
        const moved = at === record.slug ? {} : { slug: at };
        if (!(await updateCollection(c.env, record.id, input, { ...moved, owner })))
          return refuse("No collection of yours has this address.");
      }
      /* the answer is what the call changed, never the whole collection: each palette in a view by its address, which
         `remove` reads back as that view alone, so two views of one palette are two of them */
      const had = new Set(before.map(itemKey));
      const holds = new Set(input.items.map(itemKey));
      const addresses = (items: readonly CollectionItemInput[]) =>
        items.map(item => addressOf(c.origin, drawn(item)));
      const here = (given: readonly CollectionItemInput[] = []) =>
        addresses(given.filter(item => had.has(itemKey(item)) && holds.has(itemKey(item))));
      return answer({
        slug: at,
        url: place(c, at),
        title: input.title,
        visibility: input.visibility,
        palettes: input.items.length,
        ...(record && at !== record.slug ? { movedFrom: record.slug } : {}),
        ...(args.tags === undefined ? {} : { tags: input.tags }),
        ...listedAs("added", addresses(input.items.filter(item => !had.has(itemKey(item))))),
        ...listedAs("alreadyIn", here(added)),
        ...listedAs("kept", here(listed)),
        ...listedAs("removed", addresses(before.filter(item => !holds.has(itemKey(item))))),
        ...listedAs(
          "notIn",
          notIn.map(({ named }) => named)
        )
      });
    }
  },
  {
    name: "delete_collection",
    title: "Delete a collection",
    hints: { readOnly: false, destructive: true, idempotent: true, openWorld: ownMayBePublic },
    description:
      "Delete one of the Grabient account's own collections of color palettes, a public one from the site too. Its palettes stay wherever else they are. This cannot be undone.",
    inputSchema: shape({ slug: text("The collection's slug or address.") }, ["slug"]),
    async run(args, c) {
      const slug = slugOf(args.slug);
      const record = slug ? await collectionRecord(c.env, slug) : null;
      if (!record || !ownedBy(record, { kind: "user", id: c.grant.userId }))
        return refuse("No collection of yours has this address.");
      const stopped = await writeLimited(c, collectionWriteLimits(c.grant.userId, "mcp"));
      if (stopped) return stopped;
      // held to the account's own in the write itself, whatever its role
      if (!(await deleteCollection(c.env, record.id, c.grant.userId, { own: true })))
        return refuse("The collection could not be deleted.");
      return answer({ deleted: record.slug });
    }
  }
];
