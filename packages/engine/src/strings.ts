/* Strings: the palette as threads in ribbons, stirred (the design of 5 Nov 2026, from John's pictures of white strings
   flowing on black and his video of them: "it doesnt move right" of the first, whose threads slid along traveling
   waves, slowly). The threads are the whole levels of one smooth field, F = N x / sqrt(1 + x^2) of x = g / sat, where g
   is ten waves read at a point the plane's own stirring has moved (four shears, each sliding the plane along a wave):
   the saturation packs F's 2N - 1 levels close where g crosses 0, so the threads run in ribbons along g's zero curves,
   each ribbon the palette across it from its first color to its last, and leaves dark voids between them where g is
   far from 0. The ribbons fold into hairpins and eyes where g's zero curves bend and close.
   - Evenly spaced: where threads crowd closer than `gap` widths, every other one ends, by its rank (its level's trailing
     zeros), each at a spacing of its own (`jitter`), so a ribbon that tightens sheds threads as a comb, and never fills.
   - The blob: an ellipse, lumped by three slow waves and moved by most of the stirring (`share`), so its edge is ragged
     and flows; each thread ends where it crosses it, at a place of its own (`stagger`), so the ends comb.
   - Colors: a thread's level across its ribbon picks its color, (k + N) / 2N of the palette, lifted where it would sink
     into the ground, which is the palette's darkest color, deeper still, or the color the look's `bg` names (any, its
     alpha too: a translucent or clear one lets the page through): each stop stands off the ground's lightness by the
     lift at least, raised above it or, where no room is left above (a light ground), lowered under it, so the threads
     read on a light ground as on a dark one. A clear ground's stops stand off the designed ground, as the page under
     them is unknown.
   - The angle turns the whole stirring, every wave's direction turned by it (90 as designed).
   Motion: it morphs in place. Every wave's and shear's phase swings about its rest, sin(2 pi m t / loop + psi) times a
   swing that a wide wave takes little of, m one or two cycles a loop, so the large shapes hold while the middle ones
   churn, and the loop (60 s) ends on its first frame.
   Every format draws these numbers: the CPU (strings-render.ts) and the player (strings-gl.ts) shade each pixel from
   the field's value and slope there (a thread's distance is the field's step over its slope), the stills and any
   frame's SVG (strings-svg.ts) trace the same levels and cut them at the same ends, and the clips' module (video.c)
   draws them in C. The saturation is a square root alone, which every format rounds alike.

   Units: q is the box in D units, centered, y down. D is the box's longer side times STRINGS_SPAN, so every box shows
   the one design its longer side frames, centered: a still is one square laid over any box as CSS's cover lays it. */
import { hexBytes, lchToSrgb, srgbToLch, toHex } from "./color.ts";
import { sampleSrgb } from "./curve.ts";
import type { Palette } from "./palette.ts";
import { STRINGS_GROUND, stringsBytes, stringsDesignedGround } from "./strings-ground.ts";
import type { Size } from "./view.ts";

export interface StringsView {
  angle: number;
  /** 0 or none: as designed */
  shape: number | null;
  /** the ground (effect.ts EffectLook's `bg`): #rrggbb, or #rrggbbaa where it lets the page through; none as designed */
  bg: string | null;
}

/** Seconds a loop at speed 1: every swing makes whole cycles in it. */
export const STRINGS_LOOP = 60;
/** D over the box's longer side, as the papercut's. */
export const STRINGS_SPAN = 0.75;
/** The stirring's shears, the field's waves and the blob's lumps: how many of each (the shaders' arrays). */
export const STRINGS_SHEARS = 4;
export const STRINGS_WAVES = 10;
export const STRINGS_LUMPS = 3;
/** The palette's stops the threads' colors are read from. */
export const STRINGS_STOPS = 16;
/** The rank a thread at level 0 has, which no crowding ends. */
export const STRINGS_TOP_RANK = 30;

