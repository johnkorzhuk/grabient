import { deserializeCoeffs, serializeCoeffs } from "@repo/data-ops/serialization";
import { applyGlobals, cosineGradient, rgbToHex } from "@repo/data-ops/gradient-gen/cosine";
import { generateCssGradient } from "@repo/data-ops/gradient-gen/css";
import { generateSvgGradient } from "@repo/data-ops/gradient-gen/svg";
import {
  DEFAULT_ANGLE,
  DEFAULT_STEPS,
  DEFAULT_STYLE,
  type PaletteStyle,
} from "@repo/data-ops/valibot-schema/grabient";
import type { ListSearch } from "./search";

import type { CosineCoeffs, GlobalModifiers } from "@repo/data-ops/gradient-gen/cosine";

export interface RenderedPalette {
  seed: string;
  hexColors: string[];
  background: string;
  style: PaletteStyle;
  steps: number;
  angle: number;
  appliedCoeffs: CosineCoeffs;
  globals: GlobalModifiers;
}

export function canonicalSeed(seed: string): string | null {
  try {
    const { coeffs, globals } = deserializeCoeffs(seed);
    return serializeCoeffs(coeffs, globals);
  } catch {
    return null;
  }
}

export function renderPalette(
  seed: string,
  style: PaletteStyle = DEFAULT_STYLE,
  steps: number = DEFAULT_STEPS,
  angle: number = DEFAULT_ANGLE,
): RenderedPalette | null {
  try {
    const { coeffs, globals } = deserializeCoeffs(seed);
    const appliedCoeffs = applyGlobals(coeffs, globals);
    const hexColors = cosineGradient(steps, appliedCoeffs).map(([r, g, b]) => rgbToHex(r, g, b));
    const { styles } = generateCssGradient(hexColors, style, angle, { seed, searchString: "" });
    return {
      seed,
      hexColors,
      background: styles.background,
      style,
      steps,
      angle,
      appliedCoeffs,
      globals,
    };
  } catch {
    return null;
  }
}

/** Resolve a stored palette row against "auto" URL params, matching the current site's semantics. */
export function resolvePaletteView(
  row: { id: string; style: PaletteStyle; steps: number; angle: number },
  params: ListSearch,
): RenderedPalette | null {
  return renderPalette(
    row.id,
    params.style === "auto" ? row.style : params.style,
    params.steps === "auto" ? row.steps : params.steps,
    params.angle === "auto" ? row.angle : params.angle,
  );
}

export function cssSnippet(p: RenderedPalette, searchString: string): string {
  return generateCssGradient(p.hexColors, p.style, p.angle, { seed: p.seed, searchString })
    .cssString;
}

export function svgSnippet(
  p: RenderedPalette,
  searchString: string,
  size: "auto" | [number, number] = "auto",
): string {
  const [width, height] = size === "auto" ? [800, 400] : size;
  return generateSvgGradient(
    p.hexColors,
    p.style,
    p.angle,
    { seed: p.seed, searchString },
    null,
    { width, height },
  );
}

/** Copyable list of the palette's hex colors, one wrapping line. */
export function colorsSnippet(hexColors: string[]): string {
  return `[${hexColors.map((h) => `"${h}"`).join(", ")}]`;
}

const v3 = (row: readonly number[] | undefined) =>
  `vec3(${(row?.[0] ?? 0).toFixed(3)}, ${(row?.[1] ?? 0).toFixed(3)}, ${(row?.[2] ?? 0).toFixed(3)})`;

/**
 * Paste-and-run ShaderToy shader reproducing the palette as displayed:
 * cosine palette (Inigo Quilez convention) sampled into `steps` stops, then
 * blended (gradient styles) or hard-stepped (swatch styles) along the same
 * geometry the CSS uses — linear angle (0° = up, clockwise, CSS gradient-line
 * length), conic from-angle (clockwise from top), or radial farthest-corner.
 */
