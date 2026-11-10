/* A field effect's clip weight (video.ts VIDEO_WEIGHT), measured as that comment says, beside what kitVideoWeight
   gives it: its frames from a loop's middle, drawn and coded at the sizes its clips fit to at that weight, against a
   pixel of the glass's longest clip (1080 by 1080, 60 frames a second, speed 2.45), the two drawn in turn so the
   machine's other work weighs on both alike (process CPU time). Its kernel must be in the clips' module (`pnpm
   kit:gen`, then video/build.sh). Run it on a quiet machine: under load the same frames measured 39 and 47.

     node packages/engine/test/kit-weight.ts kind=strata

   kind: demo or a kit effect (demo); seeds: palettes' seeds (three); frames: frames drawn a box (10); steps: the
   view's steps, for an effect that takes them (its designed number unless said: the clipWeight a file writes is
   measured there). Wide, tall and square boxes at 60 and 30 frames a second, at the view's angle 135 and 0. */
import { readFileSync } from "node:fs";
import { decodePalette } from "../src/codec.ts";
import demo from "../src/kit/fields/demo.ts";
import {
  KIT_KERNEL_COSTS,
  KIT_KERNEL_KINDS,
  KIT_SHADOW_RUNS
} from "../src/kit/gen/kernel-order.ts";
import { isKitKind } from "../src/kit/kinds.ts";
import { kitEffect } from "../src/kit/registry.ts";
import { kitVideoDrawer, kitVideoWeight, videoDrawer, videoPlan } from "../src/video.ts";

/* Node's WebAssembly, as much of it as this names (the engine's lib knows no host) */
declare const WebAssembly: { Module: new (bytes: Uint8Array) => object };

const args = Object.fromEntries(
  process.argv.slice(2).map(a => [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)])
);
const kind = args.kind ?? "demo";
if (kind !== "demo" && !isKitKind(kind)) throw new Error(`no field effect ${kind}`);
const def = kind === "demo" ? demo : kitEffect(kind);
/* its kernel's cost and its shadows' run, as kit-gen wrote them */
const at = (KIT_KERNEL_KINDS as readonly string[]).indexOf(kind);
const cost = KIT_KERNEL_COSTS[at];
const weight = kitVideoWeight(def, cost, KIT_SHADOW_RUNS[at]);
const seeds = (
  args.seeds ?? "kWnCIwwC47igfOklkTlShq44,kYWS-6SBg-maJvlzj65bITQM2TQ8,kWip242Lq_i9tQBYszteSW_Y"
).split(",");
const n = Number(args.frames ?? 10);
const wasm = new WebAssembly.Module(
  readFileSync(new URL("../src/video/video.wasm", import.meta.url))
);
const cpu = () => {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
};
/* at its designed steps, where it takes any, unless asked: the look's none */
const look = { shape: null, frost: 1, bg: null, steps: args.steps ? Number(args.steps) : null };
const speed = 2.45;
const weights: number[] = [];
for (const seed of seeds) {
  const palette = decodePalette(seed);
  if (!palette) throw new Error(`no palette ${seed}`);
  const longest = { width: 1080, height: 1080 };
  const gplan = videoPlan({ kind: "glass", look }, speed, 60, null);
  const glass = videoDrawer(
    wasm,
    { kind: "glass", palette, look, angle: 135, size: longest, fps: 60 },
    gplan
  );
  for (const [w, h] of [
    [1920, 1080],
    [1080, 1920],
    [1080, 1080]
  ])
    for (const fps of [60, 30])
      for (const angle of [135, 0]) {
        /* the size videoFit fits the clip to at this weight: one loop, at most VIDEO_LIMITS' 60 seconds and work */
        const frames = Math.max(2, Math.round(Math.min(def.loop / speed, 60) * fps));
        const scale = Math.min(1, Math.sqrt(1.6e9 / (w * h * frames * weight)));
        const even = (v: number) => Math.max(16, 2 * Math.floor((v * scale + 1e-9) / 2));
        const size = { width: even(w), height: even(h) };
        const plan = { frames, loops: 1, speed, seconds: frames / fps };
        const clip = kitVideoDrawer(wasm, def, { palette, look, angle, size, fps }, plan);
        let theirs = 0;
        let ours = 0;
        for (let i = 0; i < n; i++) {
          let t = cpu();
          glass.draw(Math.floor(gplan.frames / 2) + i);
          glass.code(i + 1);
          theirs += cpu() - t;
          t = cpu();
          clip.draw(Math.floor(frames / 2) + i);
          clip.code(i + 1);
          ours += cpu() - t;
        }
        weights.push(
          ours / (size.width * size.height) / (theirs / (longest.width * longest.height))
        );
      }
}
weights.sort((a, b) => a - b);
const median = weights[Math.floor(weights.length / 2)];
console.log(
  `${kind}${look.steps === null ? "" : ` at ${look.steps} steps`}, a kernel of ${cost}: kitVideoWeight ${weight.toFixed(1)}; measured ${weights[0].toFixed(1)} to ` +
    `${weights[weights.length - 1].toFixed(1)}, median ${median.toFixed(1)}, in ${weights.length} clips`
);
