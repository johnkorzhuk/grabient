import type { EditRow, SiteItem, SiteRead, UseRow } from "../../palette-use/record.ts";

/* The visitors' signals: what people search for on the site and what they do with its palettes, made into what an
   admin acts on. Pure functions over the use and search records and a read of the site's public collections. What
   the signals say ranks below the admins' likes, notes and record, and never earns a like. */

export interface UseRecord {
  uses?: UseRow[];
  edits?: EditRow[];
  collectionViews?: { day: number; slug: string; count: number }[];
}
export interface SearchRecord {
  ranked?: { rank: number; words: string; score?: number }[];
  counted?: { page: string; words: string; count: number; used: number }[];
}

/** A collection title's form words: Rose gold gradients and Rose gold swatches are one title, rose-gold. */
const FORM_WORDS = /-(gradients?|swatches|colou?r-palettes?|palettes?|colou?rs?)$/;
export function stemOf(slug: string): string {
  let stem = slug;
  for (;;) {
    const next = stem.replace(FORM_WORDS, "");
    if (next === stem || !next) return stem;
    stem = next;
  }
}

const sum = <T>(
  rows: readonly T[],
  pick: (row: T) => unknown = row => (row as { count?: unknown }).count
) => rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);
function group<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = groups.get(k);
    if (list) list.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}
const round = (v: number, digits = 3): number => +Number(v).toFixed(digits);
const TAKE = new Set(["copy", "download"]);

/** A collection's palettes in the order its page shows them at rest: most liked first, ties in the collection's order. */
export const shownOrder = (collection: { items: SiteItem[] }): SiteItem[] =>
  collection.items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (b.item.likes ?? 0) - (a.item.likes ?? 0) || a.i - b.i)
    .map(({ item }) => item);

/** How much each place on a collection's page is used, from every collection's page together: the uses at a place
    over the collections long enough to have it, smoothed by one, as a share of the first place's. `without` leaves one
    collection's own uses out, so a palette's expected use never counts its own. */
export function positionWeights(
  uses: readonly UseRow[],
  sizes: ReadonlyMap<string, number>,
  without: string | null = null
): number[] {
  const onPage = uses.filter(
    r =>
      r.surface === "collection" &&
      r.collection &&
      r.collection !== without &&
      r.position >= 0 &&
      sizes.has(r.collection)
  );
  const used = [...new Set(onPage.map(r => r.collection))];
  const longest = Math.max(0, ...sizes.values());
  const counts: number[] = new Array(longest).fill(0);
  for (const r of onPage) if (r.position < longest) counts[r.position]! += Number(r.count) || 0;
  const raw = counts.map(
    (n, p) => (n + 1) / (used.filter(slug => (sizes.get(slug) ?? 0) > p).length + 1)
  );
  const top = raw[0] || 1;
  return raw.map(w => round(w / top));
}

export interface PaletteLift {
  seed: string;
  position: number;
  uses: number;
  expected: number;
  lift: number;
}

/** Each collection's page: its views, what was opened and taken there, and each palette's uses against what its place
    would earn from the other collections' pages. A lift above 1 is used more than its place explains. A palette passed
    over has `expected` of 3 or more and no use; one taken has a lift of 2 or more over 3 uses. */
export function collectionUse(record: UseRecord, site: SiteRead, { minUses = 10 } = {}) {
  const collections = site.collections;
  const sizes = new Map(collections.map(c => [c.slug, c.items.length]));
  const uses = record.uses ?? [];
  const weights = positionWeights(uses, sizes);
  const views = group(record.collectionViews ?? [], r => r.slug);
  const bySlug = group(
    uses.filter(r => r.collection),
    r => r.collection
  );
  const out = collections.map(c => {
    const rows = bySlug.get(c.slug) ?? [];
    const page = rows.filter(r => r.surface === "collection");
    const viewCount = sum(views.get(c.slug) ?? []);
    const used = sum(page);
    const opens = sum(page.filter(r => r.action === "open"));
    const takes = sum(page.filter(r => TAKE.has(r.action)));
    // the places weighed from the other collections' pages: this one's own uses would explain themselves
    const own = used ? positionWeights(uses, sizes, c.slug) : weights;
    const weight = (p: number) => own[p] ?? 1;
    const order = shownOrder(c);
    const total = order.reduce((t, _, p) => t + weight(p), 0) || 1;
    const bySeed = group(page, r => r.seed);
    const palettes: PaletteLift[] = order.map((item, p) => {
      const got = sum(bySeed.get(item.seed) ?? []);
      const expected = (used * weight(p)) / total;
      return {
        seed: item.seed,
        position: p,
        uses: got,
        expected: round(expected, 2),
        lift: round((got + 1) / (expected + 1), 2)
      };
    });
    const enough = used >= minUses;
    return {
      slug: c.slug,
      title: c.title,
      items: c.items.length,
      saves: c.saves ?? 0,
      views: viewCount,
      uses: used,
      opens,
      takes,
      previewUses: sum(rows.filter(r => r.surface !== "collection" && r.surface !== "editor")),
      editorTakes: sum(rows.filter(r => r.surface === "editor")),
      takeRate: viewCount ? round(takes / viewCount) : null,
      enough,
      passedOver: enough
        ? palettes.filter(x => x.expected >= 3 && x.uses === 0).map(x => x.seed)
        : [],
      taken: enough ? palettes.filter(x => x.lift >= 2 && x.uses >= 3).map(x => x.seed) : [],
      palettes
    };
  });
  return {
    weights,
    collections: out.sort(
      (a, b) => b.views - a.views || b.uses - a.uses || a.slug.localeCompare(b.slug)
    )
  };
}

