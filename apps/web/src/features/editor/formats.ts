import { decodePalette } from "@grabient/engine";
import { type ContrastMeasures, contrastPicture, contrastSvg } from "@grabient/engine/contrast.ts";
import { cssBlock } from "@grabient/engine/css.ts";
import type { Stop } from "@grabient/engine/curve.ts";
import {
  type Effect,
  type EffectKind,
  effectEmbedHtml,
  effectFileAddress,
  hasEmbedScript
} from "@grabient/engine/effect.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import { artworkSvg } from "@grabient/engine/svg.ts";
import { isSwatchFormat, swatchFile } from "@grabient/engine/swatches.ts";
import {
  finishOf,
  type Size,
  type SizeChoice,
  type Style,
  sizeParam
} from "@grabient/engine/view.ts";
import { copyHtml, downloadFile } from "@grabient/ui/copy.ts";
import type { Format } from "@grabient/ui/FormatStrip.tsx";
import { svgToPngBlob } from "@grabient/ui/figure.ts";
import { colorFormat } from "../../lib/color-format.ts";
import {
  copyImage,
  copySwatches,
  fileAddress,
  saveFile,
  swatchesOf,
  writeText
} from "../../lib/files.ts";
import { grainSrc } from "../../lib/picture.ts";
import { seedAddress } from "./address.ts";
import { drawnSoon, grainDataUrl } from "./copy-finish.ts";

/* What the editor's strips hand over: a palette copied, saved as a file, or as the address of the file the site serves
   for it. A copy and a download of one format hold the same palette; CSS alone differs, since a copy is the
   declaration to paste into a rule and a download is the file the site serves, which works on its own. Every CSS spells
   its colors as the reader chose in Settings. An effect's CSS is the file its address serves either way, its first
   frame on a layer behind the page, which a declaration alone cannot place, and its SVG the file too. */

/* A strip's formats over a picture: Copy hands over the address, the CSS and the pictures, Download saves the files the
   site serves (the Markdown in the address's place), and Copy link copies those files' addresses. A format keeps its
   place as the mode turns, so only the first chip changes. */
export const STRIP_COPY: readonly Format[] = ["url", "css", "svg", "png"];
export const STRIP_FILES: readonly Format[] = ["md", "css", "svg", "png"];
/** While an effect plays, Copy also hands over the two tags that play it behind a page (HTML) and the effect as
    Figma's own layers (engine/figma-glass.ts, figma-blob.ts, figma-silk.ts, figma-rosette.ts), and Copy link the
    addresses of its files: the
    palette's Markdown naming it, the stylesheet of its first frame, its moving SVG, its first frame as PNG, and the
    script that plays it (server/files/effect-files.ts, embed.ts). */
export const STRIP_EFFECT_COPY: readonly Format[] = ["url", "css", "svg", "png", "html", "figma"];
export const STRIP_EFFECT_LINKS: readonly Format[] = ["md", "css", "svg", "png", "js"];
/** An effect's links: its script where one plays it behind a page (engine/effect.ts's hasEmbedScript). */
export const effectLinkFormats = (kind: EffectKind): readonly Format[] =>
  hasEmbedScript(kind) ? STRIP_EFFECT_LINKS : STRIP_EFFECT_LINKS.filter(f => f !== "js");

/** The palette as it is taken: its view, its stops, and the pixels a picture of it is made at. */
export interface Taken {
  seed: string;
  style: Style;
  steps: number;
  angle: number;
  /** the soft and the grain over the gradient, 0 or none for none */
  soft?: number;
  grain?: number;
  size: SizeChoice | null;
  pixels: Size;
  stops: readonly Stop[];
  /** the effect the picture plays in place of the gradient, which a copy or a download takes: moving where it moves
      (an SVG), its first frame otherwise */
  effect?: Effect | null;
  /** the palette's name, which a copy for Figma names its frame */
  name?: string;
}

/** The reason a copy of a picture fails where the browser has no image clipboard. */
export const NO_IMAGE_CLIPBOARD = "no image clipboard";

