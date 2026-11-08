import { describe, expect, it } from "vitest";
import { decodePalette } from "./codec.ts";
import { hexBytes, lchToSrgb, srgbToLch } from "./color.ts";
import { sampleSrgb } from "./curve.ts";
import { CLEAR_GROUND } from "./effect.ts";
import {
  STRINGS_FRAME_SIZE,
  STRINGS_LOOK,
  STRINGS_LOOP,
  STRINGS_STOPS,
  stringsDesign,
  stringsFrameAt,
  stringsHash,
  stringsRank,
  stringsScene,
  stringsScratch,
  stringsShade,
  stringsSolid
} from "./strings.ts";
import { stringsDesignedGround } from "./strings-ground.ts";
import { renderStrings } from "./strings-render.ts";
import { stringsFrameOf, stringsStillOf, stringsStillSteps } from "./strings-svg.ts";

const P = decodePalette("kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ")!;
/* a dark navy palette, whose threads would sink into a ground of its own darkest color unlifted */
const NAVY = decodePalette("kUMzO5Na871ukuyhHUJA")!;
/* a pastel palette, whose threads would sink into a light ground unlowered */
const PASTEL = decodePalette("kWnCIwwC47igfOklkTlShq44")!;
const L = (rgb: readonly number[]) => srgbToLch(rgb)[0];
const stopsOf = (m: { stops: number[] }) =>
  Array.from({ length: STRINGS_STOPS }, (_, i) => m.stops.slice(3 * i, 3 * i + 3));

describe("the strings' design", () => {
  it("is the same for the same shape, another for another, and shape 0 is the designed one", () => {
    expect(stringsDesign(417)).toEqual(stringsDesign(417));
    expect(stringsDesign(417)).not.toEqual(stringsDesign(418));
    expect(stringsDesign(0)).toEqual(stringsDesign(null));
    for (const shape of [null, 1, 999]) {
      const d = stringsDesign(shape);
      for (const v of [...d.shears, ...d.waves, ...d.lumps]) {
        expect(Math.hypot(v.dx, v.dy)).toBeCloseTo(1, 5);
        expect([1, 2]).toContain(v.cycles);
        expect(v.swing).toBeGreaterThan(0);
        expect(v.swing).toBeLessThan(2.25);
      }
    }
  });

  it("moves in whole cycles of its loop, so the frame a loop on is the first", () => {
    const m = stringsScene(P, { angle: 135, shape: 7, bg: null }, { width: 64, height: 48 });
    const [a, b] = [new Float64Array(STRINGS_FRAME_SIZE), new Float64Array(STRINGS_FRAME_SIZE)];
    for (const t of [0, 12.5, 90]) {
      stringsFrameAt(m, t, a);
      stringsFrameAt(m, t + 3 * STRINGS_LOOP, b);
      for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i], 9);
    }
  });

  it("hashes and ranks a thread by integers alone", () => {
    expect(stringsRank(0)).toBe(30);
    expect([1, 2, 3, 4, 8, -8, 12, -1].map(stringsRank)).toEqual([0, 1, 0, 2, 3, 3, 2, 0]);
    for (const k of [-300, -1, 0, 1, 77, 4000]) {
      const h = stringsHash(k);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
    }
  });

  it("lays its threads off a deep ground: every stop stands at least its lift above it", () => {
    for (const palette of [P, NAVY]) {
      const m = stringsScene(
        palette,
        { angle: 90, shape: null, bg: null },
        { width: 9, height: 9 }
      );
      const ground = srgbToLch(m.ground)[0];
      /* its lightness at most 0.16 before its channels are rounded to bytes */
      expect(ground).toBeLessThanOrEqual(0.165);
      for (let i = 0; i < STRINGS_STOPS; i++)
        expect(srgbToLch(m.stops.slice(3 * i, 3 * i + 3))[0]).toBeGreaterThan(ground + 0.41);
    }
  });
});

