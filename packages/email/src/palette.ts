/* A palette in an email, in its view as the site shows it. Its picture is the site's own drawing (`/{seed}.png`): mail
   apps draw too little CSS to do without it. Under the picture the same view is written in CSS, which is what a reader
   sees while the picture loads, and the palette's middle color where gradients are not drawn.

   The site draws and keeps each spelling of a picture's address on its own, so an address is written one way, every
   setting in one order, at one of three sizes, none with more pixels than a share card.

   A newsletter draws only what its admins liked, each palette in the view it was liked in: every part here asks the
   email's gate before it draws. */
import { decodePalette, type Palette, sampleStops } from "@grabient/engine";
import { gradientCss } from "@grabient/engine/css.ts";
import {
  DEFAULT_ANGLE,
  DEFAULT_STEPS,
  DEFAULT_STYLE,
  isSwatchStyle,
  STEPS_MAX,
  STEPS_MIN,
  STYLES,
  type Style,
  viewSearch
} from "@grabient/engine/view.ts";
import { localizePath } from "@grabient/i18n";
import { type Child, type Html, h, table, tr } from "./html.ts";
import {
  address,
  BLANK,
  type Ctx,
  FULL,
  face,
  L,
  named,
  type Part,
  pictureLink,
  px,
  type Rendered,
  stack,
  text,
  type View
} from "./parts.ts";
import {
  FONT,
  type HeadSize,
  onColor,
  type PictureSize,
  RADIUS,
  SIZE,
  SPACE,
  TYPE
} from "./theme.ts";

export type { Style };
/** A palette in a view: what a like records. A setting left out is the site's default. */
export interface PaletteView {
  seed: string;
  style?: Style;
  steps?: number;
  angle?: number;
}
/** The site's default view. */
export const VIEW = { style: DEFAULT_STYLE, steps: DEFAULT_STEPS, angle: DEFAULT_ANGLE } as const;

/** A palette made whole: its view as the site reads it, and its colors, one to a step. */
export interface Shown {
  seed: string;
  palette: Palette;
  view: { style: Style; steps: number; angle: number };
  colors: string[];
}

function whole(value: number | undefined, low: number, high: number, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < low || value > high) {
    throw new Error(`A view's steps and angle are whole numbers the site takes, not ${value}`);
  }
  return value;
}
/** A palette's view as the site makes it whole: a setting left out is the default, and its steps are never fewer than
    three or its keyframes. Throws on a seed or a setting the site would not read. */
export function shown(of: PaletteView): Shown {
  const palette = decodePalette(of.seed);
  if (!palette)
    throw new Error(`Not a palette seed: ${JSON.stringify(String(of.seed).slice(0, 40))}`);
  if (of.style !== undefined && !STYLES.includes(of.style)) {
    throw new Error(`Not one of the site's styles: ${JSON.stringify(of.style)}`);
  }
  const steps = Math.max(
    whole(of.steps, 1, STEPS_MAX, DEFAULT_STEPS),
    STEPS_MIN,
    palette.anchors.length
  );
  const view = {
    style: of.style ?? DEFAULT_STYLE,
    steps,
    angle: whole(of.angle, 0, 360, DEFAULT_ANGLE)
  };
  return { seed: of.seed, palette, view, colors: hexes(palette, steps) };
}
export const hexes = (palette: Palette, n: number): string[] =>
  sampleStops(palette, n).map(stop => stop.hex);
/** A palette's colors, one to a keyframe: what its chips name. */
const keyframes = (palette: Palette): string[] => hexes(palette, palette.anchors.length);

/* A radial picture is the same at every angle: its address and its place among the likes say the default. */
const drawnAngle = (view: View): number =>
  view.style.startsWith("radial") ? DEFAULT_ANGLE : view.angle;
const settings = (view: View) =>
  `style=${view.style}&steps=${view.steps}&angle=${drawnAngle(view)}`;

/** A palette's picture: every setting, in this order, defaults too. */
export const pictureAddress = (
  origin: string,
  of: PaletteView,
  size: PictureSize = "card"
): string => pictureOf(origin, shown(of), size);
const pictureOf = (origin: string, { seed, view }: Shown, size: PictureSize) =>
  `${origin}/${seed}.png?${settings(view)}&w=${SIZE.pictures[size][0]}&h=${SIZE.pictures[size][1]}`;
