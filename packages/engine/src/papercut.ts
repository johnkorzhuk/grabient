/* Papercut: the palette as a mesh gradient cut into paper (the design John chose on 1 and 2 Nov 2026, from
   styles-lab/sketches/mesh-papercut). A smooth height field (a ramp along the view's angle, a few soft hills and
   hollows, and two slow waves bending the whole) is cut at the palette's steps into sheets of paper, one exact palette
   color each, stacked: every sheet casts a soft drop shadow on the sheets below it, away from the light, and a tight
   contact shadow in the crease under its cut, and shows a thin lit edge where its cut faces the light. The shadows and
   edges come from the field itself (a pixel's distance to a cut is the field's height over its slope, to second order),
   so one pass draws a frame: the CPU drawing (papercut-render.ts) and the player's shaders (papercut-gl.ts) do the same
   arithmetic, branch for branch, and the stills (papercut-svg.ts) draw the same cuts as vector paths.

   The angle lays the palette out as a linear gradient's line does, its first color at the angle's tail and its last
   at its head, and turns the light, which comes from the angle's head leaning toward the box's top. The shape picks the
   relief: 0 or none the designed one (a peak toward the head, a basin toward the tail, a small island and a dip), any
   other number a seeded layout of four or five hills and hollows and the waves' phases.

   Motion: the hills drift and breathe, the waves roll, and the light swings 30 degrees each way once a loop, so islands
   surface and sink and the shadows wheel slowly round; every motion makes whole cycles in the loop, which so ends on its
   first frame.

   Units: q is the box in D units, centered, y down. D is the box's longer side times PAPERCUT_SPAN, and the relief is
   laid out in a 16:9 box of that longer side, so a wide picture is the relief as designed and every box shows the one
   relief its longer side frames, centered: a still is one square laid over any box as CSS's cover lays it, which the
   server can paint before it knows the box, and the player, laying out the box itself, starts on that frame. */
import { lchToSrgb, srgbToLch, toHex } from "./color.ts";
import { sampleSrgb } from "./curve.ts";
import type { Palette } from "./palette.ts";
import type { Size } from "./view.ts";

export interface PapercutView {
  angle: number;
  /** 0 or none: as designed */
  shape: number | null;
}

/** Seconds a loop at speed 1: every motion finishes whole cycles in it, and at three minutes nothing reads as a
    repeat. */
export const PAPERCUT_LOOP = 180;
/** Hills and hollows at most (the shader's arrays). */
export const PAPERCUT_MAX_BUMPS = 6;
/** Sheets at most (the shader's arrays). */
export const PAPERCUT_MAX_SHEETS = 24;
/** D over the box's longer side: a 16:9 box's square root of its area over its width, so a wide box is drawn as the
    sketch drew 1920 by 1080. */
export const PAPERCUT_SPAN = 0.75;
/** The design's box in D units: a 16:9 box's half width and half height. */
const FRAME_HW = 0.5 / PAPERCUT_SPAN;
const FRAME_HH = 0.28125 / PAPERCUT_SPAN;

/** The look's dials, lengths in D units. */
export interface PapercutLook {
  /** sheets of paper, each one of the palette's colors at even steps along its curve */
  sheets: number;
  /** the ramp's share of the field against the hills' (1: the ramp climbs -1..1 over the design's box) */
  slope: number;
  /** the ramp's shortest half length: across a short side it climbs no faster, so the hills keep their say */
  rampMin: number;
  /** the two waves that bend the field: reach and frequency (radians per D unit) */
  warp: number;
  warpFreq: number;
  warp2: number;
  warpFreq2: number;
  /** the drop shadow: Gaussian sigma, its offset away from the light, its opacity */
  shadowBlur: number;
  shadowOffset: number;
  shadowAlpha: number;
  /** the contact shadow in the crease under each cut: sigma and opacity, no offset */
  contactBlur: number;
  contactAlpha: number;
  /** the shadow's color: the paper it falls on, its OKLab lightness times depth, its chroma times chroma */
  shadowDepth: number;
  shadowChroma: number;
  /** degrees a yellow's shadow turns toward orange (at OKLCH hue YELLOW, less to nothing 45 degrees either side) */
  ochre: number;
  /** the lit cut: its width, and its color the sheet's own this much lighter (OKLab L) */
  wall: number;
  wallLift: number;
  /** the light comes from the stack's high side (the angle's head), turned this many degrees toward the box's top */
  lean: number;
  /** the light swings this many degrees each way about there, once a loop */
  swing: number;
  /** every `index`-th sheet is thicker card (0: none), its shadow scaled so */
  index: number;
  indexScale: number;
}

