/* A palette's effect as a video: the fluted glass, the blob, the silk, the rosette or the papercut playing whole loops,
   so the clip loops without a seam, drawn and coded by video/video.wasm (C: the pixels of glassRenderer, blobRenderer,
   renderSilk and renderRosette within a level or two of theirs and renderPapercut's own, finished with the view's soft
   and grain as fx-finish.ts's finishPixels finishes a frame, BT.709 YUV 4:2:0, and minih264's H.264), in an MP4
   (mp4.ts). The engine's own code says where the glass's discs, the blob's balls, the silk's folds, the rosette's
   petals and the papercut's hills, waves and light stand in each frame; the module draws them. The caller hands over
   the module, compiled: a Worker imports it, a test reads its file. */
import { BLOB_DESIGN, BLOB_LOOP, blobBackdrop, blobFit, blobFrame, blobScene } from "./blob.ts";
import { hexBytes } from "./color.ts";
import { type EffectFinish, type EffectLook, groundParts } from "./effect.ts";
import type { Underlay } from "./fx-finish.ts";
import { GLASS_LOOP, type GlassGeometry, glassDiscAt, glassField } from "./glass.ts";
import { glassColors } from "./glass-colors.ts";
import { type GlassWindow, glassCover, glassMap, glassPlan } from "./glass-render.ts";
import { GRAIN_SIDE, grainAlpha, grainSpeck } from "./grain.ts";
import { type Mp4Frame, mp4 } from "./mp4.ts";
import type { Palette } from "./palette.ts";
import { PAPERCUT_LOOP, papercutFrameAt, papercutFrameSize, papercutScene } from "./papercut.ts";
import {
  HEART_STOPS,
  rosetteDesign,
  rosetteGroupAt,
  rosettePetals,
  rosetteScene
} from "./rosette.ts";
import { centresAt, SILK_LOOP, silkScene } from "./silk.ts";
import type { VideoKind } from "./video-kinds.ts";
import { effectSoftShare, type Size } from "./view.ts";

export type { VideoKind } from "./video-kinds.ts";

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

/** How a clip's frames are finished, worked out from its soft and grain for its size (video-finish.ts's videoFinish):
    the grain's strength; and for a soft, how the module blurs a frame (videoBlur) and the palette's gradient under the
    blurred frame, none under a blob with no ground, which lies on the clip's backdrop. Plain numbers, which the answer
    hands each part. */
export interface VideoFinish {
  grain?: number;
  soft?: { blur: VideoBlur; under: Underlay | null };
}

/** How the module blurs a frame for a soft (video-finish.ts's videoBlur): at the frame's own resolution or at a half or a
    quarter of it, by three boxes, each its reach before a sample and after it (none for a blur too small). */
export interface VideoBlur {
  scale: 1 | 2 | 4;
  boxes: [number, number][];
}

/** A clip of an effect, as an address asks for it, its finish worked out. */
export interface VideoAsk {
  kind: VideoKind;
  look: EffectLook;
  palette: Palette;
  angle: number;
  /** even sides */
  size: Size;
  fps: number;
  finish?: VideoFinish;
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
    petals 1.5 to 1.6; the papercut's field and its sheets' shadows 1.7 to 2.0 a frame, and in its clips' parts, each
    paired with a part of the glass's longest clip, 1.9 to 2.25 (its 60-second clips' frames are small, which costs
    each pixel more): at 2.3 its parts cost what the glass's do at 60 and 30 frames a second, 0.84 of it at 762 square. */
export const VIDEO_WEIGHT: Record<VideoKind, number> = {
  glass: 1,
  blob: 1.5,
  silk: 2.4,
  rosette: 1.6,
  papercut: 2.3
};
/** What a soft adds to a pixel's cost, by the resolution its blur runs at (videoBlur), measured as VIDEO_WEIGHT is: at
    the frame's own, about what the glass costs (0.7 to 0.95); at a half or a quarter, its passes a quarter or a
    sixteenth of that, the averaging, the reading back up and the laying over the rest (0.3 to 0.4, 0.2 to 0.35). The
    grain costs the coding its specks (0.2 to 0.45). */
export const VIDEO_SOFT_WEIGHT: Record<VideoBlur["scale"], number> = { 1: 1, 2: 0.45, 4: 0.35 };
export const VIDEO_GRAIN_WEIGHT = 0.3;

