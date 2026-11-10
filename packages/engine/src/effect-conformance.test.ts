/* Every effect held to what effect.ts's EFFECT_KINDS says it hands over: the one suite a new effect must pass, which it
   joins by its name in EFFECTS. Where an effect falls short of a form, the table says so with why, and the suite holds
   it to that instead. The heart of it: any frame of a vector effect is a plain SVG of its own (fx-still.ts
   fxFrameSvg), which resvg draws within a few hundredths of OKLab of the CPU's frame at that time, every look and
   every time of its loop, and its CSS paints that SVG. */
import { beforeAll, describe, expect, it } from "vitest";
import { type FrameDiff, frameDiff, rasterize, resvgReady } from "../test/raster.ts";
import { decodePalette } from "./codec.ts";
import {
  CLEAR_GROUND,
  EFFECT_KINDS,
  EFFECTS,
  type Effect,
  type EffectKind,
  type EffectShortfall,
  effectAddressParts,
  type FigmaKind,
  hasEmbedScript,
  hasFigma,
  isVectorKind,
  parseEffect,
  type VectorKind
} from "./effect.ts";
import { EFFECT_SVG_MOTION, effectStylesheet, effectSvg } from "./effect-code.ts";
import { EFFECT_WHY } from "./effect-why.ts";
import { effectDrawn } from "./fx-frame.ts";
import {
  type FxLook,
  type FxPointer,
  fxFrameCss,
  fxFrameSvg,
  fxLoop,
  fxStillBackground,
  fxStillSvg
} from "./fx-still.ts";
import { kitRecord } from "./kit/kinds.ts";
import { hasVideo } from "./video-kinds.ts";
import type { Size } from "./view.ts";

const P = decodePalette("kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ")!;
const SIZE: Size = { width: 320, height: 180 };
/** The size each vector effect's frames are held to its CPU's at: one where its finest line is a pixel wide at least,
    so what is measured is the drawing, not two rasterizers' antialiasing of a line thinner than a pixel. The strings'
    threads are 0.0022 D wide, a pixel at 640 by 360 (at 320 by 180 the same SVG lies a mean of 2 from the CPU, every
    pixel along a thread a little apart, and within the limits at 640). */
const PARITY_SIZE: Record<VectorKind, Size> = {
  silk: SIZE,
  rosette: SIZE,
  papercut: SIZE,
  strings: { width: 640, height: 360 },
  /* the dimple's discs are 8 pixels in radius at 320 by 180, each edge a pixel wide */
  dimple: SIZE,
  /* the field effects' at 320 by 180, where their levels lie a pixel apart or more (kit-check's crowding): the
     sandstone draws no line */
  ...kitRecord(() => SIZE)
};
/** Whether the suite sweeps every look and time (CONFORMANCE=deep), as whoever designs or changes an effect runs it:
    three times of a loop miss a moment the drawings part (the strings' threads crowding at 77 s of 180, which the
    sweep caught, 5 Nov 2026). */
const DEEP = process.env.CONFORMANCE === "deep";
/** The looks each frame is drawn in: as designed, and a shape at another angle; swept, two more. An effect that takes
    steps is drawn at both ends of their range besides (looksOf). */
const LOOKS: readonly FxLook[] = [
  { angle: 90, shape: null, steps: null, zoom: null, bg: null },
  { angle: 210, shape: 417, steps: null, zoom: null, bg: null },
  ...(DEEP
    ? [
        { angle: 0, shape: 7, steps: null, zoom: null, bg: null },
        { angle: 137, shape: 999, steps: null, zoom: null, bg: null }
      ]
    : [])
];
/** An effect's looks: LOOKS, and where it takes steps its fewest as designed and its most at a shape and an angle,
    and where it takes a zoom one between and its most at an angle. */
const looksOf = (kind: EffectKind): readonly FxLook[] => {
  const range = EFFECT_KINDS[kind].steps;
  const zoom = EFFECT_KINDS[kind].zoom;
  return range
    ? [
        ...LOOKS,
        { angle: 90, shape: null, steps: range.least, zoom: null, bg: null },
        { angle: 210, shape: 417, steps: range.most, zoom: null, bg: null }
      ]
    : zoom
      ? [
          ...LOOKS,
          { angle: 90, shape: null, steps: null, zoom: 2.35, bg: null },
          { angle: 210, shape: null, steps: null, zoom: zoom.most, bg: null }
        ]
      : LOOKS;
};
/** Shares of the loop a frame is drawn at; swept, every twelfth. */
const TIMES = DEEP ? Array.from({ length: 12 }, (_, i) => i / 12) : [0, 0.37, 0.71];
/** Where the pointer is in the box, 0 to 1 each way, for an effect the pointer moves (EFFECT_KINDS' motion): nowhere,
    its rest, then about the box; swept, by its middle (the designed look's rest is the middle itself), an edge and a
    corner besides. */