/** An email's head: the share card without its chips at the head's size, settings in a picture's order. */
export const headAddress = (origin: string, of: PaletteView, size: HeadSize): string =>
  headOf(origin, shown(of), size);
export const headOf = (origin: string, { seed, view }: Shown, size: HeadSize) =>
  `${origin}/api/og?seed=${seed}&${settings(view)}&head=${SIZE.heads[size].join("x")}`;
/** A palette's page in a view and the reader's language, a default setting left out, as the site writes it. */
export const pageAddress = (ctx: Pick<Ctx, "origin" | "locale">, { seed, view }: Shown): string =>
  ctx.origin + localizePath(`/${seed}${viewSearch(view)}`, ctx.locale);

const likeKey = (seed: string, view: View) =>
  `${seed} ${view.style} ${view.steps} ${drawnAngle(view)}`;
/** What an issue may draw, from its admins' likes: each palette in the view it was liked in. A like whose seed no longer
    decodes lets nothing through. */
export function likedGate(liked: readonly PaletteView[]): NonNullable<Ctx["gate"]> {
  const held = new Set<string>();
  for (const like of liked) {
    try {
      const { seed, view } = shown(like);
      held.add(likeKey(seed, view));
    } catch {
      // a like the codec no longer reads
    }
  }
  return (seed, view) => {
    if (!held.has(likeKey(seed, view))) {
      throw new Error(
        `An issue draws only palettes an admin liked, each in the view it was liked in. Not among them: ${seed} as ${view.style}, ${view.steps} steps, angle ${view.angle}`
      );
    }
  };
}

/** What a collection's card may draw: palettes an admin liked, in any view, since the card draws them as rings and
    blends of its own design. */
export function likedSeedGate(liked: readonly PaletteView[]): NonNullable<Ctx["gateSeed"]> {
  const held = new Set<string>();
  for (const like of liked) {
    try {
      held.add(shown(like).seed);
    } catch {
      // a like the codec no longer reads
    }
  }
  return seed => {
    if (!held.has(seed))
      throw new Error(`An issue draws only palettes an admin liked. Not among them: ${seed}`);
  };
}
/** The view written in CSS under a picture, over its middle color: the shorthand alone, since Gmail on Android rewrites
    a gradient written as background-image, or beside one, into nothing it can draw. */
export const viewGround = (show: Shown, more: Record<string, string> = {}) => ({
  bgcolor: show.colors[show.colors.length >> 1],
  style: {
    background: gradientCss(show.colors, show.view.style, show.view.angle),
    ...more,
    ...BLANK
  }
});

/* A picture's round corners are cut by what holds it, never drawn on a cell: a cell with a round corner is painted
   with soft edges, and on a screen whose pixels are no whole multiple of the email's a seam shows beside it. */
const rounded = (...rows: Child[]): Html =>
  h("div", { style: { "border-radius": px(RADIUS.surface), overflow: "hidden" } }, rows);

/** On a page the browser draws the view itself: a block of the picture's shape stands where it would be. */
export const shaped = (size: readonly number[], attrs: Record<string, string> = {}): Html =>
  h("span", { ...attrs, style: { display: "block", "aspect-ratio": `${size[0]} / ${size[1]}` } });

/* The picture over its view in CSS. Its own size is in its attributes, so an app that has not loaded it keeps its place
   and shows the CSS. With pictures off, its name stands in words on the palette's colors. */
function picture(
  ctx: Ctx,
  show: Shown,
  size: PictureSize,
  width: number,
  to: { href: string; name?: string }
): Html {
  ctx.gate?.(show.seed, show.view);
  const [w, tall] = SIZE.pictures[size];
  const ground = viewGround(show);
  const drawn = ctx.web
    ? shaped(SIZE.pictures[size])
    : h("img", {
        src: pictureOf(ctx.origin, show, size),
        alt: to.name ?? "",
        width,
        height: Math.round((width * tall) / w),
        style: {
          display: "block",
          width: "100%",
          height: "auto",
          border: "0",
          ...face(ctx, "small"),
          color: onColor(ground.bgcolor)
        }
      });
  return table(
    { ...FULL, dir: "ltr" },
    tr(h("td", ground, pictureLink(drawn, to.href, { title: to.name })))
  );
}

