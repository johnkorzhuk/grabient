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
  blobFilter,
  blobFit,
  blobFrame,
  blobGifPlan,
  blobNoiseTables,
  blobPlaces,
  blobScene,
  blobSearch,
  blobStill,
  blobSvg,
  parseBlob
} from "./blob.ts";
import { blobGif, blobGifPart, blobGifParts, blobGifTable } from "./blob-gif.ts";
import { decodePalette } from "./codec.ts";
import { GIF_END, joinBytes } from "./gif.ts";

const read = (query: string) => parseBlob(new URLSearchParams(query));
const P = decodePalette("kS4mdDYzY8lhFPW")!;
const draw = (
  query = "",
  size: { width: number; height: number } | null = BLOB_SIZE,
  palette = P
) => blobSvg(palette, read(query), size, "https://grabient.com/k");
const count = (svg: string, tag: string) => svg.split(`<${tag} `).length - 1;
const after = (svg: string) => svg.split("</defs>")[1];
/* the first of seed 9248's lattice and gradient bytes, as Chromium's Skia makes them */
const LATTICE_9248 = [47, 42, 141, 88, 121, 157, 190, 96];
const GRADIENTS_9248 = [3, 186, 231, 13, 27, 255, 18, 143];

test("an address's animation: speed, frost, shape, ground, angle and frames a second, each brought into bounds", () => {
  expect(read("")).toEqual({
    speed: 1,
    frost: 1,
    shape: null,
    bg: null,
    angle: 90,
    still: false,
    fps: null
  } satisfies BlobView);
  expect(read("fps=24").fps).toBe(24);
  expect(read("fps=120").fps).toBe(120);
  expect(read("fps=200").fps).toBe(120);
  expect(read("fps=0").fps).toBeNull();
  expect(blobSearch(read("fps=24"))).toBe("?style=blob&fps=24");
  expect(read("speed=0.05&frost=3").speed).toBe(0.1);
  expect(read("speed=20&frost=3")).toMatchObject({ speed: 10, frost: 2 });
  expect(read("speed=0.755&frost=0.333")).toMatchObject({ speed: 0.76, frost: 0.33 });
  expect(read("shape=7&angle=45")).toMatchObject({ shape: 7, angle: 45 });
  expect(read("shape=12345").shape).toBeNull();
  expect(read("shape=x").shape).toBeNull();
  expect(read("angle=400").angle).toBe(90);
  // a ground is hex: three, four, six or eight digits, with or without its #; any other color the Worker writes as hex
  expect(read("bg=FFF").bg).toBe("#ffffff");
  expect(read("bg=%23101014").bg).toBe("#101014");
  expect(read("bg=10101480").bg).toBe("#10101480");
  expect(read("bg=f008").bg).toBe("#ff000088");
  expect(read("bg=101014ff").bg).toBe("#101014");
  expect(read("bg=10101400").bg).toBeNull();
  expect(read("bg=red").bg).toBeNull();
  expect(read("speed=-1&frost=x&bg=none&duration=9&depth=0&fill=1")).toEqual(read(""));
  expect(blobSearch(read("speed=1.00&junk=1"))).toBe("?style=blob");
  expect(blobSearch(read("bg=10101480&shape=7&frost=0.5&speed=2&angle=30"), ["size=800x600"])).toBe(
    "?style=blob&angle=30&speed=2&frost=0.5&shape=7&bg=10101480&size=800x600"
  );
  expect(blobSearch(read("still=1"))).toBe("?style=blob&still=1");
  // the first frame's query leaves the speed out, and whether it moves
  expect(blobSearch(read("speed=2&shape=3&still=1"), [], false)).toBe("?style=blob&shape=3");
});

test("the file: three blobs of balls melted and frosted by one filter, moved by CSS alone, covering the box", () => {
  const svg = draw();
  expect(svg).toBe(draw());
  expect(svg).toContain(
    'width="500" height="500" viewBox="0 0 500 500" preserveAspectRatio="xMidYMid slice"'
  );
  expect(count(svg, "circle")).toBe(3 * 8);
  // one filter and nothing layered over it, which Chrome's GPU painter flickered on
  expect(count(svg, "filter")).toBe(1);
  expect(svg).not.toContain("<mask ");
  expect(svg).not.toContain("mix-blend-mode");
  for (const step of ["feGaussianBlur", "feTurbulence", "feDisplacementMap", "feComposite"])
    expect(count(svg, step)).toBe(1);
  // nothing behind the blobs: the file is transparent around them
  expect(after(svg)).not.toContain("<rect ");
  expect(svg).toMatch(/<filter id="\w+" x="-[\d.]+" y="-[\d.]+"/);
  expect(svg).toContain("@media (prefers-reduced-motion:no-preference){");
  expect(svg.length).toBeLessThan(8_000);
});