/** The resolution a soft's blur of `sigma` pixels runs at (videoBlur): the frame's own for a narrow one, a half for a
    wider and a quarter past that, each within two levels of fx-finish.ts's finishPixels. */
export const videoBlurScale = (sigma: number): VideoBlur["scale"] =>
  sigma < 7 ? 1 : sigma < 16 ? 2 : 4;

/** A soft's sigma in a picture of a size, as fx-finish.ts's effectBlurSigma reads it: a share of its longer side. */
export const videoSoftSigma = (soft: number, size: Size): number =>
  effectSoftShare(soft) * Math.max(size.width, size.height);

/** A pixel's cost in a clip of a size: its effect's, and its soft's and grain's. */
export function videoWeight(effect: VideoEffect, size: Size): number {
  const soft = effect.finish?.soft
    ? VIDEO_SOFT_WEIGHT[videoBlurScale(videoSoftSigma(effect.finish.soft, size))]
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
    case "papercut":
      return PAPERCUT_LOOP;
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

/** The share past the work's limit that counts as within it: the hair before flooring may leave a side a billionth of
    a pixel past its scaled length, so a clip scaled to the limit can weigh that little more. A size within it fits
    again to itself: a scale so near 1 moves no side of VIDEO_LIMITS.side or less past the hair. */
const WORK_HAIR = 1e-12;

/** A clip within the limits: its rate up to the most, one loop longer than the longest clip played in that time, and
    its sides even (H.264's colors are a quarter of its pixels), at least 16, scaled down together where the sides, the
    pixels or the work ask. A soft's cost grows as its picture shrinks (videoBlur), so the work is weighed again at
    each smaller size until it fits, the longer side two pixels shorter where a step left the floored sides as they
    were. So a fitted size fits again to itself, which a posted link's page names its clip by (video-make.ts). */
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
  let size = sized(scale);
  /* every step makes a side shorter, so this ends: within the work, or at the least sides */
  for (
    let work = videoWork(effect, size, plan.frames);
    work > VIDEO_LIMITS.work * (1 + WORK_HAIR) && Math.max(size.width, size.height) > 16;
    work = videoWork(effect, size, plan.frames)
  ) {
    const next = scale * Math.sqrt(VIDEO_LIMITS.work / work);
    const smaller = sized(next);
    scale =
      smaller.width < size.width || smaller.height < size.height
        ? next
        : (Math.max(size.width, size.height) - 2) / Math.max(w, h);
    size = sized(scale);
  }
  return { size, fps: rate, plan };
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
  rosette: { qp: 24, keyQp: 12, ramp: 20, effort: 9 },
  papercut: { qp: 24, keyQp: 12, ramp: 20, effort: 9 }
};

/** How a clip is coded: as its effect is, but a blob with a soft, or grained with less frost than designed, as the
    glass is. The blob's coarser quantizer is for its frost, noise in every pixel; a grain, which holds still while
    the picture moves, keeps its pattern through it as well as through the glass's, but where a soft blurs the frost
    away or there is less of it, that quantizer lets the grain fade frame by frame until the loop's key frame brings it
    back, a pulse at every seam, where the glass's holds it. Through a 480 square blob's loop at speed 2, decoded, the
    share of grain 30's pattern kept (W/styles-lab/sg/mp4/grain-seam.ts): at the blob's numbers, with soft 40, 0.94 at
    the key frame and 0.45 by the loop's end (soft 15 to 25 alike; soft 10, its sigma under a pixel, leaves the frost
    as it is), with no soft at frost 0, 0.5 and 1 0.44 to 0.65, 0.69 to 0.77 and 0.78 to 0.87, at frost 2 0.91 to
    0.93; at the glass's, with soft 40, 0.84 to 0.85 throughout, as on the glass (0.85 to 0.87), at 1.6 times the bytes
    (2,185 KiB where 1,355; the plain blob 1,572), and at frost 0 0.84 to 0.86. A frosted blob's grain at the glass's
    numbers would be 0.95 for 1.65 times the bytes. The glass's key frame also makes the seam's step in the decoded
    picture 1.8 levels where the blob's made it 2.6 (an ordinary step 0.8 to 0.9). A plain blob is coded as it was. */
export const videoQuality = (effect: {
  kind: VideoKind;
  look: Pick<EffectLook, "frost">;
  finish?: { soft?: unknown; grain?: unknown };
}): VideoQuality =>
  effect.kind === "blob" && (effect.finish?.soft || (effect.finish?.grain && effect.look.frost < 1))
    ? VIDEO_QUALITY.glass
    : VIDEO_QUALITY[effect.kind];

