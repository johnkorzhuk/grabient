/* Every effect's shader pages on a GPU (SwiftShader where the machine has none), as effect.ts's EFFECT_KINDS lists
   them: the shader code a unit test only reads as text is compiled and run here. The WebGL page, held on its first
   frame (speed 0), is the CPU's first frame within the conformance suite's limits; the WebGPU page's WGSL modules
   compile with no error, and the WebGPU page, held on its first frame, draws it as the WebGL page does within the same
   limits. No page raises an error or logs one, nor a WebGPU validation error, which Chrome logs as a warning
   ("[Invalid BindGroup (unlabeled)] is invalid due to a previous error", 8 Nov 2026). The pages are served from an
   https address of their own, a secure context, which WebGPU asks for; no server of the site's is needed
   (gpu.config.ts). */
import { decodePalette } from "@grabient/engine/codec.ts";
import { srgbToOklab } from "@grabient/engine/color.ts";
import { EFFECT_KINDS, EFFECTS, type Effect, type EffectKind } from "@grabient/engine/effect.ts";
import { effectDrawn } from "@grabient/engine/fx-frame.ts";
import { kitRecord } from "@grabient/engine/kit/kinds.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import type { ShaderKind } from "@grabient/engine/shader-kinds.ts";
import { expect, type Page, test } from "@playwright/test";

type Writer = (kind: ShaderKind, P: Palette, effect: Effect, angle: number, seed: string) => string;
/* each effect's writer of every kind of its shader code, so an effect with shaders and none here is a type error;
   none for an effect with no shader pages (EFFECT_KINDS' `shader`: the aurora, engine/effect-why.ts), which no test
   below asks for */
const WRITERS: Record<EffectKind, (() => Promise<Writer>) | null> = {
  glass: async () => (await import("@grabient/engine/glass-shader.ts")).glassShader,
  /* the blob has no angle */
  blob: async () => {
    const { blobShader } = await import("@grabient/engine/blob-shader.ts");
    return (kind, P, effect, _angle, seed) => blobShader(kind, P, effect, seed);
  },
  silk: async () => (await import("@grabient/engine/silk-shader.ts")).silkShader,
  rosette: async () => (await import("@grabient/engine/rosette-shader.ts")).rosetteShader,
  papercut: async () => (await import("@grabient/engine/papercut-shader.ts")).papercutShader,
  strings: async () => (await import("@grabient/engine/strings-shader.ts")).stringsShader,
  dimple: async () => (await import("@grabient/engine/dimple-shader.ts")).dimpleShader,
  aurora: null,
  /* a field effect's, from its definition and its kernel (engine/kit/shader.ts) */
  ...kitRecord(kind => async (): Promise<Writer> => {
    const [{ kitShader }, { kitEffect }, { kitKernel }] = await Promise.all([
      import("@grabient/engine/kit/shader.ts"),
      import("@grabient/engine/kit/registry.ts"),
      import("@grabient/engine/kit/kernels.ts")
    ]);
    const kernel = await kitKernel(kind);
    return (shader, P, effect, angle, seed) =>
      kitShader(kitEffect(kind), kernel, shader, P, effect, angle, seed);
  })
};

/* an effect's writer; the table says an effect has shader pages, so one with none here is a fault of this file */
const writerOf = (kind: EffectKind): Promise<Writer> => {
  const load = WRITERS[kind];
  if (!load) throw new Error(`the ${kind} has shader pages (EFFECT_KINDS) and no writer here`);
  return load();
};

const SEED = "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ";
const P = decodePalette(SEED) as Palette;
const SIZE = { width: 320, height: 180 };
type Look = {
  angle: number;
  shape: number | null;
  steps: number | null;
  zoom: number | null;
  path: string | null;
  bg: string | null;
};
const LOOKS: readonly Look[] = [
  { angle: 90, shape: null, steps: null, zoom: null, path: null, bg: null },
  { angle: 210, shape: 417, steps: null, zoom: null, path: null, bg: null }
];
/** An effect's looks: LOOKS, and where it takes the view's steps (the sandstone), its fewest as designed and its most at
    a shape and an angle, its levels uniforms the scene sets; where it takes a zoom in its shape's place (the dimple),
    a zoom between and its most at an angle; where it takes a ground whose none is its designed one (the strings), a
    light one, one half clear and a clear one, which its canvas lays premultiplied over the page's white. */
