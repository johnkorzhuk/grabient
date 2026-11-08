/* The strings' live drawing, WebGL 2, in one pass, the same arithmetic as the CPU drawing (strings.ts stringsShade,
   strings-render.ts) at every pixel: the plane stirred by the shears, the field's level and slope there, the two
   threads nearest the pixel, each ended by its crowding and by the blob's edge, laid over the ground farther first,
   premultiplied: the ground at its alpha, so a translucent or clear one lets the page under the canvas through, and a
   whole one draws what the opaque pass drew, to the bit. The uniforms are plain numbers (stringsSceneUniforms once a
   palette, a view or a box changes, stringsFrameAt's phases a frame), for the player (packages/ui strings-player.ts)
   and the pages (strings-webgl.ts). */
import {
  STRINGS_FRAME_SIZE,
  STRINGS_LUMPS,
  STRINGS_SHEARS,
  STRINGS_STOPS,
  STRINGS_TOP_RANK,
  STRINGS_WAVES,
  type StringsScene
} from "./strings.ts";

export const STRINGS_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** The pass's uniforms. */
export const STRINGS_UNIFORMS = `
uniform vec2 uSize;
uniform float uD;
uniform vec2 uField;
uniform vec4 uShear[${STRINGS_SHEARS}];
uniform vec4 uWave[${STRINGS_WAVES}];
uniform vec3 uLump[${STRINGS_LUMPS}];
uniform float uPhase[${STRINGS_FRAME_SIZE}];
uniform vec4 uLine;
uniform vec4 uBlob;
uniform vec4 uGround;
uniform vec3 uStops[${STRINGS_STOPS}];`;

/** A pixel's color, premultiplied, as strings.ts's stringsShade works it out: px is the pixel's place from the top
    left. */
export const STRINGS_SHADE = `
float hash(int k) {
  return float((uint(k + 4096) * 2654435761u >> 16u) & 1023u) / 1023.0;
}
float rank(int k) {
  for (int i = 0; i < ${STRINGS_TOP_RANK}; i++)
    if (((k >> i) & 1) != 0) return float(i);
  return ${STRINGS_TOP_RANK.toFixed(1)};
}
float need(int k) {
  return uLine.y * (1.0 + uLine.z * (hash(7 * k + 3) - 0.5));
}
vec3 colorOf(int k) {
  float u = clamp((float(k) + uField.x) / (2.0 * uField.x), 0.0, 1.0) * ${(STRINGS_STOPS - 1).toFixed(1)};
  int i = min(${STRINGS_STOPS - 2}, int(floor(u)));
  float f = u - float(i);
  return uStops[i] + (uStops[i + 1] - uStops[i]) * f;
}
/* the slope level k has where the waves climb climb a px (strings.ts stringsLevelSlope) */
float levelSlope(int k, float climb) {
  float u = float(k) / uField.x;
  float w = max(0.0, 1.0 - u * u);
  return climb * uField.x / uField.y * w * sqrt(w);
}
float cover(float d) {
  return min(d + uLine.x, 0.5) - max(d - uLine.x, -0.5);
}

vec4 shade(vec2 px) {
  vec2 q = (px + 0.5 - 0.5 * uSize) / uD;
  vec2 p = q;
  float j00 = 1.0, j01 = 0.0, j10 = 0.0, j11 = 1.0;
  for (int i = 0; i < ${STRINGS_SHEARS}; i++) {
    vec4 v = uShear[i];
    float s = v.z * (v.x * p.x + v.y * p.y) + uPhase[i];
    float sn = sin(s);
    float c = v.w * v.z * cos(s);
    p += v.w * sn * vec2(-v.y, v.x);
    float r0 = v.x * j00 + v.y * j10;
    float r1 = v.x * j01 + v.y * j11;
    j00 -= c * v.y * r0;
    j01 -= c * v.y * r1;
    j10 += c * v.x * r0;
    j11 += c * v.x * r1;
  }
  float f = 0.0;
  vec2 g = vec2(0.0);
  for (int i = 0; i < ${STRINGS_WAVES}; i++) {
    vec4 v = uWave[i];
    float s = v.z * (v.x * p.x + v.y * p.y) + uPhase[${STRINGS_SHEARS} + i];
    f += v.w * sin(s);
    g += v.w * v.z * cos(s) * v.xy;
  }
  /* saturated: F = N x / sqrt(1 + x^2) of x = f / sat, its slope N / (sat (1 + x^2)^1.5) times f's */
  float x = f / uField.y;
  float root = sqrt(1.0 + x * x);
  float F = uField.x * x / root;
  vec2 G = uField.x / (uField.y * root * root * root) * vec2(g.x * j00 + g.y * j10, g.x * j01 + g.y * j11);
  float gpx = max(1e-9, length(G) / uD);
  float climb = gpx * (uField.y * root * root * root / uField.x);
  /* the levels that may show, a step apart, and the nearest either side that its crowding leaves */
  float least = uLine.y * (1.0 - 0.5 * uLine.z) * gpx;
  float step = 1.0;
  for (int i = 0; i < ${STRINGS_TOP_RANK}; i++) {
    if (step >= least) break;
    step *= 2.0;
  }
  int lo = int(step * floor(F / step));
  int hi = lo + int(step);
  if (exp2(rank(lo)) < need(lo) * levelSlope(lo, climb)) lo -= int(step);
  if (exp2(rank(hi)) < need(hi) * levelSlope(hi, climb)) hi += int(step);
  /* each thread's distance over the mean of the pixel's slope and the level's */
  float dlo = (F - float(lo)) / (0.5 * (gpx + levelSlope(lo, climb)));
  float dhi = (float(hi) - F) / (0.5 * (gpx + levelSlope(hi, climb)));
  bool near = dlo < dhi;
  int k = near ? lo : hi;
  int k2 = near ? hi : lo;
  /* a level past -(N - 1) or N - 1 is no thread */
  float c1 = abs(float(k)) < uField.x ? cover(near ? dlo : dhi) : 0.0;
  float c2 = abs(float(k2)) < uField.x ? cover(near ? dhi : dlo) : 0.0;
  vec4 c = uGround;
  if (c1 <= 0.0 && c2 <= 0.0) return c;
  /* the blob, its point moved by a share of the stirring */
  float s = uBlob.x;
  vec2 u = q + s * (p - q);
  vec2 e = u / uBlob.yz;
  float b = 1.0 - dot(e, e);
  vec2 bg = -2.0 * e / uBlob.yz;
  for (int i = 0; i < ${STRINGS_LUMPS}; i++) {
    vec3 l = uLump[i];
    float a = l.z * (l.x * u.x + l.y * u.y) + uPhase[${STRINGS_SHEARS + STRINGS_WAVES} + i];
    b += uBlob.w * sin(a);
    bg += uBlob.w * l.z * cos(a) * l.xy;
  }
  vec2 B = vec2(bg.x * (1.0 - s + s * j00) + bg.y * s * j10, bg.x * s * j01 + bg.y * (1.0 - s + s * j11));
  float bpx = max(1e-9, length(B) / uD);
  if (c2 > 0.0) {
    c2 *= clamp((b - uLine.w * (hash(k2) - 0.5)) / bpx + 0.5, 0.0, 1.0);
    c += (vec4(colorOf(k2), 1.0) - c) * c2;
  }
  if (c1 > 0.0) {
    c1 *= clamp((b - uLine.w * (hash(k) - 0.5)) / bpx + 0.5, 0.0, 1.0);
    c += (vec4(colorOf(k), 1.0) - c) * c1;
  }
  return c;
}`;

