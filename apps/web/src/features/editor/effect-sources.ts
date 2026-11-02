import type { Palette } from "@grabient/engine";
import { hexBytes, srgbToLch, type Triple } from "@grabient/engine/color.ts";
import { COLOR_KINDS, colorKind, colorsText } from "@grabient/engine/css.ts";
import type { Stop } from "@grabient/engine/curve.ts";
import { type Effect, effectEmbedHtml } from "@grabient/engine/effect.ts";
import {
  effectColors,
  effectMarkdown,
  effectSpecJson,
  effectStill,
  effectStylesheet,
  effectSvg
} from "@grabient/engine/effect-code.ts";
import { msg, t } from "@grabient/i18n";
import type { CodeSource } from "@grabient/ui/PaletteCode.tsx";
import { colorFormat } from "../../lib/color-format.ts";
import { effectCard } from "../../lib/page-meta.ts";
import { effectHtml, type Taken } from "./formats.ts";

/* The code pane's tabs for an effect, which load with the effect's code as an effect first shows in the pane
   (code.ts), never with a palette's start. */

/* the glass's first frame as the tags show it inside the page: its data elided, which Copy writes in full */
const GLASS_STILL_SHOWN = 'url("data:image/webp;base64,…") 50% 50%/cover no-repeat';
const stopOf = (hex: string): Stop => {
  const rgb = hexBytes(hex).map(v => v / 255) as Triple;
  return { t: 0, hex, rgb, lch: srgbToLch(rgb) };
};

/** The effect's words for the palette's Markdown, as its address serves them. */
export const effectWords = (origin: string, seed: string, effect: Effect, angle: number) =>
  effectMarkdown(origin, seed, effect, `${origin}${effectCard(seed, effect, angle)}`);

/** The effect's own code between the seed and the Markdown: the tags, the stylesheet, its colors, its settings and its
    SVG. The tags' first spelling holds the first frame inside the page as Copy HTML does, which for the glass is a
    WebP the browser makes on the press: shown elided, copied whole. */
export function effectSources(
  P: Palette,
  seed: string,
  effect: Effect,
  taken: Taken,
  origin: string
): CodeSource[] {
  const angle = taken.angle;
  const glass = effect.kind === "glass";
  const tags = (spelling?: string) =>
    spelling === "link"
      ? effectEmbedHtml(origin, seed, effect, angle)
      : effectEmbedHtml(
          origin,
          seed,
          effect,
          angle,
          glass ? GLASS_STILL_SHOWN : effectStill(P, effect, angle)
        );
  const colors = () => effectColors(P, effect).map(stopOf);
  return [
    {
      id: "html",
      label: "HTML",
      spellings: [
        { id: "style", label: "<style>" },
        { id: "link", label: "<link>" }
      ],
      text: tags,
      take: spelling =>
        glass && spelling !== "link" ? effectHtml(taken, effect) : Promise.resolve(tags(spelling)),
      note: spelling => {
        const note = t("The two tags that play it behind a page, for the page's head.");
        return glass && spelling !== "link"
          ? `${note} ${t("Copy includes the whole first frame.")}`
          : note;
      }
    },
    {
      id: "css",
      label: "CSS",
      text: () => effectStylesheet(P, seed, effect, angle, origin),
      note: () => t("The stylesheet that paints its first frame behind the page.")
    },
    {
      id: "colors",
      label: msg("Colors"),
      spellings: COLOR_KINDS.map(([id, label]) => ({ id, label })),
      initial: colorFormat(),
      text: s => colorsText(colorKind(s ?? "hex"), colors()),
      note: () =>
        t("{count, plural, one {# color} other {# colors}}, one per line.", {
          count: colors().length
        })
    },
    {
      id: "json",
      label: "JSON",
      text: () => effectSpecJson(P, effect, angle),
      note: () => t("The keyframes and the effect's settings as JSON.")
    },
    {
      id: "svg",
      label: "SVG",
      text: () => effectSvg(P, seed, effect, angle, taken.pixels, origin),
      note: () =>
        effect.speed === 0
          ? t("The picture as an SVG file.")
          : t("The picture as an SVG file, moving by CSS alone.")
    }
  ];
}
