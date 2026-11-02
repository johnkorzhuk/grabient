/* Silk lite as SVG: the still (t = 0) and the moving version share one writer.

   - The dye: one linear gradient of the palette's 32 stops on a rect filling the box; its shade and lift take the
     same line by href (only their stops differ).
   - The folds: one group of circles in <defs> (#F), each ring drawn in its own band's units (translate, then
     scale by its period) at radius n + 1/2, with no paint of its own. One radial gradient per mask, centred on the
     ring's own origin, repeating every unit (spreadMethod repeat), holds a profile across one band; a 1-unit stroke
     shows exactly that band. So every ring, whatever its size, takes the same two gradients.
   - The masks: each is a <use> of #F that paints the rings' strokes with its gradient (inherited, as #F leaves stroke
     unset), as alpha (mask-type: alpha). The shade's layer shows through the valleys' mask, the lift's through the
     crests'. The same ring group serves both masks, so the moving SVG animates each ring once.
   No filters. The moving SVG adds one SMIL rotation to each ring: about the gather, eased to and fro by the same keys
   the CPU, the player and Figma read. */
import type { Palette } from "./palette.ts";
import { PROF_N, SILK_LOOP, type SilkScene, type SilkView, silkScene, type Track } from "./silk.ts";
import type { Size } from "./view.ts";

/** a number in short form: at most `p` decimals, no trailing zeros, no leading zero */
export function num(v: number, p = 2): string {
  const s = (Math.round(v * 10 ** p) / 10 ** p).toFixed(p).replace(/\.?0+$/, "");
  const t = s === "-0" ? "0" : s;
  return t.replace(/^(-?)0\./, "$1.");
}

/** the rings' SMIL: a rotation about the gather, added to the ring's own place */
function spin(scene: SilkScene, i: number, track: Track, speed: number): string {
  const f = scene.folds[i];
  const P = 2 * f.w;
  /* the gather in the ring's own units (after its translate and scale) */
  const px = num((scene.gx - f.cx) / P, 5);
  const py = num((scene.gy - f.cy) / P, 5);
  const values = track.map(k => `${num(k.v, 4)} ${px} ${py}`).join(";");
  const times = track.map(k => num(k.t / SILK_LOOP, 6)).join(";");
  const splines = track
    .slice(1)
    .map(k => (k.e ?? [0, 0, 1, 1]).map(v => num(v, 6)).join(" "))
    .join(";");
  return `<animateTransform attributeName="transform" type="rotate" additive="sum" calcMode="spline" values="${values}" keyTimes="${times}" keySplines="${splines}" dur="${num(SILK_LOOP / speed, 3)}s" repeatCount="indefinite"/>`;
}

export interface SvgOptions {
  /** 0 (or none): the still; else the moving SVG at this speed */
  speed?: number;
}

export function silkSvg(scene: SilkScene, opts: SvgOptions = {}): string {
  const { W, H, dye, valley, crest } = scene;
  const speed = opts.speed ?? 0;
  const stops = (colors: readonly string[]) =>
    colors
      .map((c, i) => `<stop offset="${num(i / (colors.length - 1), 4)}" stop-color="${c}"/>`)
      .join("");
  const band = (p: { k: number[]; a: number[] }) =>
    p.k
      .map(
        (k, i) =>
          `<stop offset="${num(k / (PROF_N - 1), 6)}" stop-color="#fff" stop-opacity="${num(p.a[i] / 255, 4)}"/>`
      )
      .join("");
  const defs: string[] = [];
  defs.push(
    `<linearGradient id="b" gradientUnits="userSpaceOnUse" x1="${num(scene.x1)}" y1="${num(scene.y1)}" x2="${num(scene.x2)}" y2="${num(scene.y2)}">${stops(dye.base)}</linearGradient>`,
    `<linearGradient id="s" href="#b">${stops(dye.shade)}</linearGradient>`,
    `<linearGradient id="l" href="#b">${stops(dye.lift)}</linearGradient>`
  );
  defs.push(
    `<radialGradient id="v" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" spreadMethod="repeat">${band(valley)}</radialGradient>`,
    `<radialGradient id="c" href="#v">${band(crest)}</radialGradient>`
  );
  const rings = scene.folds
    .map((f, i) => {
      const at = `translate(${num(f.cx)} ${num(f.cy)}) scale(${num(2 * f.w, 4)})`;
      return speed
        ? `<circle r="${f.n + 0.5}" transform="${at}">${spin(scene, i, f.track, speed)}</circle>`
        : `<circle r="${f.n + 0.5}" transform="${at}"/>`;
    })
    .join("");
  /* the still is the frame at t = 0: each ring at its first key's turn */
  const still = speed
    ? rings
    : scene.folds
        .map(f => {
          const P = 2 * f.w;
          const turn = f.track[0].v;
          const at = `translate(${num(f.cx)} ${num(f.cy)}) scale(${num(P, 4)}) rotate(${num(turn, 4)} ${num((scene.gx - f.cx) / P, 5)} ${num((scene.gy - f.cy) / P, 5)})`;
          return `<circle r="${f.n + 0.5}" transform="${at}"/>`;
        })
        .join("");
  defs.push(`<g id="F" fill="none" stroke-width="1">${still}</g>`);
  const box = `x="0" y="0" width="${W}" height="${H}"`;
  defs.push(
    `<mask id="mv" maskUnits="userSpaceOnUse" ${box} style="mask-type:alpha"><use href="#F" stroke="url(#v)"/></mask>`,
    `<mask id="mc" maskUnits="userSpaceOnUse" ${box} style="mask-type:alpha"><use href="#F" stroke="url(#c)"/></mask>`
  );
  const layer = (grad: string) => `<rect width="${W}" height="${H}" fill="url(#${grad})"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs>${defs.join("")}</defs>` +
    layer("b") +
    layer("s").replace("/>", ' mask="url(#mv)"/>') +
    layer("l").replace("/>", ' mask="url(#mc)"/>') +
    `</svg>`
  );
}

/** The still, the frame at t = 0. */
export const silkStillSvg = (P: Palette, view: SilkView, size: Size): string =>
  silkSvg(silkScene(P, view, size));
/** The moving SVG at a speed (1 as designed; 0 the still): one SMIL rotation on each ring. */
export const silkMovingSvg = (P: Palette, view: SilkView, size: Size, speed = 1): string =>
  silkSvg(silkScene(P, view, size), { speed });