export const PAPERCUT_LOOK: PapercutLook = {
  sheets: 12,
  slope: 0.75,
  rampMin: 0.55,
  warp: 0.045,
  warpFreq: 5.5,
  warp2: 0.018,
  warpFreq2: 11,
  shadowBlur: 0.011,
  shadowOffset: 0.007,
  shadowAlpha: 0.38,
  contactBlur: 0.0018,
  contactAlpha: 0.32,
  shadowDepth: 0.55,
  shadowChroma: 1.15,
  ochre: 28,
  wall: 0.0008,
  wallLift: 0.05,
  lean: 40,
  swing: 30,
  index: 4,
  indexScale: 2
};

/** A hill (a > 0) or hollow (a < 0): the bell (1 - s^2)^3 over a circle of radius r (D units), s the distance over r.
    Its middle sits at (x, y) in the design's box's own -1..1 units and drifts (ax, ay) of them on cosines of kx, ky
    whole cycles a loop; its height breathes by b of itself on kb cycles. */
export interface PapercutBump {
  x: number;
  y: number;
  r: number;
  a: number;
  ax: number;
  ay: number;
  kx: number;
  ky: number;
  px: number;
  py: number;
  b: number;
  kb: number;
  pb: number;
}

/** The designed relief (shape 0): a peak toward the head, a basin toward the tail, a small island and a dip. */
const DESIGNED: PapercutBump[] = [
  {
    x: 0.42,
    y: -0.18,
    r: 0.38,
    a: 0.7,
    ax: 0.1,
    ay: 0.1,
    kx: 1,
    ky: 2,
    px: 0.4,
    py: 1.3,
    b: 0.2,
    kb: 2,
    pb: 0.3
  },
  {
    x: -0.48,
    y: 0.28,
    r: 0.4,
    a: -0.65,
    ax: 0.1,
    ay: 0.1,
    kx: 2,
    ky: 1,
    px: 2.2,
    py: 0.5,
    b: 0.2,
    kb: 3,
    pb: 1.7
  },
  {
    x: -0.12,
    y: -0.64,
    r: 0.2,
    a: 0.42,
    ax: 0.12,
    ay: 0.1,
    kx: 1,
    ky: 3,
    px: 4.1,
    py: 2.4,
    b: 0.3,
    kb: 1,
    pb: 3.0
  },
  {
    x: 0.3,
    y: 0.72,
    r: 0.22,
    a: -0.28,
    ax: 0.1,
    ay: 0.08,
    kx: 3,
    ky: 1,
    px: 1.1,
    py: 5.2,
    b: 0.25,
    kb: 2,
    pb: 5.1
  }
];
const DESIGNED_PHASE = [0.7, 2.3, 4.1, 1.2];

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

/** A seeded relief: hills and hollows on a jittered ring and one near the middle, heights alternating in sign so the
    sheets keep their shares, and the waves' phases. */
