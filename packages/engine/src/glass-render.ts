/* The fluted glass drawn by the CPU and the GPU's preparation (glass.ts holds the model and its SVG): the design scaled
   to cover a box, the ribs' map for a window of it, the field's texture plan and the CPU's frames. Apart from glass.ts,
   so a page that only shows the glass's still loads none of this. */
import { hexBytes } from "./color.ts";
import {
  GLASS_ANGLE,
  GLASS_DESIGN,
  type GlassField,
  type GlassGeometry,
  glassDiscAt,
  glassGeometry
} from "./glass.ts";
import type { Size } from "./view.ts";

/** The part of a geometry a box shows: its corner in the geometry's pixels, and its size. */
export interface GlassWindow {
  x: number;
  y: number;
  w: number;
  h: number;
}
const whole = (geometry: GlassGeometry): GlassWindow => ({
  x: 0,
  y: 0,
  w: geometry.width,
  h: geometry.height
});

/** A box of `size` (CSS pixels) drawn at `dpr`: the design scaled to cover it, its ribs at `angle`, and the part of it
    the box shows, both in device pixels, as the SVG with `cover` lays itself out. */
export function glassCover(
  size: Size,
  dpr = 1,
  angle = GLASS_ANGLE,
  shape: number | null = null
): { geometry: GlassGeometry; window: GlassWindow } {
  const k = Math.max(size.width / GLASS_DESIGN.width, size.height / GLASS_DESIGN.height) * dpr;
  const geometry = glassGeometry(
    {
      width: Math.max(1, Math.round(GLASS_DESIGN.width * k)),
      height: Math.max(1, Math.round(GLASS_DESIGN.height * k))
    },
    angle,
    shape
  );
  const w = Math.max(1, Math.round(size.width * dpr));
  const h = Math.max(1, Math.round(size.height * dpr));
  const window = {
    x: Math.round((geometry.width - w) / 2),
    y: Math.round((geometry.height - h) / 2),
    w,
    h
  };
  return { geometry, window };
}

/** The composite map at each pixel of the window, as RGBA bytes, exactly as the two gradients and the arithmetic
    composite make it (pixel centers, stops interpolated, each stage rounded to 8 bits): R and G the displacement,
    B the ribs' light (twice the factor). A quarter-second's work at 1920 by 1080, once a size. */
export function glassMap(
  geometry: GlassGeometry,
  window = whole(geometry)
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(window.w * window.h * 4);
  glassMapRows(geometry, out, 0, window.h, window);
  return out;
}