/** The pass: each pixel's color, premultiplied, its place from the top left. */
export const STRINGS_FS = `#version 300 es
precision highp float;
precision highp int;${STRINGS_UNIFORMS}
out vec4 o;
${STRINGS_SHADE}
void main() {
  vec2 px = vec2(gl_FragCoord.x - 0.5, uSize.y - gl_FragCoord.y - 0.5);
  o = shade(px);
}`;

/** What the pass takes for a scene, set once a palette, a view or a box changes: N and the field's saturation,
    the shears and waves (direction, wavenumber, reach or height), the lumps (direction, wavenumber), a thread's half
    width, least spacing, jitter and stagger, the blob's share, half sides and lumps' height, the ground premultiplied
    by its alpha with the alpha last, and the stops (0..1). */
export interface StringsSceneUniforms {
  field: Float32Array;
  shear: Float32Array;
  wave: Float32Array;
  lump: Float32Array;
  line: Float32Array;
  blob: Float32Array;
  ground: Float32Array;
  stops: Float32Array;
}

export function stringsSceneUniforms(m: StringsScene): StringsSceneUniforms {
  const { shears, waves, lumps } = m.design;
  return {
    field: Float32Array.of(m.n, m.sat),
    shear: Float32Array.from(shears.flatMap(v => [v.dx, v.dy, v.k, v.a])),
    wave: Float32Array.from(waves.flatMap(v => [v.dx, v.dy, v.k, v.a])),
    lump: Float32Array.from(lumps.flatMap(v => [v.dx, v.dy, v.k])),
    line: Float32Array.of(m.hw, m.need, m.jitter, m.stagger),
    blob: Float32Array.of(m.share, m.bx, m.by, m.lumps),
    ground: Float32Array.of(...m.ground.map(v => v * m.alpha), m.alpha),
    stops: Float32Array.from(m.stops)
  };
}