const origin = () => location.origin;
const view = (p: Taken) => ({
  style: p.style,
  steps: p.steps,
  angle: p.angle,
  ...(p.soft ? { soft: p.soft } : {}),
  ...(p.grain ? { grain: p.grain } : {})
});
/* the palette's address as people share it, with the effect it plays: no language, no locks, no selection */
const pageUrl = (p: Taken) =>
  origin() +
  seedAddress({
    seed: p.seed,
    view: { ...view(p), size: p.size },
    ...(p.effect ? { effect: p.effect } : {})
  });
/* the glass's model and its CPU drawing, loaded with its first file: the editor's first load carries neither */
const model = () => import("@grabient/engine/glass.ts");
const render = () => import("@grabient/engine/glass-render.ts");
/* an effect's files as the Worker writes them (engine/effect-code.ts), loaded with the first effect taken */
const effectCode = () => import("@grabient/engine/effect-code.ts");
const paletteOf = (p: Taken) => decodePalette(p.seed)!;
const colorsOf = (p: Taken) => glassColors(paletteOf(p));
/* the glass's shape where the picture plays it: 0, as designed, otherwise */
const shapeOf = (p: Taken) => (p.effect?.kind === "glass" ? p.effect.look.shape : null);
/* the glass's first frame at a size, drawn as its player draws it */
const glassPixels = async (p: Taken, size: Size) => {
  const [g, r] = await Promise.all([model(), render()]);
  const { geometry, window } = r.glassCover(size, 1, p.angle, shapeOf(p));
  const pixels = r.glassRenderer(geometry, window).frame(g.glassField(geometry, colorsOf(p)), 0);
  const canvas = document.createElement("canvas");
  canvas.width = window.w;
  canvas.height = window.h;
  canvas.getContext("2d")?.putImageData(new ImageData(pixels, window.w, window.h), 0, 0);
  return canvas;
};
const encoded = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>(done => canvas.toBlob(done, type, quality));
/* an effect's SVG at the pixels taken, as /{seed}.svg?style= serves it: moving as the picture moves, or its first
   frame */
const effectSvgOf = async (p: Taken, effect: Effect, moving: boolean) =>
  (await effectCode()).effectSvg(
    paletteOf(p),
    p.seed,
    moving ? effect : { ...effect, speed: 0 },
    p.angle,
    p.pixels,
    origin(),
    finishOf(p),
    p.grain ? await grainDataUrl(p.grain) : undefined
  );
/* The first frame the copied tags carry inside the page, a CSS background covering it as the player covers its canvas:
   the glass as a WebP of its design square, drawn by its CPU renderer (a JPEG where the browser makes no WebP), which a
   browser paints at no cost where the glass's SVG held a page's first paint ~80 ms; the blob as its SVG still, the
   stylesheet's own, whose grain its player matches exactly, since the blob's canvas takes the still's place in one
   frame. */
const STILL_SIDE = 1000;
const dataUrl = (blob: Blob) =>
  new Promise<string>((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result));
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(blob);
  });
const glassStill = async (p: Taken): Promise<string> => {
  const canvas = await glassPixels(p, { width: STILL_SIDE, height: STILL_SIDE });
  const webp = await encoded(canvas, "image/webp", 0.8);
  const picture = webp?.type === "image/webp" ? webp : await encoded(canvas, "image/jpeg", 0.85);
  if (!picture) throw new Error("no still");
  return `url("${await dataUrl(picture)}") 50% 50%/cover no-repeat`;
};
/* the glass's stills made, by all they depend on, the latest few: drawing one holds the page about a quarter of a
   second, so a copy of the same glass again, from the strip or the code pane, takes the one made */
