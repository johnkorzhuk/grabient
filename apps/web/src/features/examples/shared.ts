/* What the examples share: the forms a palette takes and how one is drawn in words, its files' addresses and a CSS
   rule as the code shows them, and the palette as the editor's copies take it. */
import { contrastOf } from "@grabient/engine/color.ts";
import { luminance } from "@grabient/engine/contrast.ts";
import { gradientCss } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import {
  blobShapeOf,
  EFFECT_FPS,
  EFFECT_LOOK,
  EFFECT_PLAY,
  type EffectKind,
  effectFileAddress,
  isEffect
} from "@grabient/engine/effect.ts";
import { DEFAULT_SIZE, isSwatchStyle, type Size, STYLE_LABELS } from "@grabient/engine/view.ts";
import { msg, t } from "@grabient/i18n";
import { effectLabel, effectSummary } from "../editor/effect-page.ts";
import type { Taken } from "../editor/formats.ts";
import { smoothSteps } from "./looks.ts";
import { contrastLevel, drawnColors, type Shown } from "./paint.ts";

const LEVELS = {
  AAA: msg("WCAG AAA"),
  AA: msg("WCAG AA"),
  "AA Large": msg("WCAG AA Large")
} as const;
/** The WCAG level a contrast reaches, as the contrast grid names it; empty under 3:1. */
export const levelWords = (ratio: number): string => {
  const level = contrastLevel(ratio);
  return level ? t(LEVELS[level]) : "";
};

/** How the palette is drawn in the page's style, as the hero and an example's tag say it: "Linear bands · 5 steps ·
    45°", "Fluted glass · 0.3× · 45°", "Blob · 0.3×". A radial style and the blob have no angle to say. */
export function drawnWords(s: Shown): string {
  if (s.effect)
    return `${effectLabel(s.effect.kind)} · ${effectSummary(s.effect, s.effect.kind === "blob" ? null : s.view.angle)}`;
  return [
    t(STYLE_LABELS[s.view.style]),
    t("{count, plural, one {# step} other {# steps}}", { count: s.view.steps }),
    ...(s.view.style.startsWith("radial") ? [] : [`${s.view.angle}°`])
  ].join(" · ");
}

/** How an example that takes an effect's colors as a list, as no effect draws them, says so in its tag: "Fluted glass ·
    6 colors". Null for a gradient or bands. */
export function effectColorsWords(s: Shown): string | null {
  if (!s.effect) return null;
  const count = drawnColors(s).length;
  return `${effectLabel(s.effect.kind)} · ${t("{count, plural, one {# color} other {# colors}}", { count })}`;
}

/** The palette as a picture that can't be clear wears it (a banner, a cover, a card): a blob with no ground of its own
    stands on the palette's darkest or lightest color, whichever its colors stand out from more, as the engine lays a
    PNG's blob on near black or near white by their mean light (blob.ts's blobBackdrop). */
export function solidBlob(s: Shown): Shown {
  const effect = s.effect;
  if (effect?.kind !== "blob" || effect.look.bg) return s;
  const lights = drawnColors(s)
    .map(color => ({ color, light: luminance(color) }))
    .sort((a, b) => a.light - b.light);
  const mean = lights.reduce((sum, l) => sum + l.light, 0) / lights.length;
  const [dark, light] = [lights[0], lights[lights.length - 1]];
  const bg =
    contrastOf(mean, dark.light) >= contrastOf(mean, light.light) ? dark.color : light.color;
  return { ...s, effect: { ...effect, look: { ...effect.look, bg } } };
}

/** The forms a palette takes: a gradient (linear, angular or radial), bands, or one of the effects. The page is every
    palette's whole range, each part in a look of its own (looks.ts). */
export type Form = "gradient" | "bands" | EffectKind;
export const formOf = (s: Shown): Form =>
  s.effect?.kind ?? (isSwatchStyle(s.view.style) ? "bands" : "gradient");
