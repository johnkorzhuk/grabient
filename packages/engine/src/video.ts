/* A palette's effect as a video: the fluted glass, the blob, the silk or the rosette playing whole loops, so the clip
   loops without a seam, drawn and coded by video/video.wasm (C: the pixels of glassRenderer, blobRenderer, renderSilk
   and renderRosette within a level or two of theirs, finished with the view's soft and grain as fx-finish.ts's
   finishPixels finishes a frame, BT.709 YUV 4:2:0, and minih264's H.264), in an MP4 (mp4.ts). The engine's own code says
   where the glass's discs, the blob's balls, the silk's folds and the rosette's petals stand in each frame; the module
   draws them. The caller hands over the module, compiled: a Worker imports it, a test reads its file. */
import { BLOB_DESIGN, BLOB_LOOP, blobBackdrop, blobFit, blobFrame, blobScene } from "./blob.ts";
import { hexBytes } from "./color.ts";
import { type EffectFinish, type EffectKind, type EffectLook, groundParts } from "./effect.ts";
import { blurBoxes, effectBlurSigma, effectUnderlay } from "./fx-finish.ts";
import { GLASS_LOOP, type GlassGeometry, glassDiscAt, glassField } from "./glass.ts";
import { glassColors } from "./glass-colors.ts";
import { type GlassWindow, glassCover, glassMap, glassPlan } from "./glass-render.ts";
import { GRAIN_SIDE, grainAlpha, grainSpeck } from "./grain.ts";
import { type Mp4Frame, mp4 } from "./mp4.ts";
import type { Palette } from "./palette.ts";
import {
  HEART_STOPS,
  rosetteDesign,
  rosetteGroupAt,
  rosettePetals,
  rosetteScene
} from "./rosette.ts";
import { centresAt, SILK_LOOP, silkScene } from "./silk.ts";
import type { Size } from "./view.ts";

/** The effects a clip can be drawn of: every one, its frames drawn by video/video.wasm. */
export type VideoKind = EffectKind;

/* The host's WebAssembly, as much of it as this names: the engine's own lib knows no host (as zip.ts declares
   TextEncoder). Every host the engine runs in has it: a Worker, a browser, Node. */
declare namespace WebAssembly {
  type Module = object;
  interface Memory {
    readonly buffer: ArrayBuffer;
  }
  const Instance: new (module: Module, imports: object) => { readonly exports: object };
}

/** What a clip draws, which its loop and its cost depend on: the effect, its look, and its soft and grain (none where
    absent). */
export interface VideoEffect {
  kind: VideoKind;
  look: EffectLook;
  finish?: EffectFinish;
}

/** A clip of an effect, as an address asks for it. */
export interface VideoAsk extends VideoEffect {
  palette: Palette;
  angle: number;
  /** even sides */
  size: Size;
  fps: number;
}

/** How a clip plays: whole loops in whole frames, so its last frame leads into its first. */
export interface VideoPlan {
  frames: number;
  /** 0 for an effect held on its first frame */
  loops: number;
  /** the pace it plays at: the speed asked, nudged so whole loops fill whole frames, and the duration if one is asked */
  speed: number;
  seconds: number;
}

/** What a clip may be, so each costs a known most to draw: its frames' longer side and pixels, its rate, its length,
    and its work, pixels times frames weighed by what it draws (videoWeight), past which a clip is drawn smaller. A clip
    of the most work is about 20 seconds of one core's time here: a 1080 by 1080 glass at 60 frames a second for 23
    seconds, its speed 2.45. */
export const VIDEO_LIMITS = {
  side: 1920,
  pixels: 1920 * 1080,
  fps: 60,
  seconds: 60,
  least: 0.5,
  work: 1.6e9
} as const;

/** What a pixel of a frame costs to draw and code, the glass's 1, measured against the glass frame by frame and in
    whole clips drawn in parts as the Worker draws them (3 Nov 2026): the blob's melt and frost cost half again (1.1 to
    1.3 measured; 1.5 keeps its clips as they were); the silk's seven bands and three dyes 1.6 to 1.8 a frame, and 2.4
    in its clips, whose 60 seconds of a four-minute loop move each frame further, which costs the coding; the rosette's
    petals 1.5 to 1.6. */