/** The look's dials, lengths in D units. */
export interface StringsLook {
  /** N: the field runs between -N and N, so a ribbon holds 2N - 1 threads */
  threads: number;
  /** how close to g's zero curves the threads pack: g's value at which F reaches N / sqrt 2 */
  sat: number;
  /** a thread's width */
  width: number;
  /** the least spacing, in widths, past which every other thread ends */
  gap: number;
  /** how far each thread's own least spacing strays, a share either way */
  jitter: number;
  /** how far each thread's end strays from the blob's edge, in the blob's field */
  stagger: number;
  /** the share of the stirring that moves the blob */
  share: number;
  /** the blob's half width and half height */
  rx: number;
  ry: number;
  /** the blob's lumps' height */
  lumps: number;
  /** the least lightness a thread stands above the ground by (OKLab L) */
  lift: number;
  /** the ground: the palette's darkest color, its lightness times `depth` up to `dark`, its chroma times `chroma` */
  dark: number;
  depth: number;
  chroma: number;
}

export const STRINGS_LOOK: StringsLook = {
  threads: 18,
  sat: 0.08,
  width: 0.003,
  gap: 2.6,
  jitter: 0.3,
  stagger: 0.25,
  share: 0.65,
  rx: 0.5,
  ry: 0.48,
  lumps: 0.18,
  lift: 0.42,
  ...STRINGS_GROUND
};

/** A wave along (dx, dy), k radians a D unit: a shear's reach, a wave's height or a lump's (a); its phase at rest (ph),
    the radians it swings about it (swing), the swing's whole cycles a loop (cycles) and its phase at t = 0 (psi). */
export interface StringsWave {
  dx: number;
  dy: number;
  k: number;
  a: number;
  ph: number;
  swing: number;
  cycles: number;
  psi: number;
}

export interface StringsDesign {
  shears: readonly StringsWave[];
  waves: readonly StringsWave[];
  lumps: readonly StringsWave[];
}

/** mulberry32 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;
const round = (v: number, step: number) => Math.round(v / step) * step;
/** The golden angle: each wave's direction this far on from the last, jittered, so no two run near parallel and beat
    into stripes. */
const GOLDEN = 2.39996;

/** A seeded design: four shears of reach a k 0.78 to 1.56 at 3 to 7 radians a D unit; ten waves of slope A k 0.5 to 1
    at 5.5 to 13.5; three lumps at 3.5 to 6.5. Each swings 1.6 radians times 0.6 to 1.4, times (k / 7)^1.5 below
    wavenumber 7, one or two cycles a loop. Each number to a millionth, so every format writes the same design. */
function seeded(seed: number): StringsDesign {
  const r = rng(Math.imul(seed, 2654435761));
  let turn = r() * TAU;
  const wave = (k0: number, kSpan: number, slope: (k: number) => number): StringsWave => {
    turn += GOLDEN + (r() - 0.5) * 0.6;
    const k = k0 + r() * kSpan;
    const a = slope(k);
    const ph = r() * TAU;
    const swing = 1.6 * (0.6 + 0.8 * r()) * Math.min(1, (k / 7) ** 1.5);
    const cycles = 1 + Math.floor(r() * 2);
    const psi = r() * TAU;
    return {
      dx: round(Math.cos(turn), 1e-6),
      dy: round(Math.sin(turn), 1e-6),
      k: round(k, 1e-6),
      a: round(a, 1e-6),
      ph: round(ph, 1e-6),
      swing: round(swing, 1e-6),
      cycles,
      psi: round(psi, 1e-6)
    };
  };
  const shears = Array.from({ length: STRINGS_SHEARS }, () =>
    wave(3, 4, k => ((0.6 + r() * 0.6) * 1.3) / k)
  );
  const waves = Array.from({ length: STRINGS_WAVES }, () =>
    wave(5.5, 8, k => (0.5 + r() * 0.5) / k)
  );
  const lumps = Array.from({ length: STRINGS_LUMPS }, () => wave(3.5, 3, () => 1));
  return { shears, waves, lumps };
}

/** The seed the designed look (shape 0 or none) is drawn from: past every shape an address names, picked from seeds
    1000 to 1011 for a compact, ragged mass of ribbons with an eye and hairpins, as John's video has them. */
export const STRINGS_DESIGNED_SEED = 1001;

/** The design a shape draws. */
export const stringsDesign = (shape: number | null): StringsDesign =>
  seeded(shape || STRINGS_DESIGNED_SEED);

/** A design turned by an angle (90 as designed): every direction turned clockwise on the screen by angle - 90 degrees,
    which turns the whole picture by as much. */
