import { type ContrastMeasures, contrastPicture, contrastSvg } from "@grabient/engine/contrast.ts";
import { cssBlock, paletteCss } from "@grabient/engine/css.ts";
import type { Stop } from "@grabient/engine/curve.ts";
import { artworkSvg } from "@grabient/engine/svg.ts";
import {
  isSwatchFormat,
  SWATCH_FILES,
  type SwatchFormat,
  swatchFile,
  swatchName,
  swatchPalette
} from "@grabient/engine/swatches.ts";
import {
  type Size,
  type SizeChoice,
  type Style,
  sizeParam,
  viewSearch
} from "@grabient/engine/view.ts";
import { copyText } from "@grabient/ui/copy.ts";
import type { Format } from "@grabient/ui/FormatStrip.tsx";
import { svgToPngBlob } from "@grabient/ui/figure.ts";
import { colorFormat } from "../../lib/color-format.ts";
import { copyImage, downloadFile } from "../../lib/files.ts";
import { seedAddress } from "./address.ts";

/* What the editor's strips hand over: a palette copied, saved as a file, or as the address of the file the site serves
   for it. A copy and a download of one format hold the same palette; CSS alone differs, since a copy is the
   declaration to paste into a rule and a download is the file the site serves, which works on its own. Every CSS spells
   its colors as the reader chose in Settings. */

/** The palette as it is taken: its view, its stops, and the pixels a picture of it is made at. */
export interface Taken {
  seed: string;
  style: Style;
  steps: number;
  angle: number;
  size: SizeChoice | null;
  pixels: Size;
  stops: readonly Stop[];
}

/** The reason a copy of a picture fails where the browser has no image clipboard. */
export const NO_IMAGE_CLIPBOARD = "no image clipboard";

const origin = () => location.origin;
const view = (p: Taken) => ({ style: p.style, steps: p.steps, angle: p.angle });
/* the palette's address as people share it: no language, no locks, no selection */
const pageUrl = (p: Taken) =>
  origin() + seedAddress({ seed: p.seed, view: { ...view(p), size: p.size } });
const svgText = (p: Taken) => artworkSvg(p.stops, view(p), p.seed, origin(), p.pixels);
/* the file's address the site serves, at the pixels the stage shows once the reader set a size; Auto names none, and
   OKLCH, the spelling the file has by itself, is named by no parameter */
function fileUrl(p: Taken, f: Format): string {
  const query = new URLSearchParams(viewSearch(view(p)).slice(1));
  if ((f === "png" || f === "svg") && sizeParam(p.size)) {
    query.set("w", String(p.pixels.width));
    query.set("h", String(p.pixels.height));
  }
  if (f === "css" && colorFormat() !== "oklch") query.set("colors", colorFormat());
  const ending = isSwatchFormat(f) ? SWATCH_FILES[f].extension : f;
  return `${origin()}/${p.seed}.${ending}${query.size ? `?${query}` : ""}`;
}

async function writeImage(png: Promise<Blob>): Promise<void> {
  if (!(await copyImage(png))) throw new Error(NO_IMAGE_CLIPBOARD);
}
const written = async (text: string) => {
  if (!(await copyText(text))) throw new Error();
};

/** The format onto the clipboard. */
export async function copyFormat(f: Format, p: Taken): Promise<void> {
  if (isSwatchFormat(f)) {
    const palette = swatchPalette(p.seed, view(p), origin());
    const file = palette && swatchFile(f, [palette]);
    if (typeof file !== "string") throw new Error();
    return written(file);
  }
  if (f === "png") return writeImage(svgToPngBlob(svgText(p), 1));
  return written(
    f === "css"
      ? cssBlock(p.stops, p.style, p.angle, colorFormat())
      : f === "svg"
        ? svgText(p)
        : pageUrl(p)
  );
}

/** The format to a file. Markdown is the site's own file, saved as it serves it. */
export async function saveFormat(f: Format, p: Taken): Promise<void> {
  const name = `grabient-${p.seed}`;
  if (isSwatchFormat(f)) {
    const palette = swatchPalette(p.seed, view(p), origin());
    if (!palette) throw new Error();
    const file = swatchFile(f, [palette]);
    return downloadFile(
      swatchName(palette.name, f),
      new Blob([file], { type: SWATCH_FILES[f as SwatchFormat].type })
    );
  }
  if (f === "md") {
    const answer = await fetch(fileUrl(p, "md"));
    if (!answer.ok) throw new Error();
    return downloadFile(
      `${name}.md`,
      new Blob([await answer.text()], { type: "text/markdown;charset=utf-8" })
    );
  }
  if (f === "css") {
    const address = origin() + seedAddress({ seed: p.seed, view: view(p) });
    return downloadFile(
      `${name}.css`,
      new Blob([paletteCss(p.stops, view(p), address, colorFormat())], {
        type: "text/css;charset=utf-8"
      })
    );
  }
  if (f === "svg")
    return downloadFile(
      `${name}.svg`,
      new Blob([svgText(p)], { type: "image/svg+xml;charset=utf-8" })
    );
  downloadFile(`${name}.png`, await svgToPngBlob(svgText(p), 1));
}

/** The address of the palette's file onto the clipboard. */
export const copyLink = (f: Format, p: Taken) => written(fileUrl(p, f));

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
  return written(contrastText(p, inks));
}
export async function saveContrast(f: Format, p: Taken, inks: readonly string[]): Promise<void> {
  const name = `grabient-${p.seed}-contrast`;
  if (f === "png") return downloadFile(`${name}.png`, await contrastPng(p, inks));
  downloadFile(
    `${name}.svg`,
    new Blob([contrastText(p, inks)], { type: "image/svg+xml;charset=utf-8" })
  );
}