describe("the strings' ground", () => {
  it("is the designed one where the view names none, its stops lifted as they always were, to the bit", () => {
    for (const palette of [P, NAVY, PASTEL]) {
      const m = stringsScene(
        palette,
        { angle: 90, shape: null, bg: null },
        { width: 9, height: 9 }
      );
      /* the designed ground and the stops as the strings worked them out before they took a ground */
      let darkest = sampleSrgb(palette, 0);
      for (let i = 0; i <= 16; i++) {
        const c = sampleSrgb(palette, i / 16);
        if (L(c) < L(darkest)) darkest = c;
      }
      const [Ld, Cd, Hd] = srgbToLch(darkest);
      const bytes = (rgb: readonly number[]) =>
        rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255) / 255);
      const ground = bytes(
        lchToSrgb(
          Math.min(STRINGS_LOOK.dark, Ld * STRINGS_LOOK.depth),
          Cd * STRINGS_LOOK.chroma,
          Hd
        )
      );
      const Lg = L(ground);
      const stops = Array.from({ length: STRINGS_STOPS }, (_, i) => {
        const c = sampleSrgb(palette, i / (STRINGS_STOPS - 1));
        const [l, C, H] = srgbToLch(c);
        return bytes(l >= Lg + STRINGS_LOOK.lift ? c : lchToSrgb(Lg + STRINGS_LOOK.lift, C, H));
      }).flat();
      expect(m.ground).toEqual(ground);
      expect(m.backdrop).toEqual(ground);
      expect(stringsDesignedGround(palette)).toEqual(ground);
      expect(m.alpha).toBe(1);
      expect(m.stops).toEqual(stops);
    }
  });

  it("is the color the view names, its stops standing off it by the lift: above a dark one, under a light one", () => {
    for (const palette of [P, NAVY, PASTEL])
      for (const bg of ["#f4efe6", "#ffffff", "#0b1d3a", "#000000", "#e8c547", "#7f7f7f"]) {
        const m = stringsScene(palette, { angle: 90, shape: null, bg }, { width: 9, height: 9 });
        expect(m.ground).toEqual(hexBytes(bg).map(v => v / 255));
        expect(m.groundHex).toBe(bg);
        expect(m.alpha).toBe(1);
        const Lg = L(m.ground);
        for (const stop of stopsOf(m)) {
          /* a hair less where the stop's channels are rounded to bytes, or its chroma is fitted into sRGB */
          expect(Math.abs(L(stop) - Lg), `${bg} ${stop}`).toBeGreaterThan(STRINGS_LOOK.lift - 0.01);
        }
        /* a light ground's threads are darker than it, wholly */
        if (Lg > 0.6) for (const stop of stopsOf(m)) expect(L(stop)).toBeLessThan(Lg);
      }
  });

  it("lets the page through at its alpha, its stops lifted off its color; a clear one's off the designed ground", () => {
    const half = stringsScene(
      P,
      { angle: 90, shape: null, bg: "#f4efe680" },
      { width: 9, height: 9 }
    );
    const whole = stringsScene(
      P,
      { angle: 90, shape: null, bg: "#f4efe6" },
      { width: 9, height: 9 }
    );
    expect(half.alpha).toBe(128 / 255);
    expect(half.ground).toEqual(whole.ground);
    expect(half.stops).toEqual(whole.stops);
    const clear = stringsScene(
      P,
      { angle: 90, shape: null, bg: CLEAR_GROUND },
      { width: 9, height: 9 }
    );
    const designed = stringsScene(P, { angle: 90, shape: null, bg: null }, { width: 9, height: 9 });
    expect(clear.alpha).toBe(0);
    expect(clear.stops).toEqual(designed.stops);
    expect(clear.backdrop).toEqual(designed.ground);
  });

  it("is laid over the designed ground where a picture cannot be clear, in whole bytes; a whole one is its own", () => {
    const at = (bg: string | null) =>
      stringsScene(P, { angle: 90, shape: null, bg }, { width: 9, height: 9 });
    const designed = at(null);
    expect(stringsSolid(designed)).toBe(designed);
    expect(stringsSolid(at("#f4efe6"))).toEqual(at("#f4efe6"));
    const clear = stringsSolid(at(CLEAR_GROUND));
    expect(clear.ground).toEqual(designed.ground);
    expect(clear.alpha).toBe(1);
    expect(clear.stops).toEqual(designed.stops);
    const half = stringsSolid(at("#f4efe680"));
    const a = 128 / 255;
    expect(half.ground.map(v => Math.round(v * 255))).toEqual(
      hexBytes("#f4efe6").map((v, i) =>
        Math.round(v * a + Math.round(designed.ground[i] * 255) * (1 - a))
      )
    );
    expect(half.groundHex).toBe(
      `#${half.ground
        .map(v =>
          Math.round(v * 255)
            .toString(16)
            .padStart(2, "0")
        )
        .join("")}`
    );
  });
});

