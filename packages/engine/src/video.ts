/* A palette's effect as a video: the fluted glass or the blob playing whole loops, so the clip loops without a seam,
   drawn and coded by video/video.wasm (C: the pixels of glassRenderer and blobRenderer within a level of theirs, BT.709
   YUV 4:2:0, and minih264's H.264), in an MP4 (mp4.ts). The engine's own code says where the glass's discs and the
   blob's balls stand in each frame; the module draws them. The caller hands over the module, compiled: a Worker imports
   it, a test reads its file. */
import { BLOB_DESIGN, BLOB_LOOP, blobBackdrop, blobFit, blobFrame, blobScene } from "./blob.ts";
import { hexBytes } from "./color.ts";
import { type EffectKind, type EffectLook, groundParts } from "./effect.ts";
import { GLASS_LOOP, type GlassGeometry, glassDiscAt, glassField } from "./glass.ts";
import { glassColors } from "./glass-colors.ts";
import { type GlassWindow, glassCover, glassMap, glassPlan } from "./glass-render.ts";
import { type Mp4Frame, mp4 } from "./mp4.ts";
import type { Palette } from "./palette.ts";
import type { Size } from "./view.ts";

/* The host's WebAssembly, as much of it as this names: the engine's own lib knows no host (as zip.ts declares
   TextEncoder). Every host the engine runs in has it: a Worker, a browser, Node. */
declare namespace WebAssembly {
  type Module = object;
  interface Memory {
    readonly buffer: ArrayBuffer;
  }
  const Instance: new (module: Module, imports: object) => { readonly exports: object };
}

/** A clip of an effect, as an address asks for it. */
export interface VideoAsk {
  kind: EffectKind;
  palette: Palette;
  look: EffectLook;
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
    and its work, pixels times frames weighed by its effect (VIDEO_WEIGHT), past which a clip is drawn smaller. A clip
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

/** What a pixel of a frame costs to draw and code, the glass's 1: the blob's melt and frost cost half again. */
export const VIDEO_WEIGHT: Record<EffectKind, number> = { glass: 1, blob: 1.5 };

/** A clip's work: its pixels across its frames, weighed by its effect. */
export const videoWork = (kind: EffectKind, size: Size, frames: number): number =>
  size.width * size.height * frames * VIDEO_WEIGHT[kind];

/** A loop's seconds at speed 1. */
export const videoLoop = (kind: EffectKind): number => (kind === "glass" ? GLASS_LOOP : BLOB_LOOP);

/** The clip a speed, a rate and a duration make: one loop where no duration is asked, else as many whole loops as come
    nearest to the speed in that time (one at least), the speed nudged to fit them. A speed of 0, the effect held, is
    its first frame for the duration, or for a second. */
export function videoPlan(
  kind: EffectKind,
  speed: number,
  fps: number,
  duration: number | null
): VideoPlan {
  const loop = videoLoop(kind);
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
    pixels or the work ask. */
export function videoFit(
  kind: EffectKind,
  speed: number,
  fps: number,
  duration: number | null,
  asked: Size
): { size: Size; fps: number; plan: VideoPlan } {
  const rate = Math.max(1, Math.min(VIDEO_LIMITS.fps, Math.round(fps)));
  const long = speed > 0 && videoLoop(kind) / speed > VIDEO_LIMITS.seconds;
  const plan = videoPlan(kind, speed, rate, duration ?? (long ? VIDEO_LIMITS.seconds : null));
  const w = Math.max(16, asked.width);
  const h = Math.max(16, asked.height);
  const scale = Math.min(
    1,
    VIDEO_LIMITS.side / Math.max(w, h),
    Math.sqrt(VIDEO_LIMITS.pixels / (w * h)),
    Math.sqrt(VIDEO_LIMITS.work / videoWork(kind, { width: w, height: h }, plan.frames))
  );
  // the hair before flooring keeps a side that scales to a whole number from losing a pixel
  const even = (v: number) => Math.max(16, 2 * Math.floor((v * scale + 1e-9) / 2));
  return { size: { width: even(w), height: even(h) }, fps: rate, plan };
}

/** A clip's frames shared out in runs of at most `work` (videoWork) each, so each run may be drawn by an invocation of
    its own, each going on from where the one before stopped (videoFrames). A held effect is one run: it is drawn
    once. */
export function videoParts(
  kind: EffectKind,
  plan: VideoPlan,
  size: Size,
  work: number
): [number, number][] {
  if (!plan.loops) return [[0, plan.frames]];
  const per = Math.max(1, Math.floor(work / videoWork(kind, size, 1)));
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
export const VIDEO_QUALITY: Record<EffectKind, VideoQuality> = {
  glass: { qp: 24, keyQp: 12, ramp: 20, effort: 9 },
  blob: { qp: 28, keyQp: 18, ramp: 20, effort: 9 }
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
  keep_rgb: (on: number) => void;
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
  keepRgb = false
) {
  const m = new WebAssembly.Instance(wasm, {}).exports as unknown as VideoModule;
  const { width: W, height: H } = ask.size;
  if (W % 2 || H % 2) throw new Error("video: sides must be even");
  /* BT.709 primaries, transfer and matrix, as the stream and the file both say */
  const pixels = m.create(W, H, ask.fps, 0, quality.effort, quality.qp, 1, 1, 1);
  if (!pixels) throw new Error("video: no encoder for this size");
  m.keep_rgb(keepRgb ? 1 : 0);
  const params = () => new Float64Array(m.memory.buffer, m.params(), 4096);
  const draw =
    ask.kind === "glass" ? glassDraw(m, pixels, params, ask, plan) : blobDraw(m, params, ask, plan);
  const code = (i: number): Uint8Array<ArrayBuffer> => {
    const n = m.frame(i === 0 ? 1 : 0, videoQp(quality, i, plan.frames));
    if (n < 0) throw new Error(`video: minih264 error ${-n}`);
    return new Uint8Array(m.memory.buffer, m.out(), n).slice();
  };
  const rgb = () => new Uint8Array(m.memory.buffer, pixels, W * H * 3);
  const state = () => new Uint8Array(m.memory.buffer, m.state(), m.state_size()).slice();
  const resume = (saved: Uint8Array) => {
    if (saved.length !== m.state_size()) throw new Error("video: a state of another clip");
    new Uint8Array(m.memory.buffer, m.state(), saved.length).set(saved);
  };
  return { draw, code, rgb, state, resume };
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