function seeded(shape: number): { bumps: PapercutBump[]; phase: number[] } {
  const r = rng(Math.imul(shape, 2654435761));
  const count = 4 + Math.floor(r() * 2);
  const turn = r() * Math.PI * 2;
  const bumps: PapercutBump[] = [];
  for (let i = 0; i < count; i++) {
    const mid = i === count - 1;
    const th = turn + (i / (count - 1)) * Math.PI * 2 + (r() - 0.5) * 0.9;
    const rad = mid ? r() * 0.25 : 0.4 + r() * 0.3;
    bumps.push({
      x: mid ? (r() - 0.5) * 0.4 : Math.cos(th) * rad,
      y: mid ? (r() - 0.5) * 0.4 : Math.sin(th) * rad,
      r: mid ? 0.3 + r() * 0.15 : 0.18 + r() * 0.16,
      a: (i % 2 === 0 ? 1 : -1) * (mid ? 0.15 + r() * 0.15 : 0.3 + r() * 0.3),
      ax: 0.06 + r() * 0.08,
      ay: 0.06 + r() * 0.08,
      kx: 1 + Math.floor(r() * 3),
      ky: 1 + Math.floor(r() * 3),
      px: r() * 6.2832,
      py: r() * 6.2832,
      b: 0.15 + r() * 0.15,
      kb: 1 + Math.floor(r() * 3),
      pb: r() * 6.2832
    });
  }
  return { bumps, phase: [r() * 6.2832, r() * 6.2832, r() * 6.2832, r() * 6.2832] };
}

export interface PapercutScene {
  width: number;
  height: number;
  D: number;
  /** the ramp: its direction on screen (toward the palette's last color), over its half length */
  rx: number;
  ry: number;
  bumps: PapercutBump[];
  wa: number;
  wf: number;
  wa2: number;
  wf2: number;
  /** the waves' phases at t = 0, and their whole cycles a loop (signed) */
  phase: number[];
  cycles: number[];
  /** toward the light at t = 0, on screen, unit; and its swing, radians each way */
  lx: number;
  ly: number;
  swing: number;
  /** sheets in all; levels[k - 1] is where sheet k (1..n-1) begins, ascending */
  n: number;
  levels: number[];
  hex: string[];
  wallHex: string[];
  shadowHex: string[];
  /** 0..1 channels, three a sheet */
  face: number[];
  wallRgb: number[];
  shadowRgb: number[];
  /** each sheet's drop shadow in px: sigma, offset, opacity; and its contact shadow's sigma and opacity */
  sigma: number[];
  offset: number[];
  alpha: number[];
  csigma: number;
  calpha: number;
  /** how far a sheet's drop shadow can reach past its cut, px, times 1.5: the test for visiting a second sheet up */
  reach: number[];
  /** 1 / sigma, as the shader takes them */
  isigma: number[];
  icsigma: number;
  /** the lit cut's width, px */
  wall: number;
}

/** Numbers a hill takes a frame: its middle (D units), 1/r^2 and its height. */
export const PAPERCUT_BUMP = 4;
/** Numbers a frame takes: the hills', then the waves' four phases, then toward the light (x, y). */
export const papercutFrameSize = (m: PapercutScene) => m.bumps.length * PAPERCUT_BUMP + 6;

const round = (v: number, step: number) => Math.round(v / step) * step;
/** The OKLCH hue of a pure yellow, where a shadow would go most olive. */
const YELLOW = 100;
const bytes = (hex: string) => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
const TAU = Math.PI * 2;

/** The frame at t (seconds of the loop at speed 1): every hill's middle, 1/r^2 and height, then the waves' phases,
    then toward the light, into `at`. What a frame computes on the CPU, and what the player sends as uniforms. */
export function papercutFrameAt(m: PapercutScene, time: number, at: Float64Array | Float32Array) {
  /* every motion is whole cycles of the loop, so the loop's own time is enough, and keeps the phases small */
  const t = time - PAPERCUT_LOOP * Math.floor(time / PAPERCUT_LOOP);
  const w = TAU / PAPERCUT_LOOP;
  for (let i = 0; i < m.bumps.length; i++) {
    const b = m.bumps[i];
    const o = i * PAPERCUT_BUMP;
    at[o] = (b.x + b.ax * (Math.cos(w * b.kx * t + b.px) - Math.cos(b.px))) * FRAME_HW;
    at[o + 1] = (b.y + b.ay * (Math.sin(w * b.ky * t + b.py) - Math.sin(b.py))) * FRAME_HH;
    at[o + 2] = 1 / (b.r * b.r);
    at[o + 3] = b.a * (1 + b.b * (Math.sin(w * b.kb * t + b.pb) - Math.sin(b.pb)));
  }
  const o = m.bumps.length * PAPERCUT_BUMP;
  for (let j = 0; j < 4; j++) at[o + j] = m.phase[j] + w * m.cycles[j] * t;
  /* the light's swing: a sine, so it leaves the designed light at t = 0 at its fastest and turns back at the ends */
  const a = m.swing * Math.sin(w * t);
  const c = Math.cos(a);
  const s = Math.sin(a);
  at[o + 4] = c * m.lx - s * m.ly;
  at[o + 5] = s * m.lx + c * m.ly;
}

