/* The color space as a copy: a presentation build, never a screenshot. A copy is read on its own, so it is a card in
   the theme's paper with the wordmark whose bar carries this palette, the seed that leads back, the picture, the
   palette as the fused strip and a footer of measured numbers. Two figures: three panels at 1200px (the orbit as the
   reader turned it, the cylinder unrolled as a chroma read, the palette inside the gamut's solid), or the solid alone
   at 960px once it has been kept home. Every part is a named layer, Poppins is inlined, and every color is a literal a
   design tool reads. Words are the reader's; numbers, hexes and the names of spaces stay as written, and the layout is
   the picture's own in every language. */

import { encodePalette } from "@grabient/engine/codec.ts";
import { deltaE, lchToSrgb, srgbToLch, type Triple, toHex } from "@grabient/engine/color.ts";
import { sampleLCH } from "@grabient/engine/curve.ts";
import { hueTravel } from "@grabient/engine/edits.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { HUE_MIN_C, maxChromaAt } from "@grabient/engine/plot.ts";
import { layoutStops } from "@grabient/engine/strip.ts";
import { STYLE_LABELS, type Style } from "@grabient/engine/view.ts";
import { dir, locale, t } from "./i18n.ts";
import { LOGO_BAR, LOGO_GLYPH, LOGO_PATH } from "./logo.data.ts";
import { marksSvg, type Rect } from "./marks.ts";
import {
  CAM0,
  type Cam,
  insideScene,
  type SolidFrame,
  type SolidInk,
  solidFrame,
  solidScene
} from "./solid.ts";
import { color, font, radius } from "./tokens.ts";

export type FigureTheme = "dark" | "light";
export interface FigureOpts {
  palette: Palette;
  steps: number;
  /** the stops as hard bands: the dots are what ships */
  stepped?: boolean;
  wide?: boolean;
  /** the camera the reader left the scene at */
  cam?: Cam;
  /** the solid kept home: the figure is the solid alone */
  kept?: boolean;
  theme?: FigureTheme;
  style?: Style;
  angle?: number;
  seed?: string;
}
export interface FigureMeta {
  seed: string;
  keyframes: number;
  steps: number;
  lStart: number;
  lEnd: number;
  cPeak: number;
  hueTravel: number;
  clippedPct: number;
  renderErr: number;
  wide: boolean;
}

