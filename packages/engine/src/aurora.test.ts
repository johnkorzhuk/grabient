import { beforeAll, describe, expect, it } from "vitest";
import { rasterize, resvgReady } from "../test/raster.ts";
import {
  AURORA_HALF,
  AURORA_LOOP,
  AURORA_RAMP,
  AURORA_SLOTS,
  AURORA_SOFT,
  AURORA_TILE,
  auroraHash,
  auroraLight,
  auroraPieces,
  auroraPoint,
  auroraRamp,
  auroraRange,
  auroraScene,
  auroraSolid,
  auroraTiles,
  auroraTilesSteps,
  auroraTime
} from "./aurora.ts";
import {
  AURORA_FS,
  AURORA_TABLE,
  AURORA_VS,
  auroraSceneUniforms,
  auroraTable
} from "./aurora-gl.ts";
import {
  AURORA_DESIGNED_PATH,
  AURORA_PATH_MOST,
  auroraPath,
  auroraPathOf,
  auroraPathParts
} from "./aurora-path.ts";
import { AURORA_PATH_KINDS, auroraMadePath, auroraPathKind } from "./aurora-path-kinds.ts";
import { renderAurora } from "./aurora-render.ts";
import { auroraFileSvg, auroraFrameSvg, auroraStillSteps, auroraStillSvg } from "./aurora-svg.ts";
import { blobBackdrop } from "./blob.ts";
import { decodePalette } from "./codec.ts";
import { srgbToLch } from "./color.ts";
import { svgUrl } from "./css.ts";
import { type Effect, parseEffect } from "./effect.ts";
import { effectDrawn } from "./fx-frame.ts";
import type { Palette } from "./palette.ts";

const SEED = "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ";
const P = decodePalette(SEED) as Palette;
const BOX = { width: 320, height: 180 };
/* a block with upright walls on ground that steps, as aurora-path.ts writes one */
const BLOCK = "line,0:30,20:30,20:55,35:55,35:38,100:38";
const view = (path: string | null = null, bg: string | null = null, angle = 90) => ({
  angle,
  path,
  bg
});
const fnv = (bytes: Uint8Array) => {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193);
  return (h >>> 0).toString(16);
};

