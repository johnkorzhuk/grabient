import { expect, test } from "vitest";
import { readGif } from "../test/gif.ts";
import {
  BLOB_GIF_SIZE,
  BLOB_GIF_WORK,
  BLOB_SIZE,
  type BlobView,
  ballPlace,
  blobBackdrop,
  blobCss,
  blobFrame,
  blobGifPlan,
  blobLook,
  blobScene,
  blobSearch,
  blobStill,
  blobSvg,
  parseBlob
} from "./blob.ts";
import { blobGif, blobGifPart, blobGifParts, blobGifTable } from "./blob-gif.ts";
import { decodePalette } from "./codec.ts";
import { GIF_END, joinBytes } from "./gif.ts";
import { randomPalette } from "./random.ts";

const read = (query: string) => parseBlob(new URLSearchParams(query));
const P = decodePalette("kS4mdDYzY8lhFPW")!;
const draw = (query = "", size = BLOB_SIZE, palette = P) =>
  blobSvg(palette, read(query), size, "https://grabient.com/k");
const count = (svg: string, tag: string) => svg.split(`<${tag} `).length - 1;
const after = (svg: string) => svg.split("</defs>")[1];

test("an address's animation: speed, depth, fill, frost, shape and ground, each brought into bounds", () => {
  expect(read("")).toEqual({
    speed: 1,
    depth: true,
    fill: false,
    frost: 1,
    shape: null,
    bg: null,
    still: false,
    fps: null
  } satisfies BlobView);
  expect(read("fps=24").fps).toBe(24);
  expect(read("fps=90").fps).toBe(60);
  expect(read("fps=0").fps).toBeNull();
  expect(blobSearch(read("fps=24"))).toBe("?style=blob&fps=24");
  expect(read("speed=0.05&frost=3").speed).toBe(0.1);
  expect(read("speed=20&frost=3")).toMatchObject({ speed: 10, frost: 2 });
  expect(read("speed=0.755&frost=0.333")).toMatchObject({ speed: 0.76, frost: 0.33 });
  expect(read("depth=0&fill=1&shape=7")).toMatchObject({ depth: false, fill: true, shape: 7 });
  expect(read("shape=12345").shape).toBeNull();
  expect(read("shape=x").shape).toBeNull();
  expect(read("bg=deep").bg).toBe("deep");
  expect(read("bg=FFF").bg).toBe("#ffffff");
  expect(read("bg=%23101014").bg).toBe("#101014");
  expect(read("bg=red").bg).toBeNull();
  expect(read("speed=-1&depth=1&fill=0&frost=x&bg=none&duration=9")).toEqual(read(""));
  expect(blobSearch(read("speed=1.00&junk=1"))).toBe("?style=blob");
  expect(
    blobSearch(read("bg=101014&shape=7&frost=0.5&fill=1&depth=0&speed=2"), ["size=800x600"])
  ).toBe("?style=blob&speed=2&depth=0&fill=1&frost=0.5&shape=7&bg=101014&size=800x600");
  expect(blobSearch(read("still=1"))).toBe("?style=blob&still=1");
  // the first frame's query leaves the speed out, and whether it moves
  expect(blobSearch(read("speed=2&fill=1&still=1"), [], false)).toBe("?style=blob&fill=1");
});

test("the file: the balls melted and frosted by one filter, moved by CSS alone", () => {
  const svg = draw();
  expect(svg).toBe(draw());
  expect(svg).toContain('width="500" height="500" viewBox="0 0 500 500"');
  expect(svg).not.toContain("preserveAspectRatio");
  expect(count(svg, "circle")).toBe(8);
  // one filter and nothing layered over it, which Chrome's GPU painter flickered on
  expect(count(svg, "filter")).toBe(1);
  expect(svg).not.toContain("<mask ");
  expect(svg).not.toContain("mix-blend-mode");
  for (const step of ["feGaussianBlur", "feTurbulence", "feDisplacementMap", "feComposite"])
    expect(count(svg, step)).toBe(1);
  // nothing behind the blob: the file is transparent around it
  expect(after(svg)).not.toContain("<rect ");
  expect(svg).toContain("@media (prefers-reduced-motion:no-preference){");
  expect(svg.length).toBeLessThan(3_500);
});