const looksOf = (kind: EffectKind): readonly Look[] => {
  const range = EFFECT_KINDS[kind].steps;
  const zoom = EFFECT_KINDS[kind].zoom;
  const grounds: Look[] =
    EFFECT_KINDS[kind].ground === "designed"
      ? [
          { angle: 210, shape: 417, steps: null, zoom: null, path: null, bg: "#f4efe6" },
          { angle: 90, shape: null, steps: null, zoom: null, path: null, bg: "#10203080" },
          { angle: 90, shape: 7, steps: null, zoom: null, path: null, bg: "#00000000" }
        ]
      : [];
  const zooms: Look[] = zoom
    ? [
        { angle: 90, shape: null, steps: null, zoom: 2.35, path: null, bg: null },
        { angle: 210, shape: null, steps: null, zoom: zoom.most, path: null, bg: null }
      ]
    : [];
  return range
    ? [
        ...LOOKS,
        { angle: 90, shape: null, steps: range.least, zoom: null, path: null, bg: null },
        { angle: 210, shape: 417, steps: range.most, zoom: null, path: null, bg: null },
        ...grounds
      ]
    : [...LOOKS, ...zooms, ...grounds];
};
/* the conformance suite's limits (engine effect-conformance.test.ts): a mean OKLab difference in hundredths, and the
   99th percentile of 3 by 3 neighbourhoods'. The blob's frost is noise in every pixel, which its WebGL page draws
   apart from the CPU's at a mean of 2.4 to 2.9 and a p99 of 3.5 to 5 on SwiftShader (5 Nov 2026): its mean is held at
   3.5, its p99 as every other's. A WebGPU page's first frame is held to its WebGL page's by the same limits, though on
   SwiftShader every effect's two pages draw the same bytes at both looks (8 Nov 2026): a frame 1.5% darker still
   passes, one 10% darker fails */
const LIMIT = { mean: 1.5, p99: 8 };
const MEAN: Partial<Record<EffectKind, number>> = { blob: 3.5 };

/** How far two RGBA frames are apart, as the conformance suite measures them. */
function apart(a: ArrayLike<number>, b: ArrayLike<number>, w: number, h: number) {
  const lab = (p: ArrayLike<number>) =>
    Array.from({ length: w * h }, (_, i) =>
      srgbToOklab(p[4 * i] / 255, p[4 * i + 1] / 255, p[4 * i + 2] / 255)
    );
  const [la, lb] = [lab(a), lab(b)];
  let sum = 0;
  for (let i = 0; i < w * h; i++) sum += Math.hypot(...la[i].map((v, k) => v - lb[i][k]));
  const near: number[] = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const d = [0, 0, 0];
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++)
          for (let k = 0; k < 3; k++)
            d[k] += la[(y + j) * w + x + i][k] - lb[(y + j) * w + x + i][k];
      near.push((Math.hypot(...d) / 9) * 100);
    }
  near.sort((x, y) => x - y);
  return { mean: (sum / (w * h)) * 100, p99: near[Math.floor(near.length * 0.99)] };
}

/** A page of HTML served at an https address of its own, `init` run before its scripts; the errors it raises or logs
    gathered, and the warnings Chrome logs WebGPU's validation errors as. */
async function serve(page: Page, html: string, init?: () => void): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => {
    if (m.type() === "error" || (m.type() === "warning" && m.text().includes("Invalid")))
      errors.push(m.text());
  });
  if (init) await page.addInitScript(init);
  await page.route("https://gpu.test/**", route =>
    route.fulfill({ body: html, contentType: "text/html" })
  );
  await page.goto("https://gpu.test/");
  return errors;
}

/** What holdFrame keeps on a WebGPU page's window: the device, format and alpha its canvas was configured with, and
    the texture it hands the page in place of the canvas's, drawn once the page has submitted a frame into it. */