/** The searches counted on the site with how often they went on to use a result, against the site's own rate: one
    made five times or more and used at under half that rate is answered badly. `covered` is whether a public
    collection has its words as its title (by stem). Apps' searches (`mcp`) and the collections page are left out. */
export function searchAnswers(
  record: SearchRecord,
  site: SiteRead,
  slugOf: (title: string) => string
) {
  const stems = new Set(site.collections.map(c => stemOf(c.slug)));
  const rows = (record.counted ?? []).filter(r => r.page !== "collections" && r.page !== "mcp");
  const rate = sum(rows) ? sum(rows, r => r.used) / sum(rows) : 0;
  const searches = [...group(rows, r => r.words)]
    .map(([words, list]) => {
      const count = sum(list);
      const used = sum(list, r => r.used);
      return {
        words,
        count,
        used,
        rate: count ? round(used / count) : 0,
        covered: stems.has(stemOf(slugOf(words))),
        weak: count >= 5 && used / count < rate / 2
      };
    })
    .sort((a, b) => b.count - a.count || a.words.localeCompare(b.words));
  return { rate: round(rate), searches };
}

type View = Pick<SiteItem, "style" | "steps" | "angle">;
const viewOf = (text: string): View => {
  const [style = "", steps, angle] = String(text).split(":");
  return { style, steps: Number(steps), angle: Number(angle) };
};

/** The views palettes were taken in against the view the site shows them in (the collection's item, else the
    gallery's): how often the style changed and to what, and whether the steps went up or down. */
export function viewsTaken(record: UseRecord, site: SiteRead) {
  const inCollection = new Map<string, View>();
  for (const c of site.collections)
    for (const item of c.items) inCollection.set(`${c.slug} ${item.seed}`, item);
  const inGallery = new Map<string, View>(site.gallery.map(g => [g.seed, g]));
  const styles = new Map<string, number>();
  const byCollection = new Map<string, { takes: number; styleChanged: number }>();
  let takes = 0;
  let styleChanged = 0;
  let stepsUp = 0;
  let stepsDown = 0;
  for (const r of (record.uses ?? []).filter(x => TAKE.has(x.action) && x.view)) {
    const shown =
      (r.collection && inCollection.get(`${r.collection} ${r.seed}`)) || inGallery.get(r.seed);
    if (!shown) continue;
    const took = viewOf(r.view);
    const n = Number(r.count) || 0;
    const changed = took.style !== shown.style;
    takes += n;
    if (changed) {
      styleChanged += n;
      const change = `${shown.style} → ${took.style}`;
      styles.set(change, (styles.get(change) ?? 0) + n);
    }
    if (took.steps > shown.steps) stepsUp += n;
    else if (took.steps < shown.steps) stepsDown += n;
    if (r.collection) {
      const c = byCollection.get(r.collection) ?? { takes: 0, styleChanged: 0 };
      c.takes += n;
      if (changed) c.styleChanged += n;
      byCollection.set(r.collection, c);
    }
  }
  return {
    takes,
    styleChanged,
    stepsUp,
    stepsDown,
    changes: [...styles].sort((a, b) => b[1] - a[1]).map(([change, count]) => ({ change, count })),
    collections: [...byCollection]
      .map(([slug, c]) => ({ slug, ...c }))
      .sort((a, b) => b.styleChanged - a.styleChanged || b.takes - a.takes)
  };
}

const EDIT_KEYS = ["anchors", "meanL", "rangeL", "meanC", "maxC", "hueSpan"] as const;
export type EditMean = { n: number } & Record<(typeof EDIT_KEYS)[number], number>;
const meanOf = (list: readonly EditRow[]): EditMean => {
  const n = sum(list, r => r.n);
  return {
    n,
    ...Object.fromEntries(EDIT_KEYS.map(k => [k, n ? round(sum(list, r => r[k] * r.n) / n) : 0]))
  } as EditMean;
};

/** The editor's changes before a palette was taken, averaged over every edit (weighted by how many each row holds)
    and per collection the palettes were opened from: the direction readers move the site's palettes. */
export function editSummary(record: UseRecord): {
  all: EditMean;
  collections: ({ slug: string } & EditMean)[];
} {
  const rows = record.edits ?? [];
  const collections = [
    ...group(
      rows.filter(r => r.collection),
      r => r.collection
    )
  ]
    .map(([slug, list]) => ({ slug, ...meanOf(list) }))
    .sort((a, b) => b.n - a.n);
  return { all: meanOf(rows), collections };
}

/** The totals: views, opens, copies and downloads; each format and each kind of page. */
export function useTotals(record: UseRecord) {
  const uses = record.uses ?? [];
  const by = (key: (r: UseRow) => string, rows: readonly UseRow[]): Record<string, number> =>
    Object.fromEntries(
      [...group(rows, key)]
        .map(([k, list]): [string, number] => [k, sum(list)])
        .sort((a, b) => b[1] - a[1])
    );
  return {
    views: sum(record.collectionViews ?? []),
    opens: sum(uses.filter(r => r.action === "open")),
    copies: sum(uses.filter(r => r.action === "copy")),
    downloads: sum(uses.filter(r => r.action === "download")),
    edits: sum(record.edits ?? [], r => r.n),
    formats: by(
      r => r.format,
      uses.filter(r => TAKE.has(r.action))
    ),
    surfaces: by(r => `${r.surface} ${r.action}`, uses)
  };
}
