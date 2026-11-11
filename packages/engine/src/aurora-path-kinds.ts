/* The kinds of path made for the aurora's range from a number (aurora-path.ts writes them): a jagged range, a line, a
   curve, a mix of straight and curved pieces, and a skyline of blocks with upright walls. The same kind and number
   make the same path, so a control that steps through numbers steps through ranges. It loads without the aurora's
   model: the Appearance menu's fields make paths, and draw none. */
import { auroraHash } from "./aurora-hash.ts";
import { auroraPathOf, auroraPathParts } from "./aurora-path.ts";

export const AURORA_PATH_KINDS = ["range", "line", "curve", "mix", "skyline"] as const;
export type AuroraPathKind = (typeof AURORA_PATH_KINDS)[number];

/** The kind a path is: a skyline where it has an upright wall, a curve or a line by how its pieces are joined, a mix
    where they are joined both ways, a line where it is two heights, else a range. */
export function auroraPathKind(path: string): AuroraPathKind {
  const P = auroraPathParts(path);
  if (!P) return "range";
  if (P.places.some((x, i) => i > 0 && x === P.places[i - 1])) return "skyline";
  const curves = P.curved.filter(Boolean).length;
  return curves === P.curved.length
    ? "curve"
    : curves
      ? "mix"
      : P.heights.length === 2
        ? "line"
        : "range";
}

const TAU = Math.PI * 2;
/* a seeded stream of numbers for a design */
const dice = (seed: number) => {
  let i = 0;
  return () => auroraHash(i++, seed);
};

/** A path of a kind, drawn from a number (the range of number 0 is the designed one). */
export function auroraMadePath(kind: AuroraPathKind, n: number): string {
  const r = dice(n * 3331 + 7);
  if (kind === "skyline") {
    /* blocks side by side, each a width and a height, their walls upright: every height names its place, and two at
       one place are a wall. The tall ones gather toward the middle. */
    const ground = 0.22 + 0.08 * r();
    const places = [0];
    const heights = [ground];
    let y = ground;
    for (;;) {
      const x = Math.round((places[places.length - 1] + 0.035 + 0.085 * r()) * 1000) / 1000;
      if (x > 0.97 || places.length > 56) break;
      let to =
        r() < 0.2
          ? ground
          : Math.round((0.28 + 0.4 * r() * (0.55 + 0.45 * Math.sin(Math.PI * x))) * 100) / 100;
      if (Math.abs(to - y) < 0.04) to = Math.round((y + 0.07) * 100) / 100;
      places.push(x, x);
      heights.push(y, to);
      y = to;
    }
    places.push(1);
    heights.push(y);
    return auroraPathOf(false, heights, places);
  }
  if (kind === "mix") {
    /* straight and curved runs by turns along one broad outline: its curved runs are that outline as it is, rounded
       hills; its straight runs roughen it into crags */
    const level = 0.3 + 0.1 * r();
    const broad = Array.from({ length: 3 }, () => [r(), 0.05 + 0.12 * r(), 0.08 + 0.2 * r()]);
    const count = 24 + Math.floor(r() * 13);
    const hs = Math.floor(r() * 65536);
    const heights: number[] = [];
    const curved: boolean[] = [];
    let curve = r() < 0.5;
    let left = 4 + Math.floor(r() * 6);
    for (let i = 0; i < count; i++) {
      const x = i / (count - 1);
      let y = level;
      for (const [at, high, wide] of broad)
        y += high * Math.exp(-((x - at) * (x - at)) / (wide * wide));
      if (i) curved.push(curve);
      heights.push(curve ? y : y + 0.11 * (auroraHash(i, hs) - 0.5));
      if (--left === 0) {
        curve = !curve;
        left = 4 + Math.floor(r() * 6);
      }
    }
    return auroraPathOf(curved, heights);
  }
  if (kind === "line") {
    /* a line: level, or leaning a little */
    const y = 0.22 + 0.3 * r();
    const lean = r() < 0.4 ? 0 : 0.2 * (r() - 0.5);
    return auroraPathOf(false, [
      Math.round((y - lean / 2) * 100) / 100,
      Math.round((y + lean / 2) * 100) / 100
    ]);
  }
  if (kind === "curve") {
    /* a curve: a few heights joined smoothly */
    const count = 4 + Math.floor(r() * 4);
    const y = 0.26 + 0.2 * r();
    return auroraPathOf(
      true,
      Array.from({ length: count }, () => Math.round((y + 0.24 * (r() - 0.5)) * 100) / 100)
    );
  }
  /* a jagged range: a few broad heights on a level, roughened. The designed one rises to a height left of the
     middle, dips at the middle and rises to a lower one on the right. */
  const broad: number[][] =
    n === 0
      ? [
          [0.33, 0.085, 0.1],
          [0.65, 0.065, 0.085],
          [0.49, -0.025, 0.045],
          [0.02, 0.035, 0.11],
          [1.0, 0.05, 0.15]
        ]
      : Array.from({ length: 3 + Math.floor(r() * 3) }, () => [
          r(),
          0.02 + 0.1 * r() * r(),
          0.04 + 0.2 * r()
        ]);
  const level = n === 0 ? 0.375 : 0.33 + 0.08 * r();
  const rough = n === 0 ? 1.15 : 0.5 + 1.3 * r();
  const p = [r() * TAU, r() * TAU, r() * TAU, r() * TAU];
  const hs = Math.floor(r() * 65536);
  const count = 48;
  return auroraPathOf(
    false,
    Array.from({ length: count }, (_, i) => {
      const x = i / (count - 1);
      let y = level;
      for (const [at, high, wide] of broad)
        y += high * Math.exp(-((x - at) * (x - at)) / (wide * wide));
      return (
        y +
        rough *
          (0.011 * Math.sin(TAU * 3.4 * x + p[0]) +
            0.009 * Math.sin(TAU * 6.3 * x + p[1]) +
            0.006 * Math.sin(TAU * 10.7 * x + p[2]) +
            0.004 * Math.sin(TAU * 17.4 * x + p[3]) +
            0.016 * (auroraHash(i, hs) - 0.5))
      );
    })
  );
}