describe("the strings' CPU drawing", () => {
  it("draws a ground's alpha straight, the threads over it as its shading lays them premultiplied", () => {
    const size = { width: 160, height: 90 };
    for (const bg of ["#f4efe6", "#10203080", CLEAR_GROUND]) {
      const m = stringsScene(P, { angle: 90, shape: null, bg }, size);
      const drawn = renderStrings(m, 0);
      const at = new Float64Array(STRINGS_FRAME_SIZE);
      stringsFrameAt(m, 0, at);
      const s = stringsScratch();
      const c = new Float64Array(4);
      let differ = 0;
      let ground = 0;
      let raised = 0;
      let opaque = 0;
      for (let y = 0; y < size.height; y++)
        for (let x = 0; x < size.width; x++) {
          stringsShade(
            m,
            at,
            (x + 0.5 - size.width / 2) / m.D,
            (y + 0.5 - size.height / 2) / m.D,
            s,
            c
          );
          const i = 4 * (y * size.width + x);
          const alpha = Math.round(c[3] * 255);
          if (drawn[i + 3] !== alpha) differ++;
          if (alpha > 0)
            for (let k = 0; k < 3; k++)
              if (drawn[i + k] !== Math.round((c[k] / c[3]) * 255)) differ++;
          if (c[3] === m.alpha) ground++;
          if (c[3] > m.alpha + 0.05) raised++;
          if (alpha === 255) opaque++;
        }
      expect(differ, bg).toBe(0);
      /* most of the picture is the ground, at its own alpha; a whole one is opaque throughout, and over one that lets
         the page through the threads stand more opaque than it */
      expect(ground / (size.width * size.height), bg).toBeGreaterThan(0.5);
      if (m.alpha === 1) expect(opaque, bg).toBe(size.width * size.height);
      else expect(raised, bg).toBeGreaterThan(100);
    }
    /* a clear ground's pixels where no thread is are clear: no color at all */
    const clear = renderStrings(
      stringsScene(P, { angle: 90, shape: null, bg: CLEAR_GROUND }, size),
      0
    );
    expect([...clear.slice(0, 4)]).toEqual([0, 0, 0, 0]);
  });

  it("passes over only the cells past the blob, each pixel what its shading would have drawn", () => {
    for (const [size, angle, shape, t] of [
      [{ width: 160, height: 90 }, 90, null, 0],
      [{ width: 96, height: 128 }, 20, 417, 41.5],
      [{ width: 37, height: 21 }, 300, 7, 170]
    ] as const) {
      const m = stringsScene(P, { angle, shape, bg: null }, size);
      const drawn = renderStrings(m, t);
      const at = new Float64Array(STRINGS_FRAME_SIZE);
      stringsFrameAt(m, t, at);
      const s = stringsScratch();
      const c = new Float64Array(3);
      let differ = 0;
      for (let y = 0; y < size.height; y++)
        for (let x = 0; x < size.width; x++) {
          stringsShade(
            m,
            at,
            (x + 0.5 - size.width / 2) / m.D,
            (y + 0.5 - size.height / 2) / m.D,
            s,
            c
          );
          const i = 4 * (y * size.width + x);
          for (let k = 0; k < 3; k++) if (drawn[i + k] !== Math.round(c[k] * 255)) differ++;
        }
      expect(differ, `${size.width}x${size.height} ${angle} ${shape}`).toBe(0);
    }
  });
});

describe("the strings' SVG", () => {
  it("lays its ground at its alpha where it lets the page through, and none where it is clear", () => {
    const at = (bg: string | null) =>
      stringsFrameOf(
        stringsScene(P, { angle: 90, shape: null, bg }, { width: 320, height: 180 }),
        0
      );
    expect(at("#f4efe6")).toContain('<rect width="320" height="180" fill="#f4efe6"/>');
    expect(at("#10203080")).toContain(
      '<rect width="320" height="180" fill="#102030" fill-opacity=".502"/>'
    );
    expect(at(CLEAR_GROUND)).not.toContain("<rect");
    /* the same threads on any ground: they depend on the view and the box alone */
    const threads = (svg: string) => svg.match(/ d="[^"]+"/g);
    expect(threads(at(CLEAR_GROUND))).toEqual(threads(at(null)));
  });

  it("strokes each thread in its own color over the ground, with no filter, mask or <use>", () => {
    const m = stringsScene(P, { angle: 90, shape: null, bg: null }, { width: 320, height: 180 });
    const svg = stringsFrameOf(m, 0);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="320" height="180"/);
    expect(svg).toContain(`<rect width="320" height="180" fill="${m.groundHex}"/>`);
    expect(svg).not.toMatch(/<filter|<mask|<use|<animate|@keyframes/);
    const paths = svg.match(/<path stroke="#[0-9a-f]{6}" d="M[^"]+"\/>/g) ?? [];
    /* a path a level: the ribbons' levels, -(N - 1) to N - 1, most of them showing somewhere */
    expect(paths.length).toBeGreaterThan(20);
    expect(paths.length).toBeLessThanOrEqual(2 * m.n - 1);
  });

  it("writes its still a step at a time, the same as at once, and keeps a view's threads", () => {
    const m = stringsScene(P, { angle: 45, shape: 12, bg: null }, { width: 400, height: 400 });
    const steps = stringsStillSteps({ ...m, view: null });
    let count = 0;
    let step = steps.next();
    while (!step.done) {
      count++;
      step = steps.next();
    }
    expect(count).toBeGreaterThan(5);
    expect(step.value).toBe(stringsStillOf({ ...m, view: null }));
    expect(stringsStillOf(m)).toBe(step.value);
  });
});
