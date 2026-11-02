/* The blob as WebGL: the same scene the SVG draws (engine/blob.ts), the one design scaled to cover the canvas as the
   SVG scales it, at the screen's own density, and drawn by the SVG's own filter as
   Chromium's GPU raster runs it, so its first frame is the still's to about a level and it takes over without a
   seam. Measured stage by stage against Chromium (W/blob-ref/proto/blob-parity):
     - the frost is feTurbulence exactly: Skia's tables (blobNoiseTables) read as Ganesh reads them, each device
       pixel's center mapped into the design, plus half a unit, times the base frequency, two octaves of four
       channels, premultiplied and kept as 8 bits. It never moves, so it is baked once a size into a texture, one
       pass on the GPU, and a frame reads it with one texelFetch;
     - the melt is a Gaussian of the filter's deviation, truncated at three, which is what Ganesh's halvings, its
       sigma-4 blur and its bilinear upscale come to: the balls are drawn small (the deviation spans BLOB_TEXELS
       texels), the texture is blurred across and down, and read bilinearly at device pixels, kept as 8 bits as
       Chromium resolves it. The filter region crops what the blur gives, not what it reads;
     - feDisplacementMap reads the noise unpremultiplied and saturated and the melt at the nearest device pixel,
       floor(p + 0.5 + scale * (noise - 0.5)); the lift and the speckle are the filter's color matrices and arithmetic
       composite in float on those 8-bit values, the result kept as 8 bits and laid on the ground, which may let what is
       behind the canvas through.
   The shaders and the numbers they are laid out by are engine/blob-gl.ts's, which the shader exports run too
   (engine/blob-shader.ts). A frame costs the balls (24 instanced quads into a texture of a few thousand texels), two
   blur passes there, and one full-size pass of two texture reads and a few dozen operations. Nothing is allocated per
   frame. It stops while the canvas is out of view or the page hidden, draws the first frame alone for a reader who
   asks for less motion, and returns null where WebGL 2 is missing, which leaves whatever the page drew under it. */
import {
  BLOB_DESIGN,
  BLOB_LOOP,
  type BlobScene,
  type BlobView,
  blobFilter,
  blobNoiseTables,
  blobPlaces,
  blobScene
} from "@grabient/engine/blob.ts";
import {
  BLOB_BLUR_FS,
  BLOB_DOTS_FS,
  BLOB_DOTS_VS,
  BLOB_FINAL_FS,
  BLOB_FULL_VS,
  BLOB_NOISE_FS,
  BLOB_RADIUS,
  type BlobMap,
  type BlobMeltBox,
  blobCanvas,
  blobMap,
  blobMelt
} from "@grabient/engine/blob-gl.ts";
import { hexBytes } from "@grabient/engine/color.ts";
import { EFFECT_EASE_S, EFFECT_SETTLE_MS, groundParts } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { buildPrograms, knownSoftwareRenderer, softwareContext } from "./gl-build.ts";
import { createPace } from "./pace.ts";

export interface BlobPlayer {
  /** a new palette or view: the motion carries on from where it is; at speed 0 it holds its frame */
  set(palette: Palette, view: BlobView): void;
  /** back to the first frame, the still's own, from which the motion eases in again */
  rewind(): void;
  /** reads `reduced` again: the first frame held, or the motion going on */
  motion(): void;
  /** stop and let the context go */
  destroy(): void;
}

const QUAD = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

/** Plays a palette's blob into a canvas the page sizes with CSS. `onFirstFrame` is told once the first frame is on the
    canvas, so a page can fade it in over what it drew before. */
