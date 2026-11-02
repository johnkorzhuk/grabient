/* How an effect's shader page plays (glass-webgl.ts, glass-webgpu.ts, blob-webgl.ts, blob-webgpu.ts): the site's
   players' clock (ui/glass-player.ts, blob-player.ts) and frame rate (ui/pace.ts) in the page's own JavaScript, with the
   players' ease, pixel cap and settle (effect.ts), so the page draws each frame at the player's time. The page gives `layout(w, h)`, which lays its
   drawing out for the canvas's device pixels, and `draw(t)`, which draws the frame at t, and calls `lose()` as its
   GPU is lost and `found()` once a new drawing stands on the one given back; this code gives the rest. */
import { EFFECT_PIXELS_MAX, EFFECT_SETTLE_MS } from "./effect.ts";

/** A frame due once each 1/FPS, a little early rather than a refresh late, counted from the last one's due time: pace.ts
    as the page writes it (FPS the page's setting). */
export const EFFECT_PACE = `// A frame is due once each 1/FPS, a little early rather than a refresh late, counted from the last one's due time.
let paced = Number.NEGATIVE_INFINITY;
const due = now => {
  if (!FPS) return true;
  const every = 1000 / FPS;
  if (now - paced < every - Math.min(4, every * 0.2)) return false;
  paced = now - paced > 2 * every ? now : paced + every;
  return true;
};`;

/** The clock and the canvas's size, as the players keep them, and the GPU lost and found again. */
export const EFFECT_CLOCK = `// The canvas's size in device pixels as the browser lays it out, up to a 4K screen's pixels, as the player sizes it.
const PIXELS_MAX = ${EFFECT_PIXELS_MAX};
let pixels = null;
let laidOut = false;
const resize = () => {
  const dpr = devicePixelRatio || 1;
  const css = canvas.getBoundingClientRect();
  if (!css.width || !css.height) return;
  const ew = Math.round(css.width * dpr);
  const eh = Math.round(css.height * dpr);
  const exact = pixels && Math.abs(pixels.w - ew) <= 2 && Math.abs(pixels.h - eh) <= 2;
  const w0 = exact ? pixels.w : ew;
  const h0 = exact ? pixels.h : eh;
  const fit = Math.min(1, Math.sqrt(PIXELS_MAX / Math.max(1, w0 * h0)));
  const w = Math.max(1, Math.round(w0 * fit));
  const h = Math.max(1, Math.round(h0 * fit));
  layout(w, h);
  laidOut = true;
};

// The clock: seconds of the loop at speed 1, advanced by SPEED, so the motion eases in from rest over EASE seconds once
// the first frame is drawn. A frame is drawn when the picture changed or one is due at FPS; a reader who asks for
// less motion sees the first frame.
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let lost = false;
const playing = () => !document.hidden && !reduced.matches && !lost;
let t = 0;
let warm = 0;
let last = performance.now();
let lastDrawn = -1;
let changed = true;
let first = true;
let raf = 0;
let settle = 0;
${EFFECT_PACE}
const tick = now => {
  raf = 0;
  if (lost) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!playing() || SPEED === 0) warm = 0;
  else if (laidOut && !first) {
    warm = Math.min(EASE, warm + dt);
    const e = EASE ? warm / EASE : 1;
    t += dt * SPEED * e * e * (3 - 2 * e);
  }
  if (laidOut) {
    const at = reduced.matches ? 0 : t;
    if (changed || (at !== lastDrawn && due(now))) {
      draw(at);
      lastDrawn = at;
      changed = false;
      first = false;
    }
  }
  if (playing() && SPEED > 0) raf = requestAnimationFrame(tick);
};
const wake = () => {
  last = performance.now();
  if (!raf && !lost) raf = requestAnimationFrame(tick);
};
// The first size comes before the first paint; a later one settles a moment before the drawing is laid out again.
const sizes = new ResizeObserver(entries => {
  const box = entries[entries.length - 1]?.devicePixelContentBoxSize?.[0];
  pixels = box ? { w: box.inlineSize, h: box.blockSize } : null;
  clearTimeout(settle);
  settle = setTimeout(
    () => {
      resize();
      changed = true;
      wake();
    },
    laidOut ? ${EFFECT_SETTLE_MS} : 0
  );
});
try {
  sizes.observe(canvas, { box: "device-pixel-content-box" });
} catch {
  sizes.observe(canvas);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) wake();
});
reduced.addEventListener("change", () => {
  changed = true;
  wake();
});
// A GPU lost draws nothing, and the loop stops until a new drawing is made on the one found again, which is laid out
// and drawn at once, the clock going on from where it was.
const lose = () => {
  lost = true;
  cancelAnimationFrame(raf);
  raf = 0;
};
const found = () => {
  lost = false;
  laidOut = false;
  resize();
  changed = true;
  wake();
};`;