const POINTERS: readonly FxPointer[] = [
  null,
  [0.12, 0.2],
  [0.9, 0.66],
  ...(DEEP
    ? ([
        [0.5, 0.37],
        [0.31, 0.77],
        [0, 0.5],
        [1, 1]
      ] as const)
    : [])
];
/** How far resvg's drawing of a frame's SVG may lie from the CPU's frame: a mean OKLab difference, and the 99th
    percentile of 3 by 3 neighbourhoods', in hundredths; and the share of neighbourhoods past 10 hundredths. Measured
    5 Nov 2026: the silk, the rosette and the papercut lie within a mean of 0.37, a p99 of 2.0 and none far; the
    CPU's frame 0.13 of a loop on lies at least 3.0, 13 and 3.6% from them. */
const FRAME_LIMIT = { mean: 1.5, p99: 8, far: 0.006 };
/** The most a vector effect's still may weigh as a CSS background, bytes. */
const STILL_BYTES = 40 * 1024;
const within = (d: FrameDiff) =>
  d.mean < FRAME_LIMIT.mean && d.p99 < FRAME_LIMIT.p99 && d.far < FRAME_LIMIT.far;

const effectOf = (
  kind: EffectKind,
  shape: number | null,
  steps: number | null = null,
  bg: string | null = null,
  zoom: number | null = null
): Effect => ({
  kind,
  speed: 1,
  fps: 60,
  look: { shape, frost: 1, bg, steps, zoom }
});
/** The grounds an effect whose none is its designed ground is held to drawing as the CPU draws them: a light one, one
    half clear and a clear one. */
const GROUNDS = ["#f4efe6", "#10203080", CLEAR_GROUND] as const;
/** A frame laid over a page of one color, three bytes a pixel: straight alpha (the CPU's) or premultiplied (resvg's). */
function overPage(
  rgba: Uint8Array | Uint8ClampedArray,
  page: readonly number[],
  premultiplied: boolean
): Uint8Array {
  const out = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const a = rgba[i + 3] / 255;
    for (let c = 0; c < 3; c++)
      out[j + c] = Math.round((premultiplied ? rgba[i + c] : rgba[i + c] * a) + page[c] * (1 - a));
  }
  return out;
}

const SHORTFALLS: Record<EffectShortfall, (kind: EffectKind) => boolean> = {
  svgMotion: kind => EFFECT_KINDS[kind].svgMotion === null,
  frameSvg: kind => !EFFECT_KINDS[kind].frameSvg,
  figma: kind => EFFECT_KINDS[kind].figma === null,
  video: kind => !EFFECT_KINDS[kind].video,
  embed: kind => !EFFECT_KINDS[kind].embed,
  shader: kind => !EFFECT_KINDS[kind].shader
};

beforeAll(resvgReady);