export function playBlob(
  canvas: HTMLCanvasElement,
  palette: Palette,
  view: BlobView,
  onFirstFrame?: () => void,
  /** `ease: false` starts the motion at its pace, as a card's picture under the pointer does, where a page's picture
      eases in from rest. `reduced` is whether the reader asks for less motion, which holds the first frame: the
      caller's decision (the site's Settings, an embed's media query), read as it starts and on motion() */
  options: { ease?: boolean; reduced?: () => boolean } = {}
): BlobPlayer | null {
  const easing = options.ease === false ? 0 : EFFECT_EASE_S;
  /* a renderer the page has found on the CPU plays nothing, no context made: the still stays (gl-build.ts) */
  if (knownSoftwareRenderer()) return null;
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false
  });
  if (!gl) return null;
  /* a renderer on the CPU plays nothing: the still stays (gl-build.ts) */
  if (softwareContext(gl)) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
  /* built as the GPU gets to them (gl-build.ts): the first frame waits for them, the still covering the box */
  const programs = buildPrograms(gl, [
    [BLOB_DOTS_VS, BLOB_DOTS_FS],
    [BLOB_FULL_VS, BLOB_BLUR_FS],
    [BLOB_FULL_VS, BLOB_NOISE_FS],
    [BLOB_FULL_VS, BLOB_FINAL_FS]
  ]);
  const [dots, blur, bake, final] = programs.list as [
    WebGLProgram,
    WebGLProgram,
    WebGLProgram,
    WebGLProgram
  ];
  /* the melt in half floats where they can be drawn into, so its blur adds no rounding of its own */
  const half = !!(
    gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float")
  );
  const at = (p: WebGLProgram, names: string[]) =>
    Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
  /* read once the programs are built: reading them before waits for them */
  const locations = () => ({
    dots: at(dots, ["size"]),
    blur: at(blur, ["source", "step_by", "taps", "weights"]),
    bake: at(bake, ["lattice", "gradients", "scale", "offset", "frequency"]),
    final: at(final, [
      "melt",
      "noise",
      "canvas_h",
      "melt_origin",
      "melt_texel",
      "region",
      "scatter",
      "frosted",
      "lift",
      "gray",
      "k",
      "ground"
    ])
  });
  let U = null as ReturnType<typeof locations> | null;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
  const instances = gl.createBuffer();
  const dotsVao = gl.createVertexArray();
  gl.bindVertexArray(dotsVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, instances);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
  gl.vertexAttribDivisor(2, 1);
  const fullVao = gl.createVertexArray();
  gl.bindVertexArray(fullVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const texture = (filter: number) => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const melt = [0, 1].map(() => ({ texture: texture(gl.LINEAR), frame: gl.createFramebuffer()! }));
  const noise = { texture: texture(gl.NEAREST), frame: gl.createFramebuffer()! };
  const latticeTex = texture(gl.NEAREST);
  const gradientTex = texture(gl.NEAREST);

  /* everything a frame needs that changes only with the palette, the view or the box */
  let palette_ = palette;
  let view_ = view;
  let scene: BlobScene;
  let look: ReturnType<typeof blobFilter>;
  let tablesSeed = -1;
  let data = new Float32Array(0);
  let ground = [0, 0, 0, 0];
  /* the device map: a design unit is (sx, sy) device pixels, its corner at (tx, ty) */
  let map: BlobMap = { sx: 1, sy: 1, tx: 0, ty: 0 };
  let canvasSize = { w: 1, h: 1 };
  let meltBox: BlobMeltBox = { x: 0, y: 0, texel: 1, w: 1, h: 1 };
  /* the melt textures' size as last made */
  let made = { w: 0, h: 0 };
  let regionPx = [0, 0, 1, 1];
  const weights = new Float32Array(BLOB_RADIUS + 1);
  let taps = 0;
  /* whether the noise texture holds this size's and this seed's noise */
  let baked = false;

  /** the scene, its colors and its numbers, for the palette and the view */
  const prepare = () => {
    scene = blobScene(palette_, BLOB_DESIGN, view_);
    look = blobFilter(view_, BLOB_DESIGN, scene);
    const n = scene.blobs.reduce((sum, b) => sum + b.balls.length, 0);
    if (data.length !== 8 * n) {
      data = new Float32Array(8 * n);
      gl.bindBuffer(gl.ARRAY_BUFFER, instances);
      gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    }
    let i = 0;
    for (const blob of scene.blobs)
      for (const b of blob.balls) {
        const [r, g, bl] = hexBytes(scene.color(b.at)).map(v => v / 255);
        data[8 * i + 4] = r;
        data[8 * i + 5] = g;
        data[8 * i + 6] = bl;
        data[8 * i + 7] = 1;
        i++;
      }
    if (scene.backdrop) {
      const { hex, alpha } = groundParts(scene.backdrop);
      ground = [...hexBytes(hex).map(v => (v / 255) * alpha), alpha];
    } else ground = [0, 0, 0, 0];
    if (look.seed !== tablesSeed) {
      const { lattice, gradients } = blobNoiseTables(look.seed);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.bindTexture(gl.TEXTURE_2D, latticeTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8UI,
        256,
        1,
        0,
        gl.RED_INTEGER,
        gl.UNSIGNED_BYTE,
        lattice
      );
      gl.bindTexture(gl.TEXTURE_2D, gradientTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, gradients);
      tablesSeed = look.seed;
      baked = false;
    }
  };

  /* the canvas's size in device pixels, as the browser lays it out, where it says (devicePixelContentBoxSize) */
  let device: { w: number; h: number } | null = null;
  /* the box last measured, in CSS pixels, and device pixels a CSS pixel */
  let box = { W: 1, H: 1, kx: 1, ky: 1 };
  /** the canvas at its size: the design's map to its pixels, as Chromium maps the SVG (its viewBox scaled to the CSS
      box times the density, the box's corner on the device pixel the canvas's is), the filter region, the melt's
      texture and the blur's weights. `measure` reads the box again and sizes the canvas to it; a palette or a look
      alone (set) keeps the box measured last, whose read would lay the page out in the middle of a drag, and makes
      the textures again only for another size. */
  const layout = (measure = true): boolean => {
    if (measure) {
      const rect = canvas.getBoundingClientRect();
      /* a canvas off the page or hidden has no box: it keeps the layout it had, for the box it comes back to */
      if (!rect.width || !rect.height) return false;
      const W = Math.max(1, rect.width);
      const H = Math.max(1, rect.height);
      const { w: cw, h: ch, kx, ky } = blobCanvas(W, H, devicePixelRatio || 1, device);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      if (canvasSize.w !== cw || canvasSize.h !== ch) baked = false;
      canvasSize = { w: cw, h: ch };
      box = { W, H, kx, ky };
    }
    const { W, H, kx, ky } = box;
    const next = blobMap(W, H, kx, ky);
    if (next.sx !== map.sx || next.sy !== map.sy || next.tx !== map.tx || next.ty !== map.ty)
      baked = false;
    map = next;
    /* the filter region, the melt's texture and the blur's weights (engine/blob-gl.ts) */
    const melted = blobMelt(look, map, canvasSize.w, canvasSize.h, weights);
    regionPx = melted.region;
    meltBox = melted.box;
    taps = melted.taps;
    if (!measure && meltBox.w === made.w && meltBox.h === made.h) return true;
    made = { w: meltBox.w, h: meltBox.h };
    const format = half ? gl.RGBA16F : gl.RGBA8;
    const type = half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    for (const { texture: t, frame } of melt) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, format, meltBox.w, meltBox.h, 0, gl.RGBA, type, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  };

  /** the frost's noise at every device pixel, once a size and seed */
  const bakeNoise = () => {
    U ??= locations();
    const u = U.bake;
    const { w, h } = canvasSize;
    gl.bindTexture(gl.TEXTURE_2D, noise.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, noise.frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, noise.texture, 0);
    gl.viewport(0, 0, w, h);
    gl.useProgram(bake);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, latticeTex);
    gl.uniform1i(u.lattice, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, gradientTex);
    gl.uniform1i(u.gradients, 1);
    gl.uniform2f(u.scale, map.sx, map.sy);
    gl.uniform2f(u.offset, map.tx, map.ty);
    gl.uniform1f(u.frequency, look.frequency);
    gl.bindVertexArray(fullVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
    baked = true;
  };

  const draw = (f: number) => {
    U ??= locations();
    if (look.noise && !baked) bakeNoise();
    /* the balls, small: each a quad its own color covers, painted in the file's order */
    const { texel } = meltBox;
    const n = data.length / 8;
    blobPlaces(scene, f, data, 8);
    for (let i = 0; i < 8 * n; i += 8) {
      data[i] = (data[i] * map.sx + map.tx - meltBox.x) / texel;
      data[i + 1] = (data[i + 1] * map.sy + map.ty - meltBox.y) / texel;
      data[i + 2] = (data[i + 2] * map.sx) / texel;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, melt[0].frame);
    gl.viewport(0, 0, meltBox.w, meltBox.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(dots);
    gl.uniform2f(U.dots.size, meltBox.w, meltBox.h);
    gl.bindVertexArray(dotsVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.disable(gl.BLEND);
    /* the melt: across, then down */
    gl.useProgram(blur);
    gl.bindVertexArray(fullVao);
    gl.uniform1i(U.blur.taps, taps);
    gl.uniform1fv(U.blur.weights, weights);
    gl.uniform1i(U.blur.source, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, melt[1].frame);
    gl.bindTexture(gl.TEXTURE_2D, melt[0].texture);
    gl.uniform2i(U.blur.step_by, 1, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, melt[0].frame);
    gl.bindTexture(gl.TEXTURE_2D, melt[1].texture);
    gl.uniform2i(U.blur.step_by, 0, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    /* every pixel: the frost's scatter, the lift of the edge, the speckle, the ground */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasSize.w, canvasSize.h);
    gl.useProgram(final);
    const u = U.final;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, melt[0].texture);
    gl.uniform1i(u.melt, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, noise.texture);
    gl.uniform1i(u.noise, 1);
    gl.uniform1f(u.canvas_h, canvasSize.h);
    gl.uniform2f(u.melt_origin, meltBox.x, meltBox.y);
    gl.uniform1f(u.melt_texel, texel);
    gl.uniform4f(u.region, regionPx[0], regionPx[1], regionPx[2], regionPx[3]);
    gl.uniform2f(u.scatter, look.scatter * map.sx, look.scatter * map.sy);
    gl.uniform1i(u.frosted, look.noise ? 1 : 0);
    gl.uniform2f(u.lift, look.slope, look.lift);
    gl.uniform2f(u.gray, look.contrast, look.gray);
    gl.uniform2f(u.k, look.k1, look.k2);
    gl.uniform4f(u.ground, ground[0], ground[1], ground[2], ground[3]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
  };

  /* the clock: seconds of the loop at speed 1, advanced by the speed, so a change of speed never jumps. It starts once
     the first frame, the still's own, is drawn, eases in from rest (warm) whenever the motion starts again, and holds
     at speed 0. A frame is drawn when it changes and the frame rate has one due (pace.ts) */
  let reduced = !!options.reduced?.();
  let t = 0;
  let warm = 0;
  let last = performance.now();
  let shown = true;
  let raf = 0;
  let first = true;
  let drawn = -1;
  let changed = true;
  let settle = 0;
  /* whether the canvas has its size: the observer's first word, which the browser gives before the next paint */
  let sized = false;
  const moving = () => shown && !document.hidden && !reduced && view_.speed > 0;
  const pace = createPace();
  const share = () => (reduced ? 0 : (t / BLOB_LOOP) % 1);
  const tick = (now: number) => {
    raf = 0;
    if (!sized) return;
    /* the programs: each frame asks again while the GPU builds them; where they failed, the still stays */
    const built = programs.built();
    if (!built) {
      if (built === false) raf = requestAnimationFrame(tick);
      return;
    }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!moving()) warm = 0;
    else if (!first) {
      warm = Math.min(easing, warm + dt);
      const e = easing ? warm / easing : 1;
      t += dt * view_.speed * e * e * (3 - 2 * e);
    }
    const at = share();
    if (changed || (at !== drawn && pace.due(now, view_.fps))) {
      draw(at);
      drawn = at;
      changed = false;
    }
    if (first) {
      first = false;
      onFirstFrame?.();
    }
    if (moving()) raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };
  prepare();

  /* the size the observer reports in device pixels, the canvas's own: its first word with a box is taken at once,
     before the first frame, and later ones settle before the noise is baked again, the last frame covering the box
     meanwhile. A canvas made off the page (a card's player made ahead) hears a first word with no box, and draws
     nothing until it has one: its textures are made with its first layout */
  const sizes = new ResizeObserver(entries => {
    const box = entries[entries.length - 1]?.devicePixelContentBoxSize?.[0];
    device = box ? { w: box.inlineSize, h: box.blockSize } : null;
    clearTimeout(settle);
    const apply = () => {
      if (!layout() && !sized) return;
      sized = true;
      changed = true;
      wake();
    };
    if (!sized) apply();
    else settle = window.setTimeout(apply, EFFECT_SETTLE_MS);
  });
  try {
    sizes.observe(canvas, { box: "device-pixel-content-box" });
  } catch {
    sizes.observe(canvas);
  }
  const sight = new IntersectionObserver(entries => {
    shown = entries.some(e => e.isIntersecting);
    if (shown) wake();
  });
  sight.observe(canvas);
  const visible = () => {
    if (!document.hidden) wake();
  };
  document.addEventListener("visibilitychange", visible);
  const lost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
  };
  canvas.addEventListener("webglcontextlost", lost);

  return {
    set(palette: Palette, view: BlobView) {
      palette_ = palette;
      view_ = view;
      prepare();
      if (sized) layout(false);
      changed = true;
      wake();
    },
    rewind() {
      t = 0;
      warm = 0;
      changed = true;
      wake();
    },
    /* the first frame is drawn at once, whatever frame rate is asked: a frame the pace held back would stay */
    motion() {
      reduced = !!options.reduced?.();
      changed = true;
      wake();
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(settle);
      sizes.disconnect();
      sight.disconnect();
      document.removeEventListener("visibilitychange", visible);
      canvas.removeEventListener("webglcontextlost", lost);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
}