test("no transform attribute anywhere, so an optimizer moving one onto a moving element cannot shift the drawing", () => {
  for (const query of ["", "shape=7&angle=200", "bg=101014"]) {
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

test("depth: three blobs far to near, the nearer larger, wandering farther and painted later, each breathing", () => {
  for (const shape of [null, 3, 7, 41]) {
    const { blobs } = blobScene(P, BLOB_SIZE, { shape, bg: null, angle: 90 });
    expect(blobs).toHaveLength(3);
    for (let k = 1; k < 3; k++) {
      expect(blobs[k].R).toBeGreaterThan(blobs[k - 1].R);
      expect(Math.abs(blobs[k].wander[0].reach)).toBeGreaterThan(
        Math.abs(blobs[k - 1].wander[0].reach) * 1.05
      );
    }
  }
  // the file paints them in that order, each in a breath of its own
  expect(draw().match(/transform:scale\(\.88\)\}to\{transform:scale\(1\.12\)/g)?.length).toBe(1);
  expect(count(draw(), "circle")).toBe(24);
});

test("a shape's blobs: small, with the ground about them, as often as middling or full; a palette's own fills its box", () => {
  const cover = (shape: number | null, palette = P) =>
    blobScene(palette, BLOB_SIZE, { shape, bg: null, angle: 90 }).blobs.reduce(
      (sum, b) => sum + b.R * b.R,
      0
    );
  const sizes = Array.from({ length: 300 }, (_, shape) => cover(shape)).sort((a, b) => a - b);
  const most = sizes[299];
  // about a third of the shapes cover under a quarter of what the largest do, and about a third over half
  expect(sizes.filter(s => s < most / 4).length).toBeGreaterThan(80);
  expect(sizes.filter(s => s > most / 2).length).toBeGreaterThan(80);
  // with no shape asked, a palette's own blob stays near full
  for (const seed of ["kW05tMQrDKBsGxK-msT483KI", "kS4mdDYzY8lhFPW", "kS7Q8Yy5S_SChv0"])
    expect(cover(null, decodePalette(seed) ?? P) / most).toBeGreaterThan(0.5);
});

test("the ground: a color drawn behind the blobs over the whole box, which may let what is behind it through", () => {
  expect(after(draw("bg=101014"))).toContain('<rect width="500" height="500" fill="#101014"/>');
  expect(after(draw("bg=10101480"))).toContain(
    '<rect width="500" height="500" fill="#101014" fill-opacity=".502"/>'
  );
  // in a wide box, the ground covers the part of the design the box shows
  expect(after(draw("bg=101014", { width: 1020, height: 671 }))).toContain(
    '<rect y="85.53" width="500" height="328.94" fill="#101014"/>'
  );
  expect(blobScene(P, BLOB_SIZE, { shape: null, bg: "#10101480", angle: 90 }).backdrop).toBe(
    "#10101480"
  );
});

test("each file's names are its own; each palette, and each shape of it, has blobs of its own", () => {
  const mark = (svg: string) => /class="(b[0-9a-z]{4})"/.exec(svg)?.[1];
  const other = decodePalette("kKSAEDEVJVQQpMqxBWXeGPsNYdzUyx-eqwA")!;
  expect(mark(draw())).not.toBe(mark(draw("", BLOB_SIZE, other)));
  expect(mark(draw())).not.toBe(mark(draw("speed=2")));
  expect(mark(draw())).not.toBe(mark(draw("angle=30")));
  expect(mark(draw())).not.toBe(mark(draw("", { width: 400, height: 400 })));
  const places = (palette: typeof P, shape: number | null = null) =>
    blobScene(palette, BLOB_SIZE, { shape, bg: null, angle: 90 }).blobs.flatMap(blob =>
      blob.balls.map(b => blob.x + b.x)
    );
  expect(places(P)).not.toEqual(places(other));
  expect(places(P, 7)).not.toEqual(places(P));
  expect(places(P, 7)).toEqual(places(P, 7));
  // a shape number alone decides the shape: recolored, the blobs keep it
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
  const dots = blobFrame(scene, 0);
  expect(dots).toHaveLength(24);
  const drawn = [...(circles(draw()) ?? [])].map(c => [
    Number(/cx="(-?[\d.]+)"/.exec(c)![1]),
    Number(/cy="(-?[\d.]+)"/.exec(c)![1]),
    Number(/r="([\d.]+)"/.exec(c)![1])
  ]);
  dots.forEach((d, i) => {
    expect(d.x).toBeCloseTo(drawn[i][0], 1);
    expect(d.y).toBeCloseTo(drawn[i][1], 1);
    expect(d.r).toBeCloseTo(drawn[i][2], 1);
  });
  const look = blobFilter(read(""), BLOB_SIZE, scene);
  const largest = Math.max(...scene.blobs.map(b => b.R));
  expect(look).toMatchObject({
    melt: Number((0.24 * largest).toFixed(2)),
    slope: 2.2,
    lift: -0.6,
    scatter: 37.5,
    k1: 0.2,
    k2: 0.9,
    contrast: 2.2,
    gray: -0.6,
    pad: Number(scene.pad.toFixed(2)),
    frequency: 0.75,
    octaves: 2,
    seed: scene.seed,
    noise: true
  });
  // every number the player draws by is the one the file writes
  const svg = draw();
  expect(svg).toContain(`stdDeviation="${String(look.melt).replace(/^0\./, ".")}"`);
  expect(svg).toContain(`scale="${look.scatter}"`);
  expect(svg).toContain(`seed="${look.seed}"`);
  expect(svg).toContain(
    `k1="${String(look.k1).replace(/^0\./, ".")}" k2="${String(look.k2).replace(/^0\./, ".")}"`
  );
});

test("a player's places, written without allocating, are ballPlace's", () => {
  for (const query of ["", "shape=7&angle=10", "shape=41"]) {
    const view = read(query);
    const scene = blobScene(P, BLOB_SIZE, view);
    const balls = scene.blobs.flatMap(blob => blob.balls.map(b => [blob, b] as const));
    const out = new Float32Array(4 * balls.length);
    for (const f of [0, 0.13, 0.5, 0.77]) {
      blobPlaces(scene, f, out, 4);
      balls.forEach(([blob, b], i) => {
        const [x, y, r] = ballPlace(blob, b, f);
        expect(out[4 * i]).toBeCloseTo(x, 3);
        expect(out[4 * i + 1]).toBeCloseTo(y, 3);
        expect(out[4 * i + 2]).toBeCloseTo(r, 3);
      });
    }
  }
});

test("the palette lies across every blob along the angle, its first color toward the angle's tail", () => {
  const scene = (angle: number) => blobScene(P, BLOB_SIZE, { shape: 7, bg: null, angle });
  expect([scene(90).color(0), scene(90).color(1)]).toEqual(["#f9d961", "#f86c1b"]);
  /* where on the screen a blob's last color lies, from its middle: the ring ball nearest the palette's end */
  const toward = (angle: number) =>
    scene(angle).blobs.map(blob => {
      const ring = blob.balls.filter(b => b.ring);
      const last = ring.reduce((a, b) => (b.at > a.at ? b : a));
      return [last.x, last.y];
    });
  for (const [x] of toward(90)) expect(x).toBeGreaterThan(0.2);
  for (const [x] of toward(270)) expect(x).toBeLessThan(-0.2);
  for (const [, y] of toward(0)) expect(y).toBeLessThan(-0.2);
  for (const [, y] of toward(180)) expect(y).toBeGreaterThan(0.2);
  // the angle moves no blob, only its colors
  expect(scene(0).blobs.map(b => [b.x, b.y, b.R])).toEqual(
    scene(90).blobs.map(b => [b.x, b.y, b.R])
  );
});

test("one design for every box: the scene is the design square's, the box only scales it to cover", () => {
  const square = blobScene(P, BLOB_SIZE);
  for (const size of [
    { width: 1200, height: 630 },
    { width: 390, height: 543 }
  ])
    expect(blobScene(P, size).blobs).toEqual(square.blobs);
  expect(blobFit({ width: 1020, height: 671 })).toEqual({ scale: 2.04, x: 0, y: -174.5 });
  expect(blobFit({ width: 400, height: 900 })).toEqual({ scale: 1.8, x: -250, y: 0 });
  // the file: the design's viewBox in the box's size, sliced to cover it
  const wide = draw("", { width: 1020, height: 671 });
  expect(wide).toContain(
    'width="1020" height="671" viewBox="0 0 500 500" preserveAspectRatio="xMidYMid slice"'
  );
  // the same circles whatever the box: only the box's own size changes in the file
  const circles = (svg: string) => svg.match(/<circle [^>]*>/g);
  expect(circles(wide)).toEqual(circles(draw()));
  // fluid: as large as what holds it, which paints the ground
  const fluid = draw("bg=101014", null);
  expect(fluid).toContain('width="100%" height="100%" viewBox="0 0 500 500"');
  expect(after(fluid)).not.toContain("<rect ");
});

test("the first frame as pixels: clear between the blobs, on their ground, or on a backdrop", () => {
  const [W, H] = [160, 120];
  const at = (pixels: Uint8Array, n: number, p: number) => [...pixels.subarray(n * p, n * p + n)];
  /* a small shape, so the ground shows between its blobs */
  const query = "shape=13";
  const alone = blobStill(P, read(query), { width: W, height: H });
  expect(alone).toHaveLength(4 * W * H);
  expect(alone).toEqual(blobStill(P, read(query), { width: W, height: H }));
  const clear = Array.from({ length: W * H }, (_, p) => p).find(p => alone[4 * p + 3] === 0);
  const solid = Array.from({ length: W * H }, (_, p) => p).find(p => alone[4 * p + 3] === 255);
  expect(clear).toBeDefined();
  expect(solid).toBeDefined();
  const backdrop = blobBackdrop(P);
  const card = blobStill(P, read(query), { width: W, height: H }, backdrop);
  expect(card).toHaveLength(3 * W * H);
  expect(at(card, 3, clear!)).toEqual(backdrop);
  const grounded = blobStill(P, read(`${query}&bg=101014`), { width: W, height: H }, backdrop);
  expect(at(grounded, 3, clear!)).toEqual([0x10, 0x10, 0x14]);
  // a ground that lets something through: over the backdrop on a card, its own alpha on a clear picture
  const half = blobStill(P, read(`${query}&bg=ffffff80`), { width: W, height: H }, backdrop);
  expect(at(half, 3, clear!)).toEqual(
    backdrop.map(v => Math.round(255 * (128 / 255) + v * (1 - 128 / 255)))
  );
  const veiled = blobStill(P, read(`${query}&bg=ffffff80`), { width: W, height: H });
  expect(at(veiled, 4, clear!)).toEqual([255, 255, 255, 128]);
  expect(at(veiled, 4, solid!)[3]).toBe(255);
  expect(blobStill(P, read(`${query}&frost=0`), { width: W, height: H })).not.toEqual(alone);
  expect(blobStill(P, read("shape=7"), { width: W, height: H })).not.toEqual(alone);
});

test("a dark palette's card sets the blob on light, any other on dark", () => {
  expect(blobBackdrop(P)).toEqual([14, 14, 16]);
  expect(blobBackdrop(decodePalette("kYAABnAAA_wAAQEAAD8kpHAR6VwS")!)).toEqual([243, 241, 238]);
});

test("the CSS carries the file inside it, covering the box, its ground the file's own", () => {
  const css = blobCss(P, read(""), { width: 1080, height: 1350 }, "https://grabient.com/k");
  expect(css).toMatch(
    /^\/\* https:\/\/grabient\.com\/k \*\/\nhtml \{\n {2}width: 1080px;\n {2}height: 1350px;\n {2}background: url\("data:image\/svg\+xml,/
  );
  expect(css).toContain('") center / cover no-repeat;\n}\n');
  const data = /url\("data:image\/svg\+xml,([^"]*)"\)/.exec(css)![1];
  expect(data).not.toMatch(/[#<>"]/);
  const svg = blobSvg(P, read(""), { width: 1080, height: 1350 }, "https://grabient.com/k");
  expect(decodeURIComponent(data)).toBe(svg.replace(/\n/g, "").replace(/"/g, "'"));
  expect(blobCss(P, read(""), null, "x")).toContain("html {\n  min-height: 100%;\n  background:");
  // no color under the file, whose own ground covers the box
  expect(blobCss(P, read("bg=10101480"), null, "x")).toContain(
    'background: url("data:image/svg+xml,'
  );
});

test("a GIF is one whole loop at its frame rate, fewer frames past its budget, smaller where too few would be left", () => {
  const plan = (query: string, size = BLOB_GIF_SIZE) => blobGifPlan(read(query), size);
  const most = Math.floor(BLOB_GIF_WORK / (1.5 * 400 * 400));
  // 16 seconds at 12 frames a second, within its budget for three blobs
  expect(plan("")).toEqual({ size: BLOB_GIF_SIZE, frames: Math.min(192, most), seconds: 16 });
  expect(plan("speed=2&fps=24").seconds).toBe(8);
  // 50 a second at most: browsers slow a shorter delay
  expect(plan("speed=4&fps=60").frames).toBe(Math.min(200, most));
  // a large size leaves too few frames: drawn smaller, its shape kept
  const large = plan("", { width: 1600, height: 900 });
  expect(large.frames).toBeGreaterThanOrEqual(96);
  expect(large.size.width / large.size.height).toBeCloseTo(16 / 9, 1);
  expect(1.5 * large.size.width * large.size.height * large.frames).toBeLessThanOrEqual(
    BLOB_GIF_WORK
  );
  // a low frame rate leaves room for a larger size
  expect(plan("fps=2", { width: 600, height: 600 })).toEqual({
    size: { width: 600, height: 600 },
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
  const alone = await blobGif(P, read("speed=4&fps=10&shape=13"), size);
  expect(header(alone)).toEqual({ signature: "GIF89a", width: 48, height: 32 });
  const frames = controls(alone);
  expect(frames.length).toBe(40);
  expect(frames.reduce((sum, f) => sum + f.delay, 0)).toBe(400);
  expect(new Set(frames.map(f => f.disposal))).toEqual(new Set([2]));
  const grounded = controls(await blobGif(P, read("speed=4&fps=10&bg=101014"), size));
  expect(new Set(grounded.map(f => f.disposal))).toEqual(new Set([1]));
});

test("a GIF drawn in parts against one table reads back as the GIF drawn in one piece", async () => {
  const size = { width: 40, height: 30 };
  for (const query of ["speed=4&fps=10", "speed=4&fps=10&bg=101014&frost=0"]) {
    const view = read(query);
    const whole = readGif(await blobGif(P, view, size)).frames;
    // seven frames a part, three blobs counted half again
    const parts = blobGifParts(view, size, 1.5 * 40 * 30 * 7);
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
  expect(blobGifParts(read(""), BLOB_GIF_SIZE).length).toBeLessThanOrEqual(9);
});

test("a palette's blob is the same in every JavaScript engine: its anchors' last digits, which engines differ in, move nothing", () => {
  // Node's V8 and Chrome's decode one of this palette's hues as -93.43961502960886 and -93.43961502960893
  const palette = decodePalette("kKSAEDEVJVQQpMqxBWXeGPsNYdzUyx-eqwA")!;
  const nudged = { anchors: palette.anchors.map(a => ({ ...a, h: a.h * (1 + 4e-16) })) };
  expect(nudged.anchors.map(a => a.h)).not.toEqual(palette.anchors.map(a => a.h));
  const scene = blobScene(palette, BLOB_SIZE);
  expect(blobScene(nudged, BLOB_SIZE).blobs).toEqual(scene.blobs);
  expect(blobScene(nudged, BLOB_SIZE).seed).toBe(scene.seed);
  expect(draw("", BLOB_SIZE, nudged)).toBe(draw("", BLOB_SIZE, palette));
});

test("the frost's noise tables are Chromium's, which its feTurbulence draws from", () => {
  const { lattice, gradients } = blobNoiseTables(9248);
  expect(lattice).toHaveLength(256);
  expect(new Set(lattice).size).toBe(256);
  expect(gradients).toHaveLength(4 * 256 * 4);
  // pinned from the port that matched Chromium's GPU raster pixel for pixel (W/blob-ref/proto/blob-parity)
  expect([...lattice.slice(0, 8)]).toEqual(LATTICE_9248);
  expect([...gradients.slice(0, 8)]).toEqual(GRADIENTS_9248);
  // each gradient is a unit vector kept as two 16-bit values
  for (let i = 0; i < 4 * 256; i++) {
    const x = (gradients[4 * i] | (gradients[4 * i + 1] << 8)) / 32767.5 - 1;
    const y = (gradients[4 * i + 2] | (gradients[4 * i + 3] << 8)) / 32767.5 - 1;
    expect(Math.hypot(x, y)).toBeCloseTo(1, 3);
  }
  expect(blobNoiseTables(9248)).toEqual(blobNoiseTables(9248));
  expect(blobNoiseTables(1).lattice).not.toEqual(lattice);
});
