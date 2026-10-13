/* The email itself: a page, and on it one sheet that holds everything, as the site's sign-in page is paper over the
   water. Nothing stands on the wash behind the sheet: a mail app that darkens an email by itself recolors flat grounds
   and does what it likes to a gradient, so words there could end up light on light.

   The document's head carries what inline styles cannot: the dark scheme, a phone's measures and the fonts. An app that
   drops the head still shows a whole email, light, in the reader's own sans. */
import { DEFAULT_LOCALE, dirOf, type Locale } from "@grabient/i18n";
import { brandHead, paletteHead, seedStops } from "./head.ts";
import { type Html, h, mso, notMso, raw, table, tr } from "./html.ts";
import { likedGate, type PaletteOptions, type PaletteView, under } from "./palette.ts";
import { BLANK, type Ctx, L, named, type Part, type Parts, px, rule, stack } from "./parts.ts";
import {
  BRAND,
  FONT,
  type Mode,
  mix,
  RADIUS,
  ramp,
  SCHEMES,
  type Scheme,
  SIZE,
  SPACE,
  type Space,
  TYPE
} from "./theme.ts";

/** An email ready to send. */
export interface Letter {
  subject: string;
  html: string;
  text: string;
}

export interface EmailOptions {
  /** the site its links, pictures and fonts come from */
  origin: string;
  /** the reader's language */
  locale?: Locale;
  /** the language its words are written in, where that is not the reader's: the sheet runs that language's way */
  written?: Locale;
  subject: string;
  /** the line an inbox shows after the subject */
  preheader?: string;
  /** `sheet` is an account email, the sign-in sheet's width; `letter` is a newsletter */
  width?: "sheet" | "letter";
  /** the palette it wears: the head and the wash behind the sheet. Without one, the brand's */
  palette?: PaletteView;
  /** a newsletter's lead in place of `palette`: the head is its whole preview, with chips and its name under it */
  lead?: PaletteOptions;
  /** the head travels with the email under HEAD_CID, attached by the sender, so a mail app asks the site for nothing */
  carried?: boolean;
  /** the admins' likes: an email given them draws no other palette */
  liked?: readonly PaletteView[];
  body: Parts;
  gap?: Space;
  /** the small print under the rule */
  foot?: Parts;
  /** `auto`, what is sent, follows the reader's scheme; a fixed one is a preview */
  scheme?: "auto" | Mode;
}

type Sheet = Ctx & { width: number };

/** The sheet's padding at a desk; a phone's is in the head's styles. */
const PAD = SPACE.s8;
/* Three marks that show nothing, repeated after the preheader so the inbox stops reading before the body. */
const FILLER = "͏‌ ";

/** What every part is drawn with. */
function context(options: {
  origin: string;
  locale?: Locale;
  written?: Locale;
  width?: "sheet" | "letter";
  liked?: readonly PaletteView[];
  web?: boolean;
}): Sheet {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const dir = dirOf(options.written ?? locale);
  const origin = options.origin.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(origin)) {
    throw new Error(
      `An email's origin is the site's address, not ${JSON.stringify(origin.slice(0, 40))}`
    );
  }
  const width = options.width === "letter" ? SIZE.letter : SIZE.sheet;
  return {
    locale,
    written: options.written,
    dir,
    origin,
    width,
    start: dir === "rtl" ? "right" : "left",
    end: dir === "rtl" ? "left" : "right",
    sans: locale === "vi" ? FONT.system : FONT.sans,
    measure: width - 2 * PAD - 2 * SIZE.hairline,
    gate: options.liked ? likedGate(options.liked) : undefined,
    web: options.web
  };
}

/** The page behind the sheet: the palette's colors carried a little way into the page's own, straight across, so the
    body and the table over it draw the same color at every point. */
function wash(stops: readonly string[], scheme: Scheme): string {
  const at = ramp(stops);
  return `linear-gradient(90deg,${[0, 0.5, 1].map(t => mix(scheme.bg, at(t), scheme.wash)).join(",")})`;
}