interface Ink {
  panel: string;
  ink: string;
  label: string;
  grid: string;
  edge: string;
  shade: string;
  accent: string;
  onLight: string;
  onDark: string;
}
/* the theme's inks off the tokens, so a figure is the site's own paper and ink */
const inkOf = (theme: FigureTheme): Ink => {
  const c = color[theme];
  return {
    panel: c.paperSolid,
    ink: c.ink,
    label: c.ink3,
    grid: c.edge,
    edge: c.edge2,
    shade: c.paper3,
    accent: c.accent,
    onLight: c.onLight,
    onDark: c.onDark
  };
};
const solidInk = (K: Ink): SolidInk => ({
  ink: K.ink,
  ink3: K.label,
  edge: K.edge,
  paper: K.panel
});
const SANS = font.sans.replace(/"/g, "&quot;");
const MONO = font.mono.replace(/"/g, "&quot;");
const p1 = (v: number) => (Math.round(v * 10) / 10).toString();
const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/* in a right-to-left language each line of words is an isolate of its own (RLI … PDI), so a caption keeps its order
   around a name or a number in it */
const isolated = (text: string) => (dir() === "rtl" ? `⁧${text}⁩` : text);
/** A named layer: id for Illustrator and Inkscape, data-name for Figma. Empty ones are dropped. */
const layer = (name: string, body: string) =>
  body ? `<g id="${name}" data-name="${name}">${body}</g>` : "";
/* capitals the reader's language's way: a Turkish i is İ */
const caption = (
  text: string,
  x: number,
  y: number,
  fill: string,
  anchor = "start",
  halo?: string
) => {
  const at = `x="${p1(x)}" y="${p1(y)}" font-family="${SANS}" font-size="10" font-weight="700" letter-spacing="0.12em" text-anchor="${anchor}"`;
  const words = esc(isolated(text.toLocaleUpperCase(locale())));
  const under = halo
    ? `<text ${at} fill="none" stroke="${halo}" stroke-width="4" stroke-linejoin="round">${words}</text>`
    : "";
  return `${under}<text ${at} fill="${fill}">${words}</text>`;
};
const mono = (text: string, x: number, y: number, fill: string, size = 11, anchor = "start") =>
  `<text x="${p1(x)}" y="${p1(y)}" font-family="${MONO}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" style="font-variant-numeric:tabular-nums">${esc(isolated(text))}</text>`;
const stepsText = (count: number) => t("{count, plural, one {# step} other {# steps}}", { count });
/* the site's dash: 2px on, 4px off */
const dash = (x0: number, x1: number, y: number, stroke: string) =>
  `<line x1="${p1(x0)}" x2="${p1(x1)}" y1="${p1(y)}" y2="${p1(y)}" stroke="${stroke}" stroke-dasharray="2 4"/>`;

/* Poppins 500 and 700, fetched once and inlined, so a pasted figure keeps its typeface; none on a failure, which is
   not tried again for the page's life */
let fonts: string | null = null;
export async function loadFigureFonts(): Promise<void> {
  if (fonts !== null) return;
  try {
    const faces = await Promise.all(
      [500, 700].map(async weight => {
        const answer = await fetch(`/fonts/poppins-latin-${weight}-normal.woff2`);
        const bytes = new Uint8Array(await answer.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
          bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return `@font-face{font-family:Poppins;font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2')}`;
      })
    );
    fonts = faces.join("");
  } catch {
    fonts = "";
  }
}
const fontStyle = () => (fonts ? `<style>${fonts}</style>` : "");

/** The footer's numbers, measured off the drawn samples. */
export function figureMeta(P: Palette, steps: number, wide = false): FigureMeta {
  const n = 256;
  const at = (t: number) => {
    const ask = sampleLCH(P, t);
    const rgb = lchToSrgb(ask[0], ask[1], ask[2]);
    return { ask, rgb, out: srgbToLch(rgb) };
  };
  const cont = Array.from({ length: n }, (_, i) => at(i / (n - 1)));
  const m = Math.max(2, Math.round(steps));
  const stops = Array.from({ length: m }, (_, i) => at(i / (m - 1)));
  let cPeak = 0;
  let clipped = 0;
  for (const s of cont) {
    cPeak = Math.max(cPeak, s.out[1]);
    if (s.ask[1] - s.out[1] > 0.004) clipped++;
  }
  /* how far a blend of two neighboring stops strays from the curve between them */
  let renderErr = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    const mid = at(((i - 1) / (m - 1) + i / (m - 1)) / 2);
    const blend = [0, 1, 2].map(j => (a.rgb[j] + b.rgb[j]) / 2) as Triple;
    renderErr = Math.max(renderErr, deltaE(srgbToLch(blend), mid.out));
  }
  return {
    seed: encodePalette(P),
    keyframes: P.anchors.length,
    steps: m,
    lStart: cont[0].out[0],
    lEnd: cont[n - 1].out[0],
    cPeak,
    hueTravel: hueTravel(P),
    clippedPct: Math.round((100 * clipped) / n),
    renderErr,
    wide
  };
}
const footer = (meta: FigureMeta, x0: number, x1: number, y: number, K: Ink) => {
  const bits = [
    t("{count, plural, one {# keyframe} other {# keyframes}}", { count: meta.keyframes }),
    stepsText(meta.steps),
    `L ${meta.lStart.toFixed(2)}→${meta.lEnd.toFixed(2)}`,
    t("C peak {value}", { value: meta.cPeak.toFixed(3) }),
    t("hue {value}", { value: `${meta.hueTravel > 0 ? "+" : ""}${meta.hueTravel.toFixed(0)}°` }),
    t("stops off curve ΔE {value}", { value: meta.renderErr.toFixed(3) }),
    meta.clippedPct ? t("{percent}% gamut-mapped", { percent: meta.clippedPct }) : t("in gamut")
  ];
  return dash(x0, x1, y - 14, K.edge) + mono(bits.join("   ·   "), x0, y, K.label, 11);
};

/* the header: the wordmark, its bar the palette's first, middle and last colors; what the figure is; the seed */
function header(o: {
  x: number;
  right: number;
  y: number;
  h: number;
  hexes: string[];
  label: string;
  seed: string;
  K: Ink;
}) {
  const k = o.h / 50;
  const base = o.y + (LOGO_GLYPH.h * k) / 2 + (10 * 0.72) / 2;
  const end = o.x + LOGO_GLYPH.w * k;
  const h = o.hexes;
  const bar = h.length
    ? [h[0], h[Math.floor((h.length - 1) / 2)], h[h.length - 1]]
    : [o.K.label, o.K.label, o.K.label];
  return (
    `<defs><linearGradient id="logoG" x1="0%" y1="0%" x2="100%" y2="0%">${bar.map((c, i) => `<stop offset="${i * 50}%" stop-color="${c}"/>`).join("")}</linearGradient></defs>` +
    `<g transform="translate(${p1(o.x)} ${p1(o.y)}) scale(${k.toFixed(4)})"><path fill="${o.K.ink}" d="${LOGO_PATH}"/><rect x="${LOGO_BAR.x}" y="${LOGO_BAR.y}" width="${LOGO_BAR.w}" height="${LOGO_BAR.h}" fill="url(#logoG)"/></g>` +
    caption(o.label, end + 18, base, o.K.label) +
    mono(o.seed, o.right, base, o.K.label, 11, "end") +
    dash(o.x, o.right, o.y + o.h + 6, o.K.edge)
  );
}
const viewLabel = (o: FigureOpts) =>
  [
    `OKLCH · ${o.wide ? "Display P3" : "sRGB"}`,
    o.style ? t(STYLE_LABELS[o.style]) : "",
    stepsText(Math.max(2, Math.round(o.steps))),
    o.angle != null && o.style && !o.style.startsWith("radial") ? `${o.angle}°` : ""
  ]
    .filter(Boolean)
    .join(" · ");

/* the palette as the fused strip, laid out as the page's StopStrip is */
function strip(
  hexes: string[],
  x0: number,
  y0: number,
  w: number,
  K: Ink
): { svg: string; h: number } {
  const L = layoutStops(
    hexes.map(hex => ({ hex })),
    w
  );
  const rowH = L.two ? 56 : 72;
  const cols = Math.ceil(hexes.length / L.rows.length);
  const unit = w / cols;
  const r = Math.min(10, radius.surface);
  let svg = `<defs><clipPath id="sw"><rect x="${p1(x0)}" y="${y0}" width="${p1(w)}" height="${rowH * L.rows.length}" rx="${r}"/></clipPath></defs><g clip-path="url(#sw)">`;
  const boxes: {
    x: number;
    y: number;
    w: number;
    hex: string;
    ink: "onLight" | "onDark";
    first: boolean;
  }[] = [];
  L.rows.forEach((row, ri) => {
    let u = 0;
    row.forEach((c, i) => {
      const back = ri % 2 === 1;
      boxes.push({
        x: back ? x0 + w - (u + c.span) * unit : x0 + u * unit,
        y: y0 + ri * rowH,
        w: c.span * unit,
        hex: c.hex,
        ink: c.ink,
        /* the seam is on a box's left edge, and the leftmost has none: on the second row, the gradient's last */
        first: back ? i === row.length - 1 : i === 0
      });
      u += c.span;
    });
  });
  for (const b of boxes)
    svg += `<rect x="${p1(b.x)}" y="${b.y}" width="${p1(b.w + 0.5)}" height="${rowH}" fill="${b.hex}"/>`;
  const track =
    !L.vertical && L.size < 11
      ? ' letter-spacing="-0.01em"'
      : L.vertical
        ? ' letter-spacing="0.04em"'
        : "";
  for (const b of boxes) {
    const fill = b.ink === "onLight" ? K.onLight : K.onDark;
    const shadow = b.ink === "onLight" ? K.onDark : K.onLight;
    if (!b.first)
      svg += `<line x1="${p1(b.x)}" x2="${p1(b.x)}" y1="${b.y}" y2="${b.y + rowH}" stroke="${fill}" stroke-opacity="0.3" stroke-dasharray="2 4"/>`;
    if (!L.show) continue;
    const cx = b.x + b.w / 2;
    const cy = b.y + rowH / 2;
    const ax = L.vertical ? cx + L.size * 0.35 : cx;
    const ay = L.vertical ? cy : cy + L.size * 0.35;
    const rot = L.vertical ? ` transform="rotate(-90 ${p1(ax)} ${p1(ay)})"` : "";
    const text = (dy: number, f: string, op: string) =>
      `<text x="${p1(ax)}" y="${p1(ay + dy)}" font-family="${MONO}" font-size="${L.size}" font-weight="500" text-anchor="middle" fill="${f}"${op}${track}${rot} style="font-variant-numeric:tabular-nums">${b.hex}</text>`;
    svg += text(1, shadow, ' fill-opacity="0.45"') + text(0, fill, "");
  }
  svg += `</g><rect x="${p1(x0)}" y="${y0}" width="${p1(w)}" height="${rowH * L.rows.length}" rx="${r}" fill="none" stroke="${K.edge}"/>`;
  return { svg, h: rowH * L.rows.length };
}
const hexesOf = (P: Palette, steps: number) => {
  const m = Math.max(2, Math.round(steps));
  return Array.from({ length: m }, (_, i) => {
    const [l, c, h] = sampleLCH(P, i / (m - 1));
    return toHex(lchToSrgb(l, c, h));
  });
};

/* the chroma read: the cylinder unrolled, lightness up and chroma across, the gamut's ceiling dotted */
function chromaPanel(f: SolidFrame, r: Rect, ringC: number, K: Ink, wide: boolean): string {
  const px0 = r.x + 34;
  const px1 = r.x + r.w - 30;
  const py0 = r.y + 22;
  const py1 = r.y + r.h - 26;
  const c = f.cont;
  const ceil = c.map(s => maxChromaAt(s.out[0], s.out[1] >= HUE_MIN_C ? s.out[2] : 0, wide));
  const xMax = Math.min(0.42, Math.max(ringC, Math.max(...ceil) * 1.03));
  const X = (v: number) => px0 + (px1 - px0) * Math.min(1, v / xMax);
  const Y = (L: number) => py1 - (py1 - py0) * Math.min(1, Math.max(0, L));
  let out = "";
  const step = xMax > 0.26 ? 0.1 : 0.05;
  for (let v = step; v < xMax - 1e-6; v += step)
    out +=
      `<line x1="${p1(X(v))}" x2="${p1(X(v))}" y1="${p1(py0)}" y2="${p1(py1)}" stroke="${K.grid}" stroke-dasharray="2 4"/>` +
      mono(v.toFixed(2), X(v), py1 + 14, K.label, 9, "middle");
  for (const [L, name] of [
    [0, "0"],
    [0.5, ""],
    [1, "1"]
  ] as [number, string][]) {
    out += dash(px0, px1, Y(L), K.grid);
    if (name) out += mono(`L ${name}`, px0 - 8, Y(L) + 3.5, K.label, 9, "end");
  }
  out += mono("C", px1 + 6, py1 + 14, K.label, 9, "end");
  let band = "";
  c.forEach((s, i) => {
    band += `${i ? "L" : "M"}${p1(X(s.out[1]))} ${p1(Y(s.out[0]))}`;
  });
  for (let i = c.length - 1; i >= 0; i--) band += `L${p1(X(ceil[i]))} ${p1(Y(c[i].out[0]))}`;
  out += `<path d="${band}Z" fill="${K.shade}"/>`;
  let roof = "";
  ceil.forEach((v, i) => {
    roof += `${i ? "L" : "M"}${p1(X(v))} ${p1(Y(c[i].out[0]))}`;
  });
  out += `<path d="${roof}" fill="none" stroke="${K.label}" stroke-width="1.2" stroke-dasharray="1.5 3"/>`;
  let wi = 0;
  ceil.forEach((v, i) => {
    if (v > ceil[wi]) wi = i;
  });
  /* the wall's name reads leftward from the wall, so a wide gamut's wall at the panel's edge keeps its name inside */
  const limit = t("{space} limit", { space: wide ? "Display P3" : "sRGB" });
  const lw = limit.length * 7.4;
  const wx = X(ceil[wi]);
  const wy = Y(c[wi].out[0]);
  const clear = (x0: number, y0: number) =>
    c.every(s => {
      const x = X(s.out[1]);
      const y = Y(s.out[0]);
      return x < x0 - 6 || x > x0 + lw + 6 || y < y0 - 16 || y > y0 + 6;
    });
  const spot = [
    [wx - 6 - lw, wy - 8],
    [wx - 6 - lw, wy + 18],
    [wx - 6 - lw, wy - 26],
    [wx - 6 - lw, wy + 36]
  ].find(([x, y]) => clear(x, y)) ?? [wx - 6 - lw, wy - 8];
  out += caption(limit, spot[0] + lw, spot[1], K.label, "end", K.panel);
  let ask = "";
  let pen = false;
  for (const s of c) {
    if (s.ask - s.out[1] > 0.004) {
      ask += `${pen ? "L" : "M"}${p1(X(s.ask))} ${p1(Y(s.out[0]))}`;
      pen = true;
    } else pen = false;
  }
  if (ask)
    out += `<path d="${ask}" fill="none" stroke="${K.accent}" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.65"/>`;
  for (let i = 0; i < 24; i++)
    out += `<line x1="${p1(X(0))}" x2="${p1(X(0))}" y1="${p1(Y(i / 24))}" y2="${p1(Y((i + 1) / 24))}" stroke="${toHex(lchToSrgb((i + 0.5) / 24, 0, 0))}" stroke-width="5"/>`;
  let run = "";
  c.forEach((s, i) => {
    run += `${i ? "L" : "M"}${p1(X(s.out[1]))} ${p1(Y(s.out[0]))}`;
  });
  out += `<path d="${run}" fill="none" stroke="${K.ink}" stroke-opacity="0.7" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="${run}" fill="none" stroke="${K.panel}" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  for (let i = 1; i < c.length; i++)
    out += `<line x1="${p1(X(c[i - 1].out[1]))}" y1="${p1(Y(c[i - 1].out[0]))}" x2="${p1(X(c[i].out[1]))}" y2="${p1(Y(c[i].out[0]))}" stroke="${c[i].hex}" stroke-width="3.4" stroke-linecap="round"/>`;
  if (f.stepped)
    for (const s of f.stops)
      out += `<circle cx="${p1(X(s.out[1]))}" cy="${p1(Y(s.out[0]))}" r="3.6" fill="${s.hex}" stroke="${K.label}" stroke-width="1"/>`;
  return out;
}

/* the card around a figure's body: the background, the header, the strip under its count, the footer */
function card(
  o: FigureOpts,
  K: Ink,
  W: number,
  body: string,
  bodyBottom: number,
  meta: FigureMeta
): string {
  const PADX = 24;
  const hexes = hexesOf(o.palette, o.steps);
  const swY = bodyBottom + 24;
  const sw = strip(hexes, PADX, swY, W - PADX * 2, K);
  const footY = swY + sw.h + 22;
  const H = footY + 20;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    fontStyle() +
    layer(
      "background",
      `<rect width="${W}" height="${H}" rx="${radius.surface}" fill="${K.panel}"/>`
    ) +
    layer(
      "header",
      header({
        x: PADX,
        right: W - PADX,
        y: 24,
        h: 26,
        hexes,
        label: viewLabel(o),
        seed: o.seed ?? meta.seed,
        K
      })
    ) +
    body +
    layer("palette", caption(stepsText(hexes.length), PADX, swY - 10, K.label) + sw.svg) +
    layer("footer", footer(meta, PADX, W - PADX, footY, K)) +
    "</svg>"
  );
}

/** The figure the view on screen asks for: the three panels, or the solid alone once it has been kept. */
export function buildFigure(o: FigureOpts): string {
  const K = inkOf(o.theme ?? "dark");
  const cam = o.cam ?? CAM0;
  const f = solidFrame(o.palette, o.steps, !!o.stepped, !!o.wide, [], 96);
  const meta = figureMeta(o.palette, o.steps, !!o.wide);
  const space = o.wide ? "Display P3" : "sRGB";
  const bodyY = 62;
  if (o.kept) {
    const W = 960;
    const solid = insideScene(f, cam, solidInk(K), {
      u: 1.9,
      into: { x: 24, y: bodyY, w: W - 48, h: 780 },
      top: 22
    });
    const body = layer(
      "panel-solid",
      caption(t("the palette inside the {space} solid", { space }), 34, bodyY + 16, K.label) +
        marksSvg(solid, "sol")
    );
    return card(o, K, W, body, bodyY + 780, meta);
  }
  const W = 1200;
  const GUT = 16;
  const panel = Math.floor((W - 48 - GUT * 2) / 3);
  const rectOf = (i: number): Rect => ({ x: 24 + i * (panel + GUT), y: bodyY, w: panel, h: panel });
  const orbit = solidScene(f, cam, solidInk(K), W, 1400, {
    u: 1.35,
    into: rectOf(0),
    hullK: null,
    hull: false,
    labelU: 1.05,
    outline: true
  });
  const solid = insideScene(f, cam, solidInk(K), { u: 1.25, into: rectOf(2), top: 22 });
  const names = [
    t("orbit"),
    t("chroma · lightness by color"),
    t("inside the {space} solid", { space })
  ];
  const name = (i: number) => caption(names[i], 24 + i * (panel + GUT) + 10, bodyY + 16, K.label);
  const body = layer(
    "figure",
    layer("panel-orbit", name(0) + marksSvg(orbit.marks, "orb")) +
      layer("panel-chroma", name(1) + chromaPanel(f, rectOf(1), orbit.ringC, K, !!o.wide)) +
      layer("panel-solid", name(2) + marksSvg(solid, "sol"))
  );
  return card(o, K, W, body, bodyY + panel, meta);
}
/** A figure file's name: the color space's three panels, or the solid kept alone. */
export const figureName = (seed: string, kept?: boolean) =>
  `grabient-${seed}-${kept ? "solid" : "space"}`;

/** A figure rasterized to a PNG at `scale`. Browser only. */
export async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const m = /width="(\d+)" height="(\d+)"/.exec(svg);
  const w = m ? +m[1] : 1200;
  const h = m ? +m[2] : 760;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("png encode failed"))),
      "image/png"
    )
  );
}
/** Hands the browser a file to save. */
export function downloadFile(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