export const VIDEO_WEIGHT: Record<VideoKind, number> = {
  glass: 1,
  blob: 1.5,
  silk: 2.4,
  rosette: 1.6
};
/** What a soft adds to a pixel's cost, by the resolution its blur runs at (videoBlur), measured as VIDEO_WEIGHT is: at
    the frame's own, about what the glass costs (0.7 to 0.95); at a half or a quarter, its passes a quarter or a
    sixteenth of that, the averaging, the reading back up and the laying over the rest (0.3 to 0.4, 0.2 to 0.35). The
    grain costs the coding its specks (0.2 to 0.45). */
export const VIDEO_SOFT_WEIGHT: Record<VideoBlur["scale"], number> = { 1: 1, 2: 0.45, 4: 0.35 };
export const VIDEO_GRAIN_WEIGHT = 0.3;

/** A pixel's cost in a clip of a size: its effect's, and its soft's and grain's. */
export function videoWeight(effect: VideoEffect, size: Size): number {
  const soft = effect.finish?.soft
    ? VIDEO_SOFT_WEIGHT[videoBlurScale(effectBlurSigma(effect.finish.soft, size))]
    : 0;
  return VIDEO_WEIGHT[effect.kind] + soft + (effect.finish?.grain ? VIDEO_GRAIN_WEIGHT : 0);
}

/** A clip's work: its pixels across its frames, weighed by what it draws. */
export const videoWork = (effect: VideoEffect, size: Size, frames: number): number =>
  size.width * size.height * frames * videoWeight(effect, size);

/** A loop's seconds at speed 1: the rosette's by its shape (its rings' period and density). */
export function videoLoop(effect: Pick<VideoEffect, "kind" | "look">): number {
  switch (effect.kind) {
    case "glass":
      return GLASS_LOOP;
    case "blob":
      return BLOB_LOOP;
    case "silk":
      return SILK_LOOP;
    case "rosette":
      return rosetteDesign(effect.look.shape).loop;
  }
}

/** The clip a speed, a rate and a duration make: one loop where no duration is asked, else as many whole loops as come
    nearest to the speed in that time (one at least), the speed nudged to fit them. A speed of 0, the effect held, is
    its first frame for the duration, or for a second. */
export function videoPlan(
  effect: Pick<VideoEffect, "kind" | "look">,
  speed: number,
  fps: number,
  duration: number | null
): VideoPlan {
  const loop = videoLoop(effect);
  if (speed === 0) {
    const frames = Math.max(1, Math.round((duration ?? 1) * fps));
    return { frames, loops: 0, speed: 0, seconds: frames / fps };
  }
  const frames = Math.max(2, Math.round((duration ?? loop / speed) * fps));
  const loops = duration === null ? 1 : Math.max(1, Math.round((duration * speed) / loop));
  return { frames, loops, speed: (loops * loop * fps) / frames, seconds: frames / fps };
}

/** The seconds an address's `duration` asks for, two decimals within the limits, or null for one loop. */
export function videoDuration(raw: string | null | undefined): number | null {
  if (!raw || !/^\d{1,4}(\.\d+)?$/.test(raw)) return null;
  const seconds = Math.round(Number(raw) * 100) / 100;
  return seconds > 0 ? Math.min(Math.max(seconds, VIDEO_LIMITS.least), VIDEO_LIMITS.seconds) : null;
}

/** A clip within the limits: its rate up to the most, one loop longer than the longest clip played in that time, and
    its sides even (H.264's colors are a quarter of its pixels), at least 16, scaled down together where the sides, the
    pixels or the work ask. A soft's cost grows as its picture shrinks (videoBlur), so the work is weighed again at
    each smaller size until it fits. */