export function stringsTurned(design: StringsDesign, angle: number): StringsDesign {
  const rad = ((angle - 90) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const turned = (v: StringsWave): StringsWave => ({
    ...v,
    dx: c * v.dx - s * v.dy,
    dy: s * v.dx + c * v.dy
  });
  return {
    shears: design.shears.map(turned),
    waves: design.waves.map(turned),
    lumps: design.lumps.map(turned)
  };
}

export interface StringsScene {
  width: number;
  height: number;
  D: number;
  /** the view's name where the scene has the designed look, which its traced stills are kept by */
  view: string | null;
  design: StringsDesign;
  /** N, and g at which the field saturates */
  n: number;
  sat: number;
  /** a thread's width and half width, and the least spacing, px */
  lw: number;
  hw: number;
  need: number;
  jitter: number;
  stagger: number;
  share: number;
  bx: number;
  by: number;
  lumps: number;
  /** the ground and the stops, 0..1 channels of bytes, and the ground as hex */
  ground: number[];
  groundHex: string;
  /** the ground's alpha: 1 as designed and for a whole color, under 1 where it lets the page through, 0 clear */
  alpha: number;
  /** the designed ground, 0..1 channels of bytes: what a picture that cannot be clear lays a ground that lets the page
      through over (stringsSolid) */
  backdrop: number[];
  stops: number[];
}

/** Numbers a frame takes: each shear's, wave's and lump's phase. */
export const STRINGS_FRAME_SIZE = STRINGS_SHEARS + STRINGS_WAVES + STRINGS_LUMPS;

/** The frame at t (seconds of the loop at speed 1): every shear's, wave's and lump's phase, its rest plus its swing
    then, in one turn, into `at`. What a frame computes on the CPU, and what the player sends as uniforms. */
export function stringsFrameAt(m: StringsScene, time: number, at: Float64Array | Float32Array) {
  const t = time - STRINGS_LOOP * Math.floor(time / STRINGS_LOOP);
  let i = 0;
  for (const set of [m.design.shears, m.design.waves, m.design.lumps])
    for (const v of set) {
      const p = v.ph + v.swing * Math.sin((TAU * v.cycles * t) / STRINGS_LOOP + v.psi);
      at[i++] = p - TAU * Math.floor(p / TAU);
    }
}

/** The stirred point at q (D units) and its Jacobian over q, into out: [px, py, j00, j01, j10, j11]. Each shear slides
    the plane across its own direction by a sin(k d.p + phase), which keeps every area. */
export function stringsWarp(
  m: StringsScene,
  at: Float64Array | Float32Array,
  qx: number,
  qy: number,
  out: Float64Array
) {
  let px = qx;
  let py = qy;
  let j00 = 1;
  let j01 = 0;
  let j10 = 0;
  let j11 = 1;
  const S = m.design.shears;
  for (let i = 0; i < S.length; i++) {
    const v = S[i];
    const s = v.k * (v.dx * px + v.dy * py) + at[i];
    const sn = Math.sin(s);
    const c = v.a * v.k * Math.cos(s);
    /* across: n = (-dy, dx) */
    px -= v.a * v.dy * sn;
    py += v.a * v.dx * sn;
    const r0 = v.dx * j00 + v.dy * j10;
    const r1 = v.dx * j01 + v.dy * j11;
    j00 -= c * v.dy * r0;
    j01 -= c * v.dy * r1;
    j10 += c * v.dx * r0;
    j11 += c * v.dx * r1;
  }
  out[0] = px;
  out[1] = py;
  out[2] = j00;
  out[3] = j01;
  out[4] = j10;
  out[5] = j11;
}

/** The field at a stirred point (stringsWarp's `o`), in threads, and its slope over q, threads a D unit, into g: [F,
    Gx, Gy, 1 / F's slope over g's]. g is the waves there; F = N x / sqrt(1 + x^2) of x = g / sat, its slope
    N / (sat (1 + x^2)^1.5) times g's. */
export function stringsField(
  m: StringsScene,
  at: Float64Array | Float32Array,
  o: Float64Array,
  g: Float64Array
) {
  let f = 0;
  let gx = 0;
  let gy = 0;
  const V = m.design.waves;
  const base = m.design.shears.length;
  for (let i = 0; i < V.length; i++) {
    const v = V[i];
    const s = v.k * (v.dx * o[0] + v.dy * o[1]) + at[base + i];
    f += v.a * Math.sin(s);
    const c = v.a * v.k * Math.cos(s);
    gx += c * v.dx;
    gy += c * v.dy;
  }
  const x = f / m.sat;
  const root = Math.sqrt(1 + x * x);
  const slope = m.n / (m.sat * root * root * root);
  g[0] = (m.n * x) / root;
  g[1] = slope * (gx * o[2] + gy * o[4]);
  g[2] = slope * (gx * o[3] + gy * o[5]);
  g[3] = (m.sat * root * root * root) / m.n;
}

/** The slope level k has where the waves climb `climb` a px, threads a px: the waves' slope times the saturation's at the
    level, N / sat (1 - (k / N)^2)^1.5. What a thread's crowding is tested by, the same across the thread's width (the
    saturation's slope changes fast across a ribbon, the waves' slowly), so a thread ends square across, as the SVG's
    tracer ends it on its middle. */
export function stringsLevelSlope(m: StringsScene, k: number, climb: number): number {
  const u = k / m.n;
  const w = Math.max(0, 1 - u * u);
  return ((climb * m.n) / m.sat) * w * Math.sqrt(w);
}

/** The blob's field at q, its stirred point o: 1 at its middle, 0 at its edge, and its slope over q a D unit, into
    b: [B, Bx, By]. */
export function stringsBlob(
  m: StringsScene,
  at: Float64Array | Float32Array,
  qx: number,
  qy: number,
  o: Float64Array,
  b: Float64Array
) {
  const s = m.share;
  const ux = qx + s * (o[0] - qx);
  const uy = qy + s * (o[1] - qy);
  const ex = ux / m.bx;
  const ey = uy / m.by;
  let v = 1 - ex * ex - ey * ey;
  let gx = (-2 * ex) / m.bx;
  let gy = (-2 * ey) / m.by;
  const L = m.design.lumps;
  const base = m.design.shears.length + m.design.waves.length;
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    const a = l.k * (l.dx * ux + l.dy * uy) + at[base + i];
    v += m.lumps * Math.sin(a);
    const c = m.lumps * l.k * Math.cos(a);
    gx += c * l.dx;
    gy += c * l.dy;
  }
  b[0] = v;
  b[1] = gx * (1 - s + s * o[2]) + gy * s * o[4];
  b[2] = gx * s * o[3] + gy * (1 - s + s * o[5]);
}