/** The name under a picture, leading where the picture does, with its note at the row's end, or under it where
    pictures stand side by side. */
function caption(
  ctx: Ctx,
  name: string | undefined,
  href: string,
  note: string | undefined,
  stacked: boolean
) {
  if (!name && !note) return null;
  const title =
    name &&
    h(
      "td",
      { valign: "top", dir: "auto", style: face(ctx, "h3") },
      h("a", { class: "ink", href, style: { color: L.ink, "text-decoration": "none" } }, name)
    );
  if (stacked) {
    return table(
      FULL,
      title && tr(title),
      note && tr(h("td", { class: "ink3", style: { ...face(ctx, "small"), color: L.ink3 } }, note))
    );
  }
  const end =
    note &&
    h(
      "td",
      {
        class: "ink3",
        valign: "top",
        align: ctx.end,
        style: {
          ...face(ctx, "small"),
          "line-height": TYPE.h3["line-height"],
          color: L.ink3,
          "white-space": "nowrap",
          "padding-left": ctx.end === "right" ? px(SPACE.s3) : false,
          "padding-right": ctx.end === "left" ? px(SPACE.s3) : false
        }
      },
      note
    );
  return table(FULL, tr(title, end));
}

/* A palette's colors as chips, each with its hex: one to a keyframe, two to eight, whatever steps its view takes. On a
   phone the row is shorter and the hex smaller (document.ts, `.chip`), as the picture over it is. */
const chips = (colors: readonly string[]): Html =>
  table(
    { ...FULL, dir: "ltr", "data-part": "chips", style: { "table-layout": "fixed" } },
    tr(
      colors.map(hex =>
        h(
          "td",
          {
            class: "chip",
            width: `${(100 / colors.length).toFixed(4)}%`,
            height: SIZE.strip,
            align: "center",
            valign: "middle",
            bgcolor: hex,
            style: {
              height: px(SIZE.strip),
              "background-color": hex,
              "font-family": FONT.mono,
              "font-size": px(SIZE.chip),
              "line-height": px(SIZE.strip),
              color: onColor(hex)
            }
          },
          hex
        )
      )
    )
  );

export interface PaletteOptions extends PaletteView {
  name?: string;
  /** where its picture and name lead: its page in this view unless given */
  href?: string;
  /** a few quiet words at the end of its name's row */
  note?: string;
  /** its keyframes' colors as chips under the picture */
  chips?: boolean;
}

/** What stands under a palette's picture, and what it says as text. */
export function under(ctx: Ctx, options: PaletteOptions, stacked: boolean) {
  const show = shown(options);
  const href = address(options.href ?? pageAddress(ctx, show));
  const colors = options.chips && !stacked ? keyframes(show.palette) : [];
  return {
    show,
    href,
    strip: colors.length ? chips(colors) : null,
    caption: caption(ctx, options.name, href, options.note, stacked),
    text: [[options.name, options.note].filter(Boolean).join(", "), href, colors.join(" ")]
      .filter(Boolean)
      .join("\n")
  };
}

function card(ctx: Ctx, options: PaletteOptions, size: "lead" | "card"): Rendered {
  const parts = under(ctx, options, size === "card");
  const drawn = picture(ctx, parts.show, size, ctx.measure, {
    href: parts.href,
    name: options.name
  });
  return {
    html: table(
      { ...FULL, "data-part": "palette" },
      tr(h("td", null, rounded(drawn, parts.strip))),
      parts.caption && tr(h("td", { style: { "padding-top": px(SPACE.s2) } }, parts.caption))
    ),
    text: parts.text
  };
}

/** One palette alone on its row, as wide as the words. */
export const palette =
  (options: PaletteOptions): Part =>
  ctx =>
    card(ctx, options, "lead");

/** Palettes side by side, two to a row, or three where there is then no room for a note. They stay side by side on a
    phone. */
