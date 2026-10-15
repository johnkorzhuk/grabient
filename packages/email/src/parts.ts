/* The words and controls an email is built from. A part is drawn once the email knows its reader and gives its markup
   and the same content as plain text. Its colors are written inline for the light scheme and named by a class the
   email's head recolors for the dark one (document.ts): only the head can answer a scheme, and some apps drop it.
   The outer element of each part says which part it is (`data-part`). */
import { dirOf, type Locale, localizePath } from "@grabient/i18n";
import { type Child, type Html, h, type Style, table, tr } from "./html.ts";
import { FONT, RADIUS, SCHEMES, SIZE, SPACE, type Space, TYPE, type TypeRole } from "./theme.ts";

/** A palette's view, as the site shows it. */
export interface View {
  style: string;
  steps: number;
  angle: number;
}

/** What a part is drawn with. */
export interface Ctx {
  /** the reader's language: the links the email writes lead to the site in it */
  locale: Locale;
  /** the language the words are written in, where that is not the reader's */
  written?: Locale;
  dir: "ltr" | "rtl";
  /** the sides text starts and ends on, for attributes that take no logical value */
  start: "left" | "right";
  end: "left" | "right";
  /** the site, without a trailing slash */
  origin: string;
  sans: string;
  /** the width the part is laid out in, in pixels */
  measure: number;
  /** refuses, by throwing, a palette the email may not draw (palette.ts, `likedGate`) */
  gate?: (seed: string, view: View) => void;
  /** refuses a palette no admin liked in any view: a collection's card draws views of its own design */
  gateSeed?: (seed: string) => void;
  /** drawn for a page of the site: the browser draws every view and the wordmark, and the page's own title stands
      over every heading */
  web?: boolean;
}
export interface Rendered {
  html: Html;
  text: string;
}
export type Part = (ctx: Ctx) => Rendered;
export type Parts = readonly (Part | false | null | undefined)[];

/** Words with links or emphasis in them. A string is text. */
export type Inline = string | { readonly html: Html; readonly text: string } | readonly Inline[];
const inlineHtml = (content: Inline): Child =>
  typeof content === "string"
    ? content
    : "html" in content
      ? content.html
      : content.map(inlineHtml);
const inlineText = (content: Inline): string =>
  typeof content === "string"
    ? content
    : "text" in content
      ? content.text
      : content.map(inlineText).join("");

export const L = SCHEMES.light;
export const px = (n: number): string => `${n}px`;
export const FULL = { width: "100%" } as const;
/** A cell that holds no words: Outlook gives an empty cell a line's height unless its type is this small. */
export const BLANK: Style = {
  "font-size": "0",
  "line-height": "0",
  "mso-line-height-rule": "exactly"
};

/** An address an email may link to: the web or a mailbox, nothing a mail app would run. */
export function address(href: string): string {
  if (!/^(https?:\/\/|mailto:)/i.test(href)) {
    throw new Error(
      `An email links to a web or mail address, not ${JSON.stringify(href.slice(0, 40))}`
    );
  }
  return href;
}

export const face = (ctx: Ctx, role: TypeRole): Style => ({
  "font-family":
    role === "mono" || role === "code" ? FONT.mono : role === "lede" ? FONT.system : ctx.sans,
  ...TYPE[role]
});

/** The home page in the reader's language: an email's foot, and a head that wears no palette. */
export const homeAddress = (ctx: Pick<Ctx, "origin" | "locale">): string =>
  ctx.origin + localizePath("/", ctx.locale).replace(/^\/$/, "");

/** The link a picture stands in: Gmail lays a Download button over a picture that leads nowhere. `aside` marks one
    more way to where words beside the picture lead, which a screen reader and the Tab key pass over. */
export const pictureLink = (picture: Html, href: string, aside?: { title?: string }): Html =>
  h(
    "a",
    {
      href: address(href),
      ...(aside && { title: aside.title, tabindex: -1, "aria-hidden": "true" }),
      style: { display: "block", "text-decoration": "none" }
    },
    picture
  );