describe("the aurora's path", () => {
  it("is read as its words and heights say", () => {
    expect(auroraPathParts("line,33,33")).toEqual({
      heights: [0.33, 0.33],
      places: [0, 1],
      curved: [false],
      placed: false
    });
    expect(auroraPathParts("curve,30,55,35,60,30")).toMatchObject({
      heights: [0.3, 0.55, 0.35, 0.6, 0.3],
      places: [0, 0.25, 0.5, 0.75, 1],
      curved: [true, true, true, true]
    });
    /* a word joins the heights after it, the first of them to the height before the word */
    expect(auroraPathParts("line,25,25,curve,45,60,45,25,line,25,40,25")?.curved).toEqual([
      false,
      true,
      true,
      true,
      true,
      false,
      false,
      false
    ]);
    /* every height names its place: two at one place are an upright wall, never curved */
    expect(auroraPathParts(BLOCK)).toEqual({
      heights: [0.3, 0.3, 0.55, 0.55, 0.38, 0.38],
      places: [0, 0.2, 0.2, 0.35, 0.35, 1],
      curved: [false, false, false, false, false],
      placed: true
    });
    expect(auroraPathParts("curve,0:30,20:30,20:55,100:20")?.curved).toEqual([true, false, true]);
    /* a tenth at the finest, 0 to 100, 2 to 64 heights */
    expect(auroraPathParts("line,0,100")?.heights).toEqual([0, 1]);
    expect(auroraPathParts("line,33.3,66.7")?.heights.map(h => h.toFixed(3))).toEqual([
      "0.333",
      "0.667"
    ]);
    expect(auroraPathParts(`line,${Array(AURORA_PATH_MOST).fill(40).join(",")}`)).not.toBeNull();
  });

  it("is no path where it breaks a rule", () => {
    for (const no of [
      "",
      "line",
      "line,33",
      "33,33",
      "line,line,33,33",
      "line,33,33,curve",
      "line,33,,33",
      "line,101,3",
      "line,100.5,3",
      "line,33.33,3",
      "line,033,3",
      "line,-3,3",
      "line,3e1,3",
      "Line,33,33",
      "line, 33,33",
      "line,3:3,4",
      "line,3,4:4",
      "line,50:3,40:4",
      "line,101:3,40:4",
      "line,20:1,20:2,20:3,50:4",
      "line,0:2,0:3",
      "wave,33,33",
      `line,${Array(AURORA_PATH_MOST + 1)
        .fill(40)
        .join(",")}`
    ])
      expect(auroraPathParts(no), no).toBeNull();
    for (const no of [null, undefined, 33, ["line", 33, 33], {}])
      expect(auroraPathParts(no)).toBeNull();
  });

  it("drops what an outline does not need: a height written twice, a wall at the box's very side", () => {
    expect(auroraPathParts("line,0:30,50:40,50:40,100:30")).toMatchObject({
      heights: [0.3, 0.4, 0.3],
      places: [0, 0.5, 1]
    });
    expect(auroraPathParts("line,0:30,0:50,100:50")).toMatchObject({
      heights: [0.5, 0.5],
      places: [0, 1]
    });
    expect(auroraPathParts("line,0:30,100:30,100:50")).toMatchObject({
      heights: [0.3, 0.3],
      places: [0, 1]
    });
  });

  it("is written in one spelling, which a look keeps", () => {
    expect(auroraPathOf(false, [0.33, 0.33])).toBe("line,33,33");
    expect(auroraPathOf(true, [0.3, 0.55, 0.35])).toBe("curve,30,55,35");
    expect(auroraPathOf([false, true, true, false], [0.25, 0.25, 0.45, 0.25, 0.4])).toBe(
      "line,25,25,curve,45,25,line,40"
    );
    /* places are written where they are not the even spacing's, and a wall goes by the piece before it */
    expect(auroraPathOf(false, [0.3, 0.3, 0.55], [0, 0.5, 1])).toBe("line,30,30,55");
    expect(auroraPathOf(false, [0.3, 0.3, 0.55, 0.55], [0, 0.2, 0.2, 1])).toBe(
      "line,0:30,20:30,20:55,100:55"
    );
    expect(auroraPathOf([true, false, true], [0.3, 0.3, 0.55, 0.2], [0, 0.2, 0.2, 1])).toBe(
      "curve,0:30,20:30,20:55,100:20"
    );
    /* heights are kept to a tenth, within the box, and no more than a path holds */
    expect(auroraPathOf(false, [0.33349, 1.4, -2])).toBe("line,33.3,100,0");
    expect(auroraPathParts(auroraPathOf(false, Array(80).fill(0.4)))?.heights).toHaveLength(
      AURORA_PATH_MOST
    );
    /* a look keeps the one spelling of any other: plain heights stay plain, evenly placed ones are written plainly */
    expect(auroraPath("line,33.0,33")).toBe("line,33,33");
    expect(auroraPath("line,25,25,line,40")).toBe("line,25,25,40");
    expect(auroraPath("line,10,20,30,40")).toBe("line,10,20,30,40");
    expect(auroraPath("line,0:10,50:20,100:30")).toBe("line,10,20,30");
    expect(auroraPath(BLOCK)).toBe(BLOCK);
    /* and what it keeps writes itself, where a path read once would not */
    expect(auroraPath("line,0:1,0:2,0:3,50:4")).toBe("line,0:3,50:4");
    expect(auroraPath("line,0:1,0:1,0:2,50:4")).toBe("line,0:2,50:4");
    /* the designed range is none, as anything that is no path is */
    expect(auroraPath(AURORA_DESIGNED_PATH)).toBeNull();
    expect(auroraPath("mountains")).toBeNull();
    expect(auroraPath(null)).toBeNull();
  });

  it("reads back every path made and many written at random, and never throws on what is none", () => {
    const paths: string[] = [];
    for (let n = 1; n <= 400; n++) paths.push(auroraMadePath(AURORA_PATH_KINDS[n % 5], n));
    /* placed paths: places rising by random steps (some none: a wall), words dropped in at random */
    for (let n = 0; n < 600; n++) {
      const r = (k: number) => auroraHash(k, n * 97 + 5);
      let x = Math.floor(r(0) * 200);
      let out = r(1) < 0.5 ? "line" : "curve";
      const count = 2 + Math.floor(r(2) * 30);
      for (let i = 0; i < count && x <= 1000; i++) {
        if (i && r(100 + i) < 0.15) out += r(200 + i) < 0.5 ? ",line" : ",curve";
        out += `,${x / 10}:${Math.round(r(300 + i) * 1000) / 10}`;
        x += r(400 + i) < 0.3 ? 0 : 1 + Math.floor(r(500 + i) * 120);
      }
      paths.push(out);
    }
    let read = 0;
    for (const path of paths) {
      const parts = auroraPathParts(path);
      if (!parts) continue;
      read++;
      /* what a look keeps of it is a path that reads as itself, and draws: every piece's numbers finite */
      const kept = auroraPath(path) ?? AURORA_DESIGNED_PATH;
      expect(auroraPath(kept) ?? AURORA_DESIGNED_PATH, path).toBe(kept);
      const pieces = auroraPieces(kept);
      expect(pieces.segs, path).toBeGreaterThan(0);
      expect([...pieces.segA, ...pieces.segB, ...pieces.rise].every(Number.isFinite), path).toBe(
        true
      );
    }
    expect(read).toBeGreaterThan(600);
    const alphabet = "linecurv,:.0123456789-x ";
    for (let n = 0; n < 3000; n++) {
      let text = "";
      for (let i = 0; i < 1 + Math.floor(auroraHash(n, 9) * 40); i++)
        text += alphabet[Math.floor(auroraHash(i, n * 13 + 1) * alphabet.length)];
      expect(() => auroraPath(auroraHash(n, 3) < 0.5 ? `line,${text}` : text)).not.toThrow();
    }
  });

  it("is made of a kind from a number, the designed range from 0", () => {
    expect(auroraMadePath("range", 0)).toBe(AURORA_DESIGNED_PATH);
    expect(auroraPathParts(AURORA_DESIGNED_PATH)?.heights).toHaveLength(48);
    for (const kind of AURORA_PATH_KINDS)
      for (let n = 1; n <= 40; n++) {
        const path = auroraMadePath(kind, n);
        expect(auroraPathKind(path), `${kind} ${n}`).toBe(kind);
        expect(auroraPath(path), `${kind} ${n}`).toBe(path);
        expect(auroraMadePath(kind, n)).toBe(path);
      }
    expect(auroraMadePath("range", 1)).not.toBe(auroraMadePath("range", 2));
    expect(auroraPathKind(BLOCK)).toBe("skyline");
    expect(auroraPathKind("line,25,25,curve,45,60,45,25,line,25,40,25")).toBe("mix");
    expect(auroraPathKind("line,20,45")).toBe("line");
  });
});