/** The field, its slope at q (D units) and its curvature along the slope, into out: [f, df/dqx, df/dqy, kappa]. The
    curvature is the hills' Hessian carried through the waves' bend (J^T H J; the ramp has none, and the waves' own
    second derivatives are left out), taken along the slope, and weighed by how round the field is there (4 det /
    trace^2, full from 1/2, none at a saddle or along a ridge): it is only what tells a cut's distance where the slope
    alone would mislead, at a hilltop or a pit, and a saddle is neither. */
export function papercutField(
  m: PapercutScene,
  at: Float64Array | Float32Array,
  qx: number,
  qy: number,
  out: Float64Array
) {
  const nb = m.bumps.length;
  const o = nb * PAPERCUT_BUMP;
  /* two waves bend the plane: one shears across and down at a slow frequency, one along the diagonals at twice it */
  const s1 = m.wf * qy + at[o];
  const s2 = m.wf * qx + at[o + 1];
  const u = m.wf2 * (qx + qy) + at[o + 2];
  const v = m.wf2 * (qx - qy) + at[o + 3];
  const su = Math.sin(u);
  const sv = Math.sin(v);
  const wx = qx + m.wa * Math.sin(s1) + m.wa2 * sv;
  const wy = qy + m.wa * Math.sin(s2) + m.wa2 * su;
  const c1 = m.wa * m.wf * Math.cos(s1);
  const c2 = m.wa * m.wf * Math.cos(s2);
  const cu = m.wa2 * m.wf2 * Math.cos(u);
  const cv = m.wa2 * m.wf2 * Math.cos(v);
  /* d(wx, wy)/d(qx, qy) */
  const j11 = 1 + cv;
  const j12 = c1 - cv;
  const j21 = c2 + cu;
  const j22 = 1 + cu;
  let f = wx * m.rx + wy * m.ry;
  let gx = m.rx;
  let gy = m.ry;
  let hxx = 0;
  let hxy = 0;
  let hyy = 0;
  for (let i = 0; i < nb; i++) {
    const b = i * PAPERCUT_BUMP;
    const ex = wx - at[b];
    const ey = wy - at[b + 1];
    const ir2 = at[b + 2];
    const s = (ex * ex + ey * ey) * ir2;
    if (s < 1) {
      const k = 1 - s;
      const a = at[b + 3];
      const k2 = k * k;
      f += a * k2 * k;
      const c = -6 * a * k2 * ir2;
      gx += c * ex;
      gy += c * ey;
      const q = 24 * a * ir2 * ir2 * k;
      hxx += c + q * ex * ex;
      hyy += c + q * ey * ey;
      hxy += q * ex * ey;
    }
  }
  const Gx = gx * j11 + gy * j21;
  const Gy = gx * j12 + gy * j22;
  const a11 = hxx * j11 + hxy * j21;
  const a12 = hxx * j12 + hxy * j22;
  const a21 = hxy * j11 + hyy * j21;
  const a22 = hxy * j12 + hyy * j22;
  const q11 = j11 * a11 + j21 * a21;
  const q12 = j11 * a12 + j21 * a22;
  const q22 = j12 * a12 + j22 * a22;
  const g2 = Gx * Gx + Gy * Gy;
  const kn = g2 > 0 ? (Gx * Gx * q11 + 2 * Gx * Gy * q12 + Gy * Gy * q22) / g2 : 0.5 * (q11 + q22);
  const tr = q11 + q22;
  const roundness =
    tr * tr > 0 ? Math.min(1, Math.max(0, (8 * (q11 * q22 - q12 * q12)) / (tr * tr))) : 0;
  out[0] = f;
  out[1] = Gx;
  out[2] = Gy;
  out[3] = kn * roundness;
}

