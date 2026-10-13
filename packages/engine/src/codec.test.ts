import { describe, expect, test } from "vitest";
import { golden, lcg } from "../test/support.ts";
import { BASE64URL, canonical, decodePalette, encodePalette } from "./codec.ts";
import {
  hexToSrgb,
  lchToP3,
  lchToSrgb,
  srgbToLch,
  srgbToOklab,
  type Triple,
  toCssP3,
  toHex
} from "./color.ts";
import { sampleHex, sampleLCH, sampleSrgb, sampleStops } from "./curve.ts";
import type { Anchor, Palette } from "./palette.ts";
import { anchorsFromHexes, hexAnchor } from "./spec.ts";

interface FixturePalette {
  id: string;
  seed: string;
  canonicalSeed: string;
  version: number;
  length: number;
  keyframes: number;
  decoded: Anchor[];
  canonicalIdempotent: boolean;
  input?: { anchors?: Anchor[] };
  inputSeed?: string;
  lch17: Triple[];
  stops: Record<"3" | "7" | "100", string[]>;
  stops7: { t: number; rgb: Triple; lch: Triple; oklch: string }[];
  p3Stops7: string[];
}
const { palettes } = golden<{ palettes: FixturePalette[] }>("palettes");
const decode = (seed: string) => decodePalette(seed) as Palette;
const version = (seed: string) => BASE64URL.indexOf(seed[1]) >> 4;
const hexOf = (a: Anchor) => toHex(lchToSrgb(a.l, a.c, a.own ?? a.h));

test("every fixture palette encodes, decodes and samples exactly as before", () => {
  for (const p of palettes) {
    const P = decode(p.seed);
    const seed = encodePalette(P);
    expect(seed, p.id).toBe(p.canonicalSeed);
    expect([version(seed), seed.length, P.anchors.length]).toEqual([
      p.version,
      p.length,
      p.keyframes
    ]);
    expect(P.anchors, p.id).toEqual(p.decoded);
    expect(encodePalette(canonical(canonical(P))) === seed).toBe(p.canonicalIdempotent);
    if (p.input?.anchors) expect(encodePalette({ anchors: p.input.anchors })).toBe(p.inputSeed);
    expect(Array.from({ length: 17 }, (_, i) => sampleLCH(P, i / 16))).toEqual(p.lch17);
    for (const n of ["3", "7", "100"] as const)
      expect(sampleStops(P, +n).map(s => s.hex)).toEqual(p.stops[n]);
    const stops = sampleStops(P, 7);
    expect(stops.map(({ t, rgb, lch }) => ({ t, rgb, lch }))).toEqual(
      p.stops7.map(({ t, rgb, lch }) => ({ t, rgb, lch }))
    );
    expect(stops.map(s => toCssP3(lchToP3(...s.lch)))).toEqual(p.p3Stops7);
  }
});

test("decode after encode is bit-exact and canonical is idempotent", () => {
  const rand = lcg(20260830);
  for (let t = 0; t < 2000; t++) {
    const k = 2 + Math.floor(rand() * 7);
    const anchors = [{ l: rand(), c: rand() * 0.35, h: rand() * 360 }];
    for (let i = 1; i < k; i++)
      anchors.push({ l: rand(), c: rand() * 0.35, h: anchors[i - 1].h + (rand() * 2 - 1) * 540 });
    const seed = encodePalette({ anchors });
    expect(encodePalette(decode(seed))).toBe(seed);
    expect(seed).toHaveLength([11, 15, 20, 24, 28, 33, 37][k - 2]);
  }
});

test("a palette turned by whole turns is the same seed", () => {
  const P = decode("kcgI_BPOBA0BgwZI1sK2LpDueoxrwLsS764_g");
  for (const turns of [-3, -1, 1, 2]) {
    expect(encodePalette({ anchors: P.anchors.map(a => ({ ...a, h: a.h + 360 * turns })) })).toBe(
      encodePalette(P)
    );
  }
});

