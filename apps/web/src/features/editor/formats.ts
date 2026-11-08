import { decodePalette } from "@grabient/engine";
import { type ContrastMeasures, contrastPicture, contrastSvg } from "@grabient/engine/contrast.ts";
import { cssBlock } from "@grabient/engine/css.ts";
import type { Stop } from "@grabient/engine/curve.ts";
import {
  type Effect,
  type EffectKind,
  effectFileAddress,
  hasEmbedScript
} from "@grabient/engine/effect.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import { isKitKind } from "@grabient/engine/kit/kinds.ts";
import { artworkSvg } from "@grabient/engine/svg.ts";
import { isSwatchFormat, swatchFile } from "@grabient/engine/swatches.ts";
import { hasVideo } from "@grabient/engine/video-kinds.ts";
import {
  finishOf,
  type Size,
  type SizeChoice,
  type Style,
  sizeParam
} from "@grabient/engine/view.ts";
import { copyHtml, downloadFile } from "@grabient/ui/copy.ts";
import type { Format } from "@grabient/ui/FormatStrip.tsx";
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
import { isAdmin } from "../account/session.ts";
import { seedAddress } from "./address.ts";
import { drawnSoon, grainDataUrl, grainPictureUrl } from "./copy-finish.ts";

/* what a copy carries of a soft or grained picture, for the selection's CSS, which takes its files' code from here */
export { drawnSoon, grainDataUrl };

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
    Figma's own layers (engine/figma-{kind}.ts, figmaHtml), and Copy link the addresses of its files: the palette's
    Markdown naming it, the stylesheet of its first frame, its moving SVG, its first frame as PNG, and the script that
    plays it (server/files/effect-files.ts, embed.ts). */
export const STRIP_EFFECT_COPY: readonly Format[] = ["url", "css", "svg", "png", "html", "figma"];
export const STRIP_EFFECT_LINKS: readonly Format[] = ["md", "css", "svg", "png", "js"];
/** An effect's links: its script where one plays it behind a page (engine/effect.ts's hasEmbedScript). */
export const effectLinkFormats = (kind: EffectKind): readonly Format[] =>
  hasEmbedScript(kind) ? STRIP_EFFECT_LINKS : STRIP_EFFECT_LINKS.filter(f => f !== "js");

/** Whether the server draws a new clip (/{seed}.mp4) for this reader, the clips being a preview: an admin's anywhere,
    and anyone's but on production (server/images/video-make.ts's makerOf), where premium accounts will join the
    admins. A production build is made for grabient.com alone (cloudflare.config.ts), and an admin who put the admin
    tools away sees the strip as any reader does. */
export const drawsClips = (): boolean => import.meta.env.MODE !== "production" || isAdmin();
/** While an effect a clip is drawn of plays (engine/video-kinds.ts), the stage's strip also downloads its MP4, drawn
    and coded in this browser (video-download.ts), and copies its address where the server would draw it for this
    reader (drawsClips). Copy hands over no clip, and a card's strip offers none. */
export const stageFileFormats = (kind: EffectKind): readonly Format[] =>
  hasVideo(kind) ? [...STRIP_FILES, "mp4"] : STRIP_FILES;
export function stageLinkFormats(kind: EffectKind): readonly Format[] {
  const links = effectLinkFormats(kind);
  if (!hasVideo(kind) || !drawsClips()) return links;
  /* the clip among the files, before the script that plays the effect */
  return [...links.filter(f => f !== "js"), "mp4", ...links.filter(f => f === "js")];
}
/** The reason a download of an MP4 fails where this browser cannot make one: no module worker, or no WebAssembly SIMD
    (video-download.ts). */
export const NO_VIDEO_HERE = "no video here";

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
/* an effect's files as the Worker writes them (engine/effect-code.ts), loaded with the first effect taken, and the tags
   that play it behind a page (engine/effect-embed.ts), with the first Copy HTML */
const effectCode = () => import("@grabient/engine/effect-code.ts");
const embedCode = () => import("@grabient/engine/effect-embed.ts");
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
   frame; its grain's image made at `grained`, the pixels it is shown at */
const effectSvgOf = async (p: Taken, effect: Effect, moving: boolean, grained = p.pixels) =>
  (await effectCode()).effectSvg(
    paletteOf(p),
    p.seed,
    moving ? effect : { ...effect, speed: 0 },
    p.angle,
    p.pixels,
    origin(),
    finishOf(p),
    p.grain ? await grainPictureUrl(p.grain, grained) : undefined
  );