/** As few bands as read as swatches: five, or the palette's keyframes where it has more. */
const FEW_BANDS = 5;
/** The palette in a form: the address's own where it is that form; else its angle kept, a gradient at its steps
    (a linear one after an effect, as smooth as it needs), a few linear bands, or an effect playing as it does by
    default (a blob at the shape its palette suggests). */
export function inForm(s: Shown, form: Form): Shown {
  if (form === formOf(s)) return s;
  const { seed, palette } = s;
  const angle = s.view.angle;
  if (isEffect(form))
    return {
      seed,
      palette,
      view: s.view,
      effect: {
        kind: form,
        ...EFFECT_PLAY,
        look: { ...EFFECT_LOOK, shape: form === "blob" ? blobShapeOf(seed) : null }
      }
    };
  const fewest = palette.anchors.length;
  return {
    seed,
    palette,
    effect: null,
    view:
      form === "bands"
        ? { style: "linearSwatches", steps: Math.max(FEW_BANDS, fewest), angle }
        : {
            style: "linearGradient",
            steps: s.effect ? smoothSteps(palette) : s.view.steps,
            angle
          }
  };
}
/** The palette as its own plain gradient at an angle, whatever the address names: what a part's checks are first run
    on, so a palette's page holds the same parts in every style. */
export const plainAt = (s: Shown, angle: number): Shown => ({
  seed: s.seed,
  palette: s.palette,
  effect: null,
  view: { style: "linearGradient", steps: smoothSteps(s.palette), angle }
});
/** The plain gradient's angles a part's checks try: along, across and both diagonals. */
export const PLAIN_ANGLES = [90, 0, 45, 135] as const;
/** A form in a few words, as a tag says it: "Fluted glass", "Linear bands · 5 steps". */
export const formWords = (s: Shown): string =>
  s.effect
    ? effectLabel(s.effect.kind)
    : `${t(STYLE_LABELS[s.view.style])} · ${t("{count, plural, one {# step} other {# steps}}", { count: s.view.steps })}`;

/** The palette's stops at the page's steps. */
export const stopsOf = (s: Shown) => sampleStops(s.palette, s.view.steps);

/** A gradient's or bands' background as the page paints it: the CSS value, its colors as hex. */
export const gradientOf = (s: Shown): string =>
  gradientCss(
    stopsOf(s).map(stop => stop.hex),
    s.view.style,
    s.view.angle
  );

/** The address of the palette's picture as a file, in the page's style: a gradient's PNG or SVG at a size, or an
    effect's first frame as PNG or its moving SVG. */
export function pictureAddress(
  s: Shown,
  origin: string,
  extension: "png" | "svg",
  size: Size
): string {
  if (s.effect)
    return effectFileAddress(
      origin,
      s.seed,
      /* a PNG is the first frame: how the effect plays says nothing of it, and its address leaves pace out */
      extension === "png" ? { ...s.effect, speed: 1, fps: EFFECT_FPS.default } : s.effect,
      s.view.angle,
      extension,
      size
    );
  const query = new URLSearchParams();
  if (s.view.style !== "linearGradient") query.set("style", s.view.style);
  query.set("steps", String(s.view.steps));
  if (!s.view.style.startsWith("radial") && s.view.angle !== 90)
    query.set("angle", String(s.view.angle));
  query.set("w", String(size.width));
  query.set("h", String(size.height));
  return `${origin}/${s.seed}.${extension}?${query}`;
}

/** A CSS rule as the code shows it. */
export const cssRule = (selector: string, declarations: readonly string[]): string =>
  `${selector} {\n${declarations.map(d => `  ${d}`).join("\n")}\n}`;

/** The palette as the editor's copies and files take it. */
export const takenOf = (s: Shown, pixels: Size = DEFAULT_SIZE): Taken => ({
  seed: s.seed,
  style: s.view.style,
  steps: s.view.steps,
  angle: s.view.angle,
  size: null,
  pixels,
  stops: stopsOf(s),
  effect: s.effect
});