export function shadertoySnippet(
  p: Pick<RenderedPalette, "appliedCoeffs" | "style" | "steps" | "angle">,
  seed: string,
  searchString: string,
): string {
  const swatches = p.style.endsWith("Swatches");
  const stopsFn = swatches
    ? [
        "// N hard swatches sampled from the palette",
        "vec3 stops(float t) {",
        "    float i = min(floor(clamp(t, 0.0, 1.0) * STEPS), STEPS - 1.0);",
        "    return palette(i / (STEPS - 1.0));",
        "}",
      ]
    : [
        "// N stops sampled from the palette, blended like the CSS gradient",
        "vec3 stops(float t) {",
        "    float n = STEPS - 1.0;",
        "    float x = clamp(t, 0.0, 1.0) * n;",
        "    return mix(palette(floor(x) / n), palette(min(floor(x) + 1.0, n) / n), fract(x));",
        "}",
      ];
  const family = p.style.startsWith("angular")
    ? "angular"
    : p.style.startsWith("radial")
      ? "radial"
      : "linear";
  const mainBody =
    family === "angular"
      ? [
          "    vec2 p = fragCoord - 0.5 * iResolution.xy;",
          "    // conic from ANGLE, clockwise from top (CSS convention)",
          "    float t = fract((atan(p.x, p.y) - radians(ANGLE)) / 6.283185);",
        ]
      : family === "radial"
        ? [
            "    vec2 p = fragCoord - 0.5 * iResolution.xy;",
            "    // circle to the farthest corner (CSS default)",
            "    float t = length(p) / length(0.5 * iResolution.xy);",
          ]
        : [
            "    vec2 p = fragCoord - 0.5 * iResolution.xy;",
            "    // CSS angle: 0 = up, clockwise; span = CSS gradient-line length",
            "    vec2 dir = vec2(sin(radians(ANGLE)), cos(radians(ANGLE)));",
            "    float len = abs(iResolution.x * dir.x) + abs(iResolution.y * dir.y);",
            "    float t = dot(p, dir) / len + 0.5;",
          ];
  return [
    `// https://grabient.com/${seed}${searchString}`,
    "// cosine gradient palette — https://iquilezles.org/articles/palettes/",
    `const float STEPS = ${p.steps.toFixed(1)};`,
    ...(family === "radial" ? [] : [`const float ANGLE = ${p.angle.toFixed(1)};`]),
    "",
    "vec3 palette(float t) {",
    `    vec3 a = ${v3(p.appliedCoeffs[0])};`,
    `    vec3 b = ${v3(p.appliedCoeffs[1])};`,
    `    vec3 c = ${v3(p.appliedCoeffs[2])};`,
    `    vec3 d = ${v3(p.appliedCoeffs[3])};`,
    "    return a + b * cos(6.283185 * (c * t + d));",
    "}",
    "",
    ...stopsFn,
    "",
    "void mainImage(out vec4 fragColor, in vec2 fragCoord) {",
    ...mainBody,
    "    fragColor = vec4(stops(t), 1.0);",
    "}",
  ].join("\n");
}

/** Raw coefficients as a JSON array of [a, b, c, d] RGB rows. */
export function coeffsJsonSnippet(appliedCoeffs: CosineCoeffs): string {
  const row = (r: readonly number[] | undefined) =>
    `  [${(r?.[0] ?? 0).toFixed(3)}, ${(r?.[1] ?? 0).toFixed(3)}, ${(r?.[2] ?? 0).toFixed(3)}]`;
  return `[\n${appliedCoeffs.map(row).join(",\n")}\n]`;
}

