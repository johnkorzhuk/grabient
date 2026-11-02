/* The CPU drawing of the lean rosette, the reference every other format is measured against: the ground, the petals
   from the rim in (each a lens filled with its ring's gradient in its own bounding box), then the heart's glow, as the
   SVG stacks them. Coverage at a lens's edge is its signed distance's, half a pixel each side. RosetteColors mix in sRGB, as
   SVG and Figma mix them. */
import {
  gradColor,
  gradG,
  HEART_STOPS,
  lensSd,
  type RosettePetal,
  type RosetteScene,
  rosetteGroupAt,
  rosettePetals,
  stopValue
} from "./rosette.ts";

const mixInto = (acc: Float64Array, i: number, c: ArrayLike<number>, a: number) => {
  acc[i] += (c[0] - acc[i]) * a;
  acc[i + 1] += (c[1] - acc[i + 1]) * a;
  acc[i + 2] += (c[2] - acc[i + 2]) * a;
};

/** One petal at loop phase tau into acc (sRGB floats, 3 a pixel). */
export function paintPetal(sc: RosetteScene, p: RosettePetal, tau: number, acc: Float64Array) {
  const W = sc.box.width;
  const H = sc.box.height;
  const L = sc.lens;
  const d = sc.design;
  const g = rosetteGroupAt(sc, tau);
  const r = p.r * g.zoom;
  const th = p.th + g.turn;
  const cs = Math.cos(th);
  const sn = Math.sin(th);
  const cx = W / 2;
  const cy = H / 2;
  const ax = cx + r * cs;
  const ay = cy + r * sn;
  const reach = r * L.reach + 2;
  const x0 = Math.max(0, Math.floor(ax - reach));
  const x1 = Math.min(W - 1, Math.ceil(ax + reach));
  const y0 = Math.max(0, Math.floor(ay - reach));
  const y1 = Math.min(H - 1, Math.ceil(ay + reach));
  if (x0 > x1 || y0 > y1) return;
  const stops = sc.colors.grads[p.key];
  const col = new Float64Array(3);
  const inv = 1 / r;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      /* into the petal's frame: the heart at the origin, the anchor at (1, 0) */
      const qx = (dx * cs + dy * sn) * inv;
      const qy = (-dx * sn + dy * cs) * inv;
      const cov = Math.min(1, Math.max(0, 0.5 - lensSd(L, qx, qy) * r));
      if (cov <= 0) continue;
      gradColor(d, stops, gradG(d, L, qx, qy), col);
      mixInto(acc, 3 * (y * W + x), col, cov);
    }
  }
}

/** The frame at loop phase tau as sRGB floats, 3 a pixel. */
export function renderRosetteFloat(
  sc: RosetteScene,
  tau: number,
  petals = rosettePetals(sc, true)
): Float64Array {
  const W = sc.box.width;
  const H = sc.box.height;
  const acc = new Float64Array(W * H * 3);
  const G = sc.colors.ground;
  for (let i = 0; i < W * H; i++) {
    acc[3 * i] = G[0];
    acc[3 * i + 1] = G[1];
    acc[3 * i + 2] = G[2];
  }
  for (const p of petals) paintPetal(sc, p, tau, acc);
  /* the heart's glow */
  const d = sc.design;
  const cx = W / 2;
  const cy = H / 2;
  const hc = sc.colors.heart;
  const r1 = d.heartOut * sc.S;
  for (
    let y = Math.max(0, Math.floor(cy - r1 - 1));
    y <= Math.min(H - 1, Math.ceil(cy + r1 + 1));
    y++
  ) {
    const dy = y + 0.5 - cy;
    for (
      let x = Math.max(0, Math.floor(cx - r1 - 1));
      x <= Math.min(W - 1, Math.ceil(cx + r1 + 1));
      x++
    ) {
      const dx = x + 0.5 - cx;
      const hr = Math.sqrt(dx * dx + dy * dy) / sc.S;
      if (hr >= d.heartOut) continue;
      const a =
        hr <= d.heartIn ? 1 : stopValue(HEART_STOPS, (hr - d.heartIn) / (d.heartOut - d.heartIn));
      mixInto(acc, 3 * (y * W + x), hc, a);
    }
  }
  return acc;
}

export function rosetteBytes(sc: RosetteScene, acc: Float64Array): Uint8ClampedArray {
  const n = sc.box.width * sc.box.height;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    out[4 * i] = Math.round(acc[3 * i] * 255);
    out[4 * i + 1] = Math.round(acc[3 * i + 1] * 255);
    out[4 * i + 2] = Math.round(acc[3 * i + 2] * 255);
    out[4 * i + 3] = 255;
  }
  return out;
}

/** The frame at loop phase tau, RGBA bytes: the moving drawing's petals (any tau), or the still's (`still`, tau 0). */
export function renderRosette(sc: RosetteScene, tau: number, still = false): Uint8ClampedArray {
  return rosetteBytes(sc, renderRosetteFloat(sc, tau, rosettePetals(sc, !still)));
}
