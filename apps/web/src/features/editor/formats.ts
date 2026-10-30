import { decodePalette } from "@grabient/engine";
import type { BlobView } from "@grabient/engine/blob.ts";
import { type ContrastMeasures, contrastPicture, contrastSvg } from "@grabient/engine/contrast.ts";
import { cssBlock } from "@grabient/engine/css.ts";
import type { Stop } from "@grabient/engine/curve.ts";
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
/** While the blob plays, its GIF too: a file and a link, never a copy, since a clipboard takes no GIF. */
export const STRIP_BLOB_FILES: readonly Format[] = [...STRIP_FILES, "gif"];

/** The palette as it is taken: its view, its stops, and the pixels a picture of it is made at. */
export interface Taken {
  seed: string;
  style: Style;
  steps: number;
  angle: number;
  size: SizeChoice | null;
  pixels: Size;
  stops: readonly Stop[];
  /** the animated blob the picture plays, whose files a copy or a download takes in place of the gradient's */
  blob?: BlobView | null;
}

/** The reason a copy of a picture fails where the browser has no image clipboard. */
export const NO_IMAGE_CLIPBOARD = "no image clipboard";

const origin = () => location.origin;
const view = (p: Taken) => ({ style: p.style, steps: p.steps, angle: p.angle });
/* the palette's address as people share it: no language, no locks, no selection */
const pageUrl = (p: Taken) =>
  origin() + seedAddress({ seed: p.seed, view: { ...view(p), size: p.size } });
/* the blob's drawing, loaded with its first file: the editor's first load carries none of it */
const blobFiles = () => import("@grabient/engine/blob.ts");
/* the blob's SVG at the pixels taken, moving or as its first frame alone (what a PNG of it holds) */
const blobText = async (p: Taken, blob: BlobView, still = false) =>
  (await blobFiles()).blobSvg(
    decodePalette(p.seed)!,
    { ...blob, still },
    p.pixels,
    `${origin()}/${p.seed}`
  );
const svgText = async (p: Taken) =>
  p.blob ? blobText(p, p.blob) : artworkSvg(p.stops, view(p), p.seed, origin(), p.pixels);
const pngSvg = async (p: Taken) => (p.blob ? blobText(p, p.blob, true) : svgText(p));
/* the file's address the site serves, at the pixels the stage shows once the reader set a size; Auto names none */
const fileUrl = async (p: Taken, f: Format) => {
  const sized = sizeParam(p.size) ? p.pixels : undefined;
  if (p.blob && (f === "svg" || f === "png" || f === "css" || f === "gif"))
    return `${origin()}/${p.seed}.${f}${(await blobFiles()).blobSearch(p.blob, sized ? [`w=${sized.width}`, `h=${sized.height}`] : [])}`;
  return fileAddress({ seed: p.seed, ...view(p) }, f, sized);
};
/* the blob's GIF, made here as the site makes it at its address, so the file and its link hold the same frames; a turn
   for the page between frames keeps it answering while the GIF is made */
const blobGifFile = async (p: Taken, blob: BlobView) => {
  const [{ BLOB_GIF_SIZE }, { blobGif }] = await Promise.all([
    blobFiles(),
    import("@grabient/engine/blob-gif.ts")
  ]);
  const gif = await blobGif(
    decodePalette(p.seed)!,
    { ...blob, still: false },
    sizeParam(p.size) ? p.pixels : BLOB_GIF_SIZE,
    () => new Promise(resolve => setTimeout(resolve, 0))
  );
  return new Blob([gif], { type: "image/gif" });
};
const blobCssText = async (p: Taken, blob: BlobView) =>
  (await blobFiles()).blobCss(
    decodePalette(p.seed)!,
    blob,
    sizeParam(p.size) ? p.pixels : null,
    `${origin()}/${p.seed}`
  );

async function writeImage(png: Promise<Blob>): Promise<void> {
  if (!(await copyImage(png))) throw new Error(NO_IMAGE_CLIPBOARD);
}

/** The format onto the clipboard. */
export async function copyFormat(f: Format, p: Taken): Promise<void> {
  if (isSwatchFormat(f))
    return copySwatches(names => swatchFile(f, [swatchesOf({ seed: p.seed, ...view(p) }, names)]));
  if (f === "png") return writeImage(pngSvg(p).then(svg => svgToPngBlob(svg, 1)));
  return writeText(
    f === "css"
      ? p.blob
        ? await blobCssText(p, p.blob)
        : cssBlock(p.stops, p.style, p.angle, colorFormat())
      : f === "svg"
        ? await svgText(p)
        : pageUrl(p)
  );
}

/** The format to a file. */
export async function saveFormat(f: Format, p: Taken): Promise<void> {
  const name = `grabient-${p.seed}${p.blob ? "-blob" : ""}`;
  if (p.blob && f === "gif") return downloadFile(`${name}.gif`, await blobGifFile(p, p.blob));
  if (p.blob && f === "css")
    return downloadFile(
      `${name}.css`,
      new Blob([await blobCssText(p, p.blob)], { type: "text/css;charset=utf-8" })
    );
  if (f === "md" || f === "css" || isSwatchFormat(f))
    return saveFile({ seed: p.seed, ...view(p) }, f);
  if (f === "svg")
    return downloadFile(
      `${name}.svg`,
      new Blob([await svgText(p)], { type: "image/svg+xml;charset=utf-8" })
    );
  downloadFile(`${name}.png`, await svgToPngBlob(await pngSvg(p), 1));
}

/** The address of the palette's file onto the clipboard. */
export const copyLink = async (f: Format, p: Taken) => writeText(await fileUrl(p, f));

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
