/* About's share cards: the editor in small. A palette the site's Random draws, in a view drawn at random as well (a
   style, steps and an angle; band styles take few steps or many, gradients many), stands beside the Color space pane's
   scene of the same palette: its path through the solid, a dot for each step where the view draws bands. The scene is
   the pane's own marks (solid.ts) at the pane's first camera, the picture is the site's own share card of the view
   (server/images/paint.ts: the wordmark at its top left, as on every palette's card), and the frames are the site's
   CSS with the tokens' values. build-icons.ts draws a card for each of ABOUT_SEEDS at ABOUT_CARD's scale, public/about-1.png on, and
   About's metadata shows one a day (page-meta.ts). The scene's few labels stay as written: one picture serves every
   language, as the site's card does. */
import { canonical } from "@grabient/engine/codec.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { randomPalette } from "@grabient/engine/random.ts";
import { isSwatchStyle, STYLES, type Style } from "@grabient/engine/view.ts";
import { marksSvg } from "@grabient/ui/marks.ts";
import { CAM0, solidFrame, solidScene } from "@grabient/ui/solid.ts";
import { color, radius, size, space } from "@grabient/ui/tokens.ts";
import { drawCard, lookOf } from "../src/server/images/paint.ts";

/** The page in CSS px, drawn at `scale`: 1200 by 630. */
export const ABOUT_CARD = { w: 800, h: 420, scale: 1.5 } as const;
/* the picture and the pane side by side on the ground, as tall as the margins leave them */
const H = ABOUT_CARD.h - 2 * space.s6;
const PANE = { w: 340, h: H };
const PICTURE = { w: ABOUT_CARD.w - 2 * space.s6 - space.s4 - PANE.w, h: H };
/** The pane's box: the pane less its edge and its padding. */
export const SCENE = {
  w: PANE.w - 2 * (size.hairline + space.s4),
  h: PANE.h - 2 * (size.hairline + space.s4)
};

/** The cards' draws: Random's from these seeds, each kept for how it reads at a share card's size, one style family
    apiece and a seventh; page-meta.ts's ABOUT_CARDS says how many there are. */
export const ABOUT_SEEDS = [11, 53, 47, 32, 33, 50, 41] as const;
/** Chance from a seed (mulberry32), the same draws on every machine. */
export function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What a card shows: a palette and how its picture is drawn. */
export interface AboutDraw {
  palette: Palette;
  style: Style;
  steps: number;
  angle: number;
}

/** A palette as Random draws one, and a view for it: any style and angle; bands in a few steps or many (3 to 7, or 20
    to 40, even odds), a gradient in many (16 to 48), so it follows its curve smoothly. */
export function aboutDraw(rand: () => number = Math.random): AboutDraw {
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const palette = canonical(randomPalette(rand));
  const style = STYLES[Math.floor(rand() * STYLES.length)] ?? STYLES[0];
  const steps = isSwatchStyle(style) ? (rand() < 0.5 ? int(3, 7) : int(20, 40)) : int(16, 48);
  return { palette, style, steps, angle: int(0, 359) };
}

/** A card as a page of ABOUT_CARD's CSS size, in the theme's colors: the draw's picture on the left and, on the right,
    a pane holding `pane`, whose box is SCENE's. */
export async function cardPage(
  draw: AboutDraw,
  pane: { html: string; css?: string },
  theme: "dark" | "light" = "dark"
): Promise<string> {
  const c = color[theme];
  /* the picture as the site paints a palette's share card: the view edge to edge and the wordmark at its top left, at
     the cards' own size in whichever ink reads over it, its bar in the view's colors; drawn at the card's scale, so
     each of its pixels is one of the page's */
  const png = await drawCard(
    lookOf(draw.palette, draw),
    null,
    Math.round(PICTURE.w * ABOUT_CARD.scale),
    Math.round(PICTURE.h * ABOUT_CARD.scale)
  );
  const picture = `url(data:image/png;base64,${Buffer.from(png).toString("base64")})`;
  const css = `*{box-sizing:border-box}
html,body{margin:0;width:${ABOUT_CARD.w}px;height:${ABOUT_CARD.h}px;overflow:hidden;background:${c.bg}}
body{display:flex;gap:${space.s4}px;padding:${space.s6}px}
.picture{width:${PICTURE.w}px;height:${PICTURE.h}px;border-radius:${radius.surface}px;background:${picture} 0 0/100% 100% no-repeat;box-shadow:${c.rim}}
.pane{width:${PANE.w}px;height:${PANE.h}px;padding:${space.s4}px;border:${size.hairline}px solid ${c.edge};border-radius:${radius.control}px;background:${c.paperSolid}}
.box{width:${SCENE.w}px;height:${SCENE.h}px}
svg{display:block}
${pane.css ?? ""}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body><div class="picture"></div><div class="pane"><div class="box">${pane.html}</div></div></body></html>`;
}

/** About's card: the pane is the Color space scene of the same palette. */
export function aboutCardHtml(draw: AboutDraw, theme: "dark" | "light" = "dark"): Promise<string> {
  const c = color[theme];
  const scene = solidScene(
    solidFrame(draw.palette, draw.steps, isSwatchStyle(draw.style), false),
    CAM0,
    { ink: c.ink, ink3: c.ink3, edge: c.edge, paper: c.paperSolid },
    SCENE.w,
    SCENE.h,
    { hullK: 0, outline: true }
  );
  return cardPage(
    draw,
    {
      html: `<svg width="${SCENE.w}" height="${SCENE.h}" viewBox="0 0 ${SCENE.w} ${SCENE.h}">${marksSvg(scene.marks, "s")}</svg>`
    },
    theme
  );
}