export const palettes =
  (items: readonly PaletteOptions[], options: { columns?: 2 | 3 } = {}): Part =>
  ctx => {
    const columns = options.columns ?? 2;
    const gap = SPACE.s4;
    const measure = Math.floor((ctx.measure - gap * (columns - 1)) / columns);
    const cards = items.map(item =>
      card({ ...ctx, measure }, columns === 3 ? { ...item, note: undefined } : item, "card")
    );
    const rows: Html[] = [];
    for (let at = 0; at < cards.length; at += columns) {
      const cells = Array.from({ length: columns }, (_, i) => [
        i ? h("td", { width: gap, style: { width: px(gap), ...BLANK } }, " ") : null,
        h("td", { width: `${(100 / columns).toFixed(2)}%`, valign: "top" }, cards[at + i]?.html)
      ]);
      rows.push(
        tr(
          h(
            "td",
            { style: { "padding-top": at ? px(SPACE.s5) : false } },
            table({ ...FULL, style: { "table-layout": "fixed" } }, tr(cells))
          )
        )
      );
    }
    return {
      html: table({ ...FULL, "data-part": "palettes" }, rows),
      text: cards.map(drawn => drawn.text).join("\n\n")
    };
  };

export interface CollectionOptions {
  title: string;
  href: string;
  /** three to six of its palettes, each a square tile in its view */
  tiles?: readonly PaletteView[];
  /** in the tiles' place, its card: palettes it holds as wedges about the middle, each in a view of the card's own
      design (the site's share card for a collection, /api/og/collection, `pick`), up to nine */
  card?: { slug: string; palettes: readonly PaletteView[] };
  /** quiet words at the end of the title's row: how many palettes it holds */
  note?: string;
  /** a line under the title */
  about?: string;
}
/* the share card's own pixels, which give its picture its shape (apps/web server/images/size.ts, CARD) */
const CARD = { width: 1200, height: 630 };
/* Where the card's first wedge stands, as the Worker's painter turns it (server/images/paint.ts, wedgeStart): centered
   on the wordmark's place at the top left. Angles run clockwise from straight up. */
const firstWedge = (count: number) =>
  Math.atan2(
    (175 / 1200) * CARD.width - CARD.width / 2,
    CARD.height / 2 - (64.5 / 630) * CARD.height
  ) -
  Math.PI / count;
/** A point of the card's edge straight out from its middle at `angle`, as percentages of its width and height. */
function edgeAt(angle: number): [number, number] {
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const reach = Math.min(
    dx ? CARD.width / 2 / Math.abs(dx) : Number.POSITIVE_INFINITY,
    dy ? CARD.height / 2 / Math.abs(dy) : Number.POSITIVE_INFINITY
  );
  return [50 + ((dx * reach) / CARD.width) * 100, 50 + ((dy * reach) / CARD.height) * 100];
}
const CORNERS: [number, number][] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100]
];
const turn = (angle: number) => angle - 2 * Math.PI * Math.floor(angle / (2 * Math.PI));
/** One wedge, `from` to `to` clockwise, as a clip path: the middle, its sides' ends on the edge, the corners between. */
function wedgePath(from: number, to: number): string {
  const corners = CORNERS.filter(([x, y]) => {
    const at = Math.atan2(((x - 50) / 100) * CARD.width, ((50 - y) / 100) * CARD.height);
    return turn(at - from) < turn(to - from);
  }).sort(
    (a, b) =>
      turn(Math.atan2(((a[0] - 50) / 100) * CARD.width, ((50 - a[1]) / 100) * CARD.height) - from) -
      turn(Math.atan2(((b[0] - 50) / 100) * CARD.width, ((50 - b[1]) / 100) * CARD.height) - from)
  );
  const points = [[50, 50], edgeAt(from), ...corners, edgeAt(to)];
  return `polygon(${points.map(([x, y]) => `${x!.toFixed(3)}% ${y!.toFixed(3)}%`).join(",")})`;
}
/** A wedge's colors running out from the middle to the far corners: bands for a swatch style, else a blend. */
function wedgeGround(show: Shown): string {
  const n = show.colors.length;
  const stops = isSwatchStyle(show.view.style)
    ? show.colors.map(
        (hex, i) => `${hex} ${((i / n) * 100).toFixed(3)}% ${(((i + 1) / n) * 100).toFixed(3)}%`
      )
    : show.colors.map((hex, i) => `${hex} ${((i / Math.max(1, n - 1)) * 100).toFixed(3)}%`);
  return `radial-gradient(circle farthest-corner at 50% 50%,${stops.join(",")})`;
}
/** On a page the browser draws the card itself: each wedge a layer clipped to its angle. */
function cardBlock(shows: readonly Shown[]): Html {
  const n = shows.length;
  const start = firstWedge(n);
  return h(
    "div",
    {
      style: {
        position: "relative",
        width: "100%",
        "aspect-ratio": `${CARD.width} / ${CARD.height}`
      }
    },
    shows.map((show, k) =>
      h("div", {
        style: {
          position: "absolute",
          inset: "0",
          "clip-path": wedgePath(
            start + (2 * Math.PI * k) / n,
            start + (2 * Math.PI * (k + 1)) / n
          ),
          background: wedgeGround(show)
        }
      })
    )
  );
}
/** A collection's card at the sheet's measure, leading to the collection: the Worker's picture in an email, drawn by
    the browser on a page. */