describe("what is no seed", () => {
  const good = encodePalette({
    anchors: [
      { l: 0.9, c: 0.05, h: 40 },
      { l: 0.2, c: 0.1, h: 300 }
    ]
  });
  test("cut short, padded, another first letter or a character outside the alphabet", () => {
    for (const bad of [
      good.slice(0, -1),
      `${good}AA`,
      `x${good.slice(1)}`,
      "k!!!",
      "",
      "k",
      7,
      null
    ]) {
      expect(decodePalette(bad)).toBeNull();
    }
  });
  test("version 2 or 3, or more than 8 keyframes", () => {
    const seed = "kSPTq14zC4voJMs";
    const first = BASE64URL.indexOf(seed[1]);
    const head = (bits: number) => `k${BASE64URL[bits]}${seed.slice(2)}`;
    for (const v of [2, 3]) expect(decodePalette(head((first & 0b001111) | (v << 4)))).toBeNull();
    expect(decodePalette(head((first & 0b110001) | (7 << 1)))).toBeNull();
  });
  test("turn 3, a gray written as a hex color or as a near gray", () => {
    const bits = (text: string) => {
      let out = "k";
      for (let i = 0; i < text.length; i += 6)
        out += BASE64URL[parseInt(text.slice(i, i + 6).padEnd(6, "0"), 2)];
      return out;
    };
    const head = "000000";
    const hex = (n: number, turn = "") => `01${n.toString(2).padStart(24, "0")}${turn}`;
    expect(decodePalette(bits(head + hex(0xff0000) + hex(0x0000ff, "00")))).not.toBeNull();
    for (const broken of [
      head + hex(0xff0000) + hex(0x0000ff, "11"),
      head + hex(0x808080) + hex(0x0000ff, "00"),
      `${head}11${(0x808080).toString(2).padStart(24, "0")}${"0".repeat(9)}${hex(0x0000ff, "00")}`
    ]) {
      expect(decodePalette(bits(broken))).toBeNull();
    }
  });
  test("a word of a collection's or a search's address", () => {
    for (const words of [
      "kingfisher-blue",
      "kitchen-garden",
      "kimono-red-and-gold",
      "knitted-wool",
      "khaki-coded"
    ]) {
      expect(decodePalette(words)).toBeNull();
    }
  });
});

test("a set reserved bit or fill bits decode, and the seed is written canonically", () => {
  const seed = "kSPTq14zC4voJMs";
  const reserved = `k${BASE64URL[BASE64URL.indexOf(seed[1]) ^ 1]}${seed.slice(2)}`;
  const filled = seed.slice(0, -1) + BASE64URL[BASE64URL.indexOf(seed.at(-1) as string) | 1];
  for (const spelling of [reserved, filled]) {
    expect(spelling).not.toBe(seed);
    expect(encodePalette(decode(spelling))).toBe(seed);
  }
});

