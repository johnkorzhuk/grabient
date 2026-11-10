/* The dimple's live drawing, WebGL 2, in one pass, the same arithmetic as dimple.ts's dimpleShade at every pixel: the
   ground about the hollow, then the four discs at the corners of the pixel's lattice cell (found with the sheet's
   drawing-in undone), laid in the stack's order, each a circle a pixel's edge soft filled with the palette along its
   line toward the hollow. A disc's place in the stack is read at the hollow's rest, so it is the same wherever the
   hollow is. Opaque. The uniforms are plain numbers: the scene's once a palette, a view or a box changes
   (dimpleSceneUniforms), and where the hollow is, with its ground, each time it moves (dimpleHollowUniforms), for the
   player (packages/ui dimple-player.ts) and the pages (dimple-webgl.ts). */
import {
  DIMPLE_GROUND_STEPS,
  DIMPLE_LOOK,
  DIMPLE_STOPS,
  type DimpleScene,
  dimpleGroundStops
} from "./dimple.ts";

const L = DIMPLE_LOOK;
/** A number as a float's literal. */
const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

export const DIMPLE_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** The pass's uniforms. */
export const DIMPLE_UNIFORMS = `
uniform vec2 uSize;
uniform vec2 uRest;
uniform vec2 uHollow;
uniform float uFar;
uniform vec4 uLattice;
uniform vec4 uBack;
uniform vec4 uBowl;
uniform vec4 uDisc;
uniform vec3 uGround[${DIMPLE_GROUND_STEPS + 1}];
uniform vec3 uStops[${DIMPLE_STOPS}];`;

/** A pixel's color as dimple.ts's dimpleShade works it out: px is the pixel's place from the top left. */
export const DIMPLE_SHADE = `
/* how much of its distance from the hollow a point keeps once the sheet is drawn in */
float drawn(float d) {
  return 1.0 - uBowl.y * exp(-d * d / (2.0 * uBowl.z * uBowl.z));
}
/* the palette's place at a distance from the hollow's heart */
float level(float d) {
  return ${f(L.floor)} + ${f(1 - L.run - L.floor)} * min(1.0, d / uBowl.x);
}
/* the palette at t, straight lines between its stops */
vec3 ramp(float t) {
  float x = clamp(t, 0.0, 1.0) * ${f(DIMPLE_STOPS - 1)};
  int i = min(${DIMPLE_STOPS - 2}, int(floor(x)));
  float f = x - float(i);
  return uStops[i] + (uStops[i + 1] - uStops[i]) * f;
}
vec4 shade(vec2 px) {
  vec2 p = px + 0.5;
  vec2 q = p - uHollow;
  float dd = length(q);
  /* the ground, a gradient about the hollow */
  float gd = min(1.0, dd / uFar) * ${f(DIMPLE_GROUND_STEPS)};
  int gi = min(${DIMPLE_GROUND_STEPS - 1}, int(floor(gd)));
  vec3 col = uGround[gi] + (uGround[gi + 1] - uGround[gi]) * (gd - float(gi));
  /* the pixel's lattice cell once the drawing-in is undone: the discs at its corners are all that can cover it */
  float rho = dd;
  for (int n = 0; n < 4; n++) rho = dd / drawn(rho);
  float k = dd > 1e-6 ? rho / dd : 1.0;
  vec2 s = uHollow + q * k - uRest;
  vec2 cell = floor(vec2(uBack.x * s.x + uBack.y * s.y, uBack.z * s.x + uBack.w * s.y));
  vec2 mid[4];
  vec2 toward[4];
  float away[4];
  float rank[4];
  for (int n = 0; n < 4; n++) {
    vec2 ij = cell + vec2(float(n & 1), float(n >> 1));
    /* from the hollow's rest, which lattice place (0, 0) lies on, and from the hollow */
    vec2 Q = ij.x * uLattice.xy + ij.y * uLattice.zw;
    vec2 P = uRest + Q - uHollow;
    float r0 = length(P);
    float g = drawn(r0);
    mid[n] = uHollow + P * g;
    toward[n] = r0 > 1e-6 ? -P / r0 : vec2(0.0);
    away[n] = r0 * g;
    /* its place in the stack, read at the rest: the same wherever the hollow is */
    float q0 = length(Q);
    float facing = q0 > 1e-6 ? -dot(Q, uDisc.zw) / q0 : 0.0;
    rank[n] = q0 * drawn(q0) * (1.0 - ${f(L.over)} * facing);
  }
  /* laid in the stack's order, the bottom disc first */
  for (int turn = 0; turn < 4; turn++) {
    int m = 0;
    for (int n = 1; n < 4; n++) if (rank[n] > rank[m]) m = n;
    rank[m] = -1.0;
    vec2 e = p - mid[m];
    float cover = clamp(uDisc.x - length(e) + 0.5, 0.0, 1.0);
    if (cover <= 0.0) continue;
    float d = away[m];
    float w = d / uBowl.w;
    float wall = w * exp(1.0 - w) * clamp((uBowl.x - d) / (${f(L.litOut)} * uBowl.x), 0.0, 1.0);
    float facing = dot(toward[m], uDisc.zw);
    float t = clamp(level(d) + ${f(L.lit)} * wall * facing, 0.0, 1.0);
    float run = ${f(L.run)} * max(${f(L.least)}, min(1.0, d / uDisc.y));
    float along = clamp(dot(e, toward[m]) / uDisc.x, -1.0, 1.0);
    col += (ramp(t + run * along) - col) * cover;
  }
  return vec4(col, 1.0);
}`;

export const DIMPLE_FS = `#version 300 es
precision highp float;
precision highp int;${DIMPLE_UNIFORMS}
out vec4 o;
${DIMPLE_SHADE}
void main() {
  vec2 px = vec2(gl_FragCoord.x - 0.5, uSize.y - gl_FragCoord.y - 0.5);
  o = shade(px);
}`;

/** What the pass takes for a scene, set once a palette, a view or a box changes: the hollow's rest, the lattice's two
    steps and the way back from a point to lattice steps, the bowl (the palette's reach, the pinch's strength and
    width, where the wall is steepest), a disc (its radius, the heart's width, and toward the light) and the palette's
    stops (0..1). */
export interface DimpleSceneUniforms {
  rest: Float32Array;
  lattice: Float32Array;
  back: Float32Array;
  bowl: Float32Array;
  disc: Float32Array;
  stops: Float32Array;
}

export function dimpleSceneUniforms(m: DimpleScene): DimpleSceneUniforms {
  return {
    rest: Float32Array.of(m.ox, m.oy),
    lattice: Float32Array.of(m.a1x, m.a1y, m.a2x, m.a2y),
    back: Float32Array.of(m.m00, m.m01, m.m10, m.m11),
    bowl: Float32Array.of(m.reach, m.pinch, m.pinchOver, m.litAt),
    disc: Float32Array.of(m.r, m.heart, m.lx, m.ly),
    stops: Float32Array.from(m.stops)
  };
}

/** The floats of the ground's colors a picture sets: three a color. */
export const DIMPLE_GROUND_SIZE = (DIMPLE_GROUND_STEPS + 1) * 3;

/** What the pass takes each time the hollow moves: the ground's colors about it at (cx, cy), written into `ground`
    (DIMPLE_GROUND_SIZE floats), and how far they reach, which it gives back. Nothing is allocated. */
export const dimpleHollowUniforms = (
  m: DimpleScene,
  cx: number,
  cy: number,
  ground: Float32Array
): number => dimpleGroundStops(m, cx, cy, ground);
