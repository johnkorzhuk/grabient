/* A field effect's pictures while designing it (kit/README.md): a montage of its frames as the CPU draws them, every
   palette, shape and time a cell of its own, or its frames across one loop (strip), and a clip of its motion (clip),
   with what each frame cost and how close its levels crowd: measured at 320 by 180 whatever the cell's size, where
   kit-check holds them (kit-checks.ts KIT_CROWDING_SIZE), a line for each frame past its limit.

     node packages/engine/test/kit-look.ts def=packages/engine/src/kit/fields/demo.ts out=look.png
     node packages/engine/test/kit-look.ts def=<file> shapes=0,7,417 seeds=vivid,pastel,dark times=0 out=look.png
     node packages/engine/test/kit-look.ts def=<file> strip=8 out=strip.png
     node packages/engine/test/kit-look.ts def=<file> clip=motion.mp4 clipsize=480x270 clipspeed=4

   def: a module whose default export is a FieldEffect; shapes (0); times, seconds of the loop (0); seeds: palettes'
   seeds or the names of kit-checks.ts's KIT_PALETTES (vivid); angle (90); size: a cell (480x270); cols (3); strip:
   frames across the loop of the first seed and shape, in place of the times; clip: an MP4 of one loop of the first
   seed and shape at clipspeed times its pace (4), clipsize (480x270), clipfps (24), drawn by ffmpeg (FFMPEG, or
   ~/.local/zig/ffmpeg). */
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import { decodePalette } from "../src/codec.ts";
import { kitRender } from "../src/kit/render.ts";
import { kitScene } from "../src/kit/scene.ts";
import type { FieldEffect } from "../src/kit/types.ts";
import { KIT_CROWDED, KIT_CROWDING_SIZE, KIT_PALETTES, kitCrowding } from "./kit-checks.ts";

const args = Object.fromEntries(
  process.argv.slice(2).map(a => [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)])
);
if (!args.def) throw new Error("def=<a module whose default export is a FieldEffect>");
const mod = await import(pathToFileURL(resolve(args.def)).href);
const def: FieldEffect = mod.default;
if (!def?.field) throw new Error(`${args.def} exports no FieldEffect as its default`);
const list = (v: string | undefined, d: string) => (v ?? d).split(",");
const shapes = list(args.shapes, "0").map(Number);
const seeds = list(args.seeds, "vivid").map(s => KIT_PALETTES[s] ?? s);
const angle = Number(args.angle ?? 90);
const [W, H] = (args.size ?? "480x270").split("x").map(Number);
const strip = Number(args.strip ?? 0);
const times = strip
  ? Array.from({ length: strip }, (_, i) => (i * def.loop) / strip)
  : list(args.times, "0").map(Number);

const paletteOf = (seed: string) => {
  const P = decodePalette(seed);
  if (!P) throw new Error(`no palette ${seed}`);
  return P;
};

const cells: Uint8ClampedArray[] = [];
let ms = 0;
for (const seed of seeds)
  for (const shape of shapes)
    for (const t of times) {
      const look = { angle, shape: shape || null };
      const m = kitScene(def, paletteOf(seed), look, { width: W, height: H });
      const t0 = performance.now();
      cells.push(kitRender(m, t));
      ms += performance.now() - t0;
      if (!strip || t === 0) {
        const c = kitCrowding(def, kitScene(def, paletteOf(seed), look, KIT_CROWDING_SIZE), t);
        if (c > KIT_CROWDED)
          console.log(
            `crowded: ${(c * 100).toFixed(1)}% of pixels at ${KIT_CROWDING_SIZE.width} by ${KIT_CROWDING_SIZE.height} have levels under a pixel apart, of ${KIT_CROWDED * 100}% (seed ${seed}, shape ${shape}, t ${t})`
          );
      }
    }
console.log(
  `${def.kind}: ${cells.length} frames at ${W}x${H}, ${(ms / cells.length).toFixed(0)} ms each (${((1e6 * ms) / cells.length / (W * H)).toFixed(0)} ns a pixel)`
);

function png(rgba: Uint8ClampedArray[], w: number, h: number, cols: number): Buffer {
  const rows = Math.ceil(rgba.length / cols);
  const MW = w * cols;
  const MH = h * rows;
  const raw = new Uint8Array(MH * (1 + MW * 3));
  rgba.forEach((cell, c) => {
    const ox = (c % cols) * w;
    const oy = Math.floor(c / cols) * h;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (let k = 0; k < 3; k++)
          raw[(oy + y) * (1 + MW * 3) + 1 + (ox + x) * 3 + k] = cell[4 * (y * w + x) + k];
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
  return Buffer.concat([
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    chunk("IHDR", head),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array())
  ]);
}

const cols = Number(args.cols ?? Math.min(strip ? 4 : 3, cells.length));
const out = args.out ?? "look.png";
writeFileSync(out, png(cells, W, H, cols));
console.log(`${out}: ${cells.length} cells`);

if (args.clip) {
  const [cw, ch] = (args.clipsize ?? "480x270").split("x").map(Number);
  const fps = Number(args.clipfps ?? 24);
  const speed = Number(args.clipspeed ?? 4);
  const frames = Math.round((def.loop / speed) * fps);
  const ffmpeg =
    process.env.FFMPEG ??
    (existsSync(`${homedir()}/.local/zig/ffmpeg`) ? `${homedir()}/.local/zig/ffmpeg` : "ffmpeg");
  const m = kitScene(
    def,
    paletteOf(seeds[0]),
    { angle, shape: shapes[0] || null },
    { width: cw, height: ch }
  );
  const p = spawn(
    ffmpeg,
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${cw}x${ch}`,
      "-r",
      String(fps),
      "-i",
      "-",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "18",
      args.clip
    ],
    { stdio: ["pipe", "inherit", "inherit"] }
  );
  const px = new Uint8ClampedArray(cw * ch * 4);
  for (let i = 0; i < frames; i++) {
    kitRender(m, (i * speed) / fps, px);
    if (!p.stdin.write(Buffer.from(px.buffer))) await new Promise(r => p.stdin.once("drain", r));
  }
  p.stdin.end();
  await new Promise(r => p.on("close", r));
  console.log(`${args.clip}: ${frames} frames, one loop at ${speed}x`);
}