/** A link in running words. */
export const link = (label: string, href: string): Inline => ({
  html: h(
    "a",
    { class: "ink", href: address(href), style: { color: L.ink, "text-decoration": "underline" } },
    label
  ),
  text: `${label} (${href})`
});
export const strong = (content: Inline): Inline => ({
  html: h(
    "strong",
    { class: "ink", style: { color: L.ink, "font-weight": TYPE.h3["font-weight"] } },
    inlineHtml(content)
  ),
  text: inlineText(content)
});
/** A hex, a seed or a line of code in running words. */
export const mono = (code: string): Inline => ({
  html: h(
    "span",
    { dir: "ltr", style: { "font-family": FONT.mono, "font-size": TYPE.mono["font-size"] } },
    code
  ),
  text: code
});

type Ink = "ink" | "ink2" | "ink3";
/* On a page a heading stands a level down, under the page's own title. */
const words =
  (tag: string, role: TypeRole, ink: Ink, content: Inline, kind?: string): Part =>
  ctx => ({
    html: h(
      ctx.web && /^h[1-5]$/.test(tag) ? `h${Number(tag[1]) + 1}` : tag,
      {
        class: kind ? `${ink} ${kind}` : ink,
        style: { margin: "0", ...face(ctx, role), color: L[ink] }
      },
      inlineHtml(content)
    ),
    text: inlineText(content)
  });
/** The email's one title. `large` is a newsletter's. */
export const title = (text: string, options: { large?: boolean } = {}): Part =>
  options.large ? words("h1", "title", "ink", text, "title") : words("h1", "display", "ink", text);
export const heading = (text: string): Part => words("h2", "h2", "ink", text);
export const subheading = (text: string): Part => words("h3", "h3", "ink", text);
/** The quiet uppercase line over a title or a group. */
export const eyebrow = (text: string): Part => words("p", "micro", "ink3", text);
/** A paragraph: body, the `lede` under a title, or `small` print. */
export const text = (content: Inline, options: { role?: "body" | "lede" | "small" } = {}): Part =>
  words("p", options.role ?? "body", options.role === "small" ? "ink3" : "ink2", content);

/** Words in the reader's language inside an email written in another: they say whose they are and run their own way. */
export const readers =
  (part: Part): Part =>
  ctx => {
    const drawn = part(ctx);
    if (!ctx.written || ctx.written === ctx.locale) return drawn;
    const dir = dirOf(ctx.locale);
    return {
      html: h(
        "div",
        { lang: ctx.locale, dir, style: { "text-align": dir === "rtl" ? "right" : "left" } },
        drawn.html
      ),
      text: drawn.text
    };
  };

/** A part under a name the design document pins it by. */
export const named =
  (name: string, part: Part): Part =>
  ctx => {
    const drawn = part(ctx);
    return { html: h("div", { "data-part": name }, drawn.html), text: drawn.text };
  };

/** Parts one under another, a step of the spacing scale apart. Absent parts are skipped. */
export const stack =
  (gap: Space, ...parts: Parts): Part =>
  ctx => {
    const drawn = parts.filter(part => !!part).map(part => part(ctx));
    return {
      html: table(
        FULL,
        drawn.map((part, i) =>
          tr(h("td", { style: { "padding-top": i ? px(SPACE[gap]) : false } }, part.html))
        )
      ),
      text: drawn
        .map(part => part.text)
        .filter(Boolean)
        .join("\n\n")
    };
  };

/** The one separator: the dashed rule. */
export const rule = (): Part => () => ({
  html: table(
    { ...FULL, "data-part": "rule" },
    tr(
      h(
        "td",
        {
          class: "rule",
          height: SIZE.hairline,
          style: { "border-top": `${px(SIZE.hairline)} dashed ${L.line}`, ...BLANK }
        },
        " "
      )
    )
  ),
  text: ""
});

export interface ButtonOptions {
  href: string;
  /** a verb in sentence case */
  label: string;
  /** the sheet's whole width */
  full?: boolean;
  /** paper in place of ink, beside the email's one primary */
  quiet?: boolean;
}
/** The email's action, in ink once per email; any other is `quiet`. An account email's is its one link of the class
    `btn-label`, which is how the sign-in suites find it. */