/** A thread's hash, 0..1: an integer hash of its level, the same in every format's integers. */
export const stringsHash = (k: number): number =>
  ((Math.imul((k + 4096) >>> 0, 2654435761) >>> 16) & 1023) / 1023;
/** A thread's rank: its level's trailing zeros, STRINGS_TOP_RANK for level 0. */
export const stringsRank = (k: number): number =>
  k === 0 ? STRINGS_TOP_RANK : Math.min(STRINGS_TOP_RANK, 31 - Math.clz32(k & -k));
/** The least spacing thread k keeps, px: below it, it ends. */
export const stringsNeed = (m: StringsScene, k: number): number =>
  m.need * (1 + m.jitter * (stringsHash(7 * k + 3) - 0.5));
/** Where on the blob's field thread k ends. */
export const stringsEnd = (m: StringsScene, k: number): number =>
  m.stagger * (stringsHash(k) - 0.5);
/** Whether level k is a thread: the field runs strictly between -N and N, so its levels are -(N - 1) to N - 1. */
export const stringsIsThread = (m: StringsScene, k: number): boolean => k > -m.n && k < m.n;

/** A thread's color: its level's place across its ribbon, (k + N) / 2N of the palette's stops, into out[0..2], 0..1. */
export function stringsColor(m: StringsScene, k: number, out: Float64Array | number[]) {
  const u = Math.min(1, Math.max(0, (k + m.n) / (2 * m.n))) * (STRINGS_STOPS - 1);
  const i = Math.min(STRINGS_STOPS - 2, Math.floor(u));
  const f = u - i;
  const s = m.stops;
  out[0] = s[3 * i] + (s[3 * i + 3] - s[3 * i]) * f;
  out[1] = s[3 * i + 1] + (s[3 * i + 4] - s[3 * i + 1]) * f;
  out[2] = s[3 * i + 2] + (s[3 * i + 5] - s[3 * i + 2]) * f;
}
/** A thread's color as its SVG strokes it. */
export function stringsHex(m: StringsScene, k: number): string {
  const c = [0, 0, 0];
  stringsColor(m, k, c);
  return toHex(c);
}