function cardOf(ctx: Ctx, card: NonNullable<CollectionOptions["card"]>, alt: string, href: string) {
  const shows = card.palettes.slice(0, 9).map(of => {
    const show = shown(of);
    ctx.gateSeed?.(show.seed);
    return show;
  });
  if (ctx.web) return rounded(pictureLink(cardBlock(shows), href));
  const picks = shows.map(({ seed, view }) => [seed, view.style, view.steps, view.angle].join("~"));
  const src = `${ctx.origin}/api/og/collection?slug=${encodeURIComponent(card.slug)}&pick=${picks.join(",")}`;
  const width = ctx.measure;
  const picture = h("img", {
    src: address(src),
    alt,
    width,
    height: Math.round((width * CARD.height) / CARD.width),
    loading: ctx.web ? "lazy" : false,
    style: {
      display: "block",
      width: "100%",
      "max-width": ctx.web ? false : px(width),
      height: "auto"
    }
  });
  return rounded(pictureLink(picture, href));
}
/** A collection: a row of its palettes as tiles, the seams the sheet's paper, or its card, then its title. More than
    six tiles are cut to six. */
export const collection =
  (options: CollectionOptions): Part =>
  ctx => {
    const href = address(options.href);
    if (options.card)
      return titled(ctx, options, href, cardOf(ctx, options.card, options.title, href));
    const tiles = (options.tiles ?? []).slice(0, 6).map(shown);
    if (tiles.length < 3)
      throw new Error(`A collection shows 3 to 6 of its palettes, not ${tiles.length}`);
    const gap = SPACE.s1;
    const side = Math.floor((ctx.measure - gap * (tiles.length - 1)) / tiles.length);
    const cells = tiles.map((tile, i) => [
      i ? h("td", { width: gap, style: { width: px(gap), ...BLANK } }, " ") : null,
      h(
        "td",
        { width: `${(100 / tiles.length).toFixed(2)}%`, valign: "top" },
        picture(ctx, tile, "tile", side, { href })
      )
    ]);
    return titled(
      ctx,
      options,
      href,
      rounded(table({ ...FULL, dir: "ltr", style: { "table-layout": "fixed" } }, tr(cells)))
    );
  };
/** A collection's picture, then its title and the line under it. */
function titled(ctx: Ctx, options: CollectionOptions, href: string, picture: Html): Rendered {
  const heading = caption(ctx, options.title, href, options.note, false);
  const about = options.about ? text(options.about, { role: "small" })(ctx) : null;
  return {
    html: table(
      { ...FULL, "data-part": "collection" },
      tr(h("td", null, picture)),
      heading && tr(h("td", { style: { "padding-top": px(SPACE.s2) } }, heading)),
      about && tr(h("td", { style: { "padding-top": px(SPACE.s1) } }, about.html))
    ),
    text: [[options.title, options.note].filter(Boolean).join(", "), href, options.about]
      .filter(Boolean)
      .join("\n")
  };
}

/** Collections one under another. */
export const collections = (items: readonly CollectionOptions[]): Part =>
  named("collections", stack("s6", ...items.map(collection)));
