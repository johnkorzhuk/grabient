import { decodePalette } from "@grabient/engine";
import { sampleStops } from "@grabient/engine/curve.ts";
import { effectEmbedHtml, effectFileAddress, parseEffect } from "@grabient/engine/effect.ts";
import { effectStill, effectStylesheet, effectSvg } from "@grabient/engine/effect-code.ts";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { copyFormat, copyLink, type Taken } from "./formats.ts";

/* What the editor's strip hands over while an effect plays: the files its address serves, written by the same code. */

const ORIGIN = "https://grabient.test";
const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";
const P = decodePalette(SEED)!;
let copied: string[] = [];

beforeEach(() => {
  copied = [];
  vi.stubGlobal("location", { origin: ORIGIN });
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: async (text: string) => {
        copied.push(text);
      }
    }
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const effect = (query: string) => parseEffect(new URLSearchParams(query))!;
const taken = (query: string, angle = 45): Taken => ({
  seed: SEED,
  style: "radialGradient",
  steps: 6,
  angle,
  size: null,
  pixels: { width: 1200, height: 700 },
  stops: sampleStops(P, 6),
  effect: effect(query)
});

test("an effect's CSS is the stylesheet its address serves, never the gradient's", async () => {
  for (const query of ["style=glass&shape=12&speed=2", "style=blob&shape=3&bg=%23101014"]) {
    await copyFormat("css", taken(query));
    expect(copied.pop()).toBe(effectStylesheet(P, SEED, effect(query), 45, ORIGIN));
  }
  expect(copied).toEqual([]);
});

test("an effect's SVG moves as the picture does, at the pixels taken, as its file is", async () => {
  await copyFormat("svg", taken("style=glass&speed=2"));
  expect(copied.pop()).toBe(
    effectSvg(P, SEED, effect("style=glass&speed=2"), 45, { width: 1200, height: 700 }, ORIGIN)
  );
  await copyFormat("svg", taken("style=blob&speed=0&shape=3"));
  const still = copied.pop() ?? "";
  expect(still).not.toContain("@keyframes");
  expect(still).toBe(
    effectSvg(
      P,
      SEED,
      effect("style=blob&speed=0&shape=3"),
      45,
      { width: 1200, height: 700 },
      ORIGIN
    )
  );
});

test("the page's address keeps the effect, and its files' addresses carry every setting", async () => {
  await copyFormat("url", taken("style=blob&shape=3&speed=0.5"));
  // the blob has no angle
  expect(copied.pop()).toBe(`${ORIGIN}/${SEED}?style=blob&speed=0.5&shape=3`);
  for (const f of ["md", "css", "js", "svg", "png"] as const) {
    await copyLink(f, taken("style=glass&shape=7"));
    expect(copied.pop()).toBe(
      effectFileAddress(ORIGIN, SEED, effect("style=glass&shape=7"), 45, f)
    );
  }
});

test("the blob's tags carry the stylesheet's own still inside the page", async () => {
  await copyFormat("html", taken("style=blob&shape=3"));
  const blob = effect("style=blob&shape=3");
  expect(copied.pop()).toBe(effectEmbedHtml(ORIGIN, SEED, blob, 45, effectStill(P, blob, 45)));
});

/* A PNG copy as the canvas is asked to make it: what is put on it, drawn on it and laid over it. */
interface Canvas {
  put?: { data: Uint8ClampedArray; width: number; height: number };
  drawn: string[];
  tiles: string[];
  filled?: number[];
}
const GRAIN_BYTES = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
function stubCanvas(): Canvas {
  const canvas: Canvas = { drawn: [], tiles: [] };
  vi.stubGlobal(
    "ImageData",
    class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number
      ) {}
    }
  );
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      async decode() {}
    }
  );
  const context = {
    fillStyle: "",
    scale() {},
    putImageData(data: Canvas["put"]) {
      canvas.put = data;
    },
    drawImage(image: { src: string }) {
      canvas.drawn.push(image.src);
    },
    createPattern(image: { src: string }) {
      canvas.tiles.push(image.src);
      return "tile";
    },
    fillRect(...box: number[]) {
      canvas.filled = box;
    }
  };
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (done: (blob: Blob) => void, type: string) => done(new Blob(["png"], { type }))
    })
  });
  vi.stubGlobal(
    "ClipboardItem",
    class {
      constructor(readonly items: Record<string, Promise<Blob>>) {}
    }
  );
  vi.stubGlobal("navigator", {
    clipboard: {
      write: async (items: { items: Record<string, Promise<Blob>> }[]) => {
        await items[0].items["image/png"];
      }
    }
  });
  vi.stubGlobal("fetch", async () => new Response(new Blob([GRAIN_BYTES], { type: "image/png" })));
  vi.stubGlobal(
    "FileReader",
    class {
      result = "";
      onload = () => {};
      onerror = () => {};
      readAsDataURL(blob: Blob) {
        void blob.arrayBuffer().then(bytes => {
          this.result = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
          this.onload();
        });
      }
    }
  );
  return canvas;
}
const PIXELS = { width: 160, height: 90 };
const finished = (query: string, soft: number, grain: number): Taken => ({
  ...taken(query),
  pixels: PIXELS,
  ...(soft ? { soft } : {}),
  ...(grain ? { grain } : {})
});

test("the glass's PNG is its first frame drawn and blurred by the view's soft on the CPU, the grain's tile laid over it", async () => {
  const { effectRgba } = await import("@grabient/engine/fx-frame.ts");
  const glass = effect("style=glass&shape=5");
  const canvas = stubCanvas();
  await copyFormat("png", finished("style=glass&shape=5", 50, 40));
  expect(canvas.put?.data).toEqual(await effectRgba(P, glass, 45, PIXELS, 50));
  expect([canvas.put?.width, canvas.put?.height]).toEqual([160, 90]);
  expect(canvas.tiles).toEqual(["/assets/grain-test/40.png"]);
  expect(canvas.filled).toEqual([0, 0, 160, 90]);
  /* no soft, its plain frame; no grain, no tile */
  const plain = stubCanvas();
  await copyFormat("png", finished("style=glass&shape=5", 0, 0));
  expect(plain.put?.data).toEqual(await effectRgba(P, glass, 45, PIXELS, 0));
  expect([plain.tiles, plain.filled]).toEqual([[], undefined]);
});

test("the silk's, the rosette's and the blob's PNG is their finished still SVG, its grain inside, drawn by the browser", async () => {
  const tile = `data:image/png;base64,${Buffer.from(GRAIN_BYTES).toString("base64")}`;
  for (const query of ["style=silk&shape=4", "style=rosette", "style=blob&shape=3"]) {
    const canvas = stubCanvas();
    await copyFormat("png", finished(query, 50, 40));
    const svg = effectSvg(
      P,
      SEED,
      { ...effect(query), speed: 0 },
      45,
      PIXELS,
      ORIGIN,
      { soft: 50, grain: 40 },
      tile
    );
    expect(canvas.drawn).toEqual([`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`]);
    expect(canvas.put).toBeUndefined();
    expect(svg).toContain("feGaussianBlur");
    expect(svg).toContain(tile);
  }
});