/** The clips' module by its contents: the first 12 hex digits of video/video.wasm's SHA-256, which a test checks. An
    encoder's state holds pointers into the memory of the module that kept it, which another module lays out elsewhere
    (going on from one traps), so a drawing goes on only from a state the same module kept (video-make.ts). */
export const VIDEO_MODULE = "45d27eeeedb3";

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
  papercut_setup: (
    n: number,
    nb: number,
    D: number,
    rx: number,
    ry: number,
    wa: number,
    wf: number,
    wa2: number,
    wf2: number,
    icsigma: number,
    calpha: number,
    wall: number
  ) => number;
  papercut_frame: () => void;
}

/** A drawer of one clip's frames in a fresh instance of the module: `draw(i)` draws frame i into the encoder's planes
    and `code(i)` codes them, frame 0 the key frame. `state()` is the encoder's state after the frames coded, which
    `resume` takes in, in a drawer of the same clip, to go on from there. With `keepRgb`, a drawing also leaves its RGB
    for `rgb()` to read, which a test compares with the engine's own frames. */
export function videoDrawer(
  wasm: WebAssembly.Module,
  ask: VideoAsk,
  plan: VideoPlan,
  quality = videoQuality(ask),
  keepRgb = false
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
          : ask.kind === "rosette"
            ? rosetteDraw(m, params, ask, plan)
            : papercutDraw(m, params, ask, plan);
  finishSetup(m, params, ask);
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

/* The clip's finish, which the module lays on each frame as fx-finish.ts's finishPixels does: the grain's tile at its
   strength, a speck a pixel; and for a soft, the blur and what lies under the blurred frame, the palette's gradient,
   or, under a blob with no ground, the clip's backdrop, which a clip, never clear, lays every blob on (blobDraw). A
   blob with a soft is drawn as its layer alone, over its own ground where it has one, as the site lays it over that
   gradient. */
function finishSetup(m: VideoModule, params: () => Float64Array, ask: VideoAsk): void {
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
  const { blur, under } = finish.soft;
  if (ask.kind === "blob") {
    const ground = ask.look.bg ? groundParts(ask.look.bg) : null;
    const [r, g, b] = ground ? hexBytes(ground.hex) : [0, 0, 0];
    m.blob_ground(r, g, b, ground?.alpha ?? 0);
  }
  const reach = [0, 1, 2].flatMap(i => blur.boxes[i] ?? [0, 0]);
  const setup = (gradient: number, r: number, g: number, b: number) =>
    m.finish_setup(
      blur.scale,
      blur.boxes.length,
      reach[0],
      reach[1],
      reach[2],
      reach[3],
      reach[4],
      reach[5],
      gradient,
      r,
      g,
      b
    );
  let done: number;
  if (under) {
    /* the gradient's stops and its line, as linearGradientPixels reads them */
    const n = under.stops.length;
    const a = (under.angle * Math.PI) / 180;
    const p = params();
    p.set([n, Math.sin(a), -Math.cos(a)]);
    for (const [i, stop] of under.stops.entries())
      p.set([...hexBytes(stop.hex), under.at ? under.at[i] : n > 1 ? i / (n - 1) : 0], 3 + 4 * i);
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

function papercutDraw(
  m: VideoModule,
  params: () => Float64Array,
  ask: VideoAsk,
  plan: VideoPlan
): (i: number) => void {
  const scene = papercutScene(ask.palette, { angle: ask.angle, shape: ask.look.shape }, ask.size);
  params().set([
    ...scene.levels,
    ...scene.face,
    ...scene.wallRgb,
    ...scene.shadowRgb,
    ...scene.isigma,
    ...scene.offset,
    ...scene.alpha,
    ...scene.reach
  ]);
  const { n, bumps, D, rx, ry, wa, wf, wa2, wf2, icsigma, calpha, wall } = scene;
  if (!m.papercut_setup(n, bumps.length, D, rx, ry, wa, wf, wa2, wf2, icsigma, calpha, wall))
    throw new Error("video: out of memory");
  /* the frame's hills, waves and light, as the CPU drawing takes them */
  const at = new Float64Array(papercutFrameSize(scene));
  return i => {
    papercutFrameAt(scene, plan.loops ? (i * plan.loops * PAPERCUT_LOOP) / plan.frames : 0, at);
    params().set(at);
    m.papercut_frame();
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
  quality = videoQuality(ask)
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