/** The window's rows `from` to `to` of glassMap into `out`, so a page can bake the map a slice at a time. */
export function glassMapRows(
  geometry: GlassGeometry,
  out: Uint8Array,
  from: number,
  to: number,
  window = whole(geometry)
): void {
  const { ribs: ribList, normal, shadeTable: st } = geometry;
  const W = window.w;
  const nR = ribList.length;
  const nS = ribList[0].stops.length;
  const off = new Float64Array(nR * nS);
  const val = new Float64Array(nR * nS);
  const cx = new Float64Array(nR);
  const cy = new Float64Array(nR);
  const rr = new Float64Array(nR);
  ribList.forEach((r, i) => {
    cx[i] = r.cx;
    cy[i] = r.cy;
    rr[i] = r.r * r.r;
    r.stops.forEach(([o, v], j) => {
      off[i * nS + j] = o;
      val[i * nS + j] = v;
    });
  });
  const ns = normal.stops;
  const nN = ns.length;
  const noff = new Float64Array(nN);
  const nr = new Float64Array(nN);
  const ng = new Float64Array(nN);
  ns.forEach(([o, r, g], j) => {
    noff[j] = o;
    nr[j] = r;
    ng[j] = g;
  });
  /* a binary search finds the segment */
  const seg = (offs: Float64Array, base: number, n: number, t: number) => {
    if (t <= offs[base]) return -1;
    if (t > offs[base + n - 1]) return n - 1;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (t <= offs[base + mid]) hi = mid;
      else lo = mid;
    }
    return lo;
  };
  const nx = normal.x2 - normal.x1;
  const ny = normal.y2 - normal.y1;
  const nn = nx * nx + ny * ny;
  let i = nR - 1;
  for (let y = from; y < to; y++) {
    const py = y + window.y + 0.5;
    for (let x = 0; x < W; x++) {
      const px = x + window.x + 0.5;
      /* the smallest disc holding the pixel: painted last, so on top */
      let dx = px - cx[i];
      let dy = py - cy[i];
      if (dx * dx + dy * dy <= rr[i]) {
        while (i > 0) {
          const ex = px - cx[i - 1];
          const ey = py - cy[i - 1];
          if (ex * ex + ey * ey <= rr[i - 1]) i--;
          else break;
        }
      } else {
        while (i < nR - 1) {
          i++;
          const ex = px - cx[i];
          const ey = py - cy[i];
          if (ex * ex + ey * ey <= rr[i]) break;
        }
      }
      dx = px - cx[i];
      dy = py - cy[i];
      let A = 128;
      const d2 = dx * dx + dy * dy;
      if (d2 <= rr[i]) {
        const t = Math.sqrt(d2 / rr[i]);
        const base = i * nS;
        const k = seg(off, base, nS, t);
        if (k < 0) A = val[base];
        else if (k >= nS - 1) A = val[base + nS - 1];
        else {
          const o0 = off[base + k];
          const o1 = off[base + k + 1];
          const f = o1 > o0 ? (t - o0) / (o1 - o0) : 1;
          A = val[base + k] + f * (val[base + k + 1] - val[base + k]);
        }
        A = Math.round(A);
      }
      let tn = ((px - normal.x1) * nx + (py - normal.y1) * ny) / nn;
      tn = tn < 0 ? 0 : tn > 1 ? 1 : tn;
      const k = seg(noff, 0, nN, tn);
      let NR: number;
      let NG: number;
      if (k < 0) {
        NR = nr[0];
        NG = ng[0];
      } else if (k >= nN - 1) {
        NR = nr[nN - 1];
        NG = ng[nN - 1];
      } else {
        const o0 = noff[k];
        const o1 = noff[k + 1];
        const f = o1 > o0 ? (tn - o0) / (o1 - o0) : 1;
        NR = nr[k] + f * (nr[k + 1] - nr[k]);
        NG = ng[k] + f * (ng[k + 1] - ng[k]);
      }
      NR = Math.round(NR);
      NG = Math.round(NG);
      const a = A / 255;
      const ar = NR / 255;
      const ag = NG / 255;
      const o = 4 * (y * W + x);
      let v = 2 * a * ar - a - ar + 1;
      out[o] = Math.round(255 * (v < 0 ? 0 : v > 1 ? 1 : v));
      v = 2 * a * ag - a - ag + 1;
      out[o + 1] = Math.round(255 * (v < 0 ? 0 : v > 1 ? 1 : v));
      /* the composite's blue is the lens gray itself (the normal's blue is 1); the table reads it */
      const c = (A / 255) * 16;
      const kk = Math.min(15, Math.floor(c));
      out[o + 2] = Math.round(255 * (st[kk] + (c - kk) * (st[kk + 1] - st[kk])));
      out[o + 3] = 255;
    }
  }
}

/** The field's texture: 1/q of the region, q set so the blur spans about three texels, and its blur as a Gaussian
    of the three boxes' variance, eleven taps a pass (the middle and five bilinear pairs either side, out to 3σ). */
export function glassPlan(geometry: GlassGeometry) {
  const q = Math.max(1, geometry.sigmaEff / 3);
  const fw = Math.ceil(geometry.region.w / q) + 1;
  const fh = Math.ceil(geometry.region.h / q) + 1;
  const s = geometry.sigmaEff / q;
  const w: number[] = [];
  for (let i = 0; i <= 10; i++) w.push(Math.exp(-(i * i) / (2 * s * s)));
  const tot = w[0] + 2 * w.slice(1).reduce((a, b) => a + b, 0);
  const taps: [number, number][] = [[0, w[0] / tot]];
  for (let i = 1; i <= 9; i += 2) {
    const a = w[i] / tot;
    const b = w[i + 1] / tot;
    taps.push([i + b / (a + b), a + b]);
  }
  return { q, fw, fh, s, taps };
}
export type GlassPlan = ReturnType<typeof glassPlan>;

/** The CPU's frames of a geometry's window, for a PNG or a GIF: the player's arithmetic in JavaScript. Each pixel's
    read is worked out once, since the glass does not move; a frame then costs the discs, the blur and one pass. */
