/* An effect's pictures as one PNG, to look at while designing it: a montage of its frames, drawn by the CPU as its
   PNG files are (fx-frame.ts effectDrawn), or its SVG at those times as resvg draws it (fx-still.ts fxFrameSvg), or
   both beside the difference between them, four times over. Every look, palette and time a cell of its own.

     node packages/engine/test/look.ts kind=strings shapes=0,7,417 times=0,30,90 out=/tmp/look.png
     node packages/engine/test/look.ts kind=strings mode=diff size=640x360 out=/tmp/diff.png

   kind: an effect (strings); shapes: shape numbers, 0 as designed (0); times: seconds of the loop at speed 1 (0);
   seeds: palettes' seeds (one vivid palette); angle: 90; size: a cell's pixels (480x270); mode: cpu, svg or diff
   (cpu); cols: cells a row (3); path: the range of an effect that takes one, as its address writes it (none). */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { decodePalette } from "../src/codec.ts";
import { type Effect, effectLook, effectPath, isEffect, isVectorKind } from "../src/effect.ts";
import { effectDrawn } from "../src/fx-frame.ts";
import { fxFrameSvg } from "../src/fx-still.ts";
import { frameDiff, rasterize, resvgReady } from "./raster.ts";

const args = Object.fromEntries(
  process.argv.slice(2).map(a => [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)])
);
const kind = args.kind ?? "strings";
if (!isEffect(kind)) throw new Error(`no effect ${kind}`);
const list = (v: string | undefined, d: string) => (v ?? d).split(",");
const shapes = list(args.shapes, "0").map(Number);
const times = list(args.times, "0").map(Number);
const seeds = list(args.seeds, "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ");
const angle = Number(args.angle ?? 90);
const path = args.path ?? null;
const [W, H] = (args.size ?? "480x270").split("x").map(Number);
const mode = args.mode ?? "cpu";
if (mode !== "cpu" && !isVectorKind(kind)) throw new Error(`${kind} has no frame SVG`);
if (mode !== "cpu") await resvgReady();

/* each cell: the CPU's frame, the SVG's, or both and their difference (x4) */
const cells: Uint8Array[] = [];
for (const seed of seeds)
  for (const shape of shapes)
    for (const t of times) {
      const P = decodePalette(seed);
      if (!P) throw new Error(`no palette ${seed}`);
      const effect: Effect = {
        kind,
        speed: 1,
        fps: 60,
        look: effectLook({ shape: shape || null, path }, kind)
      };
      const size = { width: W, height: H };
      /* a picture that lets the page through is laid over white: the CPU's pixels carry their alpha straight,
         resvg's carry it in their colors already */
      const cpu = async () => {
        const px = (await effectDrawn(P, effect, angle, size, false, t)).pixels;
        const step = px.length / (W * H);
        return Uint8Array.from({ length: W * H * 4 }, (_, i) => {
          const o = step * Math.floor(i / 4);
          const a = step === 4 ? px[o + 3] / 255 : 1;
          return i % 4 === 3 ? 255 : Math.round(px[o + (i % 4)] * a + 255 * (1 - a));
        });
      };
      const overWhite = (px: Uint8Array) =>
        px.map((v, i) => (i % 4 === 3 ? 255 : v + 255 - px[i - (i % 4) + 3]));
      const svg = () =>
        isVectorKind(kind)
          ? overWhite(
              rasterize(
                fxFrameSvg(
                  kind,
                  P,
                  {
                    angle,
                    shape: shape || null,
                    steps: null,
                    zoom: null,
                    path: effectPath(kind, path),
                    bg: null
                  },
                  size,
                  t
                ),
                W
              )
            )
          : new Uint8Array(W * H * 4);
      if (mode === "cpu") cells.push(await cpu());
      else if (mode === "svg") cells.push(svg());
      else {
        const [a, b] = [await cpu(), svg()];
        const d = frameDiff(a, b, W, H);
        console.log(
          `${seed} shape ${shape} t ${t}: mean ${d.mean.toFixed(2)}, p99 ${d.p99.toFixed(2)}, far ${(d.far * 100).toFixed(2)}%`
        );
        cells.push(
          a,
          b,
          a.map((v, i) => (i % 4 === 3 ? 255 : Math.min(255, Math.abs(v - b[i]) * 4)))
        );
      }
    }

const cols = Number(args.cols ?? (mode === "diff" ? 3 : Math.min(3, cells.length)));
const rows = Math.ceil(cells.length / cols);
const MW = W * cols;
const MH = H * rows;
/* the montage as a PNG: RGB rows, each filtered by none, deflated */
const raw = new Uint8Array(MH * (1 + MW * 3));
cells.forEach((cell, c) => {
  const ox = (c % cols) * W;
  const oy = Math.floor(c / cols) * H;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      for (let k = 0; k < 3; k++)
        raw[(oy + y) * (1 + MW * 3) + 1 + (ox + x) * 3 + k] = cell[4 * (y * W + x) + k];
});
const crc = (bytes: Uint8Array) => {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
};
const chunk = (type: string, data: Uint8Array) => {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
  return out;
};
const head = new Uint8Array(13);
new DataView(head.buffer).setUint32(0, MW);
new DataView(head.buffer).setUint32(4, MH);
head.set([8, 2, 0, 0, 0], 8);
const png = [
  Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
  chunk("IHDR", head),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", new Uint8Array())
];
const out = args.out ?? "look.png";
writeFileSync(out, Buffer.concat(png));
console.log(`${out}: ${cells.length} cells, ${MW} by ${MH}`);
