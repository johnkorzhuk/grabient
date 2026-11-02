/* The fluted glass's still drawn in the browser, where the server drew none: a navigation in the page, an edit, another
   angle, or the glass chosen. Its code (engine/glass.ts) is no part of a palette page's start, whose first screen has
   the server's still (server/glass-still.ts): it loads on demand, and is asked for with a navigation's editor code and
   as the Appearance menu opens, so the still is there for the editor's first frame. */
import type { GlassGeometry } from "@grabient/engine/glass.ts";
import { readStillKey } from "@grabient/engine/glass-colors.ts";
import { BOOT_MARK } from "./boot.ts";

/** The id of the style in the head that holds the server's still; its data-key names the still it shows. */
export const GLASS_STILL_STYLE = "glass-still";
/** The id of the style in the head that holds the fields the server painted in other stills' places, its data-key
    their names (server/glass-still.ts). */
export const GLASS_FIELD_STYLE = "glass-fields";

let glass: typeof import("@grabient/engine/glass.ts") | null = null;
let recolor: typeof import("./glass-recolor.ts").recolor | null = null;
let loading: Promise<void> | null = null;
/* the one design every size shows, laid out once for each angle and shape */
const designs = new Map<string, GlassGeometry>();

/** The still's code, asked for once. */
export const loadStill = (): Promise<void> =>
  (loading ??= Promise.all([
    import("@grabient/engine/glass.ts"),
    import("./glass-recolor.ts")
  ]).then(([m, r]) => {
    glass = m;
    recolor = r.recolor;
  }));

/** Whether a navigation's editor will draw the still itself: an effect may play, and the page has booted, so the
    server's still is another palette's. */
export const stillWanted = (): boolean =>
  typeof document !== "undefined" &&
  document.documentElement.dataset.glass !== "off" &&
  !document.documentElement.hasAttribute(BOOT_MARK);

/** Whether the server's still is the one this key names. */
export const serverStill = (key: string): boolean =>
  document.getElementById(GLASS_STILL_STYLE)?.dataset.key === key;
/** Whether the server painted this key's field. */
export const serverField = (key: string): boolean =>
  !!document.getElementById(GLASS_FIELD_STYLE)?.dataset.key?.split(" ").includes(key);

const designOf = (
  code: typeof import("@grabient/engine/glass.ts"),
  angle: number,
  shape: number | null
) => {
  const key = `${angle}|${shape ?? 0}`;
  let design = designs.get(key);
  if (!design) {
    design = code.glassGeometry(code.GLASS_DESIGN, angle, shape);
    designs.set(key, design);
  }
  return design;
};

/** The still of these colors at this angle and shape as SVG markup, or null while its code loads. */
export function stillSvg(
  colors: readonly string[],
  angle: number,
  shape: number | null = null
): string | null {
  if (!glass) return null;
  const design = designOf(glass, angle, shape);
  return glass.glassSvg(design, glass.glassField(design, colors), { still: true, cover: true });
}

/** The still `svg` shows, drawn by stillSvg for the colors `from` at this angle, recolored in place with these
    (glass-recolor.ts); false where it must be drawn whole. */
export function recolorStill(
  svg: Element,
  from: readonly string[],
  colors: readonly string[],
  angle: number,
  shape: number | null = null
): boolean {
  if (!glass || !recolor) return false;
  const design = designOf(glass, angle, shape);
  return recolor(svg, glass.glassField(design, from), glass.glassField(design, colors));
}

let gpu: typeof import("@grabient/ui/glass-still.ts") | null = null;
let gpuLoading: Promise<void> | null = null;
/* a picture waits for its still now: the canvas is made at once, not as the page next idles */
let hurried = false;
/* makes the canvas, once its code has come */
let begin: (() => void) | null = null;

/** The GPU's still code (ui/glass-still.ts, which shares the player's chunk), asked for once as a page shows the glass,
    and its canvas made as the page next idles, or at once where a picture waits for its still (`now`): a page as
    busy as a list starting is idle only after the second the wait allows, and its cards showed their fields alone
    for as long. Its programs are built as the GPU gets to them: done once they are, or once they cannot be. The
    browser's alone. */
