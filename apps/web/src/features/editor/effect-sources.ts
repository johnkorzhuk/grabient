import type { Palette } from "@grabient/engine";
import { hexBytes, srgbToLch, type Triple } from "@grabient/engine/color.ts";
import { COLOR_KINDS, colorKind, colorsText } from "@grabient/engine/css.ts";
import type { Stop } from "@grabient/engine/curve.ts";
import {
  type Effect,
  type EffectFinish,
  type EffectKind,
  hasEmbedScript
} from "@grabient/engine/effect.ts";
import {
  EFFECT_SVG_MOTION,
  effectColors,
  effectLayers,
  effectMarkdown,
  effectSize,
  effectSpecJson,
  effectStill,
  effectStylesheet,
  effectSvg
} from "@grabient/engine/effect-code.ts";
import { effectEmbedHtml } from "@grabient/engine/effect-embed.ts";
import { effectUnderlay } from "@grabient/engine/fx-finish.ts";
import { type KitKind, kitRecord } from "@grabient/engine/kit/kinds.ts";
import { kitEffect } from "@grabient/engine/kit/registry.ts";
import type { EffectShaderFinish } from "@grabient/engine/shader-finish.ts";
import { SHADER_KINDS, type ShaderKind } from "@grabient/engine/shader-kinds.ts";
import { finishOf } from "@grabient/engine/view.ts";
import { msg, t } from "@grabient/i18n";
import type { CodeSource } from "@grabient/ui/PaletteCode.tsx";
import { createSignal } from "solid-js";
import { colorFormat } from "../../lib/color-format.ts";
import { effectCard } from "../../lib/page-meta.ts";
import { GRAIN_SHOWN, grainDataUrl, grainPictureUrl } from "./copy-finish.ts";
import { effectHtml, type Taken } from "./formats.ts";

/* The code pane's tabs for an effect, which load with the effect's code as an effect first shows in the pane
   (code.ts), never with a palette's start. */

/* an effect as shader code, each kind's module asked for once its spelling shows in the Shader tab: the WebGL page or
   the GLSL it runs (engine/{kind}-webgl.ts, a field effect's kit/webgl.ts), the WebGPU page or its WGSL
   ({kind}-webgpu.ts, kit/webgpu.ts), each with the picture's soft and grain (shader-finish.ts), and a field effect's
   kernel with them (kit/gen/<kind>.ts). The effect's code carries only the tab's spellings, and the Worker's build
   none of them: a server never writes a shader, and its ask waits for ever. */
type ShaderWriter = (
  kind: ShaderKind,
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin: string,
  finish: EffectShaderFinish
) => string;
type ShaderPart = "webgl" | "webgpu";
/* a kind's shader code: what its passes draw, the tab's note before its finish's, and its modules; null for a kind
   with none, whose Shader tab offers no spelling (a kind given modules must say what they draw) */
type EffectShaders = { passes: () => string } & Partial<
  Record<ShaderPart, () => Promise<ShaderWriter>>
>;
/* a field effect's passes, said from its recipe (kit/types.ts): its sheets and lines (the zen garden's sheets and its
   stones' band), or its sheets alone with neither shadow nor rim (the sandstone's plain bands, 8 Nov 2026). A recipe
   neither says, lines alone or sheets alone with a shadow or a rim, takes a note of its own here: code.test.ts holds
   every field effect's recipe to its note and names one it says wrong */
const kitPasses = (kind: KitKind): string =>
  t(
    kitEffect(kind).lines
      ? msg("The field at each pixel, then its sheets and lines in turn, in one pass.")
      : msg("The field at each pixel, then its plain sheets edge to edge, in one pass.")
  );
/* a field effect's kernel, its module asked for with its writer */
const kernelOf = (kind: KitKind) =>
  import("@grabient/engine/kit/kernels.ts").then(m => m.kitKernel(kind));
/* a field effect's WebGL or WebGPU writer, its kernel loaded with it */
const kitWriter = (kind: KitKind, part: ShaderPart): Promise<ShaderWriter> =>
  import.meta.env.SSR
    ? (new Promise(() => {}) as never)
    : part === "webgl"
      ? Promise.all([import("@grabient/engine/kit/webgl.ts"), kernelOf(kind)]).then(
          ([m, kernel]): ShaderWriter =>
            (shader, ...rest) =>
              m.kitWebgl(kitEffect(kind), kernel, shader as "glsl" | "webgl", ...rest)
        )
      : Promise.all([import("@grabient/engine/kit/webgpu.ts"), kernelOf(kind)]).then(
          ([m, kernel]): ShaderWriter =>
            (shader, ...rest) =>
              m.kitWebgpu(kitEffect(kind), kernel, shader as "wgsl" | "webgpu", ...rest)
        );