export function videoFit(
  effect: VideoEffect,
  speed: number,
  fps: number,
  duration: number | null,
  asked: Size
): { size: Size; fps: number; plan: VideoPlan } {
  const rate = Math.max(1, Math.min(VIDEO_LIMITS.fps, Math.round(fps)));
  const long = speed > 0 && videoLoop(effect) / speed > VIDEO_LIMITS.seconds;
  const plan = videoPlan(effect, speed, rate, duration ?? (long ? VIDEO_LIMITS.seconds : null));
  const w = Math.max(16, asked.width);
  const h = Math.max(16, asked.height);
  // the hair before flooring keeps a side that scales to a whole number from losing a pixel
  const sized = (scale: number): Size => {
    const even = (v: number) => Math.max(16, 2 * Math.floor((v * scale + 1e-9) / 2));
    return { width: even(w), height: even(h) };
  };
  let scale = Math.min(
    1,
    VIDEO_LIMITS.side / Math.max(w, h),
    Math.sqrt(VIDEO_LIMITS.pixels / (w * h)),
    Math.sqrt(VIDEO_LIMITS.work / videoWork(effect, { width: w, height: h }, plan.frames))
  );
  for (let tries = 0; tries < 4; tries++) {
    const work = videoWork(effect, sized(scale), plan.frames);
    if (work <= VIDEO_LIMITS.work) break;
    scale *= Math.sqrt(VIDEO_LIMITS.work / work);
  }
  return { size: sized(scale), fps: rate, plan };
}

/** A clip's frames shared out in runs of at most `work` (videoWork) each, so each run may be drawn by an invocation of
    its own, each going on from where the one before stopped (videoFrames). A held effect is one run: it is drawn
    once. */
export function videoParts(
  effect: VideoEffect,
  plan: VideoPlan,
  size: Size,
  work: number
): [number, number][] {
  if (!plan.loops) return [[0, plan.frames]];
  const per = Math.max(1, Math.floor(work / videoWork(effect, size, 1)));
  const count = Math.ceil(plan.frames / per);
  // as even as whole frames allow
  return Array.from({ length: count }, (_, i): [number, number] => [
    Math.round((i * plan.frames) / count),
    Math.round(((i + 1) * plan.frames) / count)
  ]);
}

/** How the frames are coded: minih264's quantizer (lower is finer and larger) and its effort (its speed: 9 leaves out
    quarter-pixel motion, which these slow, smooth pictures hardly use, and keeps the deblocking that 8 and 10 drop).
    A clip is one stream from one key frame, its parts going on from each other (videoFrames), so the only place the
    coding's noise changes all at once is the loop's seam, where the key frame follows the last: there the key frame
    and the last `ramp` frames, easing toward it, are coded at `keyQp`, so both carry less noise: at speed 2.45 the
    seam moves the decoded picture about 1.2 levels where it moved 2, at 4% more bytes (an ordinary step is 0.3). The blob's frost is noise in every pixel, which costs H.264 many times what the glass does, so it is coded
    coarser: at 1080 by 1080 and 60 frames a second the glass is about 1.3 Mbit/s, the frosted blob about 8. */
export interface VideoQuality {
  qp: number;
  keyQp: number;
  ramp: number;
  effort: number;
}
export const VIDEO_QUALITY: Record<VideoKind, VideoQuality> = {
  glass: { qp: 24, keyQp: 12, ramp: 20, effort: 9 },
  blob: { qp: 28, keyQp: 18, ramp: 20, effort: 9 },
  silk: { qp: 24, keyQp: 12, ramp: 20, effort: 9 },
  rosette: { qp: 24, keyQp: 12, ramp: 20, effort: 9 }
};

/** Frame i's quantizer in a clip of n frames. */
export function videoQp(quality: VideoQuality, i: number, n: number): number {
  if (i === 0) return quality.keyQp;
  const into = i - (n - 1 - quality.ramp);
  return into > 0
    ? Math.round(quality.qp + ((quality.keyQp - quality.qp) * into) / quality.ramp)
    : quality.qp;
}