describe("the aurora's design", () => {
  it("reads one noise, made once: two tiles of four channels that fill 0 to 255", () => {
    const tiles = auroraTiles();
    expect(auroraTiles()).toBe(tiles);
    const steps = auroraTilesSteps();
    expect(steps.next()).toEqual({ done: true, value: tiles });
    for (const tile of [tiles.noise, tiles.soft]) {
      expect(tile).toHaveLength(AURORA_TILE * AURORA_TILE * 4);
      for (let c = 0; c < 4; c++) {
        let lo = 255;
        let hi = 0;
        for (let i = c; i < tile.length; i += 4) {
          lo = Math.min(lo, tile[i]);
          hi = Math.max(hi, tile[i]);
        }
        expect([lo, hi]).toEqual([0, 255]);
      }
    }
    /* the bytes the look was designed on: another noise is another aurora */
    expect(fnv(tiles.noise)).toBe("e48aa1d1");
    expect(fnv(tiles.soft)).toBe("b050f7cf");
  });

  it("reads the light through the whole palette, its darker end first, and on to a tip as light as any of it", () => {
    const light = (ramp: Float32Array, i: number) =>
      srgbToLch([ramp[i * 3], ramp[i * 3 + 1], ramp[i * 3 + 2]])[0];
    for (const seed of [SEED, "kWKxfe1GRDVfIxNzPsjbDZKA", "kYAABnAAA_wAAQEAAD8kpHAR6VwS"]) {
      const palette = decodePalette(seed) as Palette;
      const ramp = auroraRamp(palette);
      expect(ramp).toHaveLength(AURORA_RAMP * 3);
      /* the least light is the palette's darker end, whichever way the palette runs */
      const ends = [0, 1].map(t => light(auroraRamp(palette), t * (AURORA_RAMP - 1)));
      expect(ends[0], seed).toBeLessThan(ends[1]);
      /* the hottest light is as light as every color before it, or as near white as the tip goes, and all of it
         is a color */
      const tip = light(ramp, AURORA_RAMP - 1);
      for (let i = 0; i < AURORA_RAMP - 1; i++)
        expect(Math.min(light(ramp, i), 0.98), `${seed} ${i}`).toBeLessThanOrEqual(tip);
      expect(ramp.every(v => v >= 0 && v <= 1)).toBe(true);
    }
  });

  it("lays its 16 by 9 picture in the square of the box's longer side, turned by the angle", () => {
    const wide = auroraScene(P, view(), { width: 1280, height: 720 });
    expect([wide.ext, wide.half, wide.cs, wide.sn]).toEqual([720, AURORA_HALF, 1, 0]);
    expect(auroraScene(P, view(), { width: 1000, height: 1000 }).ext).toBe(562.5);
    expect(auroraScene(P, view(), { width: 360, height: 640 }).ext).toBe(360);
    /* a 16:9 box at 90 shows the picture whole: its corners are the picture's */
    const at = [0, 0];
    auroraPoint(wide, 0, 720, at);
    expect(at[0]).toBeCloseTo(-AURORA_HALF, 12);
    expect(at[1]).toBeCloseTo(0, 12);
    auroraPoint(wide, 1280, 0, at);
    expect(at[0]).toBeCloseTo(AURORA_HALF, 12);
    expect(at[1]).toBeCloseTo(1, 12);
    /* turned, the picture's up is the angle's way: 0 runs bottom to top, so its up is the box's left */
    const turned = auroraScene(P, view(null, null, 0), { width: 1280, height: 720 });
    auroraPoint(turned, 640 - 360, 360, at);
    expect(at[0]).toBeCloseTo(0, 12);
    expect(at[1]).toBeCloseTo(1, 12);
  });

  it("draws one square for every box: a box's picture is its middle of the square's, to the byte", () => {
    for (const [angle, path, bg] of [
      [90, null, null],
      [210, BLOCK, "#10203080"]
    ] as const) {
      const square = renderAurora(
        auroraScene(P, view(path, bg, angle), { width: 160, height: 160 }),
        7
      );
      const wide = renderAurora(
        auroraScene(P, view(path, bg, angle), { width: 160, height: 90 }),
        7
      );
      const tall = renderAurora(
        auroraScene(P, view(path, bg, angle), { width: 90, height: 160 }),
        7
      );
      expect(
        Buffer.compare(Buffer.from(wide), Buffer.from(square.subarray(35 * 160 * 4, 125 * 160 * 4)))
      ).toBe(0);
      for (let y = 0; y < 160; y += 7)
        expect(
          Buffer.compare(
            Buffer.from(tall.subarray(y * 90 * 4, (y + 1) * 90 * 4)),
            Buffer.from(square.subarray((y * 160 + 35) * 4, (y * 160 + 125) * 4))
          ),
          `row ${y}`
        ).toBe(0);
    }
  });

  it("stands the designed range in pieces with no wall, and a walled path with its walls", () => {
    const designed = auroraScene(P, view(), BOX);
    expect(designed.path).toBe(AURORA_DESIGNED_PATH);
    expect([designed.segs, designed.walls]).toEqual([47, false]);
    expect(auroraPieces(AURORA_DESIGNED_PATH)).toBe(auroraPieces(AURORA_DESIGNED_PATH));
    /* what is no path draws the designed range */
    expect(auroraPieces("mountains").segs).toBe(47);
    const block = auroraScene(P, view(BLOCK), BOX);
    expect([block.segs, block.walls]).toEqual([3, true]);
    /* each piece's places and heights, then the heights beside it, its own but where a wall stands between */
    const near = (a: ArrayLike<number>) => Array.from(a, v => Math.round(v * 1000) / 1000);
    expect(near(block.segA)).toEqual([
      0, 0.2, 0.3, 0.3, 0.2, 0.35, 0.55, 0.55, 0.35, 1, 0.38, 0.38
    ]);
    expect(near(block.segB).filter((_, i) => i % 4 > 1)).toEqual([
      0.3, 0.55, 0.3, 0.38, 0.55, 0.38
    ]);
    expect(block.slots).toHaveLength(AURORA_SLOTS);
    expect([block.slots[0], block.slots[AURORA_SLOTS - 1]]).toEqual([0, 2]);
  });

  it("softens the range's edge up and down, and as much across an upright wall", () => {
    const m = auroraScene(P, view(BLOCK), BOX);
    const at = [0, 0];
    const show = (s: number, Y: number) => {
      auroraRange(m, (s * 2 - 1) * m.half, Y, at);
      return at[0];
    };
    /* across the ground's edge at 0.3, far from any wall: none under it, all over it, a half on it */
    expect(show(0.1, 0.3 - 1.01 * AURORA_SOFT)).toBe(0);
    expect(show(0.1, 0.3)).toBeCloseTo(0.5, 4);
    expect(show(0.1, 0.3 + 1.01 * AURORA_SOFT)).toBe(1);
    /* across the block's left wall, half way up it: all of the light beside the block, none in it, a half on the
       wall, and no step anywhere between */
    const soft = AURORA_SOFT / (2 * m.half);
    expect(show(0.2 - 1.01 * soft, 0.42)).toBe(1);
    expect(show(0.2 + 1.01 * soft, 0.42)).toBe(0);
    expect(show(0.2 - 1e-9, 0.42)).toBeCloseTo(0.5, 4);
    expect(show(0.2 + 1e-9, 0.42)).toBeCloseTo(0.5, 4);
    let last = show(0.2 - soft, 0.42);
    for (let k = 1; k <= 200; k++) {
      const now = show(0.2 - soft + (2 * soft * k) / 200, 0.42);
      expect(last - now).toBeGreaterThanOrEqual(0);
      expect(last - now).toBeLessThan(0.02);
      last = now;
    }
    /* past the picture's sides the range goes on level from its ends */
    expect(show(-0.3, 0.2)).toBe(0);
    expect(show(-0.3, 0.4)).toBe(1);
    expect(show(1.3, 0.38)).toBeCloseTo(0.5, 4);
  });

  it("rises from one unbroken line: the path, eased toward the feet of its walls", () => {
    const at = [0, 0];
    const height = (m: ReturnType<typeof auroraScene>, s: number) => {
      auroraRange(m, (s * 2 - 1) * m.half, 0.9, at);
      return 0.9 - at[1];
    };
    /* a path with no wall: the path itself */
    const hills = auroraScene(P, view("curve,30,55,35,60,30"), BOX);
    expect(height(hills, 0)).toBeCloseTo(0.3, 6);
    expect(height(hills, 0.25)).toBeCloseTo(0.55, 6);
    expect(height(hills, 0.5)).toBeCloseTo(0.35, 6);
    /* a walled one: the path far from a wall, drawn down toward a wall's foot near it, and never a step: across
       the whole picture the line moves by less than a hundredth of its height a step of a thousandth of its width */
    const block = auroraScene(P, view(BLOCK), BOX);
    expect(height(block, 0.02)).toBeCloseTo(0.3, 3);
    expect(height(block, 0.8)).toBeCloseTo(0.38, 3);
    expect(height(block, 0.275)).toBeLessThan(0.55);
    expect(height(block, 0.275)).toBeGreaterThan(0.38);
    let last = height(block, 0);
    for (let k = 1; k <= 1000; k++) {
      const now = height(block, k / 1000);
      expect(Math.abs(now - last), `at ${k / 1000}`).toBeLessThan(0.01);
      last = now;
    }
  });

  it("ends its loop on its first frame, every sheet having slid whole tiles", () => {
    expect(auroraTime(0)).toBe(0);
    expect(auroraTime(AURORA_LOOP)).toBe(0);
    expect(auroraTime(12)).toBe(0.25);
    expect(auroraTime(-12)).toBe(0.75);
    const m = auroraScene(P, view(), BOX);
    const a = [0, 0, 0];
    const b = [0, 0, 0];
    for (let k = 0; k < 200; k++) {
      const X = (auroraHash(k, 1) * 2 - 1) * m.half;
      const Y = auroraHash(k, 2);
      const T = auroraHash(k, 3);
      auroraLight(m, T, X, Y, Y - 0.4, a);
      auroraLight(m, T + 1, X, Y, Y - 0.4, b);
      for (let c = 0; c < 3; c++) expect(b[c]).toBeCloseTo(a[c], 9);
    }
    /* and it moves between: a frame a third of a loop on is another picture */
    const first = renderAurora(m, 5);
    expect(Buffer.compare(Buffer.from(renderAurora(m, 5 + AURORA_LOOP)), Buffer.from(first))).toBe(
      0
    );
    let moved = 0;
    const later = renderAurora(m, 5 + AURORA_LOOP / 3);
    for (let i = 0; i < first.length; i++) if (Math.abs(first[i] - later[i]) > 8) moved++;
    expect(moved).toBeGreaterThan(first.length / 20);
  });
});

