/* A picture file read in this browser: decoded, drawn small, and its colors read (@grabient/search/picture.ts). Nothing
   of it is sent anywhere. A page loads this module with its first picture, never with itself. */
import { imageSamples, type Pixels, READ_SIZE, type Sample } from "@grabient/search/picture.ts";

/** the long side the picture is shown and kept at, and the side its colors are read again at as points move */
const SHOW_SIZE = 1200;
const POINT_SIZE = 480;
/** the shown copy's JPEG quality: small enough to keep in the tab, sharp enough to read from again */
const QUALITY = 0.86;

/** A picture as the page holds it: small enough to keep in this tab. */
export interface ReadPicture {
  src: string;
  width: number;
  height: number;
  samples: Sample[];
}

function drawn(source: ImageBitmap | HTMLImageElement, side: number): HTMLCanvasElement {
  const scale = Math.min(1, side / Math.max(source.width, source.height, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No canvas to read the picture on");
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const pixelsOf = (canvas: HTMLCanvasElement): Pixels => {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas to read the picture on");
  return context.getImageData(0, 0, canvas.width, canvas.height);
};

/** A picture file's colors with their spots, and the picture itself, small. Throws when the browser cannot decode the
    file (HEIC outside Safari). */
export async function readImage(file: Blob): Promise<ReadPicture> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file);
  } catch {
    // an SVG decodes only as an image element
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
    source = img;
  }
  const read = drawn(source, READ_SIZE);
  const shown = drawn(source, SHOW_SIZE);
  if ("close" in source) source.close();
  const pixels = pixelsOf(read);
  return {
    src: shown.toDataURL("image/jpeg", QUALITY),
    width: shown.width,
    height: shown.height,
    samples: imageSamples(pixels.data, pixels.width, pixels.height)
  };
}

/** The pixels a held picture's points read their colors from as they move. */
export async function pointPixels(src: string): Promise<Pixels> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return pixelsOf(drawn(img, POINT_SIZE));
}