/** The field alone at q, as papercutField computes it: what the levels sample, at a third of its cost. */
export function papercutFieldValue(
  m: PapercutScene,
  at: Float64Array | Float32Array,
  qx: number,
  qy: number
) {
  const nb = m.bumps.length;
  const o = nb * PAPERCUT_BUMP;
  const wx =
    qx + m.wa * Math.sin(m.wf * qy + at[o]) + m.wa2 * Math.sin(m.wf2 * (qx - qy) + at[o + 3]);
  const wy =
    qy + m.wa * Math.sin(m.wf * qx + at[o + 1]) + m.wa2 * Math.sin(m.wf2 * (qx + qy) + at[o + 2]);
  let f = wx * m.rx + wy * m.ry;
  for (let i = 0; i < nb; i++) {
    const b = i * PAPERCUT_BUMP;
    const ex = wx - at[b];
    const ey = wy - at[b + 1];
    const s = (ex * ex + ey * ey) * at[b + 2];
    if (s < 1) {
      const k = 1 - s;
      f += at[b + 3] * k * k * k;
    }
  }
  return f;
}

/** Half the reach of phi, in sigmas. */
export const PAPERCUT_REACH = 2.54;
/** The Gaussian's cumulative share at x sigmas, as a blur spreads a straight edge: a quintic smootherstep over
    -2.54..2.54 sigmas, within 0.013 of it, with no exponential to take and nothing past its reach. */
