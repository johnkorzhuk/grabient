import { decodePalette } from "@grabient/engine";
import { type ContrastMeasures, contrastPicture, contrastSvg } from "@grabient/engine/contrast.ts";
import { cssBlock } from "@grabient/engine/css.ts";
import type { Stop } from "@grabient/engine/curve.ts";
import { type Effect, effectEmbedHtml, effectFileAddress } from "@grabient/engine/effect.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import { artworkSvg } from "@grabient/engine/svg.ts";
import { isSwatchFormat, swatchFile } from "@grabient/engine/swatches.ts";
import { type Size, type SizeChoice, type Style, sizeParam } from "@grabient/engine/view.ts";
import { downloadFile } from "@grabient/ui/copy.ts";
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
import { seedAddress } from "./address.ts";

/* What the editor's strips hand over: a palette copied, saved as a file, or as the address of the file the site serves
   for it. A copy and a download of one format hold the same palette; CSS alone differs, since a copy is the
   declaration to paste into a rule and a download is the file the site serves, which works on its own. Every CSS spells
   its colors as the reader chose in Settings. */

/* A strip's formats over a picture: Copy hands over the address, the CSS and the pictures, Download saves the files the
   site serves (the Markdown in the address's place), and Copy link copies those files' addresses. A format keeps its
   place as the mode turns, so only the first chip changes. */
export const STRIP_COPY: readonly Format[] = ["url", "css", "svg", "png"];
export const STRIP_FILES: readonly Format[] = ["md", "css", "svg", "png"];
/** While an effect plays, Copy also hands over the two tags that play it behind a page (HTML), and Copy link the
    addresses of its files: the stylesheet of its first frame, its moving SVG, its first frame as PNG, and the script
    that plays it (server/files/effect-files.ts, embed.ts). */
export const STRIP_EFFECT_COPY: readonly Format[] = ["url", "css", "svg", "png", "html"];
export const STRIP_EFFECT_LINKS: readonly Format[] = ["md", "css", "svg", "png", "js"];

/** The palette as it is taken: its view, its stops, and the pixels a picture of it is made at. */
export interface Taken {
  seed: string;
  style: Style;
  steps: number;
  angle: number;
  size: SizeChoice | null;
  pixels: Size;
  stops: readonly Stop[];
  /** the effect the picture plays in place of the gradient, which a copy or a download takes: moving where it moves
      (an SVG), its first frame otherwise */
  effect?: Effect | null;
}

/** The reason a copy of a picture fails where the browser has no image clipboard. */
export const NO_IMAGE_CLIPBOARD = "no image clipboard";

const origin = () => location.origin;
const view = (p: Taken) => ({ style: p.style, steps: p.steps, angle: p.angle });
/* the palette's address as people share it: no language, no locks, no selection */
const pageUrl = (p: Taken) =>
  origin() + seedAddress({ seed: p.seed, view: { ...view(p), size: p.size } });
/* the glass's model and its CPU drawing, loaded with its first file: the editor's first load carries neither */
const model = () => import("@grabient/engine/glass.ts");
const render = () => import("@grabient/engine/glass-render.ts");
const colorsOf = (p: Taken) => glassColors(decodePalette(p.seed)!);
/* the glass at the pixels taken: the one design covering the box, its ribs at the view's angle, as the picture shows
   it. Moving as the picture moves (`moving`: its speed, its discs on their CSS orbits), otherwise its first frame */
const glassText = async (p: Taken, moving: boolean) => {
  const g = await model();
  const design = g.glassGeometry(g.GLASS_DESIGN, p.angle);
  const speed = p.effect?.speed ?? 0;
  return g
    .glassSvg(design, g.glassField(design, colorsOf(p)), {
      still: !moving || speed === 0,
      speed: speed || 1,
      cover: true
    })
    .replace('width="100%" height="100%"', `width="${p.pixels.width}" height="${p.pixels.height}"`);
};
/* its PNG, its first frame drawn as the player draws it */
const glassPng = async (p: Taken): Promise<Blob> => {
  const [g, r] = await Promise.all([model(), render()]);
  const { geometry, window } = r.glassCover(p.pixels, 1, p.angle);
  const pixels = r.glassRenderer(geometry, window).frame(g.glassField(geometry, colorsOf(p)), 0);
  const canvas = document.createElement("canvas");
  canvas.width = window.w;
  canvas.height = window.h;
  canvas.getContext("2d")?.putImageData(new ImageData(pixels, window.w, window.h), 0, 0);
  return new Promise((done, fail) =>
    canvas.toBlob(blob => (blob ? done(blob) : fail(new Error("no PNG"))), "image/png")
  );
};
/* an SVG as a CSS url(), its markup escaped as a data URI */
const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
/* the blob's view of an effect's settings: moving, or its first frame alone */
const blobViewOf = (effect: Effect, still: boolean) => ({
  speed: effect.speed || 1,
  fps: effect.fps,
  still,
  ...effect.look
});
/* the blob at the pixels taken, credited to the palette's page: moving as the picture moves, otherwise its first
   frame */