describe("the aurora's CPU drawing", () => {
  it("is the picture it was designed as: these pixels, on a range of a whole color", () => {
    /* the design's own drawing of these looks at 320 by 180, a few pixels each (x, y, then red, green, blue): the
       night at the top, the flames, the white-hot light over the range, and the range */
    for (const { path, bg, t, pixels } of [
      {
        path: null,
        bg: "#140b19",
        t: 5.3,
        pixels: [
          [20, 12, 185, 2, 18],
          [160, 30, 199, 4, 31],
          [300, 44, 206, 5, 37],
          [90, 70, 255, 144, 119],
          [228, 88, 255, 219, 160],
          [40, 100, 255, 122, 110],
          [160, 104, 252, 253, 229],
          [275, 96, 254, 251, 177],
          [120, 118, 20, 11, 25],
          [10, 170, 20, 11, 25],
          [200, 150, 20, 11, 25],
          [318, 2, 214, 0, 46]
        ]
      },
      {
        path: "line,33,33",
        bg: "#140b19",
        t: 31.7,
        pixels: [
          [20, 12, 202, 4, 33],
          [160, 30, 204, 5, 35],
          [300, 44, 207, 4, 38],
          [90, 70, 241, 48, 76],
          [228, 88, 255, 223, 162],
          [40, 100, 255, 236, 168],
          [160, 104, 254, 193, 145],
          [275, 96, 255, 222, 161],
          [120, 118, 249, 94, 96],
          [10, 170, 20, 11, 25],
          [200, 150, 20, 11, 25],
          [318, 2, 206, 5, 37]
        ]
      },
      {
        path: "curve,30,55,35,60,30",
        bg: "#f4efe6",
        t: 47.5,
        pixels: [
          [20, 12, 194, 3, 26],
          [160, 30, 229, 21, 62],
          [300, 44, 211, 2, 43],
          [90, 70, 254, 254, 184],
          [228, 88, 244, 239, 230],
          [40, 100, 251, 184, 163],
          [160, 104, 251, 252, 236],
          [275, 96, 244, 239, 230],
          [120, 118, 244, 239, 230],
          [10, 170, 244, 239, 230],
          [200, 150, 244, 239, 230],
          [318, 2, 187, 2, 20]
        ]
      }
    ]) {
      const px = renderAurora(auroraScene(P, view(path, bg), BOX), t);
      for (const [x, y, ...rgb] of pixels) {
        const i = (y * BOX.width + x) * 4;
        /* to the level: a sine or an exponential an engine rounds another way may turn a byte by one */
        for (let c = 0; c < 3; c++)
          expect(Math.abs(px[i + c] - rgb[c]), `${path} at ${x}, ${y}`).toBeLessThanOrEqual(1);
        expect(px[i + 3]).toBe(255);
      }
    }
  });

  it("lets the page through a range with no color, wholly, and through one that lets it, in part", () => {
    const clear = renderAurora(auroraScene(P, view(), BOX), 0);
    const half = renderAurora(auroraScene(P, view(null, "#10203080"), BOX), 0);
    const whole = renderAurora(auroraScene(P, view(null, "#102030"), BOX), 0);
    const at = (px: Uint8ClampedArray, x: number, y: number) => [
      ...px.subarray((y * BOX.width + x) * 4, (y * BOX.width + x) * 4 + 4)
    ];
    /* deep in the range: clear with none of its color, the range's color at its cover, the range's color */
    expect(at(clear, 160, 160)).toEqual([0, 0, 0, 0]);
    expect(at(half, 160, 160)).toEqual([16, 32, 48, 128]);
    expect(at(whole, 160, 160)).toEqual([16, 32, 48, 255]);
    /* in the light: the same opaque color whatever the range is */
    expect(at(clear, 160, 20)[3]).toBe(255);
    expect(at(half, 160, 20)).toEqual(at(clear, 160, 20));
    expect(at(whole, 160, 20)).toEqual(at(clear, 160, 20));
    /* across the edge the picture thins from the one to the other: every alpha from the range's to whole */
    for (const [px, least] of [
      [clear, 0],
      [half, 128],
      [whole, 255]
    ] as const) {
      const alphas = new Set<number>();
      for (let y = 0; y < BOX.height; y++) alphas.add(px[(y * BOX.width + 160) * 4 + 3]);
      expect(Math.min(...alphas)).toBe(least);
      expect(Math.max(...alphas)).toBe(255);
      if (least < 255) expect(alphas.size).toBeGreaterThan(2);
    }
    /* a picture that cannot be clear lays the range over a ground it is given, in whole bytes */
    const solid = auroraSolid(auroraScene(P, view(null, "#10203080"), BOX), [14, 14, 16]);
    expect(solid.cover).toBe(1);
    expect(at(renderAurora(solid, 0), 160, 160)).toEqual([15, 23, 32, 255]);
    expect(
      at(renderAurora(auroraSolid(auroraScene(P, view(), BOX), [14, 14, 16]), 0), 160, 160)
    ).toEqual([14, 14, 16, 255]);
    const full = auroraScene(P, view(null, "#102030"), BOX);
    expect(auroraSolid(full, [14, 14, 16])).toBe(full);
  });

  it("draws a card that is never clear: its range over the ground a blob's card takes", async () => {
    const effect = (bg: string | null) => ({ ...parsed, look: { ...parsed.look, bg } });
    const parsed = parseEffect(new URLSearchParams("style=aurora")) as Effect;
    const card = await effectDrawn(P, effect(null), 90, BOX, true);
    expect(card.backdrop).toEqual(blobBackdrop(P));
    for (let i = 3; i < card.pixels.length; i += 4) expect(card.pixels[i]).toBe(255);
    const range = (160 * BOX.width + 160) * 4;
    expect([...card.pixels.subarray(range, range + 3)]).toEqual(blobBackdrop(P));
    /* a picture that may be clear is: the same look's file */
    expect((await effectDrawn(P, effect(null), 90, BOX)).pixels[range + 3]).toBe(0);
    /* a range of a whole color needs no ground under it */
    expect((await effectDrawn(P, effect("#102030"), 90, BOX, true)).backdrop).toBeUndefined();
  });
});