interface VideoModule {
  memory: WebAssembly.Memory;
  params: () => number;
  grain_setup: () => number;
  finish_setup: (
    scale: number,
    boxes: number,
    l0: number,
    r0: number,
    l1: number,
    r1: number,
    l2: number,
    r2: number,
    under: number,
    r: number,
    g: number,
    b: number
  ) => number;
  blob_ground: (r: number, g: number, b: number, alpha: number) => void;
  create: (
    width: number,
    height: number,
    fps: number,
    gop: number,
    speed: number,
    qp: number,
    primaries: number,
    transfer: number,
    matrix: number
  ) => number;
  keep_rgb: (on: number) => number;
  frame: (key: number, qp: number) => number;
  out: () => number;
  state: () => number;
  state_size: () => number;
  glass_setup: (
    fw: number,
    fh: number,
    taps: number,
    regionX: number,
    regionY: number,
    scale: number,
    q: number,
    windowX: number,
    windowY: number
  ) => number;
  glass_frame: (discs: number, core: number, r: number, g: number, b: number) => void;
  blob_setup: (
    S: number,
    R: number,
    pad: number,
    fitX: number,
    fitY: number,
    k: number,
    seed: number,
    frost: number,
    r: number,
    g: number,
    b: number
  ) => number;
  blob_frame: (dots: number) => void;
  silk_setup: (n: number, x1: number, y1: number, ux: number, uy: number, ul: number) => number;
  silk_frame: () => void;
  rosette_setup: (keys: number, S: number, heartIn: number, heartOut: number) => number;
  rosette_frame: (petals: number) => void;
}

/** A drawer of one clip's frames in a fresh instance of the module: `draw(i)` draws frame i into the encoder's planes
    and `code(i)` codes them, frame 0 the key frame. `state()` is the encoder's state after the frames coded, which
    `resume` takes in, in a drawer of the same clip, to go on from there. With `keepRgb`, a drawing also leaves its RGB
    for `rgb()` to read, which a test compares with the engine's own frames. */
export function videoDrawer(
  wasm: WebAssembly.Module,
  ask: VideoAsk,
  plan: VideoPlan,
  quality = VIDEO_QUALITY[ask.kind],
  keepRgb = false,
  blurAs?: VideoBlur["scale"]
) {
  const m = new WebAssembly.Instance(wasm, {}).exports as unknown as VideoModule;
  const { width: W, height: H } = ask.size;
  if (W % 2 || H % 2) throw new Error("video: sides must be even");
  /* BT.709 primaries, transfer and matrix, as the stream and the file both say */
  const pixels = m.create(W, H, ask.fps, 0, quality.effort, quality.qp, 1, 1, 1);
  if (!pixels) throw new Error("video: no encoder for this size");
  const kept = m.keep_rgb(keepRgb ? 1 : 0);
  if (keepRgb && !kept) throw new Error("video: out of memory");
  const params = () => new Float64Array(m.memory.buffer, m.params(), 4096);
  const draw =
    ask.kind === "glass"
      ? glassDraw(m, pixels, params, ask, plan)
      : ask.kind === "blob"
        ? blobDraw(m, params, ask, plan)
        : ask.kind === "silk"
          ? silkDraw(m, params, ask, plan)
          : rosetteDraw(m, params, ask, plan);
  finishSetup(m, params, ask, blurAs);
  const code = (i: number): Uint8Array<ArrayBuffer> => {
    const n = m.frame(i === 0 ? 1 : 0, videoQp(quality, i, plan.frames));
    if (n < 0) throw new Error(`video: minih264 error ${-n}`);
    return new Uint8Array(m.memory.buffer, m.out(), n).slice();
  };
  const rgb = () => new Uint8Array(m.memory.buffer, kept, W * H * 3);
  const state = () => new Uint8Array(m.memory.buffer, m.state(), m.state_size()).slice();
  const resume = (saved: Uint8Array) => {
    if (saved.length !== m.state_size()) throw new Error("video: a state of another clip");
    new Uint8Array(m.memory.buffer, m.state(), saved.length).set(saved);
  };
  return { draw, code, rgb, state, resume };
}

/** How the module blurs a frame for a soft of `sigma` pixels: at the frame's own resolution, by fx-finish.ts's own
    boxes (blurBoxes), or at 1/`scale` of it, the frame averaged `scale` by `scale` as it is drawn and read back up
    bilinearly after, as a browser draws a wide blur, by three boxes whose variance is the full blur's less what the
    averaging and the reading back spread (a box of f's (f² - 1) / 12 and a bilinear read's f² / 6 a side), each box
    centered: three of odd widths, or two of even widths leaning either way and one of odd, their widths within 2 of
    each other, so their sum stays near a Gaussian. Each step down costs a quarter of the blur before it. */