describe("hex keyframes", () => {
  test("a hex color reads back as that hex, drawn at its place, its lap kept", () => {
    const rand = lcg(20261009);
    const anyHex = () => toHex([rand(), rand(), rand()]);
    const gray = (v: number) => toHex([v / 255, v / 255, v / 255]);
    const nearGray = () => {
      const v = 20 + Math.floor(rand() * 220);
      return toHex([0, 0, 0].map(() => (v + Math.floor(rand() * 5) - 2) / 255));
    };
    const colored = (hex: string | null) => !!hex && srgbToLch(hexToSrgb(hex) as Triple)[1] >= 0.01;
    for (let t = 0; t < 1000; t++) {
      const k = 2 + Math.floor(rand() * 7);
      const anchors: Anchor[] = [];
      const asked: (string | null)[] = [];
      for (let i = 0; i < k; i++) {
        const near = i ? anchors[i - 1].h : rand() * 720 - 360;
        const pick = rand();
        const hex =
          pick < 0.5
            ? anyHex()
            : pick < 0.6
              ? nearGray()
              : pick < 0.8
                ? gray(Math.floor(rand() * 256))
                : null;
        asked.push(hex);
        anchors.push(
          hex
            ? hexAnchor(hexToSrgb(hex) as Triple, near + (rand() * 2 - 1) * 350)
            : { l: rand(), c: rand() * 0.35, h: near + (rand() * 2 - 1) * 350 }
        );
      }
      const seed = encodePalette({ anchors });
      const back = decode(seed);
      expect(encodePalette(back)).toBe(seed);
      back.anchors.forEach((a, i) => {
        const hex = asked[i];
        if (hex) expect([hexOf(a), sampleHex(back, i / (k - 1))]).toEqual([hex, hex]);
      });
      for (let i = 1; i < k; i++) {
        if (colored(asked[i]) && colored(asked[i - 1])) {
          expect(back.anchors[i].h - back.anchors[i - 1].h).toBeCloseTo(
            anchors[i].h - anchors[i - 1].h,
            6
          );
        }
      }
    }
  });
  test("seed lengths: 11 to 39 for hex colors, near grays up to the longest seed, 50", () => {
    const PAPERS = [
      "#f7f7f2",
      "#e5e7eb",
      "#f4f1ea",
      "#f8fafc",
      "#fafaf9",
      "#f1f5f9",
      "#fffdf7",
      "#f6f9fc"
    ];
    const VIVID = [
      "#ff5a5f",
      "#00a699",
      "#fc642d",
      "#3b82f6",
      "#7d7ce3",
      "#22aa66",
      "#e4002b",
      "#635bff"
    ];
    for (let k = 2; k <= 8; k++) {
      const colors = encodePalette(anchorsFromHexes(VIVID.slice(0, k)) as Palette);
      const papers = encodePalette(
        anchorsFromHexes(["#ff5a5f", ...PAPERS.slice(0, k - 1)]) as Palette
      );
      expect([colors.length, papers.length]).toEqual([
        [11, 16, 21, 25, 30, 35, 39][k - 2],
        [13, 19, 25, 31, 37, 43, 49][k - 2]
      ]);
      expect(colors).toMatch(/^k[A-P][A-Za-z0-9_-]+$/);
    }
    const longest = encodePalette({
      anchors: PAPERS.map((hex, i) => hexAnchor(hexToSrgb(hex) as Triple, 30 + i * 50))
    });
    expect(longest).toHaveLength(50);
    expect(encodePalette(decode(longest))).toBe(longest);
  });
  test("every gray is a keyframe as it is; black and white are grid codes", () => {
    for (let v = 0; v < 256; v++) {
      const hex = toHex([v / 255, v / 255, v / 255]);
      const P = canonical({
        anchors: [hexAnchor(hexToSrgb(hex) as Triple, 40), { l: 0.5, c: 0.1, h: 60 }]
      });
      expect(hexOf(P.anchors[0])).toBe(hex);
    }
    expect(encodePalette(anchorsFromHexes(["#ffffff", "#000000"]) as Palette)).toBe("kQ_gBAAAA_4");
    const blue = decode("kAP4AvCAAH-A");
    expect(blue.anchors.map(hexOf)).toEqual(["#ffffff", "#0000ff"]);
  });
  test("a near gray keeps its tint and bends no blend", () => {
    const lab = (P: Palette, t: number) => srgbToOklab(...sampleSrgb(P, t));
    const apart = (P: Palette, Q: Palette) =>
      Math.max(
        ...Array.from({ length: 65 }, (_, i) => {
          const [a, b] = [lab(P, i / 64), lab(Q, i / 64)];
          return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        })
      );
    for (const [paper, vivid] of [
      ["#f7f7f2", "#0000ff"],
      ["#e5e7eb", "#f97316"],
      ["#191414", "#1db954"]
    ]) {
      const P = canonical(anchorsFromHexes([paper, vivid]) as Palette);
      const tint = srgbToLch(hexToSrgb(paper) as Triple);
      const carried = { anchors: P.anchors.map(({ l, c, h }) => ({ l, c, h })) };
      expect([sampleHex(P, 0), sampleHex(P, 1), P.anchors[0].own]).toEqual([paper, vivid, tint[2]]);
      expect(apart(P, carried)).toBeLessThan(2 * tint[1] + 1e-9);
      /* moving it puts it on the grid at the hue it carries */
      expect(
        canonical({ anchors: [{ ...P.anchors[0], l: P.anchors[0].l - 0.05 }, P.anchors[1]] })
          .anchors[0].own
      ).toBeUndefined();
    }
  });
});

test("the curve passes through every anchor", () => {
  const rand = lcg(7);
  for (let t = 0; t < 50; t++) {
    const k = 2 + Math.floor(rand() * 7);
    const anchors = Array.from({ length: k }, (_, i) => ({
      l: 0.1 + 0.8 * rand(),
      c: 0.02 + rand() * 0.2,
      h: i * 30
    }));
    anchors.forEach((a, i) => {
      const [l, c, h] = sampleLCH({ anchors }, i / (k - 1));
      expect([l - a.l, c - a.c, h - a.h].every(d => Math.abs(d) < 1e-9)).toBe(true);
    });
  }
});