/* The first frame the copied tags carry inside the page, a CSS background covering it as the player covers its canvas:
   the glass as a WebP of its design square, drawn by its CPU renderer (a JPEG where the browser makes no WebP), which a
   browser paints at no cost where the glass's SVG held a page's first paint ~80 ms; the blob as its SVG still, the
   stylesheet's own, whose grain its player matches exactly, since the blob's canvas takes the still's place in one
   frame. A soft or grained view's still is finished by the rules around it, as the stylesheet's is (effectLayers):
   blurred over its palette's gradient by a share of the page's longer side, which no picture of the square can be
   where the page is not square, and the grain's tile laid over it at a speck a CSS pixel. */
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
/* the grain's tile as a CSS image a copy carries in itself, where the view has a grain */
const grainImageOf = async (p: Taken) =>
  p.grain ? `url("${await grainDataUrl(p.grain)}")` : undefined;
/* the stylesheet that paints an effect's first frame behind a page, as /{seed}.css?style= serves it, finished by the
   view's soft and grain */
const effectCss = async (p: Taken, effect: Effect) =>
  (await effectCode()).effectStylesheet(
    paletteOf(p),
    p.seed,
    effect,
    p.angle,
    origin(),
    finishOf(p),
    await grainImageOf(p)
  );
/* an effect's SVG moves as the picture does: speed 0 is its first frame */
/* a view's stops as its picture draws them: a soft view's blurred, at their places along the line */
type DrawnStops = Awaited<ReturnType<typeof drawnSoon>>;
/* the gradient's SVG: a soft view's blurred stops (lib/picture.ts), and its grain's image where `grain` brings it */
async function gradientSvg(p: Taken, grain?: string, drawn?: DrawnStops): Promise<string> {
  const d = drawn ?? (await drawnSoon(p.stops, view(p)));
  return artworkSvg(d.stops, view(p), p.seed, origin(), p.pixels, {
    style: d.style,
    at: d.at,
    grain
  });
}
const svgText = async (p: Taken) =>
  p.effect
    ? effectSvgOf(p, p.effect, true)
    : gradientSvg(p, p.grain ? await grainPictureUrl(p.grain, p.pixels) : undefined);
/** The palette's SVG standing still at the pixels taken: the first frame of the effect it plays, else its gradient,
    finished by its soft and grain, the grain's image made at `grained`, the pixels the picture is shown at (a grid's
    tile drawn smaller than its file): what the selection's SVG lays on its grid. */
export const stillSvg = async (p: Taken, grained: Size = p.pixels): Promise<string> =>
  p.effect
    ? effectSvgOf(p, p.effect, false, grained)
    : gradientSvg(p, p.grain ? await grainPictureUrl(p.grain, grained) : undefined);
/* the gradient's CSS: a soft view's blurred stops at their places, and the grain's tile carried in itself */
async function gradientCss(p: Taken): Promise<string> {
  const drawn = await drawnSoon(p.stops, view(p));
  return cssBlock(drawn.stops, drawn.style, p.angle, colorFormat(), {
    ...(drawn.at ? { at: drawn.at } : {}),
    ...(p.grain ? { grain: `url("${await grainDataUrl(p.grain)}")` } : {})
  });
}
const loaded = async (src: string) => {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
};
/* A picture drawn on a canvas at the pixels taken, the grain's tile laid over it as the page lays it, a speck a pixel
   from its corner. */