describe.each(EFFECTS)("the %s", kind => {
  const facts = EFFECT_KINDS[kind];

  it("has no clip, no moving SVG and no Figma timeline where nothing in it moves by itself", () => {
    /* an effect the pointer moves has no loop for a clip, an SVG's animation or Figma's timeline to play */
    if (facts.motion !== "pointer") return;
    expect(facts.video).toBe(false);
    expect(facts.svgMotion).toBeNull();
    expect(facts.figma).toBeNull();
  });

  it("says why wherever it hands over less, and nowhere else", () => {
    for (const [form, short] of Object.entries(SHORTFALLS) as [
      EffectShortfall,
      (k: EffectKind) => boolean
    ][]) {
      if (short(kind))
        expect(EFFECT_WHY[kind][form], `${kind}: why no full ${form}?`).toMatch(/^\S.{30,}$/s);
      else expect(EFFECT_WHY[kind][form], `${kind}: a why for a full ${form}`).toBeUndefined();
    }
  });

  it("is what the tables that name kinds apart say it is", () => {
    expect(hasVideo(kind)).toBe(facts.video);
    expect(hasEmbedScript(kind)).toBe(facts.embed);
    expect(EFFECT_SVG_MOTION[kind]).toBe(facts.svgMotion);
    expect(isVectorKind(kind)).toBe(facts.vector);
    /* FigmaKind, which the editor's Copy for Figma switches over, names the effects the table gives a paste */
    const FIGMA_KINDS: readonly FigmaKind[] = ["glass", "blob", "silk", "rosette"];
    expect(hasFigma(kind)).toBe(FIGMA_KINDS.includes(kind as FigmaKind));
  });

  it("reads its own address back", () => {
    /* its steps, where it takes them, at each end of their range; its zoom, where it takes one, at its most and between;
       its shape where it takes one, and none where it takes a zoom in its place */
    const range = facts.steps;
    const zooms = facts.zoom;
    for (const effect of [
      effectOf(kind, null),
      {
        ...effectOf(kind, 417, range?.least ?? null),
        speed: 2.5,
        fps: 30,
        ...(zooms && { look: { ...effectOf(kind, null).look, zoom: 2.35 } })
      },
      {
        ...effectOf(kind, 7, range?.most ?? null),
        speed: 0,
        ...(zooms && { look: { ...effectOf(kind, null).look, zoom: zooms.most } })
      }
    ]) {
      const parts = new URLSearchParams(effectAddressParts(effect, 210).join("&"));
      const back = parseEffect(parts);
      expect(back?.kind).toBe(kind);
      expect(back?.speed).toBe(effect.speed);
      expect(back?.fps).toBe(effect.fps);
      expect(back?.look.shape).toBe(facts.zoom ? null : effect.look.shape);
      expect(back?.look.steps).toBe(effect.look.steps);
      expect(back?.look.zoom).toBe(effect.look.zoom);
    }
  });

  if (!isVectorKind(kind)) return;
  const vector: VectorKind = kind;
  const size = PARITY_SIZE[vector];

  it("writes its SVG as its table says it moves", () => {
    const svg = effectSvg(P, "kseed", effectOf(kind, null), 90, SIZE, "https://grabient.com");
    const smil = /<animate/.test(svg);
    const css = /@keyframes/.test(svg);
    expect(smil).toBe(facts.svgMotion === "smil");
    expect(css).toBe(facts.svgMotion === "css");
  });

  if (!facts.frameSvg) return;

  /* one the pointer moves has no loop: its picture is drawn with the pointer anywhere, and is the same at any time */
  if (facts.motion === "pointer")
    it.each(looksOf(kind))(
      "is its picture with the pointer anywhere as an SVG of its own, as the CPU draws it, and the same at any time (angle $angle, shape $shape, zoom $zoom)",
      async look => {
        const effect = effectOf(kind, look.shape, look.steps, null, look.zoom);
        const seen: string[] = [];
        for (const at of POINTERS) {
          const svg = fxFrameSvg(vector, P, look, size, 0, at);
          seen.push(svg);
          expect(svg).not.toMatch(/<script|<foreignObject|href="(?!#|data:)|@keyframes|<animate/);
          const drawn = rasterize(svg, size.width);
          const cpu = (await effectDrawn(P, effect, look.angle, size, false, 0, at)).pixels;
          const where = at ? at.join(", ") : "its rest";
          expect(frameDiff(drawn, cpu, size.width, size.height), `${kind} at ${where}`).toSatisfy(
            within
          );
          /* and the limit tells places apart: the CPU's picture with the pointer elsewhere is not this SVG */
          const elsewhere: FxPointer = at
            ? [at[0] < 0.5 ? at[0] + 0.15 : at[0] - 0.15, at[1]]
            : [0.15, 0.85];
          const other = (await effectDrawn(P, effect, look.angle, size, false, 0, elsewhere))
            .pixels;
          expect(
            frameDiff(drawn, other, size.width, size.height),
            `${kind} at ${where}, the pointer elsewhere`
          ).not.toSatisfy(within);
        }
        /* it follows the pointer: no two places are the one picture */
        expect(new Set(seen).size).toBe(seen.length);
        /* and nothing in it moves by itself: at any time it is the picture at its rest, to the byte */
        const loop = fxLoop(vector, P, look);
        const first = (await effectDrawn(P, effect, look.angle, size)).pixels;
        for (const share of TIMES) {
          expect(fxFrameSvg(vector, P, look, size, share * loop)).toBe(seen[0]);
          const then = (await effectDrawn(P, effect, look.angle, size, false, share * loop)).pixels;
          expect(
            Buffer.compare(Buffer.from(then), Buffer.from(first)),
            `at ${share} of a loop`
          ).toBe(0);
        }
      }
    );
  else
    it.each(looksOf(kind))(
      "is any frame as an SVG of its own, as the CPU draws it (angle $angle, shape $shape, steps $steps, zoom $zoom)",
      async look => {
        const loop = fxLoop(vector, P, look);
        const seen: string[] = [];
        for (const share of TIMES) {
          const t = share * loop;
          const svg = fxFrameSvg(vector, P, look, size, t);
          seen.push(svg);
          expect(svg).not.toMatch(/<script|<foreignObject|href="(?!#|data:)|@keyframes|<animate/);
          const drawn = rasterize(svg, size.width);
          const cpu = (
            await effectDrawn(
              P,
              effectOf(kind, look.shape, look.steps, null, look.zoom),
              look.angle,
              size,
              false,
              t
            )
          ).pixels;
          const diff = frameDiff(drawn, cpu, size.width, size.height);
          expect(diff, `${kind} at ${t.toFixed(1)} s`).toSatisfy(within);
          /* and the limit tells frames apart: the CPU's frame a moment later is not this SVG */
          const later = (
            await effectDrawn(
              P,
              effectOf(kind, look.shape, look.steps, null, look.zoom),
              look.angle,
              size,
              false,
              t + 0.13 * loop
            )
          ).pixels;
          expect(frameDiff(drawn, later, size.width, size.height), "a frame later").not.toSatisfy(
            within
          );
        }
        /* it moves: no two of its frames are the one picture */
        expect(new Set(seen).size).toBe(seen.length);
        /* and the same time writes the same SVG */
        expect(fxFrameSvg(vector, P, look, size, TIMES[1] * loop)).toBe(seen[1]);
      }
    );

  /* a ground it takes, as its address names one: any frame's SVG lays it as the CPU does, over any page */
  if (facts.ground === "designed")
    it.each(GROUNDS)(
      "draws a ground it is given as the CPU draws it, over a light page and a dark one (%s)",
      async bg => {
        const look = { ...LOOKS[1], bg };
        const loop = fxLoop(vector, P, look);
        for (const share of DEEP ? TIMES : [0, 0.37]) {
          const t = share * loop;
          const drawn = rasterize(fxFrameSvg(vector, P, look, size, t), size.width);
          const cpu = (
            await effectDrawn(P, effectOf(kind, look.shape, null, bg), look.angle, size, false, t)
          ).pixels;
          expect(cpu.length).toBe(size.width * size.height * 4);
          for (const page of [
            [255, 255, 255],
            [12, 12, 14]
          ]) {
            const diff = frameDiff(
              overPage(drawn, page, true),
              overPage(cpu, page, false),
              size.width,
              size.height
            );
            expect(diff, `${kind} on ${bg} over ${page} at ${t.toFixed(1)} s`).toSatisfy(within);
          }
        }
      }
    );

  it("ends its loop on its first frame", async () => {
    const look = LOOKS[1];
    const loop = fxLoop(vector, P, look);
    const effect = effectOf(kind, look.shape);
    const first = (await effectDrawn(P, effect, look.angle, size, false, 0.37 * loop)).pixels;
    const again = (await effectDrawn(P, effect, look.angle, size, false, 1.37 * loop)).pixels;
    expect(frameDiff(first, again, size.width, size.height).mean).toBeLessThan(0.05);
  });

  it("stills on its first frame, or stands in for it where its table says", () => {
    const look = LOOKS[0];
    const still = rasterize(fxStillSvg(vector, P, look, size), size.width);
    const first = rasterize(fxFrameSvg(vector, P, look, size, 0), size.width);
    const diff = frameDiff(still, first, size.width, size.height);
    /* a still that is its first frame lies from that frame's SVG as a frame's SVG may lie from the CPU's frame; one
       that stands in for it, within a mean of 3 (the papercut's stepped shadows, 1.1 to 2.3) */
    if (facts.steppedStill) expect(diff.mean).toBeLessThan(3);
    else expect(diff).toSatisfy(within);
  });

  it("stills light enough for a list of cards, each its own CSS background", () => {
    /* the most a still's background may weigh at the design square: a list of thirty cards paints thirty of them.
       Measured 5 Nov 2026 over three palettes and four looks: the silk's 9.0 KiB, the rosette's 18.2, the papercut's
       14.6, the strings' 36.5 */
    const range = facts.steps;
    for (const look of [
      LOOKS[0],
      LOOKS[1],
      { angle: 0, shape: 7, steps: null, zoom: null, bg: null },
      /* an effect that takes steps at its most, its levels closest */
      ...(range ? [{ angle: 90, shape: null, steps: range.most, zoom: null, bg: null }] : [])
    ])
      expect(
        fxStillBackground(vector, P, look).length,
        `${look.angle} ${look.shape} ${look.steps}`
      ).toBeLessThan(STILL_BYTES);
  });

  it("paints its frame and its still with CSS", () => {
    const look = LOOKS[1];
    const css = fxFrameCss(vector, P, look, 12);
    expect(css).toMatch(/^url\("data:image\/svg\+xml,.*"\) 50% 50% \/ cover no-repeat$/s);
    const sheet = effectStylesheet(P, "kseed", effectOf(kind, null), 90, "https://grabient.com");
    expect(sheet).toContain("data:image/svg+xml");
  });
});