/** What a pixel's shading works in: the stirred point and its Jacobian, the field and its slope, the blob and its slope,
    and a thread's color. */
export interface StringsScratch {
  o: Float64Array;
  g: Float64Array;
  b: Float64Array;
  c: Float64Array;
}
export const stringsScratch = (): StringsScratch => ({
  o: new Float64Array(6),
  g: new Float64Array(4),
  b: new Float64Array(3),
  c: new Float64Array(3)
});

/** The share of a pixel's width a thread a width 2 hw wide covers, its middle d px from the pixel's: a box filter of a
    straight thread, so one under a pixel wide covers no more than its width. */
const boxCover = (d: number, hw: number) => Math.min(d + hw, 0.5) - Math.max(d - hw, -0.5);

/** The step between the levels that may show where the field climbs `gpx` threads a pixel: the least power of two its
    crowding leaves, every level a step apart below it ending where it crowds (2^rank < need gpx) whatever its jitter.
    A doubling count, which single and double precision count alike. */
export function stringsStep(m: StringsScene, gpx: number): number {
  const least = m.need * (1 - m.jitter / 2) * gpx;
  let step = 1;
  for (let i = 0; i < STRINGS_TOP_RANK && step < least; i++) step *= 2;
  return step;
}

/** The pixel at q, into out[0..3], 0..1, premultiplied, its alpha last: the ground at its alpha under the two threads
    that show nearest it, one either side, the farther first, each over by how much of the pixel it covers (its distance
    the field's step over its slope), and none past its end on the blob's edge, whose field is read only where a thread
    reaches the pixel. The threads that show: levels a step apart (stringsStep), each either side the nearest that its
    crowding leaves, or else the one past it, which a step twice as long leaves (the jitter is under a doubling); a
    level past -(N - 1) or N - 1 is none. Where nothing crowds, the two nearest levels. A whole ground's channels times
    its alpha of 1 are its own and its alpha stays 1, so an opaque pixel is what it was before the ground took an alpha,
    to the bit. What every format's pixels do, branch for branch. */
export function stringsShade(
  m: StringsScene,
  at: Float64Array | Float32Array,
  qx: number,
  qy: number,
  s: StringsScratch,
  out: Float64Array
) {
  const { o, g, b, c } = s;
  stringsWarp(m, at, qx, qy, o);
  stringsField(m, at, o, g);
  const gpx = Math.max(1e-9, Math.sqrt(g[1] * g[1] + g[2] * g[2]) / m.D);
  const climb = gpx * g[3];
  const step = stringsStep(m, gpx);
  let lo = step * Math.floor(g[0] / step);
  let hi = lo + step;
  if (2 ** stringsRank(lo) < stringsNeed(m, lo) * stringsLevelSlope(m, lo, climb)) lo -= step;
  if (2 ** stringsRank(hi) < stringsNeed(m, hi) * stringsLevelSlope(m, hi, climb)) hi += step;
  /* each thread's distance, the field's step over the mean of the pixel's slope and the level's: exact where the slope
     changes evenly between them, as it does across a ribbon, where the pixel's alone would thicken a thread's one side */
  const dlo = (g[0] - lo) / (0.5 * (gpx + stringsLevelSlope(m, lo, climb)));
  const dhi = (hi - g[0]) / (0.5 * (gpx + stringsLevelSlope(m, hi, climb)));
  /* the nearer last, over the farther */
  const near = dlo < dhi;
  const k = near ? lo : hi;
  const k2 = near ? hi : lo;
  let c1 = stringsIsThread(m, k) ? boxCover(near ? dlo : dhi, m.hw) : 0;
  let c2 = stringsIsThread(m, k2) ? boxCover(near ? dhi : dlo, m.hw) : 0;
  const a = m.alpha;
  out[0] = m.ground[0] * a;
  out[1] = m.ground[1] * a;
  out[2] = m.ground[2] * a;
  out[3] = a;
  if (c1 <= 0 && c2 <= 0) return;
  stringsBlob(m, at, qx, qy, o, b);
  const bpx = Math.max(1e-9, Math.sqrt(b[1] * b[1] + b[2] * b[2]) / m.D);
  if (c2 > 0) {
    c2 *= Math.min(1, Math.max(0, (b[0] - stringsEnd(m, k2)) / bpx + 0.5));
    stringsColor(m, k2, c);
    out[0] += (c[0] - out[0]) * c2;
    out[1] += (c[1] - out[1]) * c2;
    out[2] += (c[2] - out[2]) * c2;
    out[3] += (1 - out[3]) * c2;
  }
  if (c1 > 0) {
    c1 *= Math.min(1, Math.max(0, (b[0] - stringsEnd(m, k)) / bpx + 0.5));
    stringsColor(m, k, c);
    out[0] += (c[0] - out[0]) * c1;
    out[1] += (c[1] - out[1]) * c1;
    out[2] += (c[2] - out[2]) * c1;
    out[3] += (1 - out[3]) * c1;
  }
}

