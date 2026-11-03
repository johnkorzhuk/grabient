/* Papercut's live drawing, WebGL 2, in two passes, the same arithmetic as the CPU drawing (papercut-render.ts):
   - the field pass, at a quarter of the resolution each way, one texel past each edge: at each texel the field, its
     slope and its curvature (the waves' bend, the ramp and the few hills, from uniforms the CPU computes once a
     frame), kept as exact 32-bit floats in an RGBA32UI texture, which every WebGL 2 renders to with no extension;
   - the shading pass, at full resolution: the four texels about the pixel read with texelFetch and mixed bilinearly,
     the pixel's sheet found by counting the levels below it, and the sheets about it painted in the stills' order
     (drop shadow, contact shadow, lit cut, face), each shadow the field's own distance to its cut over a Gaussian's
     cumulative share, so nothing is blurred; then the half-level dither.
   About 0.1 ms a 1080p frame on an RTX 2080 Ti (the sketch's measure, ANGLE on D3D12). The uniforms are plain numbers
   (papercutSceneUniforms once a palette, a view or a box, papercutFrameUniforms a frame), for the player
   (packages/ui papercut-player.ts). */
import {
  PAPERCUT_BUMP,
  PAPERCUT_MAX_BUMPS,
  PAPERCUT_MAX_SHEETS,
  PAPERCUT_NEAR,
  PAPERCUT_REACH,
  PAPERCUT_TAIL,
  type PapercutScene,
  papercutFrameAt
} from "./papercut.ts";
import { PAPERCUT_QUARTER } from "./papercut-render.ts";

