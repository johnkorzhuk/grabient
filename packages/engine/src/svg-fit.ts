/* What the tracers write a traced curve with (papercut-svg.ts's cuts, strings-svg.ts's threads): a number as short as
   it reads, and a run of points with their tangents fitted with cubic Beziers (Schneider's fit with the curve's own
   tangents, split at the worst point until every point lies within the tolerance), each written relative to the pen,
   which carries each one's rounding on so it never adds up along the curve. */

/** A number to `places` decimals, no leading zero before the point, no negative zero. */
export const svgNumber = (v: number, places: number) => {
  const k = 10 ** places;
  const r = Math.round(v * k) / k;
  return (Object.is(r, -0) ? 0 : r).toString().replace(/^(-?)0\./, "$1.");
};

/** How far a fitted curve may stray from its points (px), and the decimals each coordinate is written with; `unit`,
    where given, what each is rounded to (px) in place of a tenth to the power of `places`, which must still write it
    exactly (a field effect's still writes its lines in half pixels with one decimal: kit/svg.ts). */
export interface FitHow {
  tolerance: number;
  places: number;
  unit?: number;
}

/** Points i0 to i1 (their unit tangents tx, ty: the one at i1 pointing back along the run) as relative cubics (and a
    line where two points are all), pushed onto `out` from `pen`, which they move on. */
export function fitCubics(
  xs: number[],
  ys: number[],
  tx: number[],
  ty: number[],
  i0: number,
  i1: number,
  how: FitHow,
  pen: { x: number; y: number },
  out: string[]
) {
  const p = how.places;
  const k = how.unit ? 1 / how.unit : 10 ** p;
  const rel = (x: number, y: number) => {
    const dx = Math.round((x - pen.x) * k) / k;
    const dy = Math.round((y - pen.y) * k) / k;
    return [dx, dy] as const;
  };
  const x0 = xs[i0];
  const y0 = ys[i0];
  const x3 = xs[i1];
  const y3 = ys[i1];
  if (i1 - i0 < 2) {
    const [dx, dy] = rel(x3, y3);
    out.push(`l${svgNumber(dx, p)} ${svgNumber(dy, p)}`);
    pen.x += dx;
    pen.y += dy;
    return;
  }
  /* chord-length parameters */
  const u = [0];
  for (let i = i0 + 1; i <= i1; i++)
    u.push(u[u.length - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
  const total = u[u.length - 1] || 1;
  for (let i = 0; i < u.length; i++) u[i] /= total;
  const t0x = tx[i0];
  const t0y = ty[i0];
  const t1x = -tx[i1];
  const t1y = -ty[i1];
  let c11 = 0;
  let c12 = 0;
  let c22 = 0;
  let r1 = 0;
  let r2 = 0;
  for (let j = 0; j < u.length; j++) {
    const t = u[j];
    const s = 1 - t;
    const b0 = s * s * s;
    const b1 = 3 * t * s * s;
    const b2 = 3 * t * t * s;
    const b3 = t * t * t;
    const a1x = t0x * b1;
    const a1y = t0y * b1;
    const a2x = t1x * b2;
    const a2y = t1y * b2;
    c11 += a1x * a1x + a1y * a1y;
    c12 += a1x * a2x + a1y * a2y;
    c22 += a2x * a2x + a2y * a2y;
    const px = xs[i0 + j] - (x0 * (b0 + b1) + x3 * (b2 + b3));
    const py = ys[i0 + j] - (y0 * (b0 + b1) + y3 * (b2 + b3));
    r1 += a1x * px + a1y * py;
    r2 += a2x * px + a2y * py;
  }
  const det = c11 * c22 - c12 * c12;
  const chord = Math.hypot(x3 - x0, y3 - y0);
  let l1 = chord / 3;
  let l2 = chord / 3;
  if (Math.abs(det) > 1e-12) {
    l1 = (r1 * c22 - r2 * c12) / det;
    l2 = (c11 * r2 - c12 * r1) / det;
  }
  if (!(l1 > 1e-3 * chord) || !(l2 > 1e-3 * chord) || l1 > 2 * chord || l2 > 2 * chord) {
    l1 = chord / 3;
    l2 = chord / 3;
  }
  const x1 = x0 + t0x * l1;
  const y1 = y0 + t0y * l1;
  const x2 = x3 + t1x * l2;
  const y2 = y3 + t1y * l2;
  /* the worst point, against the curve at its parameter refined by Newton steps on the distance */
  let worst = 0;
  let at = -1;
  for (let j = 1; j < u.length - 1; j++) {
    let t = u[j];
    const px = xs[i0 + j];
    const py = ys[i0 + j];
    for (let it = 0; it < 2; it++) {
      const s = 1 - t;
      const bx = s * s * s * x0 + 3 * s * s * t * x1 + 3 * s * t * t * x2 + t * t * t * x3;
      const by = s * s * s * y0 + 3 * s * s * t * y1 + 3 * s * t * t * y2 + t * t * t * y3;
      const dx1 = 3 * (s * s * (x1 - x0) + 2 * s * t * (x2 - x1) + t * t * (x3 - x2));
      const dy1 = 3 * (s * s * (y1 - y0) + 2 * s * t * (y2 - y1) + t * t * (y3 - y2));
      const dd = dx1 * dx1 + dy1 * dy1;
      if (dd < 1e-12) break;
      t = Math.min(1, Math.max(0, t - ((bx - px) * dx1 + (by - py) * dy1) / dd));
    }
    const s = 1 - t;
    const bx = s * s * s * x0 + 3 * s * s * t * x1 + 3 * s * t * t * x2 + t * t * t * x3;
    const by = s * s * s * y0 + 3 * s * s * t * y1 + 3 * s * t * t * y2 + t * t * t * y3;
    const e = Math.hypot(bx - px, by - py);
    if (e > worst) {
      worst = e;
      at = i0 + j;
    }
  }
  if (worst > how.tolerance && at > i0 && at < i1) {
    fitCubics(xs, ys, tx, ty, i0, at, how, pen, out);
    fitCubics(xs, ys, tx, ty, at, i1, how, pen, out);
    return;
  }
  const [ax, ay] = rel(x1, y1);
  const [bx, by] = rel(x2, y2);
  const [cx, cy] = rel(x3, y3);
  out.push(`c${[ax, ay, bx, by, cx, cy].map(v => svgNumber(v, p)).join(" ")}`);
  pen.x += cx;
  pen.y += cy;
}
