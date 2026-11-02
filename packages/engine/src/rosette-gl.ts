/* The lean rosette's live drawing, WebGL2: one full-screen pass. Each pixel is taken back through the loop's zoom and
   turn into the petals' own place, where petal n's anchor lies at S e^(k n) and turn alpha n + turn0. A lens spans
   x0 .. x1 of its anchor's radius, so the petals that can reach the pixel are those whose anchors lie between its
   radius over x1 and its radius over x0: about 24 at the designed density. They are taken inner first, front to back,
   the angle, the radius ratio and the ring's slot stepped from one to the next, each tried on its angle before its
   lens (whose cosine and sine are short polynomials, the angle being small); one that covers the pixel lays its ring's
   gradient under what is above it, by coverage half a pixel either side of its edge, and the pixel is done once it is
   covered whole. That is the CPU reference's stacking (rim first, each over the last) taken from the front. The ground
   fills what is left, and the heart's glow, fixed on the screen, goes last. RosetteColors mix in sRGB, as SVG and the CPU mix
   them. Nothing is baked: a new palette, view or size only sets uniforms, which rosetteUniforms gives as plain numbers
   for the player (packages/ui rosette-player.ts) and the shader exports alike. */
import { HEART_STOPS, type RosetteScene, rosettePetals } from "./rosette.ts";

/** The most keys (distinct ring gradients) a design can hold: one per slot of the longest period. */
export const ROSETTE_MAX_KEYS = 34;
const STOPS = 4;
const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

export const ROSETTE_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const ROSETTE_FS = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uBox;            // the canvas, px
uniform float uS;             // its half-diagonal, px
uniform float uK;             // log radius a petal grows by
uniform float uAlpha;         // turn a petal (radians, y down), signed by the hand
uniform float uTurn0;         // the flower's turn at the loop's start
uniform vec2 uGroup;          // the loop's zoom (log) and turn now
uniform float uEk;            // e^(-k): the radius ratio's step from one petal to the next out
uniform ivec2 uRange;         // the petals drawn, innermost and outermost index
uniform vec4 uLens;           // x0, x1, half-width w, the arcs' radius rho
uniform vec2 uLensMid;        // the lens's middle xm and its arcs' centres' offset d
uniform float uAngMax;        // the most a petal reaches round from its anchor's direction
uniform vec4 uGrad;           // the gradient's middle (cu, cv) and radii (ru, rv) in the lens's box
uniform vec4 uStopAt;         // the stops' offsets
uniform vec3 uStop[${ROSETTE_MAX_KEYS * STOPS}];
uniform int uKeyOfSlot[${ROSETTE_MAX_KEYS}];
uniform int uFlow;
uniform int uPhase;
uniform vec3 uGround;
uniform vec3 uHeart;
uniform vec2 uHeartR;         // the glow's opaque middle and its end, shares of S
out vec4 o;

const float TAU = 6.28318530718;

vec3 stopColor(int key, float g) {
  int b = key * ${STOPS};
  if (g <= uStopAt.x) return uStop[b];
  if (g <= uStopAt.y) return mix(uStop[b], uStop[b + 1], (g - uStopAt.x) / (uStopAt.y - uStopAt.x));
  if (g <= uStopAt.z) return mix(uStop[b + 1], uStop[b + 2], (g - uStopAt.y) / (uStopAt.z - uStopAt.y));
  if (g <= uStopAt.w) return mix(uStop[b + 2], uStop[b + 3], (g - uStopAt.z) / (uStopAt.w - uStopAt.z));
  return uStop[b + 3];
}

