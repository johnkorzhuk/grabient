/* The fluted glass's still for a small picture (the Appearance menu's tile, the header's swatch, a card), drawn on the
   GPU by the player's own drawing (glass-player.ts's createGlassDrawing) in one canvas the page shares, off screen, and
   handed over as a bitmap: the glass's first frame at the picture's size in a few milliseconds, where the browser took
   about a tenth of a second to paint the still's SVG, whose filter reads two maps it draws whole, and the very frame a
   player at that size starts from. Null where WebGL 2 or an off-screen canvas is missing: the picture keeps the SVG. */
import { knownSoftwareRenderer, softwareContext } from "./gl-build.ts";
import { createGlassDrawing, type GlassDrawing } from "./glass-player.ts";

let shared:
  | { canvas: OffscreenCanvas; gl: WebGL2RenderingContext; drawing: GlassDrawing }
  | null
  | undefined;

/* the shared canvas and its drawing, made with the first still and again where the browser lost its context */
const open = () => {
  if (shared === null || (shared && !shared.gl.isContextLost())) return shared;
  if (knownSoftwareRenderer()) {
    shared = null;
    return shared;
  }
  try {
    const canvas = new OffscreenCanvas(1, 1);
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false
    });
    /* a renderer on the CPU leaves the stills to the SVG (gl-build.ts) */
    if (gl && softwareContext(gl)) gl.getExtension("WEBGL_lose_context")?.loseContext();
    shared = gl && !gl.isContextLost() ? { canvas, gl, drawing: createGlassDrawing(gl) } : null;
  } catch {
    shared = null;
  }
  return shared;
};

/** Makes the shared canvas and its drawing now, its programs built as the GPU gets to them, so the first still a page
    asks for later costs only its frame: for an idle moment once a page shows the glass. True once they are built,
    false where they cannot be. */
export function warmGlassStill(): Promise<boolean> {
  return new Promise(resolve => {
    const check = () => {
      const state = open()?.drawing.built() ?? null;
      if (state === false) requestAnimationFrame(check);
      else resolve(state === true);
    };
    check();
  });
}

/** The glass's first frame for its colors (glassColors), turned to `angle` and drawn in `shape`, at a size in device
    pixels, as a bitmap a "bitmaprenderer" canvas shows as it is; null where it cannot be drawn here. */
export function glassStillBitmap(
  colors: readonly string[],
  angle: number,
  shape: number | null,
  width: number,
  height: number
): ImageBitmap | null {
  const s = open();
  if (!s) return null;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (s.canvas.width !== w || s.canvas.height !== h) {
    s.canvas.width = w;
    s.canvas.height = h;
  }
  s.drawing.recolor(colors);
  s.drawing.layout(w, h, angle, shape);
  if (!s.drawing.ready()) return null;
  s.drawing.draw(0);
  return s.canvas.transferToImageBitmap();
}
