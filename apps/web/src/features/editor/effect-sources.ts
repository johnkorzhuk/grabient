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
import { SHADER_KINDS, type ShaderKind } from "@grabient/engine/shader-kinds.ts";
import { msg, t } from "@grabient/i18n";
import type { CodeSource } from "@grabient/ui/PaletteCode.tsx";
import { createSignal } from "solid-js";
import { colorFormat } from "../../lib/color-format.ts";
import { effectCard } from "../../lib/page-meta.ts";
import { effectHtml, type Taken } from "./formats.ts";

/* The code pane's tabs for an effect, which load with the effect's code as an effect first shows in the pane
   (code.ts), never with a palette's start. */

/* the glass as shader code, each kind's module asked for once its spelling shows in the Shader tab: Shadertoy's tabs
   (engine/glass-shadertoy.ts), the GLSL or its WebGL page (glass-webgl.ts), the WGSL or its WebGPU page
   (glass-webgpu.ts). The effect's code carries only the tab's spellings, and the Worker's build none of them: a server
   never writes a shader, and its ask waits for ever. */
type GlassWriter = (
  kind: ShaderKind,
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin: string
) => string;
const GLASS_SHADER_PARTS = {
  shadertoy: () =>
    (import.meta.env.SSR
      ? (new Promise(() => {}) as never)
      : import("@grabient/engine/glass-shadertoy.ts")
    ).then(
      (m): GlassWriter =>
        (_, ...rest) =>
          m.glassShadertoyText(...rest)
    ),
  webgl: () =>
    (import.meta.env.SSR
      ? (new Promise(() => {}) as never)
      : import("@grabient/engine/glass-webgl.ts")
    ).then(
      (m): GlassWriter =>
        (kind, ...rest) =>
          m.glassWebgl(kind as "glsl" | "webgl", ...rest)
    ),
  webgpu: () =>
    (import.meta.env.SSR
      ? (new Promise(() => {}) as never)
      : import("@grabient/engine/glass-webgpu.ts")
    ).then(
      (m): GlassWriter =>
        (kind, ...rest) =>
          m.glassWebgpu(kind as "wgsl" | "webgpu", ...rest)
    )
};
type GlassPart = keyof typeof GLASS_SHADER_PARTS;
const partOf = (kind: ShaderKind): GlassPart =>
  kind === "shadertoy" ? "shadertoy" : kind === "glsl" || kind === "webgl" ? "webgl" : "webgpu";
const [glassWriters, setGlassWriters] = createSignal<Partial<Record<GlassPart, GlassWriter>>>({});
const glassAsked = new Set<GlassPart>();
const glassWriterNow = (kind: ShaderKind) => {
  const part = partOf(kind);
  if (!glassAsked.has(part)) {
    glassAsked.add(part);
    void GLASS_SHADER_PARTS[part]().then(
      write => setGlassWriters(had => ({ ...had, [part]: write })),
      () => glassAsked.delete(part)
    );
  }
  return glassWriters()[part];
};

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
    ...(glass
      ? [
          {
            id: "shader",
            label: msg("Shader"),
            spellings: SHADER_KINDS.map(([id, label]) => ({ id, label })),
            text: (spelling?: string) => {
              const kind = (spelling ?? "shadertoy") as ShaderKind;
              return glassWriterNow(kind)?.(kind, P, effect, angle, seed, origin) ?? "";
            },
            note: () => t("The ribs, the colors' blur and the light, pass by pass.")
          }
        ]
      : []),
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