/* The site's own Poppins files, with the ranges its stylesheet gives them. */
const RANGES = {
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  "latin-ext":
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"
};
const fonts = (origin: string): string =>
  Object.entries(RANGES)
    .flatMap(([subset, range]) =>
      [TYPE.body["font-weight"], TYPE.h3["font-weight"]].map(
        weight =>
          `@font-face{font-family:Poppins;font-style:normal;font-weight:${weight};font-display:swap;src:url(${origin}/fonts/poppins-${subset}-${weight}-normal.woff2) format("woff2");unicode-range:${range}}`
      )
    )
    .join("");

/** The colors a sheet and its parts take on a page of the site, as CSS values. */
export type SheetColors = Pick<
  Scheme,
  "paper" | "edge" | "shadow" | "ink" | "ink2" | "ink3" | "line" | "fill" | "onInk"
>;
/* Each class a part carries and what a scheme makes it. A part with a new color class adds it here. */
const sheetRules = (s: SheetColors): [string, string][] => [
  [".sheet", `background-color:${s.paper};border-color:${s.edge};box-shadow:${s.shadow}`],
  [".ink", `color:${s.ink}`],
  [".ink2", `color:${s.ink2}`],
  [".ink3", `color:${s.ink3}`],
  [".rule", `border-top-color:${s.line}`],
  [".line", `border-color:${s.line}`],
  [".fill", `background-color:${s.fill}`],
  [".btn", `background-color:${s.ink}`],
  [".btn-label", `color:${s.onInk}`]
];
const important = (declarations: string) =>
  declarations
    .split(";")
    .map(d => `${d}!important`)
    .join(";");
const rules = (prefix: string, list: readonly [string, string][]) =>
  list.map(([selector, d]) => `${prefix}${selector}{${important(d)}}`).join("");

/* Where there is less room than a desk gives: the sheet's padding, a newsletter's title at a sheet's size, and the
   chips as much smaller as the picture over them. */
const NARROW = px(SIZE.sheet + 2 * SPACE.s10);
const NARROW_SHEET = [
  `.pad{padding:${px(SPACE.s6)} ${px(SPACE.s5)}!important}`,
  `.sides{padding-left:${px(SPACE.s5)}!important;padding-right:${px(SPACE.s5)}!important}`,
  `.title{font-size:${TYPE.display["font-size"]}!important;line-height:${TYPE.display["line-height"]}!important}`,
  `.chip{height:${px(SIZE.stripNarrow)}!important;line-height:${px(SIZE.stripNarrow)}!important;font-size:${px(SIZE.chipNarrow)}!important}`
].join("");

function styles(stops: readonly string[], scheme: "auto" | Mode): string {
  const D = SCHEMES.dark;
  const dark: [string, string][] = [
    [".bg", `background-color:${D.bg}`],
    [".wash", `background-image:${wash(stops, D)}`],
    ...sheetRules(D)
  ];
  return [
    `:root{color-scheme:${scheme === "auto" ? "light dark" : scheme}}`,
    "body{margin:0;padding:0;width:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}",
    "table{mso-table-lspace:0;mso-table-rspace:0}",
    "img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}",
    /* a date or an address a mail app turns into a link keeps the words' color */
    "a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}",
    /* again here, for an app that drops an inline gradient and keeps the head */
    `.wash{background-image:${wash(stops, L)}}`,
    `@media (max-width:${NARROW}){.gutter{padding:${px(SPACE.s5)} ${px(SPACE.s3)}!important}${NARROW_SHEET}}`,
    scheme === "dark" ? rules("", dark) : "",
    scheme === "auto" ? `@media (prefers-color-scheme:dark){${rules("", dark)}}` : "",
    /* Outlook on the web marks what it darkened instead of answering the media query */
    scheme === "auto" ? rules("[data-ogsc] ", dark) : ""
  ].join("");
}