export const button =
  (options: ButtonOptions): Part =>
  ctx => {
    const { href, label, full, quiet } = options;
    const lines = Number.parseFloat(TYPE.lede["line-height"]);
    const block = (SIZE.button - lines) / 2 - (quiet ? SIZE.hairline : 0);
    const padding = `${px(block)} ${px(SPACE.s6)}`;
    const radius = px(RADIUS.control);
    const ground = quiet ? L.fill : L.ink;
    const anchor = h(
      "a",
      {
        class: quiet ? "ink" : "btn-label",
        href: address(href),
        style: {
          display: full ? "block" : "inline-block",
          padding,
          "font-family": ctx.sans,
          "font-size": TYPE.lede["font-size"],
          "line-height": px(lines),
          "font-weight": TYPE.h3["font-weight"],
          color: quiet ? L.ink : L.onInk,
          "text-decoration": "none",
          "text-align": "center",
          "border-radius": radius
        }
      },
      label
    );
    /* Outlook pads a cell and never a link: the cell carries the padding in the property only Outlook reads, and the
       link carries it for every other app, where the whole button then takes the press */
    const cell = h(
      "td",
      {
        class: quiet ? "fill line" : "btn",
        align: "center",
        bgcolor: ground,
        style: {
          "background-color": ground,
          border: quiet ? `${px(SIZE.hairline)} solid ${L.line}` : false,
          "border-radius": radius,
          "mso-padding-alt": padding
        }
      },
      anchor
    );
    return {
      html: table({ ...(full ? FULL : null), "data-part": "button" }, tr(cell)),
      text: `${label}: ${href}`
    };
  };

/** A sign-in code, large in mono on a tile. Its digits are the email's one `<strong>`, which is how the sign-in suites
    find them. */
export const code =
  (value: string): Part =>
  () => {
    const tracking = Math.round(
      Number.parseFloat(TYPE.code["letter-spacing"]) * Number.parseFloat(TYPE.code["font-size"])
    );
    return {
      html: table(
        { ...FULL, "data-part": "code" },
        tr(
          h(
            "td",
            {
              class: "fill ink",
              align: "center",
              dir: "ltr",
              bgcolor: L.fill,
              style: {
                "background-color": L.fill,
                "border-radius": px(RADIUS.control),
                /* the tracking leaves its space after the last digit: as much before the first centers them */
                padding: `${px(SPACE.s5)} ${px(SPACE.s4)} ${px(SPACE.s5)} ${px(SPACE.s4 + tracking)}`,
                "font-family": FONT.mono,
                ...TYPE.code,
                "letter-spacing": px(tracking),
                color: L.ink
              }
            },
            h("strong", null, value)
          )
        )
      ),
      text: value
    };
  };

/** A tile for words that stand apart: a tip, what changed. */
export const note =
  (...parts: Parts): Part =>
  ctx => {
    const inside = stack("s3", ...parts)({ ...ctx, measure: ctx.measure - 2 * SPACE.s5 });
    return {
      html: table(
        { ...FULL, "data-part": "note" },
        tr(
          h(
            "td",
            {
              class: "fill",
              bgcolor: L.fill,
              style: {
                "background-color": L.fill,
                "border-radius": px(RADIUS.surface),
                padding: `${px(SPACE.s4)} ${px(SPACE.s5)}`
              }
            },
            inside.html
          )
        )
      ),
      text: inside.text
    };
  };

/** A few short lines, each led by a dot. */
export const list =
  (...items: readonly Inline[]): Part =>
  ctx => {
    const cell = (ink: Ink, i: number, extra: Record<string, string | number>, content: Child) =>
      h(
        "td",
        {
          class: ink,
          ...extra,
          valign: "top",
          style: { ...face(ctx, "body"), color: L[ink], "padding-top": i ? px(SPACE.s2) : false }
        },
        content
      );
    return {
      html: table(
        { ...FULL, "data-part": "list" },
        items.map((item, i) =>
          tr(cell("ink3", i, { width: SPACE.s5 }, "•"), cell("ink2", i, {}, inlineHtml(item)))
        )
      ),
      text: items.map(item => `- ${inlineText(item)}`).join("\n")
    };
  };

