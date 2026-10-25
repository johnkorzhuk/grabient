/* About's share card: the editor's Color space pane as a component on the site's ground, its head (the name, and the
   strip that copies and saves the figure) over the solid it draws. The scene is the pane's own marks (solid.ts) at the
   pane's first camera, its frame is the pane's CSS with the tokens' values, and build-icons.ts draws the page at
   ABOUT_CARD's scale into public/about.png. Its words are English: one picture serves every language, as the site's
   card does. */
import { readFile } from "node:fs/promises";
import type { Palette } from "@grabient/engine/palette.ts";
import { t } from "@grabient/i18n";
import { ICONS, type IconName } from "@grabient/ui/icons.data.ts";
import { marksSvg } from "@grabient/ui/marks.ts";
import { CAM0, solidFrame, solidScene } from "@grabient/ui/solid.ts";
import { color, font, radius, size, space } from "@grabient/ui/tokens.ts";

/** The page in CSS px, drawn at `scale`: 1200 by 630. */
export const ABOUT_CARD = { w: 800, h: 420, scale: 1.5 } as const;
/* the pane stands in the middle with the ground around it, as narrow as its scene needs */
const PANE = { w: 440, h: ABOUT_CARD.h - 2 * space.s6 };
/* the scene's box: the pane less its edge, its padding, its head and the gap under the head */
const SCENE = {
  w: PANE.w - 2 * (size.hairline + space.s4),
  h: PANE.h - 2 * (size.hairline + space.s4) - size.controlSm - space.s3
};
/* a palette that climbs the pole: lightness 0.4 to 0.9 at one chroma while hue travels 600°, inside sRGB all the
   way, so the coil keeps its radius and nothing in it is gamut-mapped */
const CLIMB: Palette = {
  anchors: [0, 1, 2, 3, 4].map(i => ({ l: 0.4 + 0.125 * i, c: 0.11, h: 270 + 150 * i }))
};

const icon = (name: IconName) =>
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name]}"/></svg>`;

/** The card as a page of ABOUT_CARD's CSS size, in the theme's colors, Poppins inlined. */
export async function aboutCardHtml(theme: "dark" | "light" = "dark"): Promise<string> {
  const c = color[theme];
  const poppins = await readFile(
    new URL("../public/fonts/poppins-latin-700-normal.woff2", import.meta.url)
  );
  const scene = solidScene(
    solidFrame(CLIMB, 7, false, false),
    CAM0,
    { ink: c.ink, ink3: c.ink3, edge: c.edge, paper: c.paperSolid },
    SCENE.w,
    SCENE.h,
    { hullK: 0, outline: true }
  );
  const words = `${font.bold} ${font.fs1}px/${font.lhNone} ${font.sans}`;
  const css = `@font-face{font-family:Poppins;font-weight:${font.bold};src:url(data:font/woff2;base64,${poppins.toString("base64")}) format("woff2")}
*{box-sizing:border-box}
html,body{margin:0;width:${ABOUT_CARD.w}px;height:${ABOUT_CARD.h}px;overflow:hidden;background:${c.bg}}
body{display:grid;place-items:center}
.pane{display:flex;flex-direction:column;gap:${space.s3}px;width:${PANE.w}px;height:${PANE.h}px;padding:${space.s4}px;border:${size.hairline}px solid ${c.edge};border-radius:${radius.control}px;background:${c.paperSolid}}
.head{display:flex;align-items:center;justify-content:space-between;gap:${space.s3}px;min-height:${size.controlSm}px}
.name{color:${c.ink3};font:${words};letter-spacing:${font.lsMicro};text-transform:uppercase}
.strip{display:flex;outline:${size.hairline}px solid ${c.edge};outline-offset:-${size.hairline}px;border-radius:${radius.tight}px;background:${c.paper2};color:${c.ink2}}
.chip{display:flex;align-items:center;justify-content:center;gap:${space.s1}px;height:${size.controlSm}px;padding:0 ${space.s2}px;font:${words};white-space:pre}
.mode{width:${size.controlSm}px;padding:0;border-right:${size.hairline}px solid ${c.edge}}
svg.scene{display:block}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body><div class="pane"><div class="head"><span class="name">${t("Color space")}</span><span class="strip"><span class="chip mode">${icon("copy")}</span><span class="chip">${icon("vector")} SVG</span><span class="chip">${icon("image")} PNG</span></span></div><svg class="scene" width="${SCENE.w}" height="${SCENE.h}" viewBox="0 0 ${SCENE.w} ${SCENE.h}">${marksSvg(scene.marks, "s")}</svg></div></body></html>`;
}