const SHADER_PARTS: Record<EffectKind, EffectShaders | null> = {
  glass: {
    passes: () => t("The ribs, the colors' blur and the light, pass by pass."),
    webgl: () =>
      (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/glass-webgl.ts")
      ).then(
        (m): ShaderWriter =>
          (kind, ...rest) =>
            m.glassWebgl(kind as "glsl" | "webgl", ...rest)
      ),
    webgpu: () =>
      (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/glass-webgpu.ts")
      ).then(
        (m): ShaderWriter =>
          (kind, ...rest) =>
            m.glassWebgpu(kind as "wgsl" | "webgpu", ...rest)
      )
  },
  /* the blob has no angle */
  blob: {
    passes: () => t("The balls, their melt and the frost, pass by pass."),
    webgl: () =>
      (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/blob-webgl.ts")
      ).then(
        (m): ShaderWriter =>
          (kind, P, effect, _angle, seed, origin, finish) =>
            m.blobWebgl(kind as "glsl" | "webgl", P, effect, seed, origin, finish)
      ),
    webgpu: () =>
      (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/blob-webgpu.ts")
      ).then(
        (m): ShaderWriter =>
          (kind, P, effect, _angle, seed, origin, finish) =>
            m.blobWebgpu(kind as "wgsl" | "webgpu", P, effect, seed, origin, finish)
      )
  },
  silk: {
    passes: () => t("The dye, its folds' shade and light, in one pass."),
    webgl: () =>
      (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/silk-webgl.ts")
      ).then(
        (m): ShaderWriter =>
          (kind, ...rest) =>
            m.silkWebgl(kind as "glsl" | "webgl", ...rest)
      ),
    webgpu: () =>
      (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/silk-webgpu.ts")
      ).then(
        (m): ShaderWriter =>
          (kind, ...rest) =>
            m.silkWebgpu(kind as "wgsl" | "webgpu", ...rest)
      )
  },
  rosette: {
    passes: () => t("The petals ring by ring, the ground and the heart's glow, in one pass."),
    webgl: () =>
      (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/rosette-webgl.ts")
      ).then(
        (m): ShaderWriter =>
          (kind, ...rest) =>
            m.rosetteWebgl(kind as "glsl" | "webgl", ...rest)
      ),
    webgpu: () =>
      (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/rosette-webgpu.ts")
      ).then(
        (m): ShaderWriter =>
          (kind, ...rest) =>
            m.rosetteWebgpu(kind as "wgsl" | "webgpu", ...rest)
      )
  },
  papercut: {
    passes: () => t("The relief, then each sheet's shadows, lit cut and face, pass by pass."),
    webgl: () =>
      (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/papercut-webgl.ts")
      ).then(
        (m): ShaderWriter =>
          (kind, ...rest) =>
            m.papercutWebgl(kind as "glsl" | "webgl", ...rest)
      ),
    webgpu: () =>
      (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/papercut-webgpu.ts")
      ).then(
        (m): ShaderWriter =>
          (kind, ...rest) =>
            m.papercutWebgpu(kind as "wgsl" | "webgpu", ...rest)
      )
  },
  strings: {
    passes: () =>
      t("The stirred field at each pixel, its two nearest threads over the ground, in one pass."),
    webgl: () =>
      (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/strings-webgl.ts")
      ).then(
        (m): ShaderWriter =>
          (kind, ...rest) =>
            m.stringsWebgl(kind as "glsl" | "webgl", ...rest)
      ),
    webgpu: () =>
      (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/strings-webgpu.ts")
      ).then(
        (m): ShaderWriter =>
          (kind, ...rest) =>
            m.stringsWebgpu(kind as "wgsl" | "webgpu", ...rest)
      )
  },
  ...kitRecord(
    (kind): EffectShaders => ({
      passes: () => kitPasses(kind),
      webgl: () => kitWriter(kind, "webgl"),
      webgpu: () => kitWriter(kind, "webgpu")
    })
  )
};
const partOf = (kind: ShaderKind): ShaderPart =>
  kind === "glsl" || kind === "webgl" ? "webgl" : "webgpu";
/* the Shader tab's spellings for an effect: the kinds it has a writer for, the WebGL page first */
const shaderKinds = (effect: EffectKind) =>
  SHADER_KINDS.filter(([kind]) => SHADER_PARTS[effect]?.[partOf(kind)]);
const [writers, setWriters] = createSignal<Partial<Record<string, ShaderWriter>>>({});
const asked = new Set<string>();
const writerNow = (effect: EffectKind, kind: ShaderKind) => {
  const part = partOf(kind);
  const load = SHADER_PARTS[effect]?.[part];
  const key = `${effect} ${part}`;
  if (load && !asked.has(key)) {
    asked.add(key);
    void load().then(
      write => setWriters(had => ({ ...had, [key]: write })),
      () => asked.delete(key)
    );
  }
  return writers()[key];
};

/* the glass's first frame as the tags show it inside the page: its data elided, which Copy writes in full */
const GLASS_STILL_SHOWN = 'url("data:image/webp;base64,…") 50% 50%/cover no-repeat';
const stopOf = (hex: string): Stop => {
  const rgb = hexBytes(hex).map(v => v / 255) as Triple;
  return { t: 0, hex, rgb, lch: srgbToLch(rgb) };
};

/** The effect's words for the palette's Markdown, as its address serves them. */
export const effectWords = (
  origin: string,
  seed: string,
  effect: Effect,
  angle: number,
  finish: EffectFinish = {}
) => effectMarkdown(origin, seed, effect, `${origin}${effectCard(seed, effect, angle, finish)}`);