interface Held {
  heldGpu?: { device: GPUDevice; format: GPUTextureFormat; alpha: GPUCanvasAlphaMode };
  heldTexture?: GPUTexture;
  heldDrawn?: boolean;
}
/** The flags of WebGPU's a read-back takes, a page's globals, which TypeScript's DOM types leave out. */
interface Flags {
  GPUTextureUsage: { RENDER_ATTACHMENT: number; COPY_SRC: number };
  GPUBufferUsage: { COPY_DST: number; MAP_READ: number };
  GPUMapMode: { READ: number };
}

/* A WebGPU canvas does not show in a headless screenshot, and a headless Chromium takes the device of a page that
   presents to one: it warns "A valid external Instance reference no longer exists." and the page says it lost its GPU
   device, having drawn nothing (8 Nov 2026, every effect's page). Run before the page's scripts, this configures no
   canvas: the context hands the page a texture of the canvas's size and format to draw into, which drawnFrame reads
   back once the page has submitted a frame. */
function holdFrame() {
  const held = window as unknown as Held;
  const { GPUTextureUsage } = window as unknown as Flags;
  GPUCanvasContext.prototype.configure = config => {
    held.heldGpu = {
      device: config.device,
      format: config.format,
      alpha: config.alphaMode ?? "opaque"
    };
  };
  GPUCanvasContext.prototype.getCurrentTexture = function (this: GPUCanvasContext) {
    const { width, height } = this.canvas;
    const gpu = held.heldGpu;
    if (!gpu) throw new Error("the canvas's texture asked for before its context is configured");
    let texture = held.heldTexture;
    if (!texture || texture.width !== width || texture.height !== height) {
      texture = gpu.device.createTexture({
        size: [width, height],
        format: gpu.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
      });
      held.heldTexture = texture;
    }
    return texture;
  };
  const submit = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function (this: GPUQueue, buffers: Iterable<GPUCommandBuffer>) {
    submit.call(this, buffers);
    if (held.heldTexture) held.heldDrawn = true;
  };
}

/** A WebGPU page's first frame as the page shows it, RGBA: the texture holdFrame handed it, read back once the page
    has submitted a frame into it, laid over the page's white where the page lays it premultiplied (the blob's, clear
    about its blobs, as its WebGL page's canvas is). */
async function drawnFrame(page: Page): Promise<Uint8Array> {
  await page.waitForFunction(() => (window as unknown as Held).heldDrawn === true, null, {
    timeout: 20_000
  });
  const frame = await page.evaluate(async () => {
    const { heldGpu: gpu, heldTexture: texture } = window as unknown as Held;
    const { GPUBufferUsage, GPUMapMode } = window as unknown as Flags;
    if (!gpu || !texture) throw new Error("no frame held");
    const { width: w, height: h } = texture;
    const row = Math.ceil((w * 4) / 256) * 256;
    const buffer = gpu.device.createBuffer({
      size: row * h,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    const encoder = gpu.device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: row }, [w, h]);
    gpu.device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(buffer.getMappedRange());
    const [r, b] = gpu.format === "bgra8unorm" ? [2, 0] : [0, 2];
    const over = gpu.alpha === "premultiplied";
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * row + 4 * x;
        const o = 4 * (y * w + x);
        const clear = over ? 255 - bytes[i + 3] : 0;
        out[o] = Math.min(255, bytes[i + r] + clear);
        out[o + 1] = Math.min(255, bytes[i + 1] + clear);
        out[o + 2] = Math.min(255, bytes[i + b] + clear);
        out[o + 3] = 255;
      }
    buffer.unmap();
    let text = "";
    for (let i = 0; i < out.length; i += 0x8000)
      text += String.fromCharCode(...out.subarray(i, i + 0x8000));
    return { w, h, rgba: btoa(text) };
  });
  expect([frame.w, frame.h]).toEqual([SIZE.width, SIZE.height]);
  return Buffer.from(frame.rgba, "base64");
}

/** The page's pixels as a screenshot shows them, RGBA. */
async function pixels(page: Page): Promise<number[]> {
  const shot = (await page.screenshot({ type: "png" })).toString("base64");
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height);
    const x = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
    x.drawImage(img, 0, 0);
    return Array.from(x.getImageData(0, 0, img.width, img.height).data);
  }, shot);
}

test.use({ viewport: SIZE, deviceScaleFactor: 1 });