export const PAPERCUT_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const HEAD = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uSize;
uniform float uD;`;

const FIELD_UNIFORMS = `
uniform vec2 uRamp;
uniform vec4 uWarp;
uniform vec4 uPhase;
uniform int uBumps;
uniform vec4 uBump[${PAPERCUT_MAX_BUMPS}];`;

const SHADE_UNIFORMS = `
uniform vec2 uLight;
uniform int uSheets;
uniform float uLevel[${PAPERCUT_MAX_SHEETS}];
uniform vec3 uFace[${PAPERCUT_MAX_SHEETS}];
uniform vec3 uWallC[${PAPERCUT_MAX_SHEETS}];
uniform vec3 uShade[${PAPERCUT_MAX_SHEETS}];
uniform vec4 uSheet[${PAPERCUT_MAX_SHEETS}];
uniform float uReach[${PAPERCUT_MAX_SHEETS}];
uniform vec2 uMisc;`;

/* the field at q (D units): f, its slope G and its weighed curvature along the slope, as papercut.ts's papercutField */
const FIELD = `
vec4 field(vec2 q) {
  float s1 = uWarp.y * q.y + uPhase.x;
  float s2 = uWarp.y * q.x + uPhase.y;
  float u = uWarp.w * (q.x + q.y) + uPhase.z;
  float v = uWarp.w * (q.x - q.y) + uPhase.w;
  float su = sin(u);
  float sv = sin(v);
  vec2 w = vec2(q.x + uWarp.x * sin(s1) + uWarp.z * sv, q.y + uWarp.x * sin(s2) + uWarp.z * su);
  float c1 = uWarp.x * uWarp.y * cos(s1);
  float c2 = uWarp.x * uWarp.y * cos(s2);
  float cu = uWarp.z * uWarp.w * cos(u);
  float cv = uWarp.z * uWarp.w * cos(v);
  mat2 J = mat2(1.0 + cv, c2 + cu, c1 - cv, 1.0 + cu);
  float f = w.x * uRamp.x + w.y * uRamp.y;
  vec2 g = uRamp;
  vec3 h = vec3(0.0);
  for (int i = 0; i < ${PAPERCUT_MAX_BUMPS}; i++) {
    if (i >= uBumps) break;
    vec4 B = uBump[i];
    vec2 e = w - B.xy;
    float s = dot(e, e) * B.z;
    if (s < 1.0) {
      float k = 1.0 - s;
      float k2 = k * k;
      f += B.w * k2 * k;
      float c = -6.0 * B.w * k2 * B.z;
      g += c * e;
      float qq = 24.0 * B.w * B.z * B.z * k;
      h += vec3(c + qq * e.x * e.x, qq * e.x * e.y, c + qq * e.y * e.y);
    }
  }
  vec2 G = vec2(g.x * J[0][0] + g.y * J[0][1], g.x * J[1][0] + g.y * J[1][1]);
  mat2 H = mat2(h.x, h.y, h.y, h.z);
  mat2 Q = transpose(J) * H * J;
  float g2 = dot(G, G);
  float kn = g2 > 0.0 ? dot(G, Q * G) / g2 : 0.5 * (Q[0][0] + Q[1][1]);
  float tr = Q[0][0] + Q[1][1];
  float round = tr * tr > 0.0 ? clamp(8.0 * (Q[0][0] * Q[1][1] - Q[0][1] * Q[1][0]) / (tr * tr), 0.0, 1.0) : 0.0;
  return vec4(f, G, kn * round);
}`;

/* the pixel's color from the field there, as papercut.ts's papercutShade and its sheet, dithered */
const SHADE = `
float phi(float x) {
  float t = clamp((x + ${PAPERCUT_REACH.toFixed(2)}) * ${(1 / (2 * PAPERCUT_REACH)).toFixed(8)}, 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

vec3 sheet(vec3 c, int k, float f, float gl, float kap, float nl, float wn, float toPx) {
  vec4 S = uSheet[k];
  float rise = uLevel[k - 1] - f;
  float d = -rise * toPx;
  float ds = d + S.y * nl;
  float size = 1.0;
  float csize = 1.0;
  if (rise > 0.0) {
    float disc = gl * gl + 2.0 * kap * rise;
    float ak = abs(kap);
    if (ak * ${PAPERCUT_NEAR.toFixed(1)} * S.y > gl * uD) {
      float top = gl / ak * uD;
      float R = (disc >= 0.0 ? sqrt(disc) : -sqrt(-disc)) / ak * uD;
      float e = kap < 0.0 ? 1.0 : -1.0;
      d = -e * (top - R);
      ds = -e * (sqrt(top * top - 2.0 * e * top * S.y * nl + S.y * S.y) - R);
      if (e > 0.0) {
        float R2 = max(0.0, R) * R;
        size = 1.0 - exp(-0.5 * R2 * S.x * S.x);
        csize = 1.0 - exp(-0.5 * R2 * S.w * S.w);
      }
    } else {
      d = -uD * (disc >= 0.0 ? (2.0 * rise) / (gl + sqrt(disc)) : (gl + sqrt(-disc)) / -kap);
      ds = d + S.y * nl;
    }
  }
  float x = ds * S.x;
  if (x > ${PAPERCUT_TAIL.toFixed(2)}) c += (uShade[k] - c) * (S.z * phi(x) * size);
  float xc = d * S.w;
  if (xc > ${PAPERCUT_TAIL.toFixed(2)}) c += (uShade[k] - c) * (uMisc.x * phi(xc) * csize);
  if (d + max(0.0, wn) > -0.5) {
    c += (uWallC[k] - c) * clamp(d + 0.5, 0.0, 1.0);
    c += (uFace[k] - c) * clamp(d + wn + 0.5, 0.0, 1.0);
  }
  return c;
}

vec4 shade(vec4 F, vec2 px) {
  float f = F.x;
  vec2 G = F.yz;
  int top = uSheets - 1;
  int b = 0;
  for (int i = 0; i < ${PAPERCUT_MAX_SHEETS - 1}; i++) {
    if (i >= top) break;
    if (f >= uLevel[i]) b++;
  }
  float gl = max(1e-9, length(G));
  float toPx = uD / gl;
  float kap = F.w;
  float nl = dot(G, uLight) / gl;
  float wn = uMisc.y * nl;
  vec3 c = uFace[0];
  bool own = false;
  if (b > 0) {
    if ((f - uLevel[b - 1]) * toPx + wn >= 0.5) c = uFace[b];
    else {
      c = uFace[b - 1];
      own = true;
    }
  }
  if (own) c = sheet(c, b, f, gl, kap, nl, wn, toPx);
  if (b < top) c = sheet(c, b + 1, f, gl, kap, nl, wn, toPx);
  if (b + 1 < top && (uLevel[b + 1] - f) * toPx < uReach[b + 2]) c = sheet(c, b + 2, f, gl, kap, nl, wn, toPx);
  float a = 0.06711056 * px.x + 0.00583715 * px.y;
  float n = fract(52.9829189 * fract(a)) - 0.5;
  return vec4(c + n / 255.0, 1.0);
}`;

/** The field pass: texel (i, j) holds the field at the pixel-space point ((i - 1) Q + 0.5, (j - 1) Q + 0.5), y
    down. */
export const PAPERCUT_FIELD_FS = `${HEAD}${FIELD_UNIFORMS}
out uvec4 o;
${FIELD}
void main() {
  vec2 p = (floor(gl_FragCoord.xy) - 1.0) * ${PAPERCUT_QUARTER.toFixed(1)} + 0.5;
  o = floatBitsToUint(field((p - 0.5 * uSize) / uD));
}`;

/** The shading pass: the field mixed from its four texels (the pixel at (x, y) lies at x / Q + 1 texels). */
export const PAPERCUT_SHADE_FS = `${HEAD}${SHADE_UNIFORMS}
uniform highp usampler2D uField;
out vec4 o;
${SHADE}
void main() {
  vec2 px = vec2(gl_FragCoord.x - 0.5, uSize.y - gl_FragCoord.y - 0.5);
  vec2 t = px / ${PAPERCUT_QUARTER.toFixed(1)} + 1.0;
  ivec2 i = ivec2(t);
  vec2 a = t - vec2(i);
  vec4 f00 = uintBitsToFloat(texelFetch(uField, i, 0));
  vec4 f10 = uintBitsToFloat(texelFetch(uField, i + ivec2(1, 0), 0));
  vec4 f01 = uintBitsToFloat(texelFetch(uField, i + ivec2(0, 1), 0));
  vec4 f11 = uintBitsToFloat(texelFetch(uField, i + ivec2(1, 1), 0));
  o = shade(mix(mix(f00, f10, a.x), mix(f01, f11, a.x), a.y), px);
}`;

/** The field texture's size for a box: a texel every Q pixels each way and one past each edge. */
export const papercutFieldSize = (m: PapercutScene): { w: number; h: number } => ({
  w: Math.ceil((m.width - 1) / PAPERCUT_QUARTER) + 3,
  h: Math.ceil((m.height - 1) / PAPERCUT_QUARTER) + 3
});

/** What the shading pass takes for a scene, set once a palette, a view or a box changes. */
export interface PapercutSceneUniforms {
  level: Float32Array;
  face: Float32Array;
  wall: Float32Array;
  shadow: Float32Array;
  /** each sheet's 1 / sigma, offset, opacity, and the contact's 1 / sigma */
  sheet: Float32Array;
  reach: Float32Array;
  /** the contact's opacity and the lit cut's width */
  misc: [number, number];
}

export function papercutSceneUniforms(m: PapercutScene): PapercutSceneUniforms {
  const level = new Float32Array(PAPERCUT_MAX_SHEETS);
  level.set(m.levels);
  const face = new Float32Array(PAPERCUT_MAX_SHEETS * 3);
  face.set(m.face);
  const wall = new Float32Array(PAPERCUT_MAX_SHEETS * 3);
  wall.set(m.wallRgb);
  const shadow = new Float32Array(PAPERCUT_MAX_SHEETS * 3);
  shadow.set(m.shadowRgb);
  const reach = new Float32Array(PAPERCUT_MAX_SHEETS);
  reach.set(m.reach);
  const sheet = new Float32Array(PAPERCUT_MAX_SHEETS * 4);
  for (let k = 0; k < m.n; k++) {
    sheet[k * 4] = m.isigma[k];
    sheet[k * 4 + 1] = m.offset[k];
    sheet[k * 4 + 2] = m.alpha[k];
    sheet[k * 4 + 3] = m.icsigma;
  }
  return { level, face, wall, shadow, sheet, reach, misc: [m.calpha, m.wall] };
}

/** A frame's uniforms at t, into `bump` (the hills', PAPERCUT_MAX_BUMPS vec4s) and `rest` (the waves' four phases,
    then toward the light, x and y), with no allocation: `at` is a scratch of papercut.ts's papercutFrameSize(m)
    numbers. */
export function papercutFrameUniforms(
  m: PapercutScene,
  t: number,
  at: Float32Array,
  bump: Float32Array,
  rest: Float32Array
) {
  papercutFrameAt(m, t, at);
  const nb = m.bumps.length * PAPERCUT_BUMP;
  for (let i = 0; i < nb; i++) bump[i] = at[i];
  for (let i = 0; i < 6; i++) rest[i] = at[nb + i];
}