export interface VideoBlur {
  scale: 1 | 2 | 4;
  /** each box's reach before a sample and after it */
  boxes: [number, number][];
}
export function videoBlur(sigma: number, scale = videoBlurScale(sigma)): VideoBlur {
  const full = blurBoxes(sigma);
  if (scale === 1 || !full.length) return { scale: 1, boxes: full };
  const variance = (boxes: readonly [number, number][]) =>
    boxes.reduce((v, [l, r]) => v + ((l + r + 1) ** 2 - 1) / 12, 0);
  const target =
    (variance(full) - ((scale * scale - 1) / 12 + (scale * scale) / 6)) / (scale * scale);
  if (target <= 0) return { scale: 1, boxes: full };
  const w0 = Math.sqrt(4 * target + 1);
  let best: { boxes: [number, number][]; off: number; spread: number } | null = null;
  for (let a = Math.max(1, Math.floor(w0) - 2); a <= Math.ceil(w0) + 2; a++)
    for (let b = a; b <= a + 2; b++)
      for (let c = Math.max(1, b - 2); c <= a + 2; c++) {
        const odd = a % 2 && b % 2 && c % 2 && c >= b;
        const paired = !(a % 2) && !(b % 2) && c % 2;
        if (!odd && !paired) continue;
        const boxes: [number, number][] = odd
          ? [a, b, c].map((w): [number, number] => [(w - 1) / 2, (w - 1) / 2])
          : [
              [a / 2, a / 2 - 1],
              [b / 2 - 1, b / 2],
              [(c - 1) / 2, (c - 1) / 2]
            ];
        const off = Math.abs(variance(boxes) - target);
        const spread = Math.max(a, b, c) - Math.min(a, b, c);
        if (
          !best ||
          off < best.off - 1e-9 ||
          (Math.abs(off - best.off) <= 1e-9 && spread < best.spread)
        )
          best = { boxes, off, spread };
      }
  return best ? { scale, boxes: best.boxes } : { scale: 1, boxes: full };
}

/** The resolution a soft of `sigma` pixels is blurred at (videoBlur). */
export const videoBlurScale = (sigma: number): 1 | 2 | 4 => (sigma < 7 ? 1 : sigma < 16 ? 2 : 4);

/* The clip's soft and grain, which the module lays on each frame as fx-finish.ts's finishPixels does: the grain's tile
   at its strength, a speck a pixel; and for a soft, the blur's sigma and what lies under the blurred frame, the
   palette's gradient at the effect's angle, its stops blurred by the same soft, or, under a blob with no ground, the
   clip's backdrop, which a clip, never clear, lays every blob on (blobDraw). A blob with a soft is drawn as its layer
   alone, over its own ground where it has one, as the site lays it over that gradient. */
function finishSetup(
  m: VideoModule,
  params: () => Float64Array,
  ask: VideoAsk,
  blurAs?: VideoBlur["scale"]
): void {
  const finish = ask.finish ?? {};
  if (finish.grain) {
    const tile = new Uint8Array(m.memory.buffer, m.params(), GRAIN_SIDE * GRAIN_SIDE);
    for (let y = 0; y < GRAIN_SIDE; y++)
      for (let x = 0; x < GRAIN_SIDE; x++) {
        const { white, size } = grainSpeck(x, y);
        tile[y * GRAIN_SIDE + x] = grainAlpha(size, finish.grain) | (white ? 1 : 0);
      }
    if (!m.grain_setup()) throw new Error("video: out of memory");
  }
  if (!finish.soft) return;
  const underlay = effectUnderlay(ask.palette, ask, ask.angle, finish.soft);
  if (ask.kind === "blob") {
    const ground = ask.look.bg ? groundParts(ask.look.bg) : null;
    const [r, g, b] = ground ? hexBytes(ground.hex) : [0, 0, 0];
    m.blob_ground(r, g, b, ground?.alpha ?? 0);
  }
  const blur = videoBlur(effectBlurSigma(finish.soft, ask.size), blurAs);
  const reach = [0, 1, 2].flatMap(i => blur.boxes[i] ?? [0, 0]);
  const setup = (under: number, r: number, g: number, b: number) =>
    m.finish_setup(
      blur.scale,
      blur.boxes.length,
      reach[0],
      reach[1],
      reach[2],
      reach[3],
      reach[4],
      reach[5],
      under,
      r,
      g,
      b
    );
  let done: number;
  if (underlay) {
    const n = underlay.stops.length;
    const a = (underlay.angle * Math.PI) / 180;
    const p = params();
    p.set([n, Math.sin(a), -Math.cos(a)]);
    for (const [i, stop] of underlay.stops.entries())
      p.set(
        [...hexBytes(stop.hex), underlay.at ? underlay.at[i] : n > 1 ? i / (n - 1) : 0],
        3 + 4 * i
      );
    done = setup(1, 0, 0, 0);
  } else {
    const [r, g, b] = blobBackdrop(ask.palette);
    done = setup(0, r, g, b);
  }
  if (!done) throw new Error("video: out of memory");
}