export function papercutPhi(x: number) {
  const t = Math.min(1, Math.max(0, (x + PAPERCUT_REACH) / (2 * PAPERCUT_REACH)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Where a shadow ends, in sigmas: past it phi is 0, so nothing is mixed. */
export const PAPERCUT_TAIL = -PAPERCUT_REACH;
/** Within this many drop-shadow offsets of a hilltop or a pit, a cut's distance is taken from the round model. */
export const PAPERCUT_NEAR = 16;

/** One pixel's color at the field value f, slope (gx, gy) per D unit and curvature along it, the light toward
    (lx, ly): the sheets about it painted in the stills' order (each sheet's drop shadow, its contact shadow, its lit
    cut, its face): the pixel's own, where its face does not cover the pixel whole (within a pixel of its cut), the
    sheet above it, and the one above that only where the terraces crowd (its cut within 1.5 shadow reaches), which is
    all a shadow can reach. The shader does exactly this, branch for branch. Into out[0..2], 0..1. */
export function papercutShade(
  m: PapercutScene,
  f: number,
  gx: number,
  gy: number,
  kn: number,
  lx: number,
  ly: number,
  out: Float64Array
) {
  const L = m.levels;
  const top = m.n - 1;
  let b = 0;
  for (let i = 0; i < top; i++) if (f >= L[i]) b++;
  const g = Math.max(1e-9, Math.sqrt(gx * gx + gy * gy));
  const toPx = m.D / g;
  const nl = (gx * lx + gy * ly) / g;
  const wn = m.wall * nl;
  let base = 0;
  let own = false;
  if (b > 0) {
    if ((f - L[b - 1]) * toPx + wn >= 0.5) base = b * 3;
    else {
      base = (b - 1) * 3;
      own = true;
    }
  }
  out[0] = m.face[base];
  out[1] = m.face[base + 1];
  out[2] = m.face[base + 2];
  if (own) sheet(m, b, f, g, kn, nl, wn, toPx, out);
  if (b < top) sheet(m, b + 1, f, g, kn, nl, wn, toPx, out);
  /* the sheet above that, only where the terraces crowd: its cut within reach by the slope's own step */
  if (b + 1 < top && (L[b + 1] - f) * toPx < m.reach[b + 2])
    sheet(m, b + 2, f, g, kn, nl, wn, toPx, out);
}

/** Sheet k painted over out: its drop shadow, its contact shadow, its lit cut and its face. */
function sheet(
  m: PapercutScene,
  k: number,
  f: number,
  g: number,
  kap: number,
  nl: number,
  wn: number,
  toPx: number,
  out: Float64Array
) {
  /* the distance to sheet k's cut, px, positive inside it, and from the point the drop shadow is cast from (the
     pixel moved toward the light by the offset). Inside, the field's own step. Outside, the field must still rise
     to the cut's level: along its slope it does so at the nearer root of its second-order step. Near a hilltop or a
     pit (where the top is closer than NEAR offsets) the field is taken as round about it: the cut a circle about
     the top, of a signed radius (a hilltop under the level gives a negative one, so no shadow falls from paper that
     is not there), and the offset point's distance is measured to that circle, so a small island's shadow is the
     island moved, as a blur of it is */
  const rise = m.levels[k - 1] - f;
  const o = m.offset[k];
  let d = -rise * toPx;
  let ds = d + o * nl;
  /* a small island's shadows are as deep as a blur of a disc that size is at its middle (1 - exp(-R^2 / 2 sigma^2)):
     faint for a speck, nothing for the island a hilltop under the level would have been, whole for a broad one */
  let size = 1;
  let csize = 1;
  if (rise > 0) {
    const disc = g * g + 2 * kap * rise;
    const ak = Math.abs(kap);
    if (ak * PAPERCUT_NEAR * o > g * m.D) {
      const top = (g / ak) * m.D;
      const R = ((disc >= 0 ? Math.sqrt(disc) : -Math.sqrt(-disc)) / ak) * m.D;
      const e = kap < 0 ? 1 : -1;
      d = -e * (top - R);
      ds = -e * (Math.sqrt(top * top - 2 * e * top * o * nl + o * o) - R);
      if (e > 0) {
        const R2 = Math.max(0, R) * R;
        size = 1 - Math.exp(-0.5 * R2 * m.isigma[k] * m.isigma[k]);
        csize = 1 - Math.exp(-0.5 * R2 * m.icsigma * m.icsigma);
      }
    } else {
      d = -m.D * (disc >= 0 ? (2 * rise) / (g + Math.sqrt(disc)) : (g + Math.sqrt(-disc)) / -kap);
      ds = d + o * nl;
    }
  }
  const c = k * 3;
  let cr = out[0];
  let cg = out[1];
  let cb = out[2];
  const x = ds * m.isigma[k];
  if (x > PAPERCUT_TAIL) {
    const sh = m.alpha[k] * papercutPhi(x) * size;
    cr += (m.shadowRgb[c] - cr) * sh;
    cg += (m.shadowRgb[c + 1] - cg) * sh;
    cb += (m.shadowRgb[c + 2] - cb) * sh;
  }
  const xc = d * m.icsigma;
  if (xc > PAPERCUT_TAIL) {
    const ch = m.calpha * papercutPhi(xc) * csize;
    cr += (m.shadowRgb[c] - cr) * ch;
    cg += (m.shadowRgb[c + 1] - cg) * ch;
    cb += (m.shadowRgb[c + 2] - cb) * ch;
  }
  /* the lit cut and the face: only within a pixel of the cut (elsewhere their cover is 0, and a mix by 0 is none) */
  if (d + Math.max(0, wn) > -0.5) {
    const cw = Math.min(1, Math.max(0, d + 0.5));
    cr += (m.wallRgb[c] - cr) * cw;
    cg += (m.wallRgb[c + 1] - cg) * cw;
    cb += (m.wallRgb[c + 2] - cb) * cw;
    const cf = Math.min(1, Math.max(0, d + wn + 0.5));
    cr += (m.face[c] - cr) * cf;
    cg += (m.face[c + 1] - cg) * cf;
    cb += (m.face[c + 2] - cb) * cf;
  }
  out[0] = cr;
  out[1] = cg;
  out[2] = cb;
}

/** Interleaved gradient noise at a pixel, -0.5..0.5 of a level: the half-level dither every drawing adds, as browsers
    dither their gradients, so a shadow's slow ramp never bands. */
export function papercutDither(x: number, y: number) {
  const a = 0.06711056 * x + 0.00583715 * y;
  const b = 52.9829189 * (a - Math.floor(a));
  return (b - Math.floor(b) - 0.5) / 255;
}

/** The scene a palette and a view draw in a box of `width` by `height` px. */
export function papercutModel(
  P: Palette,
  view: PapercutView,
  width: number,
  height: number,
  look: PapercutLook = PAPERCUT_LOOK
): PapercutScene {
  const D = PAPERCUT_SPAN * Math.max(width, height);
  const rad = (view.angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  /* the ramp climbs -1..1 over the design's box along the angle, as a CSS linear-gradient's line runs corner to
     corner */
  const half = Math.max(look.rampMin, Math.abs(dx) * FRAME_HW + Math.abs(dy) * FRAME_HH);
  /* toward the light: the angle's head, turned toward the box's top by the lean (a head straight up or down turns
     toward the right) */
  const le = (look.lean * Math.PI) / 180;
  let px = dy;
  let py = -dx;
  if (py > 0 || (py === 0 && px < 0)) {
    px = -px;
    py = -py;
  }
  const lx = Math.cos(le) * dx + Math.sin(le) * px;
  const ly = Math.cos(le) * dy + Math.sin(le) * py;
  const layout = view.shape ? seeded(view.shape) : { bumps: DESIGNED, phase: DESIGNED_PHASE };
  const n = Math.max(2, Math.min(PAPERCUT_MAX_SHEETS, Math.round(look.sheets)));
  const hex = Array.from({ length: n }, (_, i) => toHex(sampleSrgb(P, i / (n - 1))));
  const lch = hex.map(h => srgbToLch(bytes(h)));
  const wallHex = lch.map(([L, C, H]) =>
    toHex(lchToSrgb(Math.min(1, L + look.wallLift), C * 0.9, H))
  );
  /* sheet k's shadow falls on sheet k - 1: that paper, deeper, and a yellow's turned toward ochre (kept at its own hue
     it goes olive, which no paper's shadow does) */
  const shadowHex = lch.map((_, k) => {
    const [L, C, H] = lch[Math.max(0, k - 1)];
    const off = ((((H - YELLOW) % 360) + 540) % 360) - 180;
    const turn = look.ochre * Math.max(0, 1 - Math.abs(off) / 45) * Math.min(1, C / 0.06);
    return toHex(lchToSrgb(L * look.shadowDepth, C * look.shadowChroma, H - turn));
  });
  const thick = (k: number) => (look.index > 0 && k % look.index === 0 ? look.indexScale : 1);
  const m: PapercutScene = {
    width,
    height,
    D,
    rx: (dx / half) * look.slope,
    ry: (dy / half) * look.slope,
    bumps: layout.bumps,
    wa: look.warp,
    wf: look.warpFreq,
    wa2: look.warp2,
    wf2: look.warpFreq2,
    phase: layout.phase,
    cycles: [1, -1, 2, -1],
    lx,
    ly,
    swing: (look.swing * Math.PI) / 180,
    n,
    levels: [],
    hex,
    wallHex,
    shadowHex,
    face: hex.flatMap(bytes),
    wallRgb: wallHex.flatMap(bytes),
    shadowRgb: shadowHex.flatMap(bytes),
    sigma: Array.from({ length: n }, (_, k) =>
      round(look.shadowBlur * D * Math.sqrt(thick(k)), 0.01)
    ),
    offset: Array.from({ length: n }, (_, k) => round(look.shadowOffset * D * thick(k), 0.01)),
    alpha: Array.from({ length: n }, (_, k) =>
      round(Math.min(0.9, look.shadowAlpha * Math.sqrt(thick(k))), 0.001)
    ),
    csigma: round(look.contactBlur * D, 0.01),
    calpha: round(look.contactAlpha, 0.001),
    isigma: [],
    icsigma: 0,
    reach: [],
    wall: round(look.wall * D, 0.01)
  };
  m.isigma = m.sigma.map(v => 1 / v);
  m.reach = m.sigma.map((v, k) => round(1.5 * (m.offset[k] + PAPERCUT_REACH * v), 0.01));
  m.icsigma = 1 / m.csigma;
  m.levels = levelsOf(m);
  return m;
}

/** The scene a palette and a view draw in a box. */
export const papercutScene = (P: Palette, view: PapercutView, size: Size): PapercutScene =>
  papercutModel(P, view, size.width, size.height);

/** The least share of the design's box an island or hole cut at t = 0 may have. */
const SPECK = 0.004;
/** The levels' grid over the design's box, cells each way. */
const GRID_W = 128;
const GRID_H = 72;

/** The levels that give every sheet an equal share of the design's box at t = 0 (quantiles of the field over a grid),
    each then moved a hair past any island or hole it would cut smaller than SPECK of the box, so the still never shows
    a speck (in motion, islands still surface and sink, as they would). They depend on the palette's view alone, never
    on the box, so every box cuts the same sheets. A few ms: a grid of the field alone, one flood a level, nothing
    allocated per cell. */
function levelsOf(m: PapercutScene): number[] {
  const gw = GRID_W;
  const gh = GRID_H;
  const cells = gw * gh;
  const at = new Float64Array(papercutFrameSize(m));
  papercutFrameAt(m, 0, at);
  const vals = new Float64Array(cells);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++)
      vals[j * gw + i] = papercutFieldValue(
        m,
        at,
        ((i + 0.5) / gw - 0.5) * 2 * FRAME_HW,
        ((j + 0.5) / gh - 0.5) * 2 * FRAME_HH
      );
  const sorted = vals.slice().sort();
  const levels = Array.from(
    { length: m.n - 1 },
    (_, k) => sorted[Math.floor(((k + 1) / m.n) * cells)]
  );
  const label = new Int32Array(cells);
  const stack = new Int32Array(cells);
  const min = SPECK * cells;
  for (let k = 0; k < levels.length; k++)
    for (let pass = 0; pass < 4; pass++) {
      const L = levels[k];
      label.fill(0);
      let moved = false;
      let id = 0;
      for (let s = 0; s < cells && !moved; s++) {
        if (label[s]) continue;
        /* flood one region on one side of the level */
        const above = vals[s] >= L;
        id++;
        let top = 0;
        stack[top++] = s;
        label[s] = id;
        let size = 0;
        let edge = false;
        let lo = Infinity;
        let hi = -Infinity;
        while (top) {
          const c = stack[--top];
          size++;
          const v = vals[c];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
          const i = c % gw;
          const j = (c - i) / gw;
          if (i === 0 || j === 0 || i === gw - 1 || j === gh - 1) edge = true;
          if (i > 0 && !label[c - 1] && vals[c - 1] >= L === above) {
            label[c - 1] = id;
            stack[top++] = c - 1;
          }
          if (i < gw - 1 && !label[c + 1] && vals[c + 1] >= L === above) {
            label[c + 1] = id;
            stack[top++] = c + 1;
          }
          if (j > 0 && !label[c - gw] && vals[c - gw] >= L === above) {
            label[c - gw] = id;
            stack[top++] = c - gw;
          }
          if (j < gh - 1 && !label[c + gw] && vals[c + gw] >= L === above) {
            label[c + gw] = id;
            stack[top++] = c + gw;
          }
        }
        if (edge || size >= min) continue;
        /* a speck: the level moved a hair past it, so it is gone */
        levels[k] = above ? hi + 1e-4 : lo - 1e-4;
        moved = true;
      }
      if (!moved) break;
    }
  return levels.map(v => round(v, 1e-6));
}