async function grainedCanvas(
  p: Taken,
  draw: (context: CanvasRenderingContext2D) => void,
  grain?: number
): Promise<HTMLCanvasElement> {
  const tile = grain ? loaded(grainSrc(grain)) : null;
  const { width, height } = p.pixels;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d context");
  draw(context);
  if (tile) {
    context.fillStyle = context.createPattern(await tile, "repeat") ?? "transparent";
    context.fillRect(0, 0, width, height);
  }
  return canvas;
}
/* an SVG as the browser paints it at the pixels taken, the grain's tile laid over it where `grain` asks */
async function svgCanvas(p: Taken, svg: string, grain?: number): Promise<HTMLCanvasElement> {
  const picture = await loaded(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  return grainedCanvas(
    p,
    context => context.drawImage(picture, 0, 0, p.pixels.width, p.pixels.height),
    grain
  );
}
/* The gradient's picture: its SVG painted, the grain's tile over it. A soft angular gradient is the canvas's own conic
   gradient at its blurred stops' places, as the stage's CSS draws it and a card's PNG (ui/exportgrid.ts paintGrid):
   the SVG's fan lays those stops a flat wedge a degree, and a seam the soft blurs over a few degrees showed its wedges
   as steps (John, 7 Nov 2026: "just fix the png output"). The SVG file keeps its fan. */
async function gradientCanvas(p: Taken): Promise<HTMLCanvasElement> {
  const d = await drawnSoon(p.stops, view(p));
  const at = d.at;
  if (!at || d.style !== "angularGradient")
    return svgCanvas(p, await gradientSvg(p, undefined, d), p.grain);
  const { width, height } = p.pixels;
  return grainedCanvas(
    p,
    context => {
      const conic = context.createConicGradient(
        ((p.angle - 90) * Math.PI) / 180,
        width / 2,
        height / 2
      );
      for (const [i, stop] of d.stops.entries()) conic.addColorStop(at[i], stop.hex);
      context.fillStyle = conic;
      context.fillRect(0, 0, width, height);
    },
    p.grain
  );
}
/* the papercut's picture by its CPU drawing (papercut-png.ts), its code asked for with the first one taken: neither a
   page's start nor the Worker's build carries it */
const papercutCanvasOf = async (p: Taken, effect: Effect): Promise<HTMLCanvasElement> =>
  (
    await (import.meta.env.SSR ? (new Promise(() => {}) as never) : import("./papercut-png.ts"))
  ).papercutCanvas(p, effect);
/* An effect's picture is its first frame finished as the site paints it: the silk, the rosette and the blob as their
   finished still SVG paints, which each browser draws within about a level of the site's picture (the blob's frost
   its own), drawn by the browser at once; the papercut by its own CPU drawing (papercut-png.ts); the glass drawn on
   the CPU as its player draws it and blurred there, the same pixels as the server's picture of the address
   (engine/fx-frame.ts), where its SVG is a displacement filter that Firefox and Safari draw a few levels off and
   slowly, the grain's tile laid over it as over the gradient's. */
async function frameCanvas(p: Taken, effect: Effect): Promise<HTMLCanvasElement> {
  const { effectRgba } = await import("@grabient/engine/fx-frame.ts");
  const { width, height } = p.pixels;
  const pixels = await effectRgba(paletteOf(p), effect, p.angle, p.pixels, p.soft);
  return grainedCanvas(
    p,
    context => context.putImageData(new ImageData(pixels, width, height), 0, 0),
    p.grain
  );
}
/** The palette's picture at the pixels taken, standing still, as its PNG is drawn: the first frame of the effect it
    plays, else its gradient (gradientCanvas), finished by its soft and grain. What Copy PNG and Download PNG encode,
    and what the selection lays on its grid. */
export async function pictureCanvas(p: Taken): Promise<HTMLCanvasElement> {
  if (!p.effect) return gradientCanvas(p);
  if (p.effect.kind === "papercut") return papercutCanvasOf(p, p.effect);
  if (p.effect.kind !== "glass") return svgCanvas(p, await effectSvgOf(p, p.effect, false));
  return frameCanvas(p, p.effect);
}
const pngOf = async (p: Taken): Promise<Blob> => {
  const png = await encoded(await pictureCanvas(p), "image/png");
  if (!png) throw new Error("no PNG");
  return png;
};
/* the file's address the site serves, at the pixels the stage shows once the reader set a size; Auto names none */
const fileUrl = (p: Taken, f: Format) =>
  fileAddress({ seed: p.seed, ...view(p) }, f, sizeParam(p.size) ? p.pixels : undefined);

async function writeImage(png: Promise<Blob>): Promise<void> {
  if (!(await copyImage(png))) throw new Error(NO_IMAGE_CLIPBOARD);
}

/* The effect as Figma's own layers at the pixels taken, the frame named for the palette, moving on Figma's timeline
   as the picture moves (its speed), its first frame when held, with its soft and grain as the stage paints them
   (figma-paste.ts figmaFinish): a soft one's edges thin to the gradient its files lay under it, whose code comes for
   a soft view alone. Each effect's code comes on the press, and the Worker's build carries none of it. One branch an
   effect, the switch over every kind, so an effect with none is the compiler's error rather than another's paste */
const figmaHtml = async (p: Taken, effect: Effect): Promise<string> => {
  const finish = finishOf(p);
  const frame = {
    width: p.pixels.width,
    height: p.pixels.height,
    name: p.name || "Grabient",
    finish,
    underlay: finish.soft
      ? (
          await (import.meta.env.SSR
            ? (new Promise(() => {}) as never)
            : import("./figma-underlay.ts"))
        ).effectUnderlay(paletteOf(p), effect, p.angle, finish.soft)
      : null
  };
  const { kind } = effect;
  /* a field effect is its still at any pace, as the strings are (engine/kit/figma.ts), its definition with it */
  if (isKitKind(kind)) {
    const [{ figmaKitHtml }, { kitEffect }] = await (import.meta.env.SSR
      ? (new Promise(() => {}) as never)
      : Promise.all([
          import("@grabient/engine/kit/figma.ts"),
          import("@grabient/engine/kit/registry.ts")
        ]));
    return figmaKitHtml(kitEffect(kind), {
      palette: decodePalette(p.seed)!,
      angle: p.angle,
      shape: effect.look.shape,
      steps: effect.look.steps,
      ...frame
    });
  }
  switch (kind) {
    /* the papercut and the strings are their stills at any pace: their cuts and threads change shape as they move,
       which no layer's track follows */
    case "papercut": {
      const { figmaPapercutHtml } = await (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/figma-papercut.ts"));
      return figmaPapercutHtml({
        palette: decodePalette(p.seed)!,
        angle: p.angle,
        shape: effect.look.shape,
        ...frame
      });
    }
    case "strings": {
      const { figmaStringsHtml } = await (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/figma-strings.ts"));
      return figmaStringsHtml({
        palette: decodePalette(p.seed)!,
        angle: p.angle,
        shape: effect.look.shape,
        bg: effect.look.bg,
        ...frame
      });
    }
    case "silk": {
      const { figmaSilkHtml } = await (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/figma-silk.ts"));
      return figmaSilkHtml({
        palette: decodePalette(p.seed)!,
        angle: p.angle,
        shape: effect.look.shape,
        ...frame,
        speed: effect.speed
      });
    }
    case "rosette": {
      const { figmaRosetteHtml } = await (import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : import("@grabient/engine/figma-rosette.ts"));
      return figmaRosetteHtml({
        palette: decodePalette(p.seed)!,
        angle: p.angle,
        shape: effect.look.shape,
        ...frame,
        speed: effect.speed
      });
    }
    case "blob": {
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
    case "glass": {
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
    }
    default: {
      const none: never = kind;
      throw new Error(`No Copy for Figma for ${none}.`);
    }
  }
};

/** The tags that play an effect behind a page, its first frame inside them, finished by the view's soft and grain, as
    Copy HTML gives them. */
export async function effectHtml(p: Taken, effect: Effect): Promise<string> {
  const [code, embed, still, grain] = await Promise.all([
    effectCode(),
    embedCode(),
    stillOf(p, effect),
    grainImageOf(p)
  ]);
  const finish = finishOf(p);
  return embed.effectEmbedHtml(
    origin(),
    p.seed,
    effect,
    p.angle,
    still,
    finish,
    code.effectLayers(paletteOf(p), effect, p.angle, finish, grain)
  );
}

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

/* an effect's file's address, at the pixels the stage shows once the reader set a size */
const effectFileUrl = (p: Taken, effect: Effect, f: "md" | "css" | "js" | "svg" | "png" | "mp4") =>
  effectFileAddress(
    origin(),
    p.seed,
    effect,
    p.angle,
    f,
    sizeParam(p.size) ? p.pixels : undefined,
    finishOf(p)
  );
/** The address of the effect's clip, which Copy link copies and Download draws in this browser as the server draws it
    (video-download.ts): at the pixels the stage shows once the reader set a size, else at the clip's own. */
export const clipAddress = (p: Taken, effect: Effect) => effectFileUrl(p, effect, "mp4");

/** The address of the palette's file onto the clipboard: while an effect plays, its file's, at the pixels the stage
    shows once the reader set a size, and the Markdown that names it. */
export const copyLink = async (f: Format, p: Taken) =>
  writeText(
    p.effect &&
      (f === "md" || f === "css" || f === "js" || f === "svg" || f === "png" || f === "mp4")
      ? effectFileUrl(p, p.effect, f)
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