/* The glass's ribs' map for the last box drawn, which every part of a clip drawn in this isolate shares: a tenth of a
   second at 1080 by 1080, where a part draws about a second. */
let mapKept: { key: string; map: Uint8Array } | null = null;
function ribsMap(geometry: GlassGeometry, window: GlassWindow, key: string): Uint8Array {
  if (mapKept?.key !== key) mapKept = { key, map: glassMap(geometry, window) };
  return mapKept.map;
}

function glassDraw(
  m: VideoModule,
  pixels: number,
  params: () => Float64Array,
  ask: VideoAsk,
  plan: VideoPlan
): (i: number) => void {
  const { geometry, window } = glassCover(ask.size, 1, ask.angle, ask.look.shape);
  const { region, scale } = geometry;
  const { q, fw, fh, taps } = glassPlan(geometry);
  const field = glassField(geometry, glassColors(ask.palette));
  /* the ribs' map where the pixels go, read once into each pixel's place in the field */
  const key = `${window.w}x${window.h}|${ask.angle}|${ask.look.shape ?? 0}`;
  new Uint8Array(m.memory.buffer, pixels, window.w * window.h * 4).set(
    ribsMap(geometry, window, key)
  );
  params().set(taps.flat());
  if (!m.glass_setup(fw, fh, taps.length, region.x, region.y, scale, q, window.x, window.y))
    throw new Error("video: out of memory");
  const [br, bg, bb] = hexBytes(field.base).map(v => v / 255);
  const discs = field.discs.map(d => ({ d, rgb: hexBytes(d.color).map(v => v / 255) }));
  const pos = new Float32Array(2);
  return i => {
    const t = plan.loops ? (i * plan.loops * GLASS_LOOP) / plan.frames : 0;
    const p = params();
    for (const [k, { d, rgb }] of discs.entries()) {
      glassDiscAt(geometry, d, t, pos, 0);
      p.set([(pos[0] - region.x) / q, (pos[1] - region.y) / q, d.R / q, ...rgb], 6 * k);
    }
    m.glass_frame(discs.length, field.core, br, bg, bb);
  };
}

function blobDraw(
  m: VideoModule,
  params: () => Float64Array,
  ask: VideoAsk,
  plan: VideoPlan
): (i: number) => void {
  const scene = blobScene(ask.palette, BLOB_DESIGN, ask.look);
  const fit = blobFit(ask.size);
  const k = fit.scale;
  const R = Math.max(...scene.blobs.map(b => b.R)) * k;
  /* a video is never clear: the ground over the near-black or near-white a picture that cannot be clear takes, as the
     PNG lays it (blobRenderer's `under`) */
  const backdrop = blobBackdrop(ask.palette);
  const ground = scene.backdrop ? groundParts(scene.backdrop) : null;
  const under = ground
    ? hexBytes(ground.hex).map((v, i) =>
        Math.round(v * ground.alpha + backdrop[i] * (1 - ground.alpha))
      )
    : backdrop;
  const S = BLOB_DESIGN.width * k;
  const [ur, ug, ub] = under;
  if (!m.blob_setup(S, R, scene.pad * k, fit.x, fit.y, k, scene.seed, ask.look.frost, ur, ug, ub))
    throw new Error("video: out of memory");
  const colors = new Map<string, number[]>();
  const rgbOf = (hex: string) => {
    let rgb = colors.get(hex);
    if (!rgb) {
      rgb = hexBytes(hex).map(v => v / 255);
      colors.set(hex, rgb);
    }
    return rgb;
  };
  return i => {
    const f = plan.loops ? ((i * plan.loops) % plan.frames) / plan.frames : 0;
    const p = params();
    const dots = blobFrame(scene, f);
    for (const [n, dot] of dots.entries()) p.set([dot.x, dot.y, dot.r, ...rgbOf(dot.color)], 6 * n);
    m.blob_frame(dots.length);
  };
}

