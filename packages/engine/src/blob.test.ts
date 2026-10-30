import { expect, test } from "vitest";
import {
  BLOB_SIZE,
  type BlobView,
  ballPlace,
  blobBackdrop,
  blobCss,
  blobScene,
  blobSearch,
  blobStill,
  blobSvg,
  parseBlob
} from "./blob.ts";
import { decodePalette } from "./codec.ts";
import { randomPalette } from "./random.ts";

const read = (query: string) => parseBlob(new URLSearchParams(query));
const P = decodePalette("kS4mdDYzY8lhFPW")!;
const draw = (query = "", size = BLOB_SIZE, palette = P) =>
  blobSvg(palette, read(query), size, "https://grabient.com/k");
const count = (svg: string, tag: string) => svg.split(`<${tag} `).length - 1;

test("an address's animation: the default loop with depth, a duration brought into bounds, focus and fill", () => {
  expect(read("")).toEqual({ duration: 16, focus: true, fill: false } satisfies BlobView);
  expect(read("duration=0.5").duration).toBe(2);
  expect(read("duration=600").duration).toBe(120);
  expect(read("duration=7.255").duration).toBe(7.26);
  expect(read("duration=-3&bands=9&focus=1&fill=0")).toEqual(read(""));
  expect(read("focus=0&fill=1")).toMatchObject({ focus: false, fill: true });
  expect(blobSearch(read("duration=16.00&junk=1"))).toBe("?style=blob");
  expect(blobSearch(read("fill=1&duration=9&focus=0"), ["size=800x600"])).toBe(
    "?style=blob&duration=9&focus=0&fill=1&size=800x600"
  );
  // the first frame's query leaves the loop out
  expect(blobSearch(read("duration=9&fill=1"), [], false)).toBe("?style=blob&fill=1");
});

test("the file: the balls drawn frosted and clear, cross-faded by a spot of focus, moved by CSS alone", () => {
  const svg = draw();
  expect(svg).toBe(draw());
  expect(svg).toContain('width="500" height="500" viewBox="0 0 500 500"');
  expect(svg).not.toContain("preserveAspectRatio");
  // eight balls in each drawing, and the spot in each of the two masks
  expect(count(svg, "circle")).toBe(18);
  expect(count(svg, "filter")).toBe(2);
  expect(count(svg, "mask")).toBe(2);
  for (const step of ["feGaussianBlur", "feTurbulence", "feDisplacementMap", "feComposite"])
    expect(svg).toContain(`<${step} `);
  expect(svg).toContain("mix-blend-mode:plus-lighter");
  // nothing behind the blob: the file is transparent around it
  expect(svg.split("</defs>")[1]).not.toContain("<rect ");
  expect(svg).toContain("@media (prefers-reduced-motion:no-preference){");
  expect(svg.length).toBeLessThan(7_000);
});

test("no transform attribute anywhere, so an optimizer moving one onto a moving element cannot shift the drawing", () => {
  for (const query of ["", "focus=0", "fill=1"]) {
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

test("every turn and every to-and-fro makes whole laps in the loop", () => {
  const svg = draw("", { width: 900, height: 500 });
  const turns = [...svg.matchAll(/animation-duration:([\d.]+)s/g)].map(m => 16 / Number(m[1]));
  const sweeps = [...svg.matchAll(/animation:\w+ ([\d.]+)s cubic/g)].map(
    m => 16 / (2 * Number(m[1]))
  );
  expect(turns.length).toBeGreaterThanOrEqual(3);
  expect(sweeps.length).toBeGreaterThanOrEqual(3);
  for (const n of [...turns, ...sweeps]) expect(n).toBeCloseTo(Math.round(n), 2);
  expect(draw("duration=4")).toContain("animation-duration:4s");
});

test("without focus, one frosted drawing at one depth; filled, three blobs on the deep tone, melting past the box", () => {
  const still = draw("focus=0");
  expect(count(still, "circle")).toBe(8);
  expect(count(still, "filter")).toBe(1);
  expect(still).not.toContain("<mask ");
  expect(still).not.toContain("scale(");
  const filled = draw("fill=1", { width: 1280, height: 720 });
  const { backdrop } = blobScene(P, { width: 1280, height: 720 }, true);
  expect(filled).toContain(`<rect width="1280" height="720" fill="${backdrop}"/>`);
  expect(count(filled, "circle")).toBe(3 * 8 * 2 + 3 * 2);
  expect(filled).toMatch(/<filter id="\w+" x="-[\d.]+" y="-[\d.]+"/);
});

test("each file's names are its own, and each palette has a blob of its own", () => {
  const mark = (svg: string) => /class="(b[0-9a-z]{4})"/.exec(svg)?.[1];
  const other = decodePalette("kKSAEDEVJVQQpMqxBWXeGPsNYdzUyx-eqwA")!;
  expect(mark(draw())).not.toBe(mark(draw("", BLOB_SIZE, other)));
  expect(mark(draw())).not.toBe(mark(draw("duration=8")));
  expect(mark(draw())).not.toBe(mark(draw("fill=1")));
  expect(mark(draw())).not.toBe(mark(draw("", { width: 400, height: 400 })));
  const places = (palette: typeof P) => blobScene(palette, BLOB_SIZE).blobs[0].balls.map(b => b.x);
  expect(places(P)).not.toEqual(places(other));
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
      const [blob] = blobScene(palette, size).blobs;
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

test("the first frame as pixels: transparent around the blob, or on a backdrop, and filled on the deep tone", () => {
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
  const filled = blobStill(P, read("fill=1"), { width: W, height: H });
  expect(filled).toHaveLength(3 * W * H);
  const deep = blobScene(P, { width: W, height: H }, true).backdrop!;
  expect(blobStill(P, read("focus=0"), { width: W, height: H })).not.toEqual(alone);
  expect(deep).toMatch(/^#[0-9a-f]{6}$/);
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
  const filled = blobCss(P, read("fill=1"), null, "x");
  const { backdrop } = blobScene(P, BLOB_SIZE, true);
  expect(filled).toContain(`background: ${backdrop} url("data:image/svg+xml,`);
  expect(filled).toContain('") center / cover no-repeat;');
});