const STILLS_KEPT = 4;
const glassStills = new Map<string, Promise<string>>();
const stillOf = async (p: Taken, effect: Effect): Promise<string> => {
  /* the blob's, the silk's and the rosette's stills are their own SVGs, painted at once */
  if (effect.kind !== "glass")
    return (await effectCode()).effectStill(paletteOf(p), effect, p.angle);
  const key = `${p.seed}|${p.angle}|${shapeOf(p) ?? 0}`;
  let made = glassStills.get(key);
  if (!made) {
    made = glassStill(p);
    glassStills.set(key, made);
    made.catch(() => glassStills.delete(key));
    if (glassStills.size > STILLS_KEPT) glassStills.delete(glassStills.keys().next().value!);
  }
  return made;
};
/* the stylesheet that paints an effect's first frame behind a page, as /{seed}.css?style= serves it */
const effectCss = async (p: Taken, effect: Effect) =>
  (await effectCode()).effectStylesheet(paletteOf(p), p.seed, effect, p.angle, origin());
/* an effect's SVG moves as the picture does: speed 0 is its first frame */
/* the gradient's SVG: a soft view's blurred stops (lib/picture.ts), and its grain's tile where `grain` brings it */
async function gradientSvg(p: Taken, grain?: string): Promise<string> {
  const d = await drawnSoon(p.stops, view(p));
  return artworkSvg(d.stops, view(p), p.seed, origin(), p.pixels, {
    style: d.style,
    at: d.at,
    grain
  });
}
const svgText = async (p: Taken) =>
  p.effect
    ? effectSvgOf(p, p.effect, true)
    : gradientSvg(p, p.grain ? await grainDataUrl(p.grain) : undefined);
