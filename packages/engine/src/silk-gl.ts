/* Silk lite's GLSL ES 3.00: the same layers model.ts's renderSilk sums, in one full-screen pass.
   Per pixel, for each ring: the squared distance to its centre against its band's (two compares, no root), and only
   inside the band a root, one MAD to the profile's texel and one fetch of both profiles (valley in r, crest in g),
   joined as layers are. A pixel lies in about two bands, so about two fetches. Then the dye: three fetches of the
   palette's 32 x 3 table (base, shade, lift) at the pixel's place along the line, the filter's straight blends being
   the gradient's own between stops and clamp-to-edge its padding, and lerp(lerp(base, shade, V), lift, C) in full
   precision (a trilinear 32 x 2 x 2 table would fetch once, but its 8-bit filter weights cost a level). About 60 ALU,
   two RG16F fetches and three RGBA8 fetches a pixel. */
import { centresAt, LUT_N, MAX_FOLDS, PROF_N, type SilkScene } from "./silk.ts";

export const SILK_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const SILK_FS = `#version 300 es
precision highp float;
precision highp int;
/* D: the dye's line as a texel coordinate, u = dot(p, D.xy) + D.z; D.w the canvas's height (p is y down) */
uniform vec4 D;
/* F[i]: ring i's centre (px, y down) and its profile's texel coordinate, x = distance * F.z + F.w; G[i]: its band's
   squared radii, inner and outer */
uniform vec4 F[${MAX_FOLDS}];
uniform vec2 G[${MAX_FOLDS}];
uniform int N;
/* S: the profiles, 65 x 1 RG16F (valley, crest); T: the palette, 32 x 3 RGBA8 (rows base, shade, lift) */
uniform sampler2D S;
uniform sampler2D T;
out vec4 outColor;

void main() {
  vec2 p = vec2(gl_FragCoord.x, D.w - gl_FragCoord.y);
  float tv = 1.0;
  float tc = 1.0;
  for (int i = 0; i < ${MAX_FOLDS}; i++) {
    if (i >= N) break;
    vec4 f = F[i];
    vec2 d = p - f.xy;
    float q = dot(d, d);
    if (q > G[i].x && q < G[i].y) {
      vec2 a = textureLod(S, vec2(sqrt(q) * f.z + f.w, 0.5), 0.0).rg;
      tv -= tv * a.r;
      tc -= tc * a.g;
    }
  }
  float u = dot(p, D.xy) + D.z;
  vec3 b = textureLod(T, vec2(u, 1.0 / 6.0), 0.0).rgb;
  vec3 s = textureLod(T, vec2(u, 0.5), 0.0).rgb;
  vec3 l = textureLod(T, vec2(u, 5.0 / 6.0), 0.0).rgb;
  outColor = vec4(mix(mix(b, s, 1.0 - tv), l, 1.0 - tc), 1.0);
}`;

/** The uniform that holds for a scene (set once per palette, view or box): D, the dye's line as a texel coordinate
    and the canvas's height. */
export function sceneUniforms(scene: SilkScene, S: Float32Array) {
  const dx = scene.x2 - scene.x1;
  const dy = scene.y2 - scene.y1;
  const k = (LUT_N - 1) / (LUT_N * (dx * dx + dy * dy));
  S[0] = dx * k;
  S[1] = dy * k;
  S[2] = -(scene.x1 * dx + scene.y1 * dy) * k + 0.5 / LUT_N;
  S[3] = scene.H;
}

/** The rings' bands as squared radii (inner, outer), for the shader's test: set once per scene. */
export function bandUniforms(scene: SilkScene, G: Float32Array) {
  for (let i = 0; i < MAX_FOLDS; i++) {
    const f = scene.folds[i];
    G[2 * i] = f ? (f.R - f.w) ** 2 : 0;
    G[2 * i + 1] = f ? (f.R + f.w) ** 2 : 0;
  }
}

/** The palette as the player's 32 x 3 table: rows base, shade, lift. */
export function colorTexels(scene: SilkScene): Uint8Array {
  const rows = [scene.dye.baseB, scene.dye.shadeB, scene.dye.liftB];
  const out = new Uint8Array(4 * LUT_N * 3);
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < LUT_N; i++) {
      const o = 4 * (r * LUT_N + i);
      out[o] = rows[r][3 * i];
      out[o + 1] = rows[r][3 * i + 1];
      out[o + 2] = rows[r][3 * i + 2];
      out[o + 3] = 255;
    }
  return out;
}

/** The rings' uniforms at t, written into F (MAX_FOLDS vec4s) with no allocation: each ring's centre turned about
    the gather by its keys, and its profile's texel mapping. */
const CENTRES = new Float64Array(2 * MAX_FOLDS);
export function foldUniforms(scene: SilkScene, t: number, F: Float32Array) {
  centresAt(scene, t, CENTRES);
  const g = (PROF_N - 1) / PROF_N;
  for (let i = 0; i < MAX_FOLDS; i++) {
    const o = 4 * i;
    const f = scene.folds[i];
    if (!f) {
      F[o] = F[o + 1] = F[o + 2] = F[o + 3] = 0;
      continue;
    }
    F[o] = CENTRES[2 * i];
    F[o + 1] = CENTRES[2 * i + 1];
    F[o + 2] = g / (2 * f.w);
    F[o + 3] = ((1 - f.R / f.w) / 2) * g + 0.5 / PROF_N;
  }
}

/** The profiles as the player's 65 x 1 RG texture: valley, crest. */
export function profileTexels(scene: SilkScene): Float32Array {
  const px = new Float32Array(2 * PROF_N);
  for (let k = 0; k < PROF_N; k++) {
    px[2 * k] = scene.valley.table[k];
    px[2 * k + 1] = scene.crest.table[k];
  }
  return px;
}
