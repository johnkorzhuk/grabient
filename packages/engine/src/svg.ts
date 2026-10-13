/* A palette as a standalone SVG in the six styles, its stops sRGB hexes since design tools and rasterizers do not
   parse display-p3. A comment carries the palette's address, `--` written `-%2D` (strict XML parsers reject it in a
   comment). Angular gradients are a fan of thin blended wedges, which every renderer draws, beside a path that tells
   Figma to rebuild a true angular gradient on paste. Radial bands are rings with real holes, and angular bands sit
   under a 0.3px blur that closes the seams between wedges. */
import { hexBytes } from "./color.ts";
import type { Stop } from "./curve.ts";
import { onWheel } from "./math.ts";
import { DEFAULT_SIZE, resolveSize, type Size, type Style, type View, viewSearch } from "./view.ts";

export interface Credit {
  seed: string;
  search: string;
  baseUrl?: string;
}
export interface PaletteSvgOptions {
  width?: number;
  height?: number;
  /** Corner rounding as a percentage of half the smaller side, 0 to 100. */
  borderRadius?: number;
  /** Suffixes every id, so several palettes can share one document. */
  gridItemIndex?: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const halfDiagonal = (w: number, h: number) => Math.sqrt(w * w + h * h) / 2;
const stopTags = (hexes: readonly string[]) =>
  hexes
    .map((c, i) => `<stop offset="${(i / (hexes.length - 1)).toFixed(3)}" stop-color="${c}"/>`)
    .join("");

/* CSS's gradient line spans the rectangle's projection on the direction: pixel coordinates keep that angle at any
   shape, where a normalized line would be stretched with the rectangle */
function linearLine(angle: number, w: number, h: number) {
  const a = onWheel(angle) * (Math.PI / 180);
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (w * Math.abs(dx) + h * Math.abs(dy)) / 2;
  const [x1, y1, x2, y2] = [
    w / 2 - dx * half,
    h / 2 - dy * half,
    w / 2 + dx * half,
    h / 2 + dy * half
  ].map(v => v.toFixed(6));
  return `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`;
}
function bands(hexes: readonly string[], angle: number, w: number, h: number) {
  const a = onWheel(angle) * (Math.PI / 180) - Math.PI / 2;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const cx = w / 2;
  const cy = h / 2;
  let length: number;
  if (Math.abs(dx) < 1e-10) length = h;
  else if (Math.abs(dy) < 1e-10) length = w;
  else {
    const along = [0, w].flatMap(px => [0, h].map(py => (px - cx) * dx + (py - cy) * dy));
    length = Math.max(...along) - Math.min(...along);
  }
  const x0 = cx - (length / 2) * dx;
  const y0 = cy - (length / 2) * dy;
  const px = -dy * halfDiagonal(w, h);
  const py = dx * halfDiagonal(w, h);
  const point = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
  return hexes
    .map((c, i) => {
      const s = (i / hexes.length) * length;
      const e = ((i + 1) / hexes.length) * length;
      const [sx, sy, ex, ey] = [x0 + s * dx, y0 + s * dy, x0 + e * dx, y0 + e * dy];
      return `<path d="M ${point(sx + px, sy + py)} L ${point(sx - px, sy - py)} L ${point(ex - px, ey - py)} L ${point(ex + px, ey + py)} Z" fill="${c}"/>`;
    })
    .join("");
}
/* the fan: 36 wedges per pair of stops, each the pair's byte-wise blend, overdrawn 0.5° to hide hairline seams */
function fan(hexes: readonly string[], angle: number, w: number, h: number) {
  const cx = w / 2;
  const cy = h / 2;
  const radius = halfDiagonal(w, h) + 2;
  const r = radius.toFixed(2);
  const point = (rad: number) =>
    `${(cx + radius * Math.cos(rad)).toFixed(2)},${(cy + radius * Math.sin(rad)).toFixed(2)}`;
  const PER_PAIR = 36;
  const total = (hexes.length - 1) * PER_PAIR;
  const seg = 360 / total;
  let wedges = "";
  for (let i = 0; i < total; i++) {
    const pair = Math.floor(i / PER_PAIR);
    const u = (i % PER_PAIR) / PER_PAIR;
    const from = hexBytes(hexes[pair]);
    const to = hexBytes(hexes[Math.min(pair + 1, hexes.length - 1)]);
    const color = from.map((v, j) =>
      Math.round(v + (to[j] - v) * u)
        .toString(16)
        .padStart(2, "0")
    );
    const s = toRad(angle - 90 + i * seg);
    const e = toRad(angle - 90 + (i + 1) * seg + 0.5);
    wedges += `<path d="M ${cx},${cy} L ${point(s)} A ${r},${r} 0 0 1 ${point(e)} Z" fill="#${color.join("")}"/>`;
  }
  return wedges;
}
/* Figma's GRADIENT_ANGULAR paint, as its importer reads it from data-figma-gradient-fill */
function figmaFill(hexes: readonly string[], angle: number, w: number, h: number) {
  const stops = hexes
    .map((c, i) => {
      const [r, g, b] = hexBytes(c).map(v => v / 255);
      return `{"color":{"r":${r},"g":${g},"b":${b},"a":1},"position":${i / (hexes.length - 1)}}`;
    })
    .join(",");
  const rot = toRad(angle - 90);
  const scale = Math.max(w, h);
  const m00 = scale * Math.cos(rot);
  const m01 = -scale * Math.sin(rot);
  const m10 = scale * Math.sin(rot);
  const m11 = scale * Math.cos(rot);
  const m = { m00, m01, m02: w / 2 - (m00 + m01) / 2, m10, m11, m12: h / 2 - (m10 + m11) / 2 };
  const transform = Object.entries(m)
    .map(([k, v]) => `"${k}":${v.toFixed(6)}`)
    .join(",");
  return `{"type":"GRADIENT_ANGULAR","stops":[${stops}],"stopsVar":[${stops}],"transform":{${transform}},"opacity":1.0,"blendMode":"NORMAL","visible":true}`.replaceAll(
    '"',
    "&quot;"
  );
}
function wedges(hexes: readonly string[], angle: number, w: number, h: number) {
  const cx = (w / 2).toFixed(3);
  const cy = (h / 2).toFixed(3);
  const radius = halfDiagonal(w, h).toFixed(3);
  const seg = 360 / hexes.length;
  const large = seg > 180 ? 1 : 0;
  /* the rounded center and radius, as written, so the wedges meet where the path says */
  const point = (deg: number) =>
    `${(Number(cx) + Number(radius) * Math.cos(toRad(deg))).toFixed(3)},${(Number(cy) + Number(radius) * Math.sin(toRad(deg))).toFixed(3)}`;
  return hexes
    .map((c, i) => {
      const start = angle - 90 + i * seg;
      const end = angle - 90 + (i + 1) * seg;
      return `<path d="M ${cx},${cy} L ${point(start)} A ${radius},${radius} 0 ${large} 1 ${point(end)} Z" fill="${c}"/>`;
    })
    .join("");
}
function rings(hexes: readonly string[], w: number, h: number) {
  const maxR = halfDiagonal(w, h);
  const cx = w / 2;
  const y = (h / 2).toFixed(3);
  const circle = (r: number, sweep: 0 | 1) => {
    const [left, right, rr] = [cx - r, cx + r, r].map(v => v.toFixed(3));
    return `M ${left},${y} A ${rr},${rr} 0 1 ${sweep} ${right},${y} A ${rr},${rr} 0 1 ${sweep} ${left},${y} Z`;
  };
  return hexes
    .map((c, i) => {
      const outer = circle(((i + 1) / hexes.length) * maxR, 1);
      return `<path d="${i === 0 ? outer : `${outer} ${circle((i / hexes.length) * maxR, 0)}`}" fill="${c}"/>`;
    })
    .join("");
}

export function paletteSvg(
  hexes: readonly string[],
  style: Style,
  angle: number,
  credit: Credit,
  options: PaletteSvgOptions = {}
): string {
  const { width: w = 800, height: h = 400, gridItemIndex, borderRadius = 0 } = options;
  const radius = (borderRadius / 100) * (Math.min(w, h) / 2);
  const rx = radius > 0 ? ` rx="${radius}" ry="${radius}"` : "";
  const address = `${credit.seed}${credit.search}`.replace(/--/g, "-%2D");
  const comment = `<!-- ${credit.baseUrl ?? "https://grabient.com"}/${address} -->`;
  const id = (base: string) =>
    typeof gridItemIndex === "number" ? `${base}_${gridItemIndex}` : base;
  const box = `<rect x="0" y="0" width="${w}" height="${h}"${rx}`;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">\n${comment}\n`;
  if (hexes.length === 0) return `${head}</svg>`;
  if (hexes.length === 1) return `${head}${box} fill="${hexes[0]}"/>\n</svg>`;
  const filled = (name: string, gradient: (id: string) => string) =>
    `${head}<defs>${gradient(id(name))}</defs>\n${box} fill="url(#${id(name)})"/>\n</svg>`;
  const clipped = (clip: string, content: string, blur?: string) => {
    const filter = blur
      ? `<filter id="${id(blur)}"><feGaussianBlur in="SourceGraphic" stdDeviation="0.3"/></filter>`
      : "";
    const drawn = blur ? ` filter="url(#${id(blur)})" shape-rendering="crispEdges"` : "";
    return `${head}<defs><clipPath id="${id(clip)}">${box}/></clipPath>${filter}</defs>\n<g clip-path="url(#${id(clip)})"${drawn}>${content}</g>\n</svg>`;
  };
  switch (style) {
    case "linearGradient":
      return filled(
        "gradient",
        name =>
          `<linearGradient id="${name}" gradientUnits="userSpaceOnUse" ${linearLine(angle, w, h)}>${stopTags(hexes)}</linearGradient>`
      );
    case "linearSwatches":
      return clipped("bounds", bands(hexes, angle, w, h));
    case "angularGradient": {
      const clip = id("paint0_angular_clip_path");
      const r = radius;
      const shape =
        r > 0
          ? `M${w - r} 0H${r}A${r} ${r} 0 0 0 0 ${r}V${h - r}A${r} ${r} 0 0 0 ${r} ${h}H${w - r}A${r} ${r} 0 0 0 ${w} ${h - r}V${r}A${r} ${r} 0 0 0 ${w - r} 0Z`
          : `M${w} 0H0V${h}H${w}V0Z`;
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg">\n${comment}\n<g clip-path="url(#${clip})" data-figma-skip-parse="true">${fan(hexes, angle, w, h)}</g><path d="${shape}" data-figma-gradient-fill="${figmaFill(hexes, angle, w, h)}"/>\n<defs>\n<clipPath id="${clip}"><path d="${shape}"/></clipPath>\n</defs>\n</svg>`;
    }
    case "angularSwatches":
      return clipped("squareClip", wedges(hexes, angle, w, h), "antiGap");
    case "radialGradient":
      return filled(
        "radial",
        name =>
          `<radialGradient id="${name}" gradientUnits="userSpaceOnUse" cx="${(w / 2).toFixed(3)}" cy="${(h / 2).toFixed(3)}" r="${halfDiagonal(w, h).toFixed(3)}">${stopTags(hexes)}</radialGradient>`
      );
    case "radialSwatches":
      return clipped("ringBounds", rings(hexes, w, h));
  }
}

/** The palette's SVG file at a view: its stops' hexes, credited to its address, at the given size or the view's
    (800 by 400 for auto). */
export const artworkSvg = (
  stops: readonly Stop[],
  view: View,
  seed: string,
  baseUrl?: string,
  size?: Size
) =>
  paletteSvg(
    stops.map(s => s.hex),
    view.style,
    view.angle,
    { seed, search: viewSearch(view), baseUrl },
    size ?? resolveSize(view.size, DEFAULT_SIZE)
  );