/* the gradient's CSS: a soft view's blurred stops at their places, and the grain's tile carried in itself */
async function gradientCss(p: Taken): Promise<string> {
  const drawn = await drawnSoon(p.stops, view(p));
  return cssBlock(drawn.stops, drawn.style, p.angle, colorFormat(), {
    ...(drawn.at ? { at: drawn.at } : {}),
    ...(p.grain ? { grain: `url("${await grainDataUrl(p.grain)}")` } : {})
  });
}
/* the gradient's PNG: its SVG drawn, and the grain's tile laid over it as the page lays it */
async function gradientPng(p: Taken): Promise<Blob> {
  const svg = await gradientSvg(p);
  if (!p.grain) return svgToPngBlob(svg, 1);
  const load = async (src: string) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    return image;
  };
  const [picture, tile] = await Promise.all([
    load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`),
    load(grainSrc(p.grain))
  ]);
  const { width, height } = p.pixels;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d context");
  context.drawImage(picture, 0, 0, width, height);
  context.fillStyle = context.createPattern(tile, "repeat") ?? "transparent";
  context.fillRect(0, 0, width, height);
  const png = await encoded(canvas, "image/png");
  if (!png) throw new Error("no PNG");
  return png;
}
/* An effect's PNG is its first frame finished as the site paints it: the glass, the silk and the rosette drawn on the
   CPU as their players draw them and finished there, the same pixels as the server's picture of the address
   (engine/fx-frame.ts) in every browser, where their finished SVG differs by browser (Safari draws the silk's
   repeating gradients padded inside a filter, so its soft silk lost its folds' light and shade); the blob as its
   finished still SVG paints, its frost the site's own. */
async function framePng(p: Taken, effect: Effect): Promise<Blob> {
  const { effectRgba } = await import("@grabient/engine/fx-frame.ts");
  const { width, height } = p.pixels;
  const pixels = await effectRgba(paletteOf(p), effect, p.angle, p.pixels, finishOf(p));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.putImageData(new ImageData(pixels, width, height), 0, 0);
  const png = await encoded(canvas, "image/png");
  if (!png) throw new Error("no PNG");
  return png;
}
const pngOf = async (p: Taken): Promise<Blob> => {
  if (!p.effect) return gradientPng(p);
  if (p.effect.kind === "blob") return svgToPngBlob(await effectSvgOf(p, p.effect, false), 1);
  return framePng(p, p.effect);
};
/* the file's address the site serves, at the pixels the stage shows once the reader set a size; Auto names none */
const fileUrl = (p: Taken, f: Format) =>
  fileAddress({ seed: p.seed, ...view(p) }, f, sizeParam(p.size) ? p.pixels : undefined);

async function writeImage(png: Promise<Blob>): Promise<void> {
  if (!(await copyImage(png))) throw new Error(NO_IMAGE_CLIPBOARD);
}

/* The effect as Figma's own layers at the pixels taken, the frame named for the palette, moving on Figma's timeline
   as the picture moves (its speed), its first frame when held. Each effect's code comes on the press, and the
   Worker's build carries none of it */
const figmaHtml = async (p: Taken, effect: Effect): Promise<string> => {
  const frame = { width: p.pixels.width, height: p.pixels.height, name: p.name || "Grabient" };
  if (effect.kind === "silk" || effect.kind === "rosette") {
    const look = {
      palette: decodePalette(p.seed)!,
      angle: p.angle,
      shape: effect.look.shape,
      ...frame,
      speed: effect.speed
    };
    if (effect.kind === "silk") {
      const { figmaSilkHtml } = await (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/figma-silk.ts"));
      return figmaSilkHtml(look);
    }
    const { figmaRosetteHtml } = await (import.meta.env.SSR
      ? (new Promise(() => {}) as never)
      : import("@grabient/engine/figma-rosette.ts"));
    return figmaRosetteHtml(look);
  }
  if (effect.kind === "blob") {
    const { figmaBlobHtml } = await (import.meta.env.SSR
      ? (new Promise(() => {}) as never)
      : import("@grabient/engine/figma-blob.ts"));
    return figmaBlobHtml({
      palette: decodePalette(p.seed)!,
      ...effect.look,
      ...frame,
      speed: effect.speed
    });
  }
  const { figmaGlassHtml } = await (import.meta.env.SSR
    ? (new Promise(() => {}) as never)
    : import("@grabient/engine/figma-glass.ts"));
  return figmaGlassHtml({
    colors: colorsOf(p),
    angle: p.angle,
    shape: shapeOf(p),
    ...frame,
    speed: effect.speed
  });
};

/** The tags that play an effect behind a page, its first frame inside them, as Copy HTML gives them. */
export const effectHtml = async (p: Taken, effect: Effect): Promise<string> =>
  effectEmbedHtml(origin(), p.seed, effect, p.angle, await stillOf(p, effect), finishOf(p));

/** The format onto the clipboard. */
export async function copyFormat(f: Format, p: Taken): Promise<void> {
  if (isSwatchFormat(f))
    return copySwatches(names => swatchFile(f, [swatchesOf({ seed: p.seed, ...view(p) }, names)]));
  if (f === "png") return writeImage(pngOf(p));
  if (f === "figma" && p.effect) {
    if (!(await copyHtml(await figmaHtml(p, p.effect)))) throw new Error("Couldn't copy.");
    return;
  }
  if (f === "html" && p.effect) return writeText(await effectHtml(p, p.effect));
  return writeText(
    f === "css"
      ? p.effect
        ? await effectCss(p, p.effect)
        : await gradientCss(p)
      : f === "svg"
        ? await svgText(p)
        : pageUrl(p)
  );
}

/** The format onto the clipboard, or where no picture can go there its PNG saved instead: why a copy failed, where
    the file could not be saved either. */
export async function copyOrSave(f: Format, p: Taken): Promise<"copied" | "downloaded"> {
  try {
    await copyFormat(f, p);
    return "copied";
  } catch (reason) {
    if (f !== "png" || !(reason instanceof Error) || reason.message !== NO_IMAGE_CLIPBOARD)
      throw reason;
    await saveFormat(f, p).catch(() => {
      throw reason;
    });
    return "downloaded";
  }
}

/** The format to a file. */
export async function saveFormat(f: Format, p: Taken): Promise<void> {
  const name = `grabient-${p.seed}${p.effect ? `-${p.effect.kind}` : ""}`;
  if (p.effect && f === "css")
    return downloadFile(
      `${name}.css`,
      new Blob([await effectCss(p, p.effect)], { type: "text/css;charset=utf-8" })
    );
  if (f === "md" || f === "css" || isSwatchFormat(f))
    return saveFile(
      { seed: p.seed, ...view(p) },
      f,
      f === "md" && p.effect
        ? effectFileAddress(origin(), p.seed, p.effect, p.angle, "md", undefined, finishOf(p))
        : undefined
    );
  if (f === "svg")
    return downloadFile(
      `${name}.svg`,
      new Blob([await svgText(p)], { type: "image/svg+xml;charset=utf-8" })
    );
  downloadFile(`${name}.png`, await pngOf(p));
}

/** The address of the palette's file onto the clipboard: while an effect plays, its file's, at the pixels the stage
    shows once the reader set a size, and the Markdown that names it. */
export const copyLink = async (f: Format, p: Taken) =>
  writeText(
    p.effect && (f === "md" || f === "css" || f === "js" || f === "svg" || f === "png")
      ? effectFileAddress(
          origin(),
          p.seed,
          p.effect,
          p.angle,
          f,
          sizeParam(p.size) ? p.pixels : undefined,
          finishOf(p)
        )
      : fileUrl(p, f)
  );

/* Which text reads on the palette's colors, as a picture of its own, the reader's own text colors among its rows: an
   SVG whose samples are text, and a PNG drawn in the page's face at twice its size. */
const CONTRAST: ContrastMeasures = {
  ink: 24,
  band: 64,
  row: 32,
  radius: 6,
  coin: 12,
  text: 13,
  large: 24,
  weight: "500",
  family: "Poppins, sans-serif"
};
async function contrastPng(p: Taken, inks: readonly string[]): Promise<Blob> {
  const hexes = p.stops.map(s => s.hex);
  const picture = contrastPicture(hexes, inks, CONTRAST);
  /* a canvas draws a fallback face until the page's is loaded */
  await Promise.all(
    [CONTRAST.text, CONTRAST.large].map(size =>
      document.fonts.load(`${CONTRAST.weight} ${size}px Poppins`, "Aa")
    )
  ).catch(() => {});
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = picture.width * scale;
  canvas.height = picture.height * scale;
  const c = canvas.getContext("2d");
  if (!c) throw new Error();
  c.scale(scale, scale);
  c.save();
  c.beginPath();
  c.roundRect(CONTRAST.ink, 0, picture.width - CONTRAST.ink, picture.height, CONTRAST.radius);
  c.clip();
  for (const g of picture.grounds) {
    c.fillStyle = g.hex;
    c.fillRect(g.x, 0, CONTRAST.band, picture.height);
  }
  c.restore();
  for (const coin of picture.coins) {
    c.beginPath();
    c.arc(CONTRAST.coin / 2, coin.y, CONTRAST.coin / 2 - 0.5, 0, Math.PI * 2);
    c.fillStyle = coin.hex;
    c.fill();
    c.strokeStyle = "rgba(128, 128, 128, 0.5)";
    c.stroke();
  }
  c.textAlign = "center";
  for (const s of picture.samples) {
    c.font = `${CONTRAST.weight} ${s.size}px ${CONTRAST.family}`;
    c.fillStyle = s.hex;
    c.fillText("Aa", s.x, s.y);
  }
  return new Promise((done, fail) =>
    canvas.toBlob(blob => (blob ? done(blob) : fail(new Error())), "image/png")
  );
}
const contrastText = (p: Taken, inks: readonly string[]) =>
  contrastSvg(
    p.stops.map(s => s.hex),
    pageUrl(p),
    inks,
    CONTRAST
  );
export async function copyContrast(f: Format, p: Taken, inks: readonly string[]): Promise<void> {
  if (f === "png") return writeImage(contrastPng(p, inks));
  return writeText(contrastText(p, inks));
}
export async function saveContrast(f: Format, p: Taken, inks: readonly string[]): Promise<void> {
  const name = `grabient-${p.seed}-contrast`;
  if (f === "png") return downloadFile(`${name}.png`, await contrastPng(p, inks));
  downloadFile(
    `${name}.svg`,
    new Blob([contrastText(p, inks)], { type: "image/svg+xml;charset=utf-8" })
  );
}