describe("the aurora's SVGs", () => {
  beforeAll(resvgReady);

  it("writes a frame as shapes alone, for every reader of SVG: no filter, no picture, no script", () => {
    const svg = auroraFrameSvg(P, view(BLOCK, "#10203080"), BOX, 7);
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" [^>]*width="320" height="180" viewBox="0 0 320 180">/
    );
    expect(svg).not.toMatch(/<filter|<image|<script|<foreignObject|@keyframes|<animate|<style/);
    /* a copy names its shape as SVG 1.1 does, and nothing names anything outside the file */
    expect(svg).not.toMatch(/[^:]href=/);
    expect(svg).not.toMatch(/href="(?!#)/);
    /* its file is its first frame, the same at the same time, another at another */
    expect(auroraFileSvg(P, view(), BOX)).toBe(auroraFrameSvg(P, view(), BOX, 0));
    expect(auroraFrameSvg(P, view(), BOX, AURORA_LOOP)).toBe(auroraFrameSvg(P, view(), BOX, 0));
    expect(auroraFrameSvg(P, view(), BOX, 7)).not.toBe(auroraFrameSvg(P, view(), BOX, 0));
    /* the range's color lies under the light, at its cover; a clear range lays none */
    expect(svg).toContain('<rect width="320" height="180" fill="#102030" fill-opacity=".50196"/>');
    expect(auroraFrameSvg(P, view(), BOX, 7)).not.toMatch(/<rect width="320" height="180"/);
  });

  it("writes only the wedges that show: a higher range hides more of the fan", () => {
    const wedges = (path: string) =>
      auroraFrameSvg(P, view(path), BOX, 0).match(/<path d="M[^"]*" fill="url\(#w\d+\)"\/>/g)
        ?.length ?? 0;
    const low = wedges("line,5,5");
    const high = wedges("line,70,70");
    expect(low).toBeGreaterThan(100);
    expect(high).toBeLessThan(low * 0.7);
    /* a range to the box's top leaves its soft edge alone to write: a few wedges, some three stops each */
    const top = auroraFrameSvg(P, view("line,100,100"), BOX, 0);
    expect(wedges("line,100,100")).toBeLessThan(high / 2);
    expect(top.match(/<stop /g)?.length).toBeLessThanOrEqual(3 * wedges("line,100,100"));
  });

  it("stops resvg at no angle, walls or none", () => {
    /* resvg 2.6.2 panics on a layer inside a mask (an opacity, or a mask of its own, on a wall's strip) once the
       masked wedges reach well past the picture's top, as they do turned on their side */
    const skyline = auroraMadePath("skyline", 3);
    for (const angle of [0, 1, 45, 90, 180, 270, 359])
      for (const path of [null, skyline]) {
        const svg = auroraFrameSvg(P, view(path, null, angle), BOX, 0);
        expect(() => rasterize(svg, BOX.width), `angle ${angle}`).not.toThrow();
        const still = auroraStillSvg(P, view(path, null, angle), BOX);
        expect(() => rasterize(still, BOX.width), `still, angle ${angle}`).not.toThrow();
      }
  });

  it("stills under one blur, within the weight a list's card may have, whatever the look", () => {
    const still = auroraStillSvg(P, view(), { width: 1000, height: 1000 });
    expect(still.match(/<filter/g)).toHaveLength(1);
    expect(still).toContain("<feGaussianBlur");
    expect(still).not.toMatch(/<image|<script|<foreignObject|@keyframes|<animate|xlink/);
    /* a step at a time it is the same still */
    const steps = auroraStillSteps(P, view(), { width: 1000, height: 1000 });
    let count = 0;
    let step = steps.next();
    while (!step.done) {
      count++;
      step = steps.next();
    }
    expect(step.value).toBe(still);
    expect(count).toBeGreaterThan(8);
    /* the most light a box holds, in a palette of many colors, at any angle: cut coarser, never over the weight */
    const many = decodePalette("kWKxfe1GRDVfIxNzPsjbDZKA") as Palette;
    const weights: number[] = [];
    for (const path of [null, "line,0,0", auroraMadePath("skyline", 3)])
      for (const angle of [90, 45, 210]) {
        const heavy = auroraStillSvg(many, view(path, null, angle), { width: 1000, height: 1000 });
        weights.push(`${svgUrl(heavy)} 50% 50% / cover no-repeat`.length);
      }
    expect(Math.max(...weights)).toBeLessThan(40 * 1024);
    expect(Math.min(...weights)).toBeGreaterThan(20 * 1024);
  });
});

describe("the aurora's pass", () => {
  it("is written for WebGL 2, with no word its GLSL keeps for itself as a name", () => {
    expect(AURORA_VS.startsWith("#version 300 es")).toBe(true);
    expect(AURORA_FS.startsWith("#version 300 es")).toBe(true);
    expect(AURORA_FS).not.toMatch(/\$\{|undefined|NaN/);
    for (const word of [
      "flat",
      "smooth",
      "sample",
      "patch",
      "input",
      "output",
      "filter",
      "active",
      "half",
      "fixed"
    ])
      expect(AURORA_FS, word).not.toMatch(new RegExp(`\\b(float|int|vec[234])\\s+${word}\\b`));
    for (const name of ["uSize", "uFrame", "uPath", "uRange", "uTime", "uTable", "uNoise", "uSoft"])
      expect(AURORA_FS).toMatch(new RegExp(`uniform \\w+ ${name};`));
  });

  it("takes the scene's numbers as one table of floats and a few plain uniforms", () => {
    const m = auroraScene(P, view(BLOCK, "#10203080", 210), BOX);
    const table = auroraTable(m);
    const W = AURORA_TABLE.width;
    expect(table).toHaveLength(W * AURORA_TABLE.height * 4);
    /* a row each: the ramp, the pieces' two rows, the slots, the line the light rises from */
    expect([...table.subarray(0, 4)]).toEqual([m.ramp[0], m.ramp[1], m.ramp[2], 1]);
    expect([...table.subarray((AURORA_RAMP - 1) * 4, AURORA_RAMP * 4 - 1)]).toEqual([
      ...m.ramp.subarray((AURORA_RAMP - 1) * 3)
    ]);
    expect([...table.subarray(W * 4, W * 4 + 12)]).toEqual([...m.segA]);
    expect([...table.subarray(W * 8, W * 8 + 12)]).toEqual([...m.segB]);
    expect(table[(W * 3 + AURORA_SLOTS - 1) * 4]).toBe(2);
    expect(table[(W * 4 + 500) * 4]).toBe(m.rise[500]);
    const u = auroraSceneUniforms(m);
    expect([...u.frame]).toEqual([Math.fround(m.cs), Math.fround(m.sn), 180]);
    expect([...u.path]).toEqual([Math.fround(AURORA_HALF), 3, 1]);
    /* the range's color comes premultiplied by its cover */
    const cover = 128 / 255;
    expect([...u.range]).toEqual(
      [(16 / 255) * cover, (32 / 255) * cover, (48 / 255) * cover, cover].map(Math.fround)
    );
    expect([...auroraSceneUniforms(auroraScene(P, view(), BOX)).range]).toEqual([0, 0, 0, 0]);
  });
});
