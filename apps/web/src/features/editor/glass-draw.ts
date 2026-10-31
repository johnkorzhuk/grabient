/* The fluted glass's still drawn in the browser, where the server drew none: a navigation in the page, an edit, another
   angle, or the glass chosen. Its code (engine/glass.ts) is no part of a palette page's start, whose first screen has
   the server's still (server/glass-still.ts): it loads on demand, and is asked for with a navigation's editor code and
   as the Appearance menu opens, so the still is there for the editor's first frame. */
import type { GlassGeometry } from "@grabient/engine/glass.ts";
import { BOOT_MARK } from "./boot.ts";

/** The id of the style in the head that holds the server's still; its data-key names the still it shows. */
export const GLASS_STILL_STYLE = "glass-still";

let glass: typeof import("@grabient/engine/glass.ts") | null = null;
let recolor: typeof import("./glass-recolor.ts").recolor | null = null;
let loading: Promise<void> | null = null;
/* the one design every size shows, laid out once for each angle */
const designs = new Map<number, GlassGeometry>();

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

const designOf = (code: typeof import("@grabient/engine/glass.ts"), angle: number) => {
  let design = designs.get(angle);
  if (!design) {
    design = code.glassGeometry(code.GLASS_DESIGN, angle);
    designs.set(angle, design);
  }
  return design;
};

/** The still of these colors at this angle as SVG markup, or null while its code loads. */
export function stillSvg(colors: readonly string[], angle: number): string | null {
  if (!glass) return null;
  const design = designOf(glass, angle);
  return glass.glassSvg(design, glass.glassField(design, colors), { still: true, cover: true });
}

/** The still `svg` shows, drawn by stillSvg for the colors `from` at this angle, recolored in place with these
    (glass-recolor.ts); false where it must be drawn whole. */
export function recolorStill(
  svg: Element,
  from: readonly string[],
  colors: readonly string[],
  angle: number
): boolean {
  if (!glass || !recolor) return false;
  const design = designOf(glass, angle);
  return recolor(svg, glass.glassField(design, from), glass.glassField(design, colors));
}

/** The same still as a data URI, for a picture's background, or null while its code loads. */
export function stillUri(colors: readonly string[], angle: number): string | null {
  const svg = stillSvg(colors, angle);
  return svg && glass ? glass.glassDataUri(svg) : null;
}
