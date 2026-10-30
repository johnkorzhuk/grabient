import { expect, test } from "vitest";
import {
  BLOB_SIZE,
  type BlobView,
  blobCss,
  blobScene,
  blobSearch,
  blobSvg,
  parseBlob
} from "./blob.ts";
import { decodePalette } from "./codec.ts";
import { randomPalette } from "./random.ts";

const read = (query: string) => parseBlob(new URLSearchParams(query));
const P = decodePalette("kS4mdDYzY8lhFPW")!;
const draw = (query = "", size = BLOB_SIZE, palette = P) =>
  blobSvg(palette, read(query), size, "https://grabient.com/k");

test("an address's animation: the default loop, a duration brought into bounds", () => {
  expect(read("")).toEqual({ duration: 16 } satisfies BlobView);
  expect(read("duration=0.5").duration).toBe(2);
  expect(read("duration=600").duration).toBe(120);
  expect(read("duration=7.255").duration).toBe(7.26);
  expect(read("duration=-3&bands=9")).toEqual(read(""));
  expect(blobSearch(read("duration=16.00&junk=1"))).toBe("?style=blob");
  expect(blobSearch(read("duration=9"), ["size=800x600"])).toBe(
    "?style=blob&duration=9&size=800x600"
  );
});

test("the file: eight balls melted and grained by one filter, turned by CSS for a reader who allows motion", () => {
  const svg = draw();
  expect(svg).toBe(draw());
  expect(svg).toContain('width="500" height="500" viewBox="0 0 500 500"');
  expect(svg).not.toContain("preserveAspectRatio");
  expect(svg.match(/<circle /g)).toHaveLength(8);
  expect(svg.match(/<filter /g)).toHaveLength(1);
  for (const step of ["feGaussianBlur", "feTurbulence", "feDisplacementMap", "feComposite"])
    expect(svg).toContain(`<${step} `);
  // nothing behind the blob: the file is transparent around it
  expect(svg).not.toMatch(/<rect /);
  expect(svg).toContain("@media (prefers-reduced-motion:no-preference){");
  // every turn is a whole number of laps in the loop: 16, 8 and 5.333 seconds a lap
  const laps = [...svg.matchAll(/animation-duration:([\d.]+)s/g)].map(m => 16 / Number(m[1]));
  expect(laps.length).toBeGreaterThanOrEqual(3);
  for (const n of laps) expect(n).toBeCloseTo(Math.round(n), 2);
  expect(draw("duration=4")).toContain("animation-duration:4s");
  expect(svg.length).toBeLessThan(5_000);
});

test("each file's names are its own, and each palette has a blob of its own", () => {
  const mark = (svg: string) => /class="(b[0-9a-z]{4})"/.exec(svg)?.[1];
  const other = decodePalette("kKSAEDEVJVQQpMqxBWXeGPsNYdzUyx-eqwA")!;
  expect(mark(draw())).not.toBe(mark(draw("", BLOB_SIZE, other)));
  expect(mark(draw())).not.toBe(mark(draw("duration=8")));
  expect(mark(draw())).not.toBe(mark(draw("", { width: 400, height: 400 })));
  const places = (palette: typeof P) => blobScene(palette, BLOB_SIZE).balls.map(b => b.x);
  expect(places(P)).not.toEqual(places(other));
});

test("the palette's colors lie across the blob, its darker end on one side", () => {
  const scene = blobScene(P, BLOB_SIZE);
  const ends = [scene.color(0), scene.color(1)];
  expect(ends).toEqual(["#f86c1b", "#f9d961"]);
  const ring = scene.balls.filter(b => b.ring).slice(0, 6);
  const darkest = ring.reduce((a, b) => (b.at < a.at ? b : a));
  const lightest = ring.reduce((a, b) => (b.at > a.at ? b : a));
  // the darkest and lightest balls stand on opposite sides of the middle
  expect(darkest.x * lightest.x + darkest.y * lightest.y).toBeLessThan(0);
});

test("the blob stays whole inside its box at every moment of the loop, whatever the palette and the box", () => {
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
  for (let i = 0; i < 60; i++) {
    const palette = randomPalette(rand);
    for (const size of sizes) {
      const scene = blobScene(palette, size);
      const S = Math.min(size.width, size.height);
      expect(scene.wander.x).toBeGreaterThanOrEqual(0);
      expect(scene.wander.y).toBeGreaterThanOrEqual(0);
      for (let k = 0; k < 64; k++) {
        const f = k / 64;
        const cx = size.width / 2 + scene.wander.x * Math.sin(2 * Math.PI * f);
        const cy = size.height / 2 + scene.wander.y * Math.sin(4 * Math.PI * f);
        for (const b of scene.balls) {
          const turn = 2 * Math.PI * (b.phase + b.laps * f);
          let x = b.x + b.swing * Math.cos(turn);
          let y = b.y + b.swing * Math.sin(turn);
          if (b.ring) {
            const a = 2 * Math.PI * scene.spin * f;
            [x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
          }
          const reach = (b.r + 0.1) * scene.R;
          expect(cx + x * scene.R - reach).toBeGreaterThanOrEqual(0.03 * S);
          expect(cx + x * scene.R + reach).toBeLessThanOrEqual(size.width - 0.03 * S);
          expect(cy + y * scene.R - reach).toBeGreaterThanOrEqual(0.03 * S);
          expect(cy + y * scene.R + reach).toBeLessThanOrEqual(size.height - 0.03 * S);
        }
      }
    }
  }
});

test("a wide box lets the blob wander across it, and a square one a little", () => {
  const square = blobScene(P, BLOB_SIZE).wander;
  const wide = blobScene(P, { width: 1200, height: 630 }).wander;
  expect(square.x).toBeGreaterThan(0);
  expect(wide.x).toBeGreaterThan(200);
  expect(wide.y).toBeLessThan(wide.x);
  expect(draw("", { width: 1200, height: 630 })).toMatch(
    /@keyframes b[0-9a-z]{4}x\{from\{transform:translateX\(-\d+/
  );
});

test("the CSS carries the file inside it, the blob as large as the page's box holds it", () => {
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
});
