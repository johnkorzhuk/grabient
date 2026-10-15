/* The sheet's head: a picture from edge to edge with the wordmark on it, which no mail app recolors. A palette's head is
   the site's share card without its chips (`/api/og?…&head=WxH`) over the same view in CSS; an email with no palette
   wears the brand's, a file drawn ahead by the same painter. A page of the site draws the wordmark itself from the
   logo's path, in the painter's place and ink, so it asks for no picture.

   A head is a strip a quarter as tall as wide, so not every palette makes one (`headFault`): an angular view is cut
   into a fan, a gray palette has nothing to wear, a busy radial gradient is rings, and the wordmark must read on what
   lies under it. Every measure here is the card painter's own arithmetic, so the email agrees with the picture. */
import { contrastOf, hexToSrgb, luminance, srgbToLch } from "@grabient/engine/color.ts";
import type { Style } from "@grabient/engine/view.ts";
import { LOGO_BAR, LOGO_PATH, LOGO_VIEWBOX } from "@grabient/ui/logo.data.ts";
import { type Html, h } from "./html.ts";
import {
  headOf,
  hexes,
  type PaletteView,
  pageAddress,
  type Shown,
  shown,
  viewGround
} from "./palette.ts";
import { BLANK, type Ctx, face, homeAddress, L, pictureLink, px } from "./parts.ts";
import {
  BRAND,
  HEAD_CID,
  HEAD_FILES,
  type HeadSize,
  onColor,
  ramp,
  SCHEMES,
  SIZE
} from "./theme.ts";

/** Where the painter sets the wordmark's mask on a head, in the picture's own pixels, and the two inks it sets it in. */
export const WORDMARK = { x: 32, y: 32, width: 286, height: 50, inks: [10, 250] } as const;
/* The least contrast of the ink with all but a twentieth of what lies under it: WCAG's for large text and graphics. */
const READS = 3;
/* A radial gradient whose lightness turns back this often, each by this much, over this much lightness, is busy. */
const BUSY = { turns: 2, deep: 0.03, span: 0.2 } as const;
/* The least OKLCH chroma that gives an email any color to wear. */
const COLORFUL = 0.06;
/** How finely a palette is read for its wash and its color. */
const SAMPLES = 33;
const STRIP_STYLES: readonly Style[] = [
  "linearGradient",
  "linearSwatches",
  "radialGradient",
  "radialSwatches"
];

const bytes = (hex: string) => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
const light = (rgb: readonly number[]) => luminance(rgb.map(v => v / 255));
const INKS = WORDMARK.inks.map(tone => light([tone, tone, tone]));
const lchOf = (hex: string) => srgbToLch(hexToSrgb(hex) ?? [0, 0, 0]);

/** A palette's colors finely read: the wash behind an email's sheet. */
export const seedStops = (seed: string): string[] => hexes(shown({ seed }).palette, SAMPLES);

/* The points of the wordmark's area the painter samples: every four pixels, from the second. */
function marks(): (readonly [number, number])[] {
  const points: (readonly [number, number])[] = [];
  for (let y = WORDMARK.y + 2; y < WORDMARK.y + WORDMARK.height; y += 4) {
    for (let x = WORDMARK.x + 2; x < WORDMARK.x + WORDMARK.width; x += 4) points.push([x, y]);
  }
  return points;
}

/** How light a head is under each part of the wordmark: how far along its line, or out from its middle, a point lies,
    and the color there, blended between stops or in bands, as the painter places it. */