const bytes = stringsBytes;

/** The scene a palette and a view draw in a box of `width` by `height` px. */
export function stringsModel(
  P: Palette,
  view: StringsView,
  width: number,
  height: number,
  look: StringsLook = STRINGS_LOOK
): StringsScene {
  const D = STRINGS_SPAN * Math.max(width, height);
  /* the ground: the palette's darkest color, deeper and greyer, or the one the view names, at its alpha */
  const designed = stringsDesignedGround(P, look);
  const ground = view.bg ? hexBytes(view.bg).map(v => v / 255) : designed;
  const alpha = view.bg?.length === 9 ? parseInt(view.bg.slice(7), 16) / 255 : 1;
  /* the stops, each lifted to stand off the ground where it would sink into it: raised the lift above it, or lowered
     as far under it where the room above is less (a light ground), whichever lies nearer where both have room; off
     the designed ground where the ground is clear, which leaves the page under it unknown */
  const Lg = srgbToLch(alpha > 0 ? ground : designed)[0];
  const up = Lg + look.lift;
  const down = Lg - look.lift;
  const stops = Array.from({ length: STRINGS_STOPS }, (_, i) => {
    const c = sampleSrgb(P, i / (STRINGS_STOPS - 1));
    const [L, C, H] = srgbToLch(c);
    if (L >= up || L <= down) return bytes(c);
    return bytes(lchToSrgb(up <= 1 && (L >= Lg || down < 0) ? up : down, C, H));
  }).flat();
  const lw = round(look.width * D, 0.001);
  return {
    width,
    height,
    D,
    view: look === STRINGS_LOOK ? `${view.angle}|${view.shape || 0}` : null,
    design: stringsTurned(stringsDesign(view.shape), view.angle),
    n: look.threads,
    sat: look.sat,
    lw,
    hw: lw / 2,
    need: round(look.gap * lw, 0.001),
    jitter: look.jitter,
    stagger: look.stagger,
    share: look.share,
    bx: look.rx,
    by: look.ry,
    lumps: look.lumps,
    ground,
    groundHex: toHex(ground),
    alpha,
    backdrop: designed,
    stops
  };
}

/** The scene as a picture that cannot be clear draws it (a clip, a share card): a ground that lets the page through laid
    over the designed ground at its alpha, in whole bytes, as the blob's clips lay its ground over theirs (video.ts
    blobDraw), the stops as they were lifted. A whole ground's scene is itself. */
export function stringsSolid(m: StringsScene): StringsScene {
  if (m.alpha >= 1) return m;
  const ground = m.ground.map(
    (v, i) =>
      Math.round(Math.round(v * 255) * m.alpha + Math.round(m.backdrop[i] * 255) * (1 - m.alpha)) /
      255
  );
  return { ...m, ground, groundHex: toHex(ground), alpha: 1 };
}

/** The scene a palette and a view draw in a box. */
export const stringsScene = (P: Palette, view: StringsView, size: Size): StringsScene =>
  stringsModel(P, view, size.width, size.height);