/** SVG favicon rendering the palette with its effective style/steps/angle. */
export function faviconDataUri(p: RenderedPalette): string {
  const svg = generateSvgGradient(
    p.hexColors,
    p.style,
    p.angle,
    { seed: p.seed, searchString: "" },
    null,
    { width: 64, height: 64, borderRadius: 25 },
  );
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export interface HeroInk {
  /** "dark" = near-black text over a bright gradient; "light" = near-white. */
  ink: "dark" | "light";
  /** Average color of the sampled region — used as the browser theme-color. */
  avgHex: string;
}

/**
 * Analytic port of the OG image's sampleRegionLuminance: instead of
 * rasterizing the SVG, evaluate the gradient math directly at a grid of
 * points in the top `regionH` px of a `w`×`h` viewport (CSS conventions,
 * y down) and average Rec. 709 luminance. Same 0.5 threshold as /api/og
 * uses to pick the logo color.
 */
export function heroInk(
  p: Pick<RenderedPalette, "hexColors" | "style" | "angle">,
  w = 430,
  h = 860,
  regionH = 132,
  x0 = 0,
  x1 = w,
): HeroInk {
  const stops = p.hexColors.map(
    (hx) =>
      [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)] as const,
  );
  const n = stops.length;
  if (n === 0) return { ink: "dark", avgHex: "#888888" };
  const swatch = p.style.endsWith("Swatches");
  const family = p.style.startsWith("angular")
    ? "angular"
    : p.style.startsWith("radial")
      ? "radial"
      : "linear";
  const rad = (p.angle * Math.PI) / 180;
  // CSS linear angle: 0° = to top, clockwise; screen y grows down.
  const dirX = Math.sin(rad);
  const dirY = -Math.cos(rad);
  const lineLen = Math.abs(w * dirX) + Math.abs(h * dirY) || 1;
  const colorAt = (raw: number): readonly [number, number, number] => {
    const t = Math.min(1, Math.max(0, raw));
    if (swatch || n === 1) return stops[Math.min(Math.floor(t * n), n - 1)]!;
    const x = t * (n - 1);
    const i = Math.floor(x);
    const f = x - i;
    const a = stops[i]!;
    const b = stops[Math.min(i + 1, n - 1)]!;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };
  let r = 0;
  let g = 0;
  let b = 0;
  let lum = 0;
  const COLS = 10;
  const ROWS = 4;
  for (let yi = 0; yi < ROWS; yi++) {
    for (let xi = 0; xi < COLS; xi++) {
      const px = x0 + ((x1 - x0) * (xi + 0.5)) / COLS - w / 2;
      const py = (regionH * (yi + 0.5)) / ROWS - h / 2;
      let t: number;
      if (family === "angular") {
        // conic from `angle`, clockwise from 12 o'clock (y down: top = -y).
        t = (Math.atan2(px, -py) - rad) / (2 * Math.PI);
        t -= Math.floor(t);
      } else if (family === "radial") {
        t = Math.hypot(px, py) / (Math.hypot(w, h) / 2);
      } else {
        t = (px * dirX + py * dirY) / lineLen + 0.5;
      }
      const c = colorAt(t);
      r += c[0];
      g += c[1];
      b += c[2];
      lum += 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }
  }
  const count = COLS * ROWS;
  const hex = (v: number) =>
    Math.round(v / count)
      .toString(16)
      .padStart(2, "0");
  return {
    ink: lum / count / 255 > 0.5 ? "dark" : "light",
    avgHex: `#${hex(r)}${hex(g)}${hex(b)}`,
  };
}

/** Perceived luminance (0..1) used to pick readable text color over a swatch. */
export function hexLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ---------------------------------------------------------------------------
// Site-wide default branding palette (John, 2026-07-21): this seed is the
// default favicon and the logo bar's resting gradient. List pages still
// override the bar with their own palette animation; seed pages paint it with
// their own colors.
export const DEFAULT_PALETTE = {
  seed: "_gKdgHPgKkgGhgFxgD_gJkgL8gLOgXRgEsgNK",
  style: "linearGradient" as PaletteStyle,
  steps: 8,
  angle: 45,
} as const;

const defaultView = renderPalette(
  DEFAULT_PALETTE.seed,
  DEFAULT_PALETTE.style,
  DEFAULT_PALETTE.steps,
  DEFAULT_PALETTE.angle,
);

export const DEFAULT_FAVICON = defaultView ? faviconDataUri(defaultView) : undefined;

// The wordmark's underline has 3 stops — sample the palette at start/middle/
// end, same as the list pages' logo animation.
export const DEFAULT_LOGO_COLORS: readonly string[] | undefined = defaultView
  ? [
      defaultView.hexColors[0]!,
      defaultView.hexColors[Math.floor((defaultView.hexColors.length - 1) / 2)]!,
      defaultView.hexColors[defaultView.hexColors.length - 1]!,
    ]
  : undefined;