function underMark(show: Shown, size: HeadSize): number[] {
  const [w, t] = SIZE.heads[size];
  const colors = show.colors.map(bytes);
  const n = colors.length;
  const angle = (show.view.angle * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const line = Math.abs(w * sin) + Math.abs(t * cos);
  const radius = Math.hypot(w, t) / 2;
  const radial = show.view.style.startsWith("radial");
  const bands = show.view.style.endsWith("Swatches");
  return marks().map(([x, y]) => {
    const dx = x + 0.5 - w / 2;
    const dy = y + 0.5 - t / 2;
    const along = radial ? Math.hypot(dx, dy) / radius : (dx * sin - dy * cos) / line + 0.5;
    const at = Math.min(1, Math.max(0, along));
    const position = bands ? Math.min(n - 1, Math.floor(at * n)) : at * (n - 1);
    const i = Math.floor(position);
    const a = colors[i];
    const b = colors[Math.min(n - 1, i + 1)];
    return light(a.map((v, k) => v + (b[k] - v) * (position - i)));
  });
}
/* The brand's head runs its colors left to right. */
function brandUnderMark(size: HeadSize, at: (t: number) => string): number[] {
  const lights: number[] = [];
  for (let x = WORDMARK.x + 2; x < WORDMARK.x + WORDMARK.width; x += 4) {
    lights.push(light(bytes(at((x + 0.5) / SIZE.heads[size][0]))));
  }
  return lights;
}
/** Whether the painter sets the wordmark in its near black: the ink that contrasts more with the mean light. */
function darkInk(lights: readonly number[]): boolean {
  const mean = lights.reduce((sum, value) => sum + value, 0) / lights.length;
  return contrastOf(mean, INKS[0]) >= contrastOf(mean, INKS[1]);
}

function reads(show: Shown, size: HeadSize): boolean {
  const lights = underMark(show, size);
  const ink = darkInk(lights) ? INKS[0] : INKS[1];
  const ratios = lights.map(value => contrastOf(value, ink)).sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length / 20)] >= READS;
}
function busy(show: Shown): boolean {
  const lightness = hexes(show.palette, 2 * SAMPLES - 1).map(hex => lchOf(hex)[0]);
  if (Math.max(...lightness) - Math.min(...lightness) < BUSY.span) return false;
  let direction = 0;
  let extreme = lightness[0];
  let turns = 0;
  for (const value of lightness) {
    if (direction === 0) {
      if (Math.abs(value - extreme) >= BUSY.deep) {
        direction = Math.sign(value - extreme);
        extreme = value;
      }
    } else if ((value - extreme) * direction > 0) extreme = value;
    else if (Math.abs(value - extreme) >= BUSY.deep) {
      direction = -direction;
      extreme = value;
      turns++;
    }
  }
  return turns >= BUSY.turns;
}

export type HeadFault = "unread" | "gray" | "angular" | "busy" | "faint";
/** Why a palette in a view makes no head, or null when it does. */
export function headFault(of: PaletteView, size: HeadSize = "sheet"): HeadFault | null {
  let show: Shown;
  try {
    show = shown(of);
  } catch {
    return "unread";
  }
  if (!hexes(show.palette, SAMPLES).some(hex => lchOf(hex)[1] >= COLORFUL)) return "gray";
  if (!STRIP_STYLES.includes(show.view.style)) return "angular";
  if (show.view.style === "radialGradient" && busy(show)) return "busy";
  return reads(show, size) ? null : "faint";
}

/** One of these palettes, drawn at random from those that make a head, in its view made whole: what an account email
    wears. Undefined when none does, and the email wears the brand. */
export function pickHead(
  candidates: readonly PaletteView[],
  rand: () => number = Math.random
): Required<PaletteView> | undefined {
  const fit = candidates.filter(of => headFault(of) === null);
  if (!fit.length) return undefined;
  const { seed, view } = shown(fit[Math.min(fit.length - 1, Math.floor(rand() * fit.length))]);
  return { seed, ...view };
}

/** A head as a page draws it: a block of the head's shape over the view in CSS, with the wordmark from the logo's own
    path at the painter's margin and size, in the painter's ink, its bar running the head's colors. */