for (const kind of EFFECTS.filter(k => EFFECT_KINDS[k].shader))
  test.describe(`the ${kind}'s shader pages`, () => {
    for (const look of looksOf(kind)) {
      const effect: Effect = {
        kind,
        speed: 0,
        fps: 60,
        look: {
          shape: look.shape,
          frost: 1,
          bg: look.bg,
          steps: look.steps,
          zoom: look.zoom,
          path: look.path
        }
      };
      const named = `angle ${look.angle}, shape ${look.shape}${look.steps === null ? "" : `, ${look.steps} steps`}${look.zoom === null ? "" : `, zoom ${look.zoom}`}${look.bg === null ? "" : `, on ${look.bg}`}`;
      test(`its WebGL page draws its first frame as the CPU does (${named})`, async ({ page }) => {
        const write = await writerOf(kind);
        const errors = await serve(page, write("webgl", P, effect, look.angle, SEED));
        await page.waitForTimeout(1500);
        expect(errors).toEqual([]);
        /* the CPU's frame as the page shows it: three bytes a pixel opaque, four straight alpha over the page's white
           (a blob with no ground is clear about its blobs) */
        const cpu = (await effectDrawn(P, effect, look.angle, SIZE)).pixels;
        const step = cpu.length / (SIZE.width * SIZE.height);
        const rgba = Uint8Array.from({ length: SIZE.width * SIZE.height * 4 }, (_, i) => {
          const p = Math.floor(i / 4);
          if (i % 4 === 3) return 255;
          const a = step === 4 ? cpu[4 * p + 3] / 255 : 1;
          return Math.round(cpu[step * p + (i % 4)] * a + 255 * (1 - a));
        });
        const d = apart(await pixels(page), rgba, SIZE.width, SIZE.height);
        expect(d.mean, `${kind}: ${JSON.stringify(d)}`).toBeLessThan(MEAN[kind] ?? LIMIT.mean);
        expect(d.p99, `${kind}: ${JSON.stringify(d)}`).toBeLessThan(LIMIT.p99);
      });

      test(`its WebGPU page draws its first frame as its WebGL page does (${named})`, async ({
        page,
        context
      }) => {
        const write = await writerOf(kind);
        const errors = await serve(page, write("webgpu", P, effect, look.angle, SEED), holdFrame);
        const frame = await drawnFrame(page);
        const gl = await context.newPage();
        const glErrors = await serve(gl, write("webgl", P, effect, look.angle, SEED));
        await gl.waitForTimeout(1500);
        const d = apart(frame, await pixels(gl), SIZE.width, SIZE.height);
        /* read once the WebGL page has drawn, so a warning the WebGPU page logs late is in */
        expect(errors).toEqual([]);
        expect(glErrors).toEqual([]);
        /* a page that needs WebGPU, or lost its device, says so in place of its canvas */
        expect(await page.evaluate(() => document.body.innerText)).toBe("");
        expect(d.mean, `${kind}: ${JSON.stringify(d)}`).toBeLessThan(MEAN[kind] ?? LIMIT.mean);
        expect(d.p99, `${kind}: ${JSON.stringify(d)}`).toBeLessThan(LIMIT.p99);
      });
    }

    test("its WebGPU page's modules compile with no error", async ({ page }) => {
      const write = await writerOf(kind);
      const effect: Effect = {
        kind,
        speed: 0,
        fps: 60,
        look: { shape: null, frost: 1, bg: null, steps: null, zoom: null, path: null }
      };
      const html = write("webgpu", P, effect, 90, SEED);
      const modules = [
        ...html.matchAll(/<script type="text\/wgsl" id="([^"]+)">([\s\S]*?)<\/script>/g)
      ].map(([, id, code]) => ({ id, code }));
      expect(modules.length).toBeGreaterThan(0);
      /* compiled on a blank page of their own, with a device of their own */
      const errors = await serve(page, "<p>WGSL</p>");
      const messages = await page.evaluate(async list => {
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) return ["no WebGPU adapter"];
        const device = await adapter.requestDevice();
        const out: string[] = [];
        for (const { id, code } of list) {
          const info = await device.createShaderModule({ code }).getCompilationInfo();
          for (const m of info.messages)
            if (m.type === "error") out.push(`${id} ${m.lineNum}:${m.linePos} ${m.message}`);
        }
        return out;
      }, modules);
      expect(messages).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