/** Code to take away, in mono, left to right in every language. */
export const snippet =
  (source: string): Part =>
  () => {
    /* white-space is not honored everywhere: each line break is written, and each leading space is one that holds */
    const lines = source
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(line => line.replace(/^ +/, lead => " ".repeat(lead.length)));
    return {
      html: table(
        { ...FULL, "data-part": "snippet" },
        tr(
          h(
            "td",
            {
              class: "fill ink2",
              dir: "ltr",
              align: "left",
              bgcolor: L.fill,
              style: {
                "background-color": L.fill,
                "border-radius": px(RADIUS.control),
                padding: `${px(SPACE.s3)} ${px(SPACE.s4)}`,
                "font-family": FONT.mono,
                ...TYPE.mono,
                color: L.ink2,
                "word-break": "break-word"
              }
            },
            lines.map((line, i) => [i ? h("br", null) : null, line])
          )
        )
      ),
      text: source
    };
  };

export interface ImageOptions {
  src: string;
  /** what the picture shows */
  alt: string;
  /** the file's own pixels, which give the picture its shape */
  width: number;
  height: number;
  /** where it leads: to itself unless given */
  href?: string;
  caption?: string;
}
/* A page holds its picture back behind a blank of its shape, which only a browser running script takes, until the page
   that shows the issue drops the blank as the picture nears the screen: a browser's own lazy loading asks for a file
   over a thousand pixels from the screen. A browser without script takes the file. */
function heldBack(picture: Html, width: number, height: number): Html {
  const blank = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`;
  return h(
    "picture",
    null,
    h("source", {
      media: "(scripting: enabled)",
      srcset: `data:image/svg+xml,${encodeURIComponent(blank)}`
    }),
    picture
  );
}

/** A picture as wide as the words. */
export const image =
  (options: ImageOptions): Part =>
  ctx => {
    const width = ctx.measure;
    const height = Math.round((width * options.height) / options.width);
    const picture = h("img", {
      class: "line",
      src: address(options.src),
      alt: options.alt,
      width,
      height,
      loading: ctx.web ? "lazy" : false,
      /* a page's column is as wide as the page makes it, where an email's is the sheet's */
      style: {
        display: "block",
        width: "100%",
        "max-width": ctx.web ? false : px(width),
        height: "auto",
        border: `${px(SIZE.hairline)} solid ${L.line}`,
        "border-radius": px(RADIUS.surface)
      }
    });
    const shown = ctx.web ? heldBack(picture, width, height) : picture;
    const under = options.caption ? text(options.caption, { role: "small" })(ctx) : null;
    return {
      html: table(
        { ...FULL, "data-part": "image" },
        tr(h("td", null, pictureLink(shown, options.href ?? options.src))),
        under && tr(h("td", { style: { "padding-top": px(SPACE.s2) } }, under.html))
      ),
      text: [`[${options.alt}]${options.href ? ` ${options.href}` : ""}`, options.caption]
        .filter(Boolean)
        .join("\n")
    };
  };

/** The ways on from an email's foot, on one small line. */
export const links =
  (...items: readonly { label: string; href: string }[]): Part =>
  ctx => ({
    html: h(
      "p",
      {
        class: "ink3",
        "data-part": "links",
        style: { margin: "0", ...face(ctx, "small"), color: L.ink3 }
      },
      items.map((item, i) => [
        i ? " · " : null,
        h(
          "a",
          {
            class: "ink2",
            href: address(item.href),
            style: { color: L.ink2, "text-decoration": "underline" }
          },
          item.label
        )
      ])
    ),
    text: items.map(item => `${item.label}: ${item.href}`).join("\n")
  });

/** A newsletter's section: the rule, its heading, then its parts. */
export const section = (name: string | null, ...parts: Parts): Part =>
  stack("s6", rule(), stack("s4", name ? heading(name) : null, ...parts));