function drawn(size: HeadSize, colors: readonly string[], lights: readonly number[]): Html {
  const [w, t] = SIZE.heads[size];
  const tone = WORDMARK.inks[darkInk(lights) ? 0 : 1];
  const part = (n: number) => `${(100 * n).toFixed(3)}%`;
  const offset = (i: number) =>
    colors.length > 1 ? Number((i / (colors.length - 1)).toFixed(4)) : 0;
  const mark = h(
    "svg",
    {
      viewBox: LOGO_VIEWBOX,
      "aria-hidden": "true",
      style: {
        position: "absolute",
        left: part(WORDMARK.x / w),
        top: part(WORDMARK.y / t),
        width: part(WORDMARK.width / w),
        height: "auto"
      }
    },
    h(
      "defs",
      null,
      h(
        "linearGradient",
        { id: "bar" },
        colors.map((color, i) => h("stop", { offset: offset(i), "stop-color": color }))
      )
    ),
    h("path", { d: LOGO_PATH, fill: `rgb(${tone},${tone},${tone})` }),
    h("rect", {
      x: LOGO_BAR.x,
      y: LOGO_BAR.y,
      width: LOGO_BAR.w,
      height: LOGO_BAR.h,
      fill: "url(#bar)"
    })
  );
  return h(
    "span",
    {
      "data-part": "head",
      role: "img",
      "aria-label": "Grabient",
      style: { display: "block", position: "relative", "aspect-ratio": `${w} / ${t}` }
    },
    mark
  );
}

/* The sheet's top corners, a hairline inside its own. */
const ROUND = `${px(13)} ${px(13)} 0 0`;
/* The picture's own size is in its attributes; with pictures off, its alt text stands in heading type. */
const picture = (ctx: Ctx, src: string, size: HeadSize, width: number, ink: string) =>
  h("img", {
    "data-part": "head",
    src,
    width,
    height: Math.round((width * SIZE.heads[size][1]) / SIZE.heads[size][0]),
    alt: "Grabient",
    style: {
      display: "block",
      width: "100%",
      height: "auto",
      border: "0",
      "border-radius": ROUND,
      ...face(ctx, "h2"),
      color: ink
    }
  });

export interface HeadOptions {
  size: HeadSize;
  /** the head's width on the sheet */
  width: number;
  /** where it leads: the palette's page unless given */
  href?: string;
  /** words under the head lead where it does, so a screen reader and the Tab key pass over its link */
  named?: boolean;
  /** it travels with the email under HEAD_CID */
  carried?: boolean;
}
/** A palette's head: the picture over its view in CSS, its alt text in the ink that reads where the wordmark stands. */
export function paletteHead(ctx: Ctx, of: PaletteView, options: HeadOptions): Html {
  const show = shown(of);
  ctx.gate?.(show.seed, show.view);
  const lights = underMark(show, options.size);
  const art = ctx.web
    ? drawn(options.size, show.colors, lights)
    : picture(
        ctx,
        options.carried ? `cid:${HEAD_CID}` : headOf(ctx.origin, show, options.size),
        options.size,
        options.width,
        darkInk(lights) ? L.ink : SCHEMES.dark.ink
      );
  return h(
    "td",
    {
      dir: "ltr",
      // on a page, the lead's head is where an admin's arrows for another lead stand
      ...(ctx.web && options.size === "lead" ? { "data-part": "lead" } : {}),
      ...viewGround(show, { "border-radius": ROUND })
    },
    pictureLink(art, options.href ?? pageAddress(ctx, show), options.named ? {} : undefined)
  );
}

/** The brand's head, leading home. */
export function brandHead(
  ctx: Ctx,
  size: "sheet" | "letter",
  width: number,
  carried?: boolean
): Html {
  const at = ramp(BRAND);
  const art = ctx.web
    ? drawn(size, BRAND, brandUnderMark(size, at))
    : picture(
        ctx,
        carried ? `cid:${HEAD_CID}` : `${ctx.origin}/${HEAD_FILES[size]}`,
        size,
        width,
        onColor(at(0.2))
      );
  return h(
    "td",
    {
      dir: "ltr",
      bgcolor: at(0.5),
      style: {
        background: `linear-gradient(90deg,${BRAND.join(",")})`,
        "border-radius": ROUND,
        ...BLANK
      }
    },
    pictureLink(art, homeAddress(ctx))
  );
}
