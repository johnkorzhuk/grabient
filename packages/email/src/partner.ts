/* A swap: two makers mention each other to their readers. In an issue the partner stands on a tile under a label that
   says what the reader is looking at, and the tile ends with what was exchanged: a reader is owed both. `blurb` is the
   other half, Grabient as a partner's own newsletter shows it: markup set into an email that is not ours, so inline
   styles alone, light whatever the scheme, in the reader's own sans, and no class a partner's styles could answer. */
import { DEFAULT_LOCALE, dirOf, type Locale, translate } from "@grabient/i18n";
import { h, table, tr } from "./html.ts";
import { likedGate, type PaletteView, palette } from "./palette.ts";
import {
  address,
  button,
  type Ctx,
  eyebrow,
  FULL,
  type ImageOptions,
  type Inline,
  image,
  L,
  link,
  type Part,
  type Parts,
  px,
  stack,
  strong,
  subheading,
  text
} from "./parts.ts";
import { FONT, RADIUS, SIZE, SPACE } from "./theme.ts";

const owed = (what: string, value: string) => {
  if (!value.trim()) throw new Error(`A partner's tile says ${what}`);
};
const tile =
  (id: string, label: string, terms: string, ...parts: Parts): Part =>
  ctx => {
    owed("what the reader is looking at", label);
    owed("what was exchanged", terms);
    const inside = stack(
      "s4",
      eyebrow(label),
      ...parts,
      text(terms, { role: "small" })
    )({ ...ctx, measure: ctx.measure - 2 * SPACE.s5 });
    return {
      html: table(
        { ...FULL, "data-part": id },
        tr(
          h(
            "td",
            {
              class: "fill",
              bgcolor: L.fill,
              style: {
                "background-color": L.fill,
                "border-radius": px(RADIUS.surface),
                padding: px(SPACE.s5)
              }
            },
            inside.html
          )
        )
      ),
      text: inside.text
    };
  };

export interface PromoOptions {
  /** what the reader is looking at: "Partner" */
  label: string;
  name: string;
  href: string;
  /** what it is and who it is for, in the partner's words */
  about: Inline;
  picture?: Pick<ImageOptions, "src" | "alt" | "width" | "height">;
  /** the press: "Visit Partner name" */
  action: string;
  /** what was exchanged */
  terms: string;
}
/** One partner. Its press is quiet: the issue's ink is Grabient's own. */
export const promo = (options: PromoOptions): Part =>
  tile(
    "promo",
    options.label,
    options.terms,
    options.picture && image({ ...options.picture, href: options.href }),
    stack("s2", subheading(options.name), text(options.about)),
    button({ href: options.href, label: options.action, quiet: true })
  );

export interface MentionsOptions {
  label: string;
  items: readonly { name: string; href: string; about: string }[];
  terms: string;
}
/** Several partners, a line or two each, on one tile. */
export const mentions = (options: MentionsOptions): Part =>
  tile(
    "mentions",
    options.label,
    options.terms,
    stack(
      "s3",
      ...options.items.map(item => text([strong(link(item.name, item.href)), " ", item.about]))
    )
  );

export interface BlurbOptions {
  /** the site: where the picture is read from, and where the blurb leads without an `href` */
  origin: string;
  /** the site's address, marked however that partner's readers are counted */
  href?: string;
  /** one sentence ending in a link, the name over two, or a palette's picture with the words and a button */
  size: "line" | "short" | "card";
  /** a card's palette, among the admins' likes */
  palette?: PaletteView;
  liked?: readonly PaletteView[];
  /** the partner's readers' language */
  locale?: Locale;
}
/** Grabient as a partner's newsletter shows it, as markup and as plain text, in the site's own words. */
export function blurb(options: BlurbOptions): { html: string; text: string } {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const dir = dirOf(locale);
  const origin = options.origin.replace(/\/+$/, "");
  const href = address(options.href ?? origin);
  const ctx: Ctx = {
    locale,
    dir,
    origin,
    start: dir === "rtl" ? "right" : "left",
    end: dir === "rtl" ? "left" : "right",
    sans: FONT.system,
    measure: SIZE.sheet - 2 * SPACE.s5 - 2 * SIZE.hairline,
    gate: options.liked ? likedGate(options.liked) : undefined
  };
  const host = link(origin.replace(/^https?:\/\//i, ""), href);
  const words = translate(
    locale,
    "CSS gradient generator and color palette finder. Browse and edit gradient palettes, then export them as CSS, SVG, PNG or a shader."
  );
  let part: Part;
  if (options.size === "line") {
    const line = translate(
      locale,
      "A free CSS gradient generator and color palette finder for designers and developers."
    );
    part = text([line, " ", host]);
  } else if (options.size === "short") {
    part = stack("s1", subheading("Grabient"), text([words, " ", host]));
  } else {
    if (!options.palette || !options.liked) {
      throw new Error("A card shows a palette an admin liked: give it the palette and the likes");
    }
    const { seed, style, steps, angle } = options.palette;
    part = stack(
      "s4",
      palette({ seed, style, steps, angle, href }),
      stack("s2", subheading("Grabient"), text(words)),
      button({ href, label: translate(locale, "Open Grabient") })
    );
  }
  const drawn = part(ctx);
  const html =
    options.size === "card"
      ? table(
          { width: "100%", dir, style: { width: "100%", "max-width": px(SIZE.sheet) } },
          tr(
            h(
              "td",
              {
                align: ctx.start,
                bgcolor: L.paper,
                style: {
                  "background-color": L.paper,
                  border: `${px(SIZE.hairline)} solid ${L.edge}`,
                  "border-radius": px(RADIUS.surface),
                  padding: px(SPACE.s5),
                  "text-align": ctx.start
                }
              },
              drawn.html
            )
          )
        ).html
      : h("div", { dir }, drawn.html).html;
  return {
    /* our classes name our own head's dark colors and the design document's pins: neither is there */
    html: html.replace(/ (?:class|data-part)="[^"]*"/g, ""),
    text: options.size === "card" ? `Grabient\n${words}\n${href}` : drawn.text
  };
}