function page(
  ctx: Ctx,
  subject: string,
  stops: readonly string[],
  scheme: "auto" | Mode,
  body: Html
): string {
  const schemes = scheme === "auto" ? "light dark" : scheme;
  const head = h(
    "head",
    null,
    h("meta", { charset: "utf-8" }),
    h("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
    h("meta", { name: "x-apple-disable-message-reformatting" }),
    h("meta", {
      name: "format-detection",
      content: "telephone=no, date=no, address=no, email=no, url=no"
    }),
    h("meta", { name: "color-scheme", content: schemes }),
    h("meta", { name: "supported-color-schemes", content: schemes }),
    h("title", null, subject),
    mso(
      raw(
        "<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>"
      )
    ),
    /* apart from the other styles, so an app that refuses fonts keeps the rest; Outlook, which sets an email that
       names a web font in Times New Roman, never reads them */
    ctx.sans === FONT.sans && notMso(raw(`<style>${fonts(ctx.origin)}</style>`)),
    raw(`<style>${styles(stops, scheme)}</style>`),
    mso(
      raw(
        "<style>table,td,p,a,h1,h2,h3,span,strong{font-family:Segoe UI,Arial,sans-serif!important}</style>"
      )
    )
  );
  const document = h(
    "html",
    {
      lang: ctx.written ?? ctx.locale,
      dir: ctx.dir,
      xmlns: "http://www.w3.org/1999/xhtml",
      "xmlns:v": "urn:schemas-microsoft-com:vml",
      "xmlns:o": "urn:schemas-microsoft-com:office:office"
    },
    head,
    body
  );
  return `<!DOCTYPE html>${document.html}`;
}

/* The sheet's head rows, and what the head says as text. */
function headRows(ctx: Sheet, options: EmailOptions): { rows: Html[]; text: string } {
  const width = ctx.width - 2 * SIZE.hairline;
  if (options.lead) {
    const lead = under(ctx, options.lead, false);
    const head = paletteHead(ctx, options.lead, {
      size: "lead",
      width,
      href: lead.href,
      named: !!options.lead.name
    });
    const rows = [
      tr(head),
      lead.strip && tr(h("td", { dir: "ltr", style: BLANK }, lead.strip)),
      lead.caption &&
        tr(
          h(
            "td",
            { class: "sides", style: { padding: `${px(SPACE.s3)} ${px(PAD)} 0` } },
            lead.caption
          )
        )
    ];
    return { rows: rows.filter(row => !!row), text: lead.text };
  }
  const size = options.width === "letter" ? "letter" : "sheet";
  const head = options.palette
    ? paletteHead(ctx, options.palette, { size, width, carried: options.carried })
    : brandHead(ctx, size, width, options.carried);
  return { rows: [tr(head)], text: "" };
}

/* The sheet, as an email and a page of the site both show it: its head from edge to edge, its words with room around
   them, its foot under the rule. */
function sheetOf(ctx: Sheet, options: EmailOptions): { sheet: Html; text: string } {
  if (options.carried && (options.lead || options.width === "letter")) {
    throw new Error(
      "Only a sheet's head travels with its email: a newsletter's is asked of the site"
    );
  }
  const foot: Part | null = options.foot?.length
    ? stack("s5", rule(), named("foot", stack("s2", ...options.foot)))
    : null;
  const body = stack(options.gap ?? "s6", ...options.body, foot)(ctx);
  const top = headRows(ctx, options);
  const words = h(
    "td",
    {
      class: "pad",
      align: ctx.start,
      style: { padding: px(PAD), "text-align": ctx.start, direction: ctx.dir }
    },
    body.html
  );
  const sheet = h(
    "td",
    {
      class: "sheet",
      bgcolor: L.paper,
      style: {
        "background-color": L.paper,
        border: `${px(SIZE.hairline)} solid ${L.edge}`,
        "border-radius": px(RADIUS.surface),
        "box-shadow": L.shadow
      }
    },
    table({ width: "100%" }, ...top.rows, tr(words))
  );
  return { sheet, text: `${[top.text, body.text].filter(Boolean).join("\n\n")}\n` };
}

/** An email from its parts, as HTML and as plain text. */
export function email(options: EmailOptions): Letter {
  const ctx = context(options);
  const worn = options.lead ?? options.palette;
  const stops = worn ? seedStops(worn.seed) : BRAND;
  const { sheet, text } = sheetOf(ctx, options);
  const column = table(
    {
      width: "100%",
      align: "center",
      style: { width: "100%", "max-width": px(ctx.width), margin: "0 auto" }
    },
    tr(sheet)
  );
  /* the wash is the shorthand alone over the flat color as an attribute, the one form Gmail on Android draws; Outlook
     reads a width from an attribute and no max-width, so it alone gets a table of the sheet's width */
  const ground = table(
    {
      class: "bg wash",
      width: "100%",
      bgcolor: L.bg,
      style: { width: "100%", background: wash(stops, L) }
    },
    tr(
      h(
        "td",
        {
          class: "gutter",
          align: "center",
          style: { padding: `${px(SPACE.s10)} ${px(SPACE.s4)}` }
        },
        mso(
          raw(
            `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${ctx.width}" align="center"><tr><td>`
          )
        ),
        column,
        mso(raw("</td></tr></table>"))
      )
    )
  );
  const preheader =
    options.preheader &&
    h(
      "div",
      {
        style: {
          display: "none",
          "max-height": "0",
          overflow: "hidden",
          "mso-hide": "all",
          "font-size": "1px",
          "line-height": "1px",
          color: L.bg,
          opacity: "0"
        }
      },
      options.preheader,
      FILLER.repeat(60)
    );
  const body = h(
    "body",
    {
      class: "bg wash",
      dir: ctx.dir,
      bgcolor: L.bg,
      style: { margin: "0", padding: "0", width: "100%", background: wash(stops, L) }
    },
    preheader,
    ground
  );
  return {
    subject: options.subject,
    html: page(ctx, options.subject, stops, options.scheme ?? "auto", body),
    text
  };
}

/** An email set into a page of the site: its sheet as an inbox shows it, head, words and foot, without the wash. The
    browser draws what the email would ask the site for. The markup is for a tree of its own, beside `insetStyles`. */
export function inset(options: EmailOptions): { html: string; text: string } {
  const ctx = context({ ...options, web: true });
  const { sheet, text } = sheetOf(ctx, options);
  const html = h(
    "div",
    { class: "inset", dir: ctx.dir },
    table({ width: "100%", style: { width: "100%", "max-width": px(ctx.width) } }, tr(sheet))
  ).html;
  return { html, text };
}

/** The styles of that tree: the sheet's classes in the colors the page gives, as CSS values, so an issue follows the
    page's theme, and a phone's measures where the column, not the window, is narrow. */
export const insetStyles = (colors: SheetColors): string =>
  `.inset{container-type:inline-size}${rules("", sheetRules(colors))}@container (max-width:${NARROW}){${NARROW_SHEET}}`;

/** One part alone on the sheet's paper, under an email's own head styles, for the design document. Never sent. */
export function specimen(
  part: Part,
  options: { origin: string; locale?: Locale; width?: "sheet" | "letter"; scheme?: Mode }
): string {
  const ctx = context(options);
  const body = h(
    "body",
    {
      class: "sheet",
      dir: ctx.dir,
      style: { margin: "0", padding: "0", "background-color": L.paper }
    },
    table(
      { width: "100%", style: { "max-width": px(ctx.measure + 2 * SPACE.s5) } },
      tr(
        h(
          "td",
          { align: ctx.start, style: { padding: px(SPACE.s5), "text-align": ctx.start } },
          part(ctx).html
        )
      )
    )
  );
  return page(ctx, "Specimen", BRAND, options.scheme ?? "light", body);
}