function silkDraw(
  m: VideoModule,
  params: () => Float64Array,
  ask: VideoAsk,
  plan: VideoPlan
): (i: number) => void {
  const scene = silkScene(ask.palette, { angle: ask.angle, shape: ask.look.shape }, ask.size);
  const ux = scene.x2 - scene.x1;
  const uy = scene.y2 - scene.y1;
  params().set([
    ...scene.folds.map(f => f.R),
    ...scene.folds.map(f => 1 / f.w),
    ...scene.valley.table,
    ...scene.crest.table,
    ...scene.dye.baseB,
    ...scene.dye.shadeB,
    ...scene.dye.liftB
  ]);
  if (!m.silk_setup(scene.folds.length, scene.x1, scene.y1, ux, uy, 1 / (ux * ux + uy * uy)))
    throw new Error("video: a silk of too many folds");
  const centres = new Float64Array(2 * scene.folds.length);
  return i => {
    centresAt(scene, plan.loops ? (i * plan.loops * SILK_LOOP) / plan.frames : 0, centres);
    params().set(centres);
    m.silk_frame();
  };
}

function rosetteDraw(
  m: VideoModule,
  params: () => Float64Array,
  ask: VideoAsk,
  plan: VideoPlan
): (i: number) => void {
  const scene = rosetteScene(ask.palette, { angle: ask.angle, shape: ask.look.shape }, ask.size);
  /* every petal any frame of the loop shows, rim first */
  const petals = rosettePetals(scene, true);
  const { lens, design, colors } = scene;
  params().set([
    lens.x0,
    lens.x1,
    lens.w,
    lens.xm,
    lens.d,
    lens.rho,
    lens.reach,
    design.grad.cu,
    design.grad.cv,
    design.grad.ru,
    design.grad.rv,
    ...design.stops.map(([at]) => at),
    ...HEART_STOPS.flat(),
    ...colors.ground,
    ...colors.heart,
    ...colors.grads.flat(2)
  ]);
  if (!m.rosette_setup(colors.grads.length, scene.S, design.heartIn, design.heartOut))
    throw new Error("video: out of memory");
  return i => {
    const tau = plan.loops ? ((i * plan.loops) % plan.frames) / plan.frames : 0;
    const group = rosetteGroupAt(scene, tau);
    const p = params();
    for (const [k, petal] of petals.entries()) {
      const turn = petal.th + group.turn;
      p.set([petal.r * group.zoom, Math.cos(turn), Math.sin(turn), petal.key], 4 * k);
    }
    m.rosette_frame(petals.length);
  };
}

/** Frames `from` to `to` of a clip, coded: from its key frame, or from `state`, the encoder's state where the frames
    before stopped, so parts drawn apart join as one stream. With the state after them, for the next part. A held
    effect is drawn once. */
export function videoFrames(
  wasm: WebAssembly.Module,
  ask: VideoAsk,
  plan: VideoPlan,
  from = 0,
  to = plan.frames,
  state: Uint8Array | null = null,
  quality = VIDEO_QUALITY[ask.kind]
): { frames: Mp4Frame[]; state: Uint8Array<ArrayBuffer> } {
  const drawer = videoDrawer(wasm, ask, plan, quality);
  if (from > 0) {
    if (!state) throw new Error("video: a part after the first goes on from a state");
    drawer.resume(state);
  }
  const frames: Mp4Frame[] = [];
  for (let i = from; i < to; i++) {
    if (plan.loops || i === from) drawer.draw(i);
    frames.push({ data: drawer.code(i), key: i === 0 });
  }
  return { frames, state: drawer.state() };
}

/** A clip's frames as an MP4. */
export const videoFile = (ask: Pick<VideoAsk, "size" | "fps">, frames: readonly Mp4Frame[]) =>
  mp4({ width: ask.size.width, height: ask.size.height, fps: ask.fps }, frames);