export function glassRenderer(
  geometry: GlassGeometry,
  window = whole(geometry),
  map = glassMap(geometry, window)
) {
  const { region, scale } = geometry;
  const W = window.w;
  const H = window.h;
  const plan = glassPlan(geometry);
  const { q, fw, fh, taps } = plan;
  const idx = new Int32Array(W * H);
  const wx = new Float32Array(W * H);
  const wy = new Float32Array(W * H);
  const shf = new Float32Array(W * H);
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i++) {
      const p = 4 * i;
      const sx = x + window.x + Math.floor(scale * (map[p] / 255 - 0.5) + 0.5);
      const sy = y + window.y + Math.floor(scale * (map[p + 1] / 255 - 0.5) + 0.5);
      const fxp = (sx + 0.5 - region.x) / q - 0.5;
      const fyp = (sy + 0.5 - region.y) / q - 0.5;
      let x0 = Math.floor(fxp);
      let y0 = Math.floor(fyp);
      let ax = fxp - x0;
      let ay = fyp - y0;
      if (x0 < 0) {
        x0 = 0;
        ax = 0;
      }
      if (x0 > fw - 2) {
        x0 = fw - 2;
        ax = 1;
      }
      if (y0 < 0) {
        y0 = 0;
        ay = 0;
      }
      if (y0 > fh - 2) {
        y0 = fh - 2;
        ay = 1;
      }
      idx[i] = y0 * fw + x0;
      wx[i] = ax;
      wy[i] = ay;
      shf[i] = (2 * map[p + 2]) / 255;
    }
  }
  const nT = taps.length;
  const tOff = Float64Array.from(taps, t => t[0]);
  const tW = Float64Array.from(taps, t => t[1]);
  const f = new Float32Array(fw * fh * 3);
  const tmp = new Float32Array(f.length);
  const pos = new Float32Array(2);
  /* one blur pass, the player's: the middle and bilinear pairs either side, edges clamped */
  const blur = (src: Float32Array, dst: Float32Array, along: boolean) => {
    const n = along ? fw : fh;
    const lines = along ? fh : fw;
    const stepI = along ? 3 : 3 * fw;
    const stepL = along ? 3 * fw : 3;
    for (let l = 0; l < lines; l++) {
      const lb = l * stepL;
      for (let x = 0; x < n; x++) {
        let r = tW[0] * src[lb + x * stepI];
        let g = tW[0] * src[lb + x * stepI + 1];
        let b = tW[0] * src[lb + x * stepI + 2];
        for (let k = 1; k < nT; k++) {
          for (let sgn = -1; sgn <= 1; sgn += 2) {
            const sx = x + sgn * tOff[k];
            const x0 = Math.floor(sx);
            const fr = sx - x0;
            const a0 = x0 < 0 ? 0 : x0 > n - 1 ? n - 1 : x0;
            const a1 = x0 + 1 < 0 ? 0 : x0 + 1 > n - 1 ? n - 1 : x0 + 1;
            const o0 = lb + a0 * stepI;
            const o1 = lb + a1 * stepI;
            const w = tW[k];
            r += w * (src[o0] + fr * (src[o1] - src[o0]));
            g += w * (src[o0 + 1] + fr * (src[o1 + 1] - src[o0 + 1]));
            b += w * (src[o0 + 2] + fr * (src[o1 + 2] - src[o0 + 2]));
          }
        }
        const o = lb + x * stepI;
        dst[o] = r;
        dst[o + 1] = g;
        dst[o + 2] = b;
      }
    }
  };
  /** The frame at t (seconds at speed 1) as RGBA bytes. */
  const frame = (field: GlassField, t: number): Uint8ClampedArray<ArrayBuffer> => {
    const [br, bg, bb] = hexBytes(field.base).map(v => v / 255);
    for (let i = 0; i < fw * fh; i++) {
      f[3 * i] = br;
      f[3 * i + 1] = bg;
      f[3 * i + 2] = bb;
    }
    for (const d of field.discs) {
      glassDiscAt(geometry, d, t, pos, 0);
      const [cr, cg, cb] = hexBytes(d.color).map(v => v / 255);
      const X = (pos[0] - region.x) / q;
      const Y = (pos[1] - region.y) / q;
      const R = d.R / q;
      for (let y = Math.max(0, Math.floor(Y - R)); y < Math.min(fh, Math.ceil(Y + R + 1)); y++) {
        for (let x = Math.max(0, Math.floor(X - R)); x < Math.min(fw, Math.ceil(X + R + 1)); x++) {
          const ex = x + 0.5 - X;
          const ey = y + 0.5 - Y;
          const r = Math.sqrt(ex * ex + ey * ey) / R;
          if (r >= 1) continue;
          const a = r <= field.core ? 1 : (1 - r) / (1 - field.core);
          const o = 3 * (y * fw + x);
          f[o] = cr * a + f[o] * (1 - a);
          f[o + 1] = cg * a + f[o + 1] * (1 - a);
          f[o + 2] = cb * a + f[o + 2] * (1 - a);
        }
      }
    }
    blur(f, tmp, true);
    blur(tmp, f, false);
    const out = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const o00 = 3 * idx[i];
      const o10 = o00 + 3;
      const o01 = o00 + 3 * fw;
      const o11 = o01 + 3;
      const ax = wx[i];
      const ay = wy[i];
      const sh = shf[i];
      const o = 4 * i;
      for (let c = 0; c < 3; c++) {
        const v = Math.round(
          255 *
            ((f[o00 + c] * (1 - ax) + f[o10 + c] * ax) * (1 - ay) +
              (f[o01 + c] * (1 - ax) + f[o11 + c] * ax) * ay)
        );
        out[o + c] = Math.round(Math.min(255, v * sh));
      }
      out[o + 3] = 255;
    }
    return out;
  };
  return { width: W, height: H, plan, frame };
}
