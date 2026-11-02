/* The lean rosette as SVG, the still and the moving drawing: the ground, the petals rim-in, the heart's glow. Each petal
   is one plain path, the lens in its own frame (the heart at the origin, its anchor at (1, 0)) placed by its transform,
   so its ring's radial gradient, in the path's own bounding box, rides with it. Slots that read one place on the
   palette share a gradient.
   No masks, filters or <use>: a list card is a few dozen plain paths. The moving drawing turns and zooms the petal
   group about the heart on CSS's timeline, the zoom in ZOOM_PARTS stretches each eased as the exponential runs (the
   first lite's way, within 2e-5 of the radius); prefers-reduced-motion shows the still. */
import type { Palette } from "./palette.ts";
import {
  HEART_STOPS,
  type RosetteDensity,
  type RosettePetal,
  type RosetteScene,
  type RosetteView,
  rosettePetals,
  rosetteScene,
  type Size
} from "./rosette.ts";

const fix = (v: number, p: number) => {
  const s = (Math.round(v * 10 ** p) / 10 ** p).toString();
  return s === "-0" ? "0" : s.replace(/^(-?)0\./, "$1.");
};
export const n2 = (v: number) => fix(v, 2);
export const n4 = (v: number) => fix(v, 4);
export const n6 = (v: number) => fix(v, 6);
const hex = (c: readonly number[]) =>
  `#${c
    .map(v =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;

/** The lens's path in its frame: two arcs from its base point to its tip and back, bulging to either side. */
export function lensPath(sc: RosetteScene): string {
  const L = sc.lens;
  const r = n6(L.rho);
  return `M${n6(L.x0)} 0A${r} ${r} 0 0 0 ${n6(L.x1)} 0A${r} ${r} 0 0 0 ${n6(L.x0)} 0Z`;
}

/** The gradients: one per ring key, radial in the petal's bounding box, its y stretched by rv / ru about the
    middle; and the heart's, in the drawing's own units. */
export function gradientDefs(sc: RosetteScene): string {
  const d = sc.design;
  const { cu, cv, ru, rv } = d.grad;
  const grads = sc.colors.grads.map((stops, i) => {
    const st = d.stops
      .map(([at], j) => `<stop offset="${n4(at)}" stop-color="${hex(stops[j])}"/>`)
      .join("");
    return `<radialGradient id="g${i}" cx="${n4(cu)}" cy="${n4(cv)}" r="${n4(ru)}" gradientTransform="translate(${n4(cu)} ${n4(cv)})scale(1 ${n4(rv / ru)})translate(${n4(-cu)} ${n4(-cv)})">${st}</radialGradient>`;
  });
  const span = d.heartOut - d.heartIn;
  const heart = sc.colors.heart;
  const hs = [
    `<stop offset="0" stop-color="${hex(heart)}"/>`,
    ...HEART_STOPS.map(
      ([g, a]) =>
        `<stop offset="${n4((d.heartIn + g * span) / d.heartOut)}" stop-color="${hex(heart)}" stop-opacity="${n4(a)}"/>`
    )
  ].join("");
  grads.push(
    `<radialGradient id="h" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${n2(d.heartOut * sc.S)}">${hs}</radialGradient>`
  );
  return grads.join("");
}

/** A petal placed: the one lens (#l) turned to its angle and scaled to its anchor's radius, about the heart, filled
    with its ring's gradient, which the lens takes from the <use> (it has no fill of its own). */
export function petalEl(p: RosettePetal): string {
  return `<use href="#l" transform="rotate(${n4((p.th * 180) / Math.PI)})scale(${n4(p.r)})" fill="url(#g${p.key})"/>`;
}

function body(sc: RosetteScene, petals: RosettePetal[], groupClass = ""): string {
  const W = sc.box.width;
  const H = sc.box.height;
  const path = lensPath(sc);
  const heartR = sc.design.heartOut * sc.S;
  return (
    `<defs><path id="l" d="${path}"/>${gradientDefs(sc)}</defs>` +
    `<rect width="${W}" height="${H}" fill="${hex(sc.colors.ground)}"/>` +
    `<g transform="translate(${n2(W / 2)} ${n2(H / 2)})">` +
    `<g${groupClass ? ` class="${groupClass}"` : ""}>${petals.map(petalEl).join("")}</g>` +
    `<circle r="${n2(heartR)}" fill="url(#h)"/></g>`
  );
}

/** The still: the petals as they stand at the loop's start. */
export function rosetteStillSvg(sc: RosetteScene): string {
  const W = sc.box.width;
  const H = sc.box.height;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body(sc, rosettePetals(sc, false))}</svg>`;
}

/** Stretches the zoom is keyed in. */
export const ZOOM_PARTS = 6;

/** The easing that follows e^(Δu) from 0 to 1 over a stretch, as a cubic-bezier: x even in time, y matching the
    exponential's slopes at both ends. */
export function expEase(delta: number): [number, number, number, number] {
  const e = Math.exp(delta) - 1;
  const s0 = delta / e;
  const s1 = (delta * Math.exp(delta)) / e;
  return [1 / 3, s0 / 3, 2 / 3, 1 - s1 / 3];
}

/** The zoom's keyframes over a loop: shares of the loop, scales, and the easing of the stretch leaving each. */
export function zoomKeys(sc: RosetteScene) {
  const total = sc.lattice.k * sc.design.flow;
  const ease = expEase(total / ZOOM_PARTS);
  return Array.from({ length: ZOOM_PARTS + 1 }, (_, i) => ({
    at: i / ZOOM_PARTS,
    scale: Math.exp((total * i) / ZOOM_PARTS),
    ease
  }));
}

/** The moving drawing at a speed (1 as designed: a loop in design.loop seconds). */
export function rosetteMovingSvg(sc: RosetteScene, speed = 1): string {
  const W = sc.box.width;
  const H = sc.box.height;
  const seconds = sc.design.loop / Math.max(1e-6, speed);
  const turn = (sc.lattice.beta * 180) / Math.PI;
  const keys = zoomKeys(sc);
  const css =
    `.m{transform-box:view-box;transform-origin:0 0;animation:r ${n4(seconds)}s linear infinite,z ${n4(seconds)}s infinite}` +
    `@keyframes r{from{rotate:0deg}to{rotate:${n4(turn)}deg}}` +
    `@keyframes z{${keys
      .map(
        (k, i) =>
          `${n4(k.at * 100)}%{scale:${n6(k.scale)}${i < keys.length - 1 ? `;animation-timing-function:cubic-bezier(${k.ease.map(n6).join(",")})` : ""}}`
      )
      .join("")}}` +
    `@media (prefers-reduced-motion:reduce){.m{animation:none}}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${css}</style>${body(sc, rosettePetals(sc, true), "m")}</svg>`;
}

export const rosetteStillSvgOf = (
  P: Palette,
  view: RosetteView,
  box: Size,
  density: RosetteDensity = 60
) => rosetteStillSvg(rosetteScene(P, view, box, density));
export const rosetteMovingSvgOf = (
  P: Palette,
  view: RosetteView,
  box: Size,
  speed = 1,
  density: RosetteDensity = 60
) => rosetteMovingSvg(rosetteScene(P, view, box, density), speed);