float heartAlpha(float x) {
  ${HEART_STOPS.slice(1)
    .map(
      ([g, a], i) =>
        `if (x <= ${f(g)}) return mix(${f(HEART_STOPS[i][1])}, ${f(a)}, (x - ${f(HEART_STOPS[i][0])}) / ${f(g - HEART_STOPS[i][0])});`
    )
    .join("\n  ")}
  return ${f(HEART_STOPS[HEART_STOPS.length - 1][1])};
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uBox.y - gl_FragCoord.y) - 0.5 * uBox;
  float rho = length(p);
  vec3 acc = vec3(0.0);
  float cover = 0.0;
  if (rho > 0.0) {
    float th = atan(p.y, p.x) - uGroup.y;
    float lr = log(rho / uS) - uGroup.x;
    int nMin = max(uRange.x, int(ceil((lr - log(uLens.y)) / uK)));
    int nMax = min(uRange.y, int(floor((lr - log(uLens.x)) / uK)));
    float d = th - (uAlpha * float(nMin) + uTurn0);
    d -= TAU * floor(d / TAU + 0.5);
    float e = exp(lr - uK * float(nMin));
    int s = nMin + uPhase;
    s -= uFlow * int(floor(float(s) / float(uFlow)));
    for (int n = nMin; n <= nMax; n++) {
      if (abs(d) <= uAngMax) {
        float d2 = d * d;
        float cd = 1.0 - d2 * (0.5 - d2 * (0.0416666667 - d2 * 0.0013888889));
        float sd = d * (1.0 - d2 * (0.1666666667 - d2 * (0.0083333333 - d2 * 0.0001984127)));
        float qx = e * cd;
        float qy = e * sd;
        vec2 l = vec2(qx - uLensMid.x, abs(qy) + uLensMid.y);
        float cov = clamp(0.5 - (length(l) - uLens.w) * (rho / e), 0.0, 1.0);
        if (cov > 0.0) {
          vec2 uv = vec2((qx - uLens.x) / (uLens.y - uLens.x), (qy + uLens.z) / (2.0 * uLens.z));
          float w = (1.0 - cover) * cov;
          acc += w * stopColor(uKeyOfSlot[s], length((uv - uGrad.xy) / uGrad.zw));
          cover += w;
          if (cover > 0.99999) break;
        }
      }
      d -= uAlpha;
      if (d < -3.14159265359) d += TAU;
      else if (d > 3.14159265359) d -= TAU;
      e *= uEk;
      s += 1;
      if (s >= uFlow) s = 0;
    }
  }
  vec3 col = acc + (1.0 - cover) * uGround;
  float hr = rho / uS;
  if (hr < uHeartR.y) col = mix(col, uHeart, hr <= uHeartR.x ? 1.0 : heartAlpha((hr - uHeartR.x) / (uHeartR.y - uHeartR.x)));
  o = vec4(col, 1.0);
}`;

/** The most a lens reaches round from its anchor's direction, radians: its arcs sampled, with a margin. */
export function angMaxOf(sc: RosetteScene): number {
  const L = sc.lens;
  let most = 0;
  /* the upper arc: centre (xm, -d), radius rho, from the base point (x0, 0) to the tip (x1, 0) */
  const a0 = Math.atan2(0 + L.d, L.x0 - L.xm);
  const a1 = Math.atan2(0 + L.d, L.x1 - L.xm);
  for (let i = 0; i <= 256; i++) {
    const a = a0 + ((a1 - a0) * i) / 256;
    const x = L.xm + L.rho * Math.cos(a);
    const y = -L.d + L.rho * Math.sin(a);
    most = Math.max(most, Math.atan2(y, x));
  }
  return most + 0.05;
}

/** The uniforms a frame of a scene needs, as plain numbers, by their names in ROSETTE_FS: everything but uGroup,
    which the loop's phase sets (rosetteGroup). `still` draws the still's petals, a moving drawing those any phase of
    the loop shows. */
export function rosetteUniforms(sc: RosetteScene, still = false) {
  const d = sc.design;
  const L = sc.lens;
  const petals = rosettePetals(sc, !still);
  const lo = petals.reduce((m, q) => Math.min(m, q.n), Infinity);
  const hi = petals.reduce((m, q) => Math.max(m, q.n), -Infinity);
  const stop = new Float32Array(ROSETTE_MAX_KEYS * STOPS * 3);
  sc.colors.grads.forEach((g, k) => {
    g.forEach((c, j) => {
      stop.set(c, (k * STOPS + j) * 3);
    });
  });
  const keyOfSlot = new Int32Array(ROSETTE_MAX_KEYS);
  keyOfSlot.set(sc.colors.keyOfSlot.slice(0, ROSETTE_MAX_KEYS));
  return {
    uBox: [sc.box.width, sc.box.height],
    uS: sc.S,
    uK: sc.lattice.k,
    uEk: Math.exp(-sc.lattice.k),
    uAlpha: sc.lattice.alpha,
    uTurn0: d.turn0,
    uRange: [lo, hi],
    uLens: [L.x0, L.x1, L.w, L.rho],
    uLensMid: [L.xm, L.d],
    uAngMax: angMaxOf(sc),
    uGrad: [d.grad.cu, d.grad.cv, d.grad.ru, d.grad.rv],
    uStopAt: [d.stops[0][0], d.stops[1][0], d.stops[2][0], d.stops[3][0]],
    uStop: stop,
    uKeyOfSlot: keyOfSlot,
    uFlow: d.flow,
    uPhase: d.phase,
    uGround: sc.colors.ground,
    uHeart: sc.colors.heart,
    uHeartR: [d.heartIn, d.heartOut]
  };
}

/** uGroup at loop phase tau (0 to 1): the zoom's log and the turn the petals' group has made. */
export const rosetteGroup = (sc: RosetteScene, tau: number): [number, number] => [
  sc.lattice.k * sc.design.flow * tau,
  sc.lattice.beta * tau
];