test("no transform attribute anywhere, so an optimizer moving one onto a moving element cannot shift the drawing", () => {
  for (const query of ["", "depth=0", "fill=1&bg=deep"]) {
    const svg = draw(query, { width: 640, height: 360 });
    expect(svg).not.toMatch(/\stransform=/);
    // every element that turns or grows turns about an origin of its own
    for (const [element] of svg.matchAll(
      /<(?:g|circle) class="[^"]*(?:\bs\b|\ba\d)[^"]*"[^>]*>/g
    )) {
      if (/class="a\d+"/.test(element) && !/style=/.test(element)) continue;
      expect(element).toMatch(/style="transform-origin:[\d.]+px [\d.]+px"/);
    }
  }
});

test("every turn and every to-and-fro makes whole laps in the loop, and speed shortens the loop", () => {
  const svg = draw("", { width: 900, height: 500 });
  const turns = [...svg.matchAll(/animation-duration:([\d.]+)s/g)].map(m => 16 / Number(m[1]));
  const sweeps = [...svg.matchAll(/animation:\w+ ([\d.]+)s cubic/g)].map(
    m => 16 / (2 * Number(m[1]))
  );
  expect(turns.length).toBeGreaterThanOrEqual(3);
  expect(sweeps.length).toBeGreaterThanOrEqual(3);
  for (const n of [...turns, ...sweeps]) expect(n).toBeCloseTo(Math.round(n), 2);
  expect(draw()).toContain("animation-duration:16s");
  expect(draw("speed=2")).toContain("animation-duration:8s");
  expect(draw("speed=2")).not.toContain("animation-duration:16s");
});

test("frost scales the scatter and the speckle, and none leaves the noise out", () => {
  const scatter = (svg: string) =>
    [...svg.matchAll(/feDisplacementMap in="b" in2="n" scale="([\d.]+)"/g)].map(m => Number(m[1]));
  expect(scatter(draw())).toEqual([37.5]);
  expect(scatter(draw("frost=2"))).toEqual([75]);
  const clean = draw("frost=0");
  expect(clean).not.toContain("feTurbulence");
  expect(clean).not.toContain("arithmetic");
});

test("in depth the blob grows and shrinks, without it it keeps its size; filled, three blobs melt past the box", () => {
  expect(draw()).toContain("transform:scale(.88)}to{transform:scale(1.12)");
  const still = draw("depth=0");
  expect(count(still, "circle")).toBe(8);
  expect(still).not.toContain("scale(");
  const filled = draw("fill=1", { width: 1280, height: 720 });
  expect(count(filled, "circle")).toBe(3 * 8);
  expect(filled).toMatch(/<filter id="\w+" x="-[\d.]+" y="-[\d.]+"/);
  // filled and transparent unless a ground is asked for
  expect(after(filled)).not.toMatch(/<rect /);
});