export const loadGpuStill = (now = false): Promise<void> => {
  if (now) {
    hurried = true;
    begin?.();
  }
  gpuLoading ??= (
    import.meta.env.SSR ? (new Promise(() => {}) as never) : import("@grabient/ui/glass-still.ts")
  ).then(
    m =>
      new Promise<void>(done => {
        let begun = false;
        begin = () => {
          if (begun) return;
          begun = true;
          begin = null;
          /* once the page's still is painted, which a context would otherwise wait on (painted.ts) */
          void (
            import.meta.env.SSR
              ? Promise.resolve()
              : import("./painted.ts").then(p => p.stillPainted())
          )
            .then(() => m.warmGlassStill())
            .then(() => {
              gpu = m;
              done();
            });
        };
        if (hurried) begin();
        else {
          const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 300));
          idle(() => begin?.(), { timeout: 1000 });
        }
      })
  );
  return gpuLoading;
};

/** Whether the GPU's still code and its canvas are ready, so a still costs only its drawing. */
export const gpuReady = (): boolean => gpu !== null;

/** The stills of the cards a feed's page left as the server drew them (data-still: no component of the page owns them
    until the reader moves or the page wakes them, features/list/wake.ts), drawn on the GPU into each card's canvas,
    as a live card's picture draws its own (GlassArt.tsx): those within a screen of the window, the window's first.
    Until then a still card shows its field, where the server painted one, or nothing. Nothing where the GPU's code is
    not ready or cannot draw. */
export function paintStills(root: ParentNode = document): void {
  if (!gpu) return;
  const dpr = devicePixelRatio || 1;
  const holders = [...root.querySelectorAll<HTMLElement>("[data-still] [data-glass-still]")]
    .map(holder => ({ holder, box: holder.getBoundingClientRect() }))
    .filter(
      ({ holder, box }) =>
        box.width > 0 &&
        box.bottom > -innerHeight &&
        box.top < 2 * innerHeight &&
        !holder.querySelector("canvas[data-painted]")
    );
  const inWindow = (box: DOMRect) => box.bottom > 0 && box.top < innerHeight;
  const paint = (list: typeof holders) => {
    for (const { holder, box } of list) {
      const canvas = holder.querySelector("canvas");
      const named = readStillKey(holder.dataset.glassStill ?? "");
      if (!canvas || !named || !gpu) continue;
      /* shape 0 is the glass as designed, which a card's picture names as none: the same layout, kept */
      const bitmap = gpu.glassStillBitmap(
        named.colors,
        named.angle,
        named.shape || null,
        Math.round(box.width * dpr),
        Math.round(box.height * dpr)
      );
      if (!bitmap) return;
      canvas.getContext("bitmaprenderer")?.transferFromImageBitmap(bitmap);
      /* over its field, which it fades in over as a live card's does */
      canvas.setAttribute("data-fades", "");
      canvas.setAttribute("data-painted", "");
    }
  };
  paint(holders.filter(({ box }) => inWindow(box)));
  const near = holders.filter(({ box }) => !inWindow(box));
  if (near.length) requestAnimationFrame(() => paint(near));
}

/** The still drawn on the GPU as a bitmap at a size in device pixels: undefined until its code and its canvas are
    ready, null where the GPU cannot draw it (the SVG then stands in). */
export function gpuStill(
  colors: readonly string[],
  angle: number,
  shape: number | null,
  width: number,
  height: number
): ImageBitmap | null | undefined {
  return gpu ? gpu.glassStillBitmap(colors, angle, shape, width, height) : undefined;
}

/** The still's field (engine/glass.ts's glassFieldBackground), a background shown while the still is on its way,
    or null while its code loads. */
export const stillField = (
  colors: readonly string[],
  angle: number,
  shape: number | null = null
): string | null => glass?.glassFieldBackground(colors, angle, shape) ?? null;

/** The same still as a data URI, for a picture's background, or null while its code loads. */
export function stillUri(
  colors: readonly string[],
  angle: number,
  shape: number | null = null
): string | null {
  const svg = stillSvg(colors, angle, shape);
  return svg && glass ? glass.glassDataUri(svg) : null;
}