const blobCode = () => import("@grabient/engine/blob.ts");
const blobText = async (p: Taken, moving: boolean) => {
  const effect = p.effect;
  if (!effect) return "";
  const b = await blobCode();
  const still = !moving || effect.speed === 0;
  return b.blobSvg(
    decodePalette(p.seed)!,
    blobViewOf(effect, still),
    p.pixels,
    `${origin()}/${p.seed}`
  );
};
const blobCssText = async (p: Taken) => {
  const effect = p.effect;
  if (!effect) return "";
  const b = await blobCode();
  return b.blobCss(
    decodePalette(p.seed)!,
    blobViewOf(effect, true),
    p.size && sizeParam(p.size) ? p.pixels : null,
    `${origin()}/${p.seed}`
  );
};
/* The first frame the copied tags carry inside the page, a CSS background covering it as the player covers its canvas:
   the glass as a WebP of its design square, drawn by its CPU renderer (a JPEG where the browser makes no WebP), which a
   browser paints at no cost where the glass's SVG held a page's first paint ~80 ms; the blob as its SVG still, whose
   grain its player matches exactly, since the blob's canvas takes the still's place in one frame. */
const STILL_SIDE = 1000;
const encoded = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>(done => canvas.toBlob(done, type, quality));
const dataUrl = (blob: Blob) =>
  new Promise<string>((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result));
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(blob);
  });
const stillOf = async (p: Taken, effect: Effect): Promise<string> => {
  if (effect.kind === "blob") {
    const b = await blobCode();
    return b.blobStillBackground(decodePalette(p.seed)!, {
      speed: 1,
      fps: null,
      still: true,
      ...effect.look
    });
  }
  const [g, r] = await Promise.all([model(), render()]);
  const side = { width: STILL_SIDE, height: STILL_SIDE };
  const { geometry, window } = r.glassCover(side, 1, p.angle);
  const pixels = r.glassRenderer(geometry, window).frame(g.glassField(geometry, colorsOf(p)), 0);
  const canvas = document.createElement("canvas");
  canvas.width = window.w;
  canvas.height = window.h;
  canvas.getContext("2d")?.putImageData(new ImageData(pixels, window.w, window.h), 0, 0);
  const webp = await encoded(canvas, "image/webp", 0.8);
  const picture = webp?.type === "image/webp" ? webp : await encoded(canvas, "image/jpeg", 0.85);
  if (!picture) throw new Error("no still");
  return `url("${await dataUrl(picture)}") 50% 50%/cover no-repeat`;
};
/* a page's background: the first frame, since a background that moved would repaint the glass's whole filter under
   everything on the page every frame */
const glassCss = async (p: Taken) =>
  `/* ${origin()}/${p.seed} */\nhtml {\n  min-height: 100%;\n  background: ${svgUrl(await glassText(p, false))} center / cover no-repeat;\n}\n`;
/* an effect's SVG moves as the picture does: speed 0 is its first frame */
const svgText = async (p: Taken) =>
  p.effect?.kind === "blob"
    ? blobText(p, true)
    : p.effect
      ? glassText(p, true)
      : artworkSvg(p.stops, view(p), p.seed, origin(), p.pixels);
/* a PNG is the first frame: the glass as its player draws it, the blob as its still SVG paints */
const pngOf = async (p: Taken) =>
  p.effect?.kind === "blob"
    ? svgToPngBlob(await blobText(p, false), 1)
    : p.effect
      ? glassPng(p)
      : svgToPngBlob(artworkSvg(p.stops, view(p), p.seed, origin(), p.pixels), 1);
const effectCss = (p: Taken) => (p.effect?.kind === "blob" ? blobCssText(p) : glassCss(p));
/* the file's address the site serves, at the pixels the stage shows once the reader set a size; Auto names none */
const fileUrl = (p: Taken, f: Format) =>
  fileAddress({ seed: p.seed, ...view(p) }, f, sizeParam(p.size) ? p.pixels : undefined);

async function writeImage(png: Promise<Blob>): Promise<void> {
  if (!(await copyImage(png))) throw new Error(NO_IMAGE_CLIPBOARD);
}

/** The format onto the clipboard. */
export async function copyFormat(f: Format, p: Taken): Promise<void> {
  if (isSwatchFormat(f))
    return copySwatches(names => swatchFile(f, [swatchesOf({ seed: p.seed, ...view(p) }, names)]));
  if (f === "png") return writeImage(pngOf(p));
  if (f === "html" && p.effect)
    return writeText(
      effectEmbedHtml(origin(), p.seed, p.effect, p.angle, await stillOf(p, p.effect))
    );
  return writeText(
    f === "css"
      ? p.effect
        ? await effectCss(p)
        : cssBlock(p.stops, p.style, p.angle, colorFormat())
      : f === "svg"
        ? await svgText(p)
        : pageUrl(p)
  );
}

/** The format to a file. */
export async function saveFormat(f: Format, p: Taken): Promise<void> {
  const name = `grabient-${p.seed}${p.effect ? `-${p.effect.kind}` : ""}`;
  if (p.effect && f === "css")
    return downloadFile(
      `${name}.css`,
      new Blob([await effectCss(p)], { type: "text/css;charset=utf-8" })
    );
  if (f === "md" || f === "css" || isSwatchFormat(f))
    return saveFile({ seed: p.seed, ...view(p) }, f);
  if (f === "svg")
    return downloadFile(
      `${name}.svg`,
      new Blob([await svgText(p)], { type: "image/svg+xml;charset=utf-8" })
    );
  downloadFile(`${name}.png`, await pngOf(p));
}

/** The address of the palette's file onto the clipboard: while an effect plays, its file's, at the pixels the stage
    shows once the reader set a size. */
export const copyLink = async (f: Format, p: Taken) =>
  writeText(
    p.effect && (f === "css" || f === "js" || f === "svg" || f === "png")
      ? effectFileAddress(
          origin(),
          p.seed,
          p.effect,
          p.angle,
          f,
          sizeParam(p.size) ? p.pixels : undefined
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