/** The effect's own code between the seed and the Markdown: the tags, the stylesheet, its colors, its settings and its
    SVG. The tags' first spelling holds the first frame inside the page as Copy HTML does, which for the glass is a
    WebP the browser makes on the press, and the grain's tile with it where the view has one: shown elided, copied
    whole. */
export function effectSources(
  P: Palette,
  seed: string,
  effect: Effect,
  taken: Taken,
  origin: string
): CodeSource[] {
  const angle = taken.angle;
  /* the soft and the grain the picture is finished by, which its files' addresses name, and the rules lay with its
     still: the grain's tile shown elided, copied whole; and for its shaders the gradient under a soft effect's edges */
  const finish = finishOf(taken);
  const grained = !!finish.grain;
  const shownLayers = () =>
    effectLayers(P, effect, angle, finish, grained ? `url("${GRAIN_SHOWN}")` : undefined);
  const grainImage = async () =>
    finish.grain ? `url("${await grainDataUrl(finish.grain)}")` : undefined;
  const shaderFinish: EffectShaderFinish = {
    ...finish,
    ...(finish.soft ? { underlay: effectUnderlay(P, effect, angle, finish.soft) } : {})
  };
  const glass = effect.kind === "glass";
  /* what Copy writes whole: the glass's WebP or the grain's tile */
  const elided = glass || grained;
  const tags = (spelling?: string) =>
    spelling === "link"
      ? effectEmbedHtml(origin, seed, effect, angle, undefined, finish)
      : effectEmbedHtml(
          origin,
          seed,
          effect,
          angle,
          glass ? GLASS_STILL_SHOWN : effectStill(P, effect, angle),
          finish,
          shownLayers()
        );
  const shaderSource = (): CodeSource => ({
    id: "shader",
    label: msg("Shader"),
    spellings: shaderKinds(effect.kind).map(([id, label]) => ({ id, label })),
    text: (spelling?: string) => {
      const kind = (spelling ?? shaderKinds(effect.kind)[0]?.[0]) as ShaderKind;
      return (
        writerNow(effect.kind, kind)?.(kind, P, effect, angle, seed, origin, shaderFinish) ?? ""
      );
    },
    note: () => {
      const passes = SHADER_PARTS[effect.kind]?.passes() ?? "";
      /* the finish the passes end on, where the picture has one */
      const after =
        finish.soft && finish.grain
          ? t("Then its soft and grain, as the site lays them over it.")
          : finish.soft
            ? t("Then its soft, as the site blurs it.")
            : finish.grain
              ? t("Then its grain, a speck a CSS pixel.")
              : "";
      return after ? `${passes} ${after}` : passes;
    }
  });
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
        elided && spelling !== "link" ? effectHtml(taken, effect) : Promise.resolve(tags(spelling)),
      note: spelling => {
        /* an effect with no script has its stylesheet alone, which paints it */
        const note = hasEmbedScript(effect.kind)
          ? t("The two tags that play it behind a page, for the page's head.")
          : t("The tag that paints its first frame behind a page, for the page's head.");
        /* the glass's first frame is a picture the code shows cut short; a grain's tile is shown elided, as the
           CSS and SVG tabs show it, with no word of its own */
        return glass && spelling !== "link"
          ? `${note} ${t("Copy includes the whole first frame.")}`
          : note;
      }
    },
    {
      id: "css",
      label: "CSS",
      text: () =>
        effectStylesheet(
          P,
          seed,
          effect,
          angle,
          origin,
          finish,
          grained ? `url("${GRAIN_SHOWN}")` : undefined
        ),
      take: async () =>
        effectStylesheet(P, seed, effect, angle, origin, finish, await grainImage()),
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
    /* the Shader tab for an effect with a spelling of it */
    ...(shaderKinds(effect.kind).length ? [shaderSource()] : []),
    {
      id: "json",
      label: "JSON",
      text: () => effectSpecJson(P, effect, angle, finish),
      note: () => t("The keyframes and the effect's settings as JSON.")
    },
    {
      id: "svg",
      label: "SVG",
      /* the grain's tile shown elided, copied whole */
      text: () => effectSvg(P, seed, effect, angle, taken.pixels, origin, finish, GRAIN_SHOWN),
      take: () =>
        taken.grain
          ? grainPictureUrl(taken.grain, taken.pixels ?? effectSize(effect)).then(data =>
              effectSvg(P, seed, effect, angle, taken.pixels, origin, finish, data)
            )
          : Promise.resolve(effectSvg(P, seed, effect, angle, taken.pixels, origin, finish)),
      /* the silk's SVG moves by SMIL, the papercut's holds its first frame, the others' move by CSS */
      note: () => {
        const motion = effect.speed === 0 ? null : EFFECT_SVG_MOTION[effect.kind];
        return motion === "smil"
          ? t("The picture as an SVG file, moving by SMIL alone.")
          : motion === "css"
            ? t("The picture as an SVG file, moving by CSS alone.")
            : t("The picture as an SVG file.");
      }
    }
  ];
}