test("the ground: the palette's deep tone or a color, drawn behind the blobs", () => {
  const { backdrop } = blobScene(P, BLOB_SIZE, { fill: true, shape: null, bg: "deep" });
  expect(backdrop).toMatch(/^#[0-9a-f]{6}$/);
  expect(after(draw("fill=1&bg=deep"))).toContain(
    `<rect width="500" height="500" fill="${backdrop}"/>`
  );
  expect(after(draw("bg=101014"))).toContain('<rect width="500" height="500" fill="#101014"/>');
  // a dark palette's deep tone is pale
  const black = decodePalette("kYAABnAAA_wAAQEAAD8kpHAR6VwS")!;
  const pale = blobScene(black, BLOB_SIZE, { fill: true, shape: null, bg: "deep" }).backdrop!;
  expect(parseInt(pale.slice(1, 3), 16)).toBeGreaterThan(200);
});

test("each file's names are its own; each palette, and each shape of it, has blobs of its own", () => {
  const mark = (svg: string) => /class="(b[0-9a-z]{4})"/.exec(svg)?.[1];
  const other = decodePalette("kKSAEDEVJVQQpMqxBWXeGPsNYdzUyx-eqwA")!;
  expect(mark(draw())).not.toBe(mark(draw("", BLOB_SIZE, other)));
  expect(mark(draw())).not.toBe(mark(draw("speed=2")));
  expect(mark(draw())).not.toBe(mark(draw("fill=1")));
  expect(mark(draw())).not.toBe(mark(draw("", { width: 400, height: 400 })));
  const places = (palette: typeof P, shape: number | null = null) =>
    blobScene(palette, BLOB_SIZE, { fill: false, shape, bg: null }).blobs[0].balls.map(b => b.x);
  expect(places(P)).not.toEqual(places(other));
  expect(places(P, 7)).not.toEqual(places(P));
  expect(places(P, 7)).toEqual(places(P, 7));
  // a shape number alone decides the shape: recolored, the blob keeps it
  expect(places(other, 7)).toEqual(places(P, 7));
  expect(draw("shape=7")).not.toBe(draw());
});

test("the still frame is the first frame with no motion, which a player takes over from", () => {
  const still = draw("still=1");
  expect(still).not.toContain("<style>");
  expect(still).not.toContain("@keyframes");
  const circles = (svg: string) => svg.match(/<circle [^>]*>/g);
  expect(circles(still)).toEqual(circles(draw()));
  // a player's first frame puts every ball where the file draws it
  const scene = blobScene(P, BLOB_SIZE);
  const dots = blobFrame(scene, 0, true);
  expect(dots).toHaveLength(8);
  const drawn = [...(circles(draw()) ?? [])].map(c => [
    Number(/cx="([\d.]+)"/.exec(c)![1]),
    Number(/cy="([\d.]+)"/.exec(c)![1]),
    Number(/r="([\d.]+)"/.exec(c)![1])
  ]);
  dots.forEach((d, i) => {
    expect(d.x).toBeCloseTo(drawn[i][0], 1);
    expect(d.y).toBeCloseTo(drawn[i][1], 1);
    expect(d.r).toBeCloseTo(drawn[i][2], 1);
  });
  expect(blobLook(read(""), BLOB_SIZE, scene)).toMatchObject({ slope: 2.2, scatter: 37.5, pad: 0 });
});

test("the palette's colors lie across the blob, its darker end on one side", () => {
  const scene = blobScene(P, BLOB_SIZE);
  expect([scene.color(0), scene.color(1)]).toEqual(["#f86c1b", "#f9d961"]);
  const ring = scene.blobs[0].balls.filter(b => b.ring).slice(0, 6);
  const darkest = ring.reduce((a, b) => (b.at < a.at ? b : a));
  const lightest = ring.reduce((a, b) => (b.at > a.at ? b : a));
  expect(darkest.x * lightest.x + darkest.y * lightest.y).toBeLessThan(0);
});

test("alone, the blob stays whole inside its box at every moment of the loop, near or far, whatever the palette", () => {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const sizes = [
    BLOB_SIZE,
    { width: 1200, height: 630 },
    { width: 1080, height: 1350 },
    { width: 40, height: 40 }
  ];
  for (let i = 0; i < 50; i++) {
    const palette = randomPalette(rand);
    for (const size of sizes) {
      const shape = i % 3 ? null : i;
      const [blob] = blobScene(palette, size, { fill: false, shape, bg: null }).blobs;
      const S = Math.min(size.width, size.height);
      for (let k = 0; k < 64; k++) {
        for (const b of blob.balls) {
          const [x, y, r] = ballPlace(blob, b, k / 64);
          const reach = r + (0.1 * r) / b.r;
          expect(x - reach).toBeGreaterThanOrEqual(0.03 * S);
          expect(x + reach).toBeLessThanOrEqual(size.width - 0.03 * S);
          expect(y - reach).toBeGreaterThanOrEqual(0.03 * S);
          expect(y + reach).toBeLessThanOrEqual(size.height - 0.03 * S);
        }
      }
    }
  }
});

test("a wide box lets the blob wander across it, and a square one a little", () => {
  const [square] = blobScene(P, BLOB_SIZE).blobs;
  const [wide] = blobScene(P, { width: 1200, height: 630 }).blobs;
  expect(square.wander[0].reach).toBeGreaterThan(0);
  expect(wide.wander[0].reach).toBeGreaterThan(200);
  expect(wide.wander[1].reach).toBeLessThan(wide.wander[0].reach);
});

test("the first frame as pixels: transparent around the blobs, or on their ground, or on a backdrop", () => {
  const [W, H] = [160, 120];
  const at = (pixels: Uint8Array, n: number, x: number, y: number) => [
    ...pixels.subarray(n * (y * W + x), n * (y * W + x) + n)
  ];
  const alone = blobStill(P, read(""), { width: W, height: H });
  expect(alone).toHaveLength(4 * W * H);
  expect(alone).toEqual(blobStill(P, read(""), { width: W, height: H }));
  expect(at(alone, 4, 0, 0)[3]).toBe(0);
  expect(at(alone, 4, W - 1, H - 1)[3]).toBe(0);
  expect(at(alone, 4, W / 2, H / 2)[3]).toBe(255);
  const backdrop = blobBackdrop(P);
  const card = blobStill(P, read(""), { width: W, height: H }, backdrop);
  expect(card).toHaveLength(3 * W * H);
  expect(at(card, 3, 0, 0)).toEqual(backdrop);
  // filled, still transparent unless a ground is asked for
  expect(blobStill(P, read("fill=1"), { width: W, height: H })).toHaveLength(4 * W * H);
  const grounded = blobStill(P, read("bg=101014"), { width: W, height: H }, backdrop);
  expect(grounded).toHaveLength(3 * W * H);
  expect(at(grounded, 3, 0, 0)).toEqual([0x10, 0x10, 0x14]);
  expect(blobStill(P, read("frost=0"), { width: W, height: H })).not.toEqual(alone);
  expect(blobStill(P, read("shape=7"), { width: W, height: H })).not.toEqual(alone);
});

test("a dark palette's card sets the blob on light, any other on dark", () => {
  expect(blobBackdrop(P)).toEqual([14, 14, 16]);
  expect(blobBackdrop(decodePalette("kYAABnAAA_wAAQEAAD8kpHAR6VwS")!)).toEqual([243, 241, 238]);
});

test("the CSS carries the file inside it: a lone blob as large as the box holds it, a filled one covering it", () => {
  const css = blobCss(P, read(""), { width: 1080, height: 1350 }, "https://grabient.com/k");
  expect(css).toMatch(
    /^\/\* https:\/\/grabient\.com\/k \*\/\nhtml \{\n {2}width: 1080px;\n {2}height: 1350px;\n {2}background: url\("data:image\/svg\+xml,/
  );
  expect(css).toContain('") center / contain no-repeat;\n}\n');
  const data = /url\("data:image\/svg\+xml,([^"]*)"\)/.exec(css)![1];
  expect(data).not.toMatch(/[#<>"]/);
  const svg = blobSvg(P, read(""), { width: 1080, height: 1350 }, "https://grabient.com/k");
  expect(decodeURIComponent(data)).toBe(svg.replace(/\n/g, "").replace(/"/g, "'"));
  expect(blobCss(P, read(""), null, "x")).toContain("html {\n  min-height: 100%;\n  background:");
  expect(blobCss(P, read("fill=1"), null, "x")).toContain('background: url("data:image/svg+xml,');
  const grounded = blobCss(P, read("fill=1&bg=deep"), null, "x");
  const { backdrop } = blobScene(P, BLOB_SIZE, { fill: true, shape: null, bg: "deep" });
  expect(grounded).toContain(`background: ${backdrop} url("data:image/svg+xml,`);
  expect(grounded).toContain('") center / cover no-repeat;');
});

test("a GIF is one whole loop at its frame rate, fewer frames past its budget, smaller where too few would be left", () => {
  const plan = (query: string, size = BLOB_GIF_SIZE) => blobGifPlan(read(query), size);
  // 16 seconds at 12 frames a second
  expect(plan("")).toEqual({ size: BLOB_GIF_SIZE, frames: 192, seconds: 16 });
  expect(plan("speed=2&fps=24")).toEqual({ size: BLOB_GIF_SIZE, frames: 192, seconds: 8 });
  // 50 a second at most: browsers slow a shorter delay
  expect(plan("speed=4&fps=60").frames).toBe(200);
  // a filled GIF counts half again: its loop in fewer frames
  const filled = plan("fill=1");
  expect(filled.frames).toBe(Math.floor(BLOB_GIF_WORK / (1.5 * 400 * 400)));
  // a slow blob takes the budget's frames over its long loop
  expect(plan("speed=0.1")).toEqual({ size: BLOB_GIF_SIZE, frames: 200, seconds: 160 });
  // a large size leaves too few frames: drawn smaller, its shape kept
  const large = plan("", { width: 1600, height: 900 });
  expect(large.frames).toBeGreaterThanOrEqual(96);
  expect(large.size.width / large.size.height).toBeCloseTo(16 / 9, 1);
  expect(large.size.width * large.size.height * large.frames).toBeLessThanOrEqual(BLOB_GIF_WORK);
  // a low frame rate leaves room for a larger size
  expect(plan("fps=2", { width: 900, height: 900 })).toEqual({
    size: { width: 900, height: 900 },
    frames: 32,
    seconds: 16
  });
});

test("a blob's GIF: its size, its loop's frames and their delays, transparent unless it has a ground", async () => {
  const header = (gif: Uint8Array) => ({
    signature: String.fromCharCode(...gif.subarray(0, 6)),
    width: gif[6] | (gif[7] << 8),
    height: gif[8] | (gif[9] << 8)
  });
  const controls = (gif: Uint8Array) => readGif(gif).frames;
  const size = { width: 48, height: 32 };
  const alone = await blobGif(P, read("speed=4&fps=10"), size);
  expect(header(alone)).toEqual({ signature: "GIF89a", width: 48, height: 32 });
  const frames = controls(alone);
  expect(frames.length).toBe(40);
  expect(frames.reduce((sum, f) => sum + f.delay, 0)).toBe(400);
  expect(new Set(frames.map(f => f.disposal))).toEqual(new Set([2]));
  const grounded = controls(await blobGif(P, read("speed=4&fps=10&bg=deep"), size));
  expect(new Set(grounded.map(f => f.disposal))).toEqual(new Set([1]));
});

test("a GIF drawn in parts against one table reads back as the GIF drawn in one piece", async () => {
  const size = { width: 40, height: 30 };
  for (const query of ["speed=4&fps=10", "speed=4&fps=10&bg=deep&frost=0"]) {
    const view = read(query);
    const whole = readGif(await blobGif(P, view, size)).frames;
    // seven frames a part
    const parts = blobGifParts(view, size, 40 * 30 * 7);
    expect(parts.length).toBe(6);
    expect([parts[0][0], parts.at(-1)?.[1]]).toEqual([0, 40]);
    const { table, start } = blobGifTable(P, view, size);
    const drawn = await Promise.all(
      parts.map(([from, to]) => blobGifPart(P, view, size, table, from, to))
    );
    const split = readGif(joinBytes([start, ...drawn, GIF_END])).frames;
    expect(split.map(f => f.pixels)).toEqual(whole.map(f => f.pixels));
    expect(split.map(f => f.delay)).toEqual(whole.map(f => f.delay));
  }
  expect(blobGifParts(read(""), BLOB_GIF_SIZE)).toHaveLength(6);
  expect(blobGifParts(read("fill=1"), BLOB_GIF_SIZE).length).toBeLessThanOrEqual(9);
});
