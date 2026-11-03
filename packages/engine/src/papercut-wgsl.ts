/* The papercut's two passes in WGSL, for its WebGPU page (papercut-webgpu.ts): the player's GLSL (papercut-gl.ts) line
   for line. The field's texture rows and the canvas's run down from the top, as the pixel's place does in the player
   (it turns gl_FragCoord's y over), so the fragment's position is that place plus a half. Uniforms are each pass's
   struct at group 0, binding 0; a uniform array's elements are 16 bytes apart, so the levels and the reaches are four
   to a vector and each sheet's color a vector of its own. */
import {
  PAPERCUT_MAX_BUMPS,
  PAPERCUT_MAX_SHEETS,
  PAPERCUT_NEAR,
  PAPERCUT_REACH,
  PAPERCUT_TAIL
} from "./papercut.ts";
import { PAPERCUT_QUARTER } from "./papercut-render.ts";

/** The vertex stage: one triangle over the target from the vertex's index, as the player's. */
const COVER_VS = `@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Where each of the field pass's uniforms lies in its struct, in bytes, as WGSL lays a uniform struct out (a scalar
    on 4 bytes, a vec2f on 8, a vec4f and an array of them on 16), and the struct's bytes: the WebGPU page writes its
    block by these, so they move with the hills' count. The page writes the canvas and D as three floats from the
    block's start. */
export const PAPERCUT_FIELD_UNIFORMS = {
  size: 0,
  D: 8,
  bumps: 12,
  ramp: 16,
  warp: 32,
  phase: 48,
  bump: 64,
  bytes: 64 + 16 * PAPERCUT_MAX_BUMPS
} as const;

/* an array of four sheets a vector, and of a vector a sheet, in bytes */
const QUADS = 16 * (PAPERCUT_MAX_SHEETS / 4);
const ROWS = 16 * PAPERCUT_MAX_SHEETS;

/** The shading pass's, as the field pass's: the levels and the reaches four sheets to a vector, then each sheet's
    colors and shadows a vector a sheet, so they move with the sheets' count. */
export const PAPERCUT_SHADE_UNIFORMS = {
  size: 0,
  D: 8,
  sheets: 12,
  light: 16,
  misc: 24,
  level: 32,
  reach: 32 + QUADS,
  face: 32 + 2 * QUADS,
  wallC: 32 + 2 * QUADS + ROWS,
  shade: 32 + 2 * QUADS + 2 * ROWS,
  sheet: 32 + 2 * QUADS + 3 * ROWS,
  bytes: 32 + 2 * QUADS + 4 * ROWS
} as const;

/** The field pass: texel (i, j) holds the field at the pixel-space point ((i - 1) Q + 0.5, (j - 1) Q + 0.5), y down,
    each float's bits. */
export const PAPERCUT_FIELD_WGSL = `struct Field {
  size: vec2f,                            // the canvas's pixels
  D: f32,                                 // D units' pixels
  bumps: i32,                             // the hills and hollows
  ramp: vec2f,                            // the ramp, its direction over its half length
  warp: vec4f,                            // the two waves' reach and frequency, each
  phase: vec4f,                           // the waves' phases this frame
  bump: array<vec4f, ${PAPERCUT_MAX_BUMPS}>,                 // each hill's middle (D units), 1 / r^2 and height this frame
}
@group(0) @binding(0) var<uniform> F: Field;
${COVER_VS}
// the field at q (D units): f, its slope G and its weighed curvature along the slope
fn field(q: vec2f) -> vec4f {
  let s1 = F.warp.y * q.y + F.phase.x;
  let s2 = F.warp.y * q.x + F.phase.y;
  let u = F.warp.w * (q.x + q.y) + F.phase.z;
  let v = F.warp.w * (q.x - q.y) + F.phase.w;
  let su = sin(u);
  let sv = sin(v);
  let w = vec2f(q.x + F.warp.x * sin(s1) + F.warp.z * sv, q.y + F.warp.x * sin(s2) + F.warp.z * su);
  let c1 = F.warp.x * F.warp.y * cos(s1);
  let c2 = F.warp.x * F.warp.y * cos(s2);
  let cu = F.warp.z * F.warp.w * cos(u);
  let cv = F.warp.z * F.warp.w * cos(v);
  let J = mat2x2f(1.0 + cv, c2 + cu, c1 - cv, 1.0 + cu);
  var f = w.x * F.ramp.x + w.y * F.ramp.y;
  var g = F.ramp;
  var h = vec3f(0.0);
  for (var i = 0; i < ${PAPERCUT_MAX_BUMPS}; i++) {
    if (i >= F.bumps) {
      break;
    }
    let B = F.bump[i];
    let e = w - B.xy;
    let s = dot(e, e) * B.z;
    if (s < 1.0) {
      let k = 1.0 - s;
      let k2 = k * k;
      f += B.w * k2 * k;
      let c = -6.0 * B.w * k2 * B.z;
      g += c * e;
      let qq = 24.0 * B.w * B.z * B.z * k;
      h += vec3f(c + qq * e.x * e.x, qq * e.x * e.y, c + qq * e.y * e.y);
    }
  }
  let G = vec2f(g.x * J[0][0] + g.y * J[0][1], g.x * J[1][0] + g.y * J[1][1]);
  let H = mat2x2f(h.x, h.y, h.y, h.z);
  let Q = transpose(J) * H * J;
  let g2 = dot(G, G);
  var kn = 0.5 * (Q[0][0] + Q[1][1]);
  if (g2 > 0.0) {
    kn = dot(G, Q * G) / g2;
  }
  let tr = Q[0][0] + Q[1][1];
  var roundness = 0.0;
  if (tr * tr > 0.0) {
    roundness = clamp(8.0 * (Q[0][0] * Q[1][1] - Q[0][1] * Q[1][0]) / (tr * tr), 0.0, 1.0);
  }
  return vec4f(f, G, kn * roundness);
}
@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4u {
  let p = (floor(position.xy) - 1.0) * ${PAPERCUT_QUARTER.toFixed(1)} + 0.5;
  return bitcast<vec4u>(field((p - 0.5 * F.size) / F.D));
}`;

/** The shading pass: the field mixed from its four texels (the pixel at (x, y) lies at x / Q + 1 texels), the sheets
    about the pixel painted from it, and the dither. */
export const PAPERCUT_SHADE_WGSL = `struct Shade {
  size: vec2f,                            // the canvas's pixels
  D: f32,                                 // D units' pixels
  sheets: i32,                            // the sheets
  light: vec2f,                           // toward the light this frame
  misc: vec2f,                            // the contact shadow's opacity and the lit cut's width
  level: array<vec4f, ${PAPERCUT_MAX_SHEETS / 4}>,                // where each sheet from the second begins, four a vector
  reach: array<vec4f, ${PAPERCUT_MAX_SHEETS / 4}>,                // how far each sheet's drop shadow reaches past its cut times 1.5, px, four a vector
  face: array<vec4f, ${PAPERCUT_MAX_SHEETS}>,                // each sheet's color, rgb
  wallC: array<vec4f, ${PAPERCUT_MAX_SHEETS}>,               // its lit cut's
  shade: array<vec4f, ${PAPERCUT_MAX_SHEETS}>,               // the shadow it casts
  sheet: array<vec4f, ${PAPERCUT_MAX_SHEETS}>,               // its drop shadow's 1 / sigma, offset and opacity, and the contact's 1 / sigma
}
@group(0) @binding(0) var<uniform> S: Shade;
@group(0) @binding(1) var fieldTex: texture_2d<u32>;   // the field pass's texels
${COVER_VS}
fn level(k: i32) -> f32 {
  return S.level[k / 4][k % 4];
}
fn reachOf(k: i32) -> f32 {
  return S.reach[k / 4][k % 4];
}
fn phi(x: f32) -> f32 {
  let t = clamp((x + ${PAPERCUT_REACH.toFixed(2)}) * ${(1 / (2 * PAPERCUT_REACH)).toFixed(8)}, 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}
fn sheet(c0: vec3f, k: i32, f: f32, gl: f32, kap: f32, nl: f32, wn: f32, toPx: f32) -> vec3f {
  var c = c0;
  let P = S.sheet[k];
  let rise = level(k - 1) - f;
  var d = -rise * toPx;
  var ds = d + P.y * nl;
  var size = 1.0;
  var csize = 1.0;
  if (rise > 0.0) {
    let disc = gl * gl + 2.0 * kap * rise;
    let ak = abs(kap);
    if (ak * ${PAPERCUT_NEAR.toFixed(1)} * P.y > gl * S.D) {
      let top = gl / ak * S.D;
      var root = -sqrt(-disc);
      if (disc >= 0.0) {
        root = sqrt(disc);
      }
      let R = root / ak * S.D;
      var e = -1.0;
      if (kap < 0.0) {
        e = 1.0;
      }
      d = -e * (top - R);
      ds = -e * (sqrt(top * top - 2.0 * e * top * P.y * nl + P.y * P.y) - R);
      if (e > 0.0) {
        let R2 = max(0.0, R) * R;
        size = 1.0 - exp(-0.5 * R2 * P.x * P.x);
        csize = 1.0 - exp(-0.5 * R2 * P.w * P.w);
      }
    } else {
      if (disc >= 0.0) {
        d = -S.D * ((2.0 * rise) / (gl + sqrt(disc)));
      } else {
        d = -S.D * ((gl + sqrt(-disc)) / -kap);
      }
      ds = d + P.y * nl;
    }
  }
  let x = ds * P.x;
  if (x > ${PAPERCUT_TAIL.toFixed(2)}) {
    c += (S.shade[k].rgb - c) * (P.z * phi(x) * size);
  }
  let xc = d * P.w;
  if (xc > ${PAPERCUT_TAIL.toFixed(2)}) {
    c += (S.shade[k].rgb - c) * (S.misc.x * phi(xc) * csize);
  }
  if (d + max(0.0, wn) > -0.5) {
    c += (S.wallC[k].rgb - c) * clamp(d + 0.5, 0.0, 1.0);
    c += (S.face[k].rgb - c) * clamp(d + wn + 0.5, 0.0, 1.0);
  }
  return c;
}
fn shade(F: vec4f, px: vec2f) -> vec4f {
  let f = F.x;
  let G = F.yz;
  let top = S.sheets - 1;
  var b = 0;
  for (var i = 0; i < ${PAPERCUT_MAX_SHEETS - 1}; i++) {
    if (i >= top) {
      break;
    }
    if (f >= level(i)) {
      b++;
    }
  }
  let gl = max(1e-9, length(G));
  let toPx = S.D / gl;
  let kap = F.w;
  let nl = dot(G, S.light) / gl;
  let wn = S.misc.y * nl;
  var c = S.face[0].rgb;
  var own = false;
  if (b > 0) {
    if ((f - level(b - 1)) * toPx + wn >= 0.5) {
      c = S.face[b].rgb;
    } else {
      c = S.face[b - 1].rgb;
      own = true;
    }
  }
  if (own) {
    c = sheet(c, b, f, gl, kap, nl, wn, toPx);
  }
  if (b < top) {
    c = sheet(c, b + 1, f, gl, kap, nl, wn, toPx);
  }
  if (b + 1 < top && (level(b + 1) - f) * toPx < reachOf(b + 2)) {
    c = sheet(c, b + 2, f, gl, kap, nl, wn, toPx);
  }
  let a = 0.06711056 * px.x + 0.00583715 * px.y;
  let n = fract(52.9829189 * fract(a)) - 0.5;
  return vec4f(c + n / 255.0, 1.0);
}
@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let px = position.xy - 0.5;
  let t = px / ${PAPERCUT_QUARTER.toFixed(1)} + 1.0;
  let i = vec2i(t);
  let a = t - vec2f(i);
  let f00 = bitcast<vec4f>(textureLoad(fieldTex, i, 0));
  let f10 = bitcast<vec4f>(textureLoad(fieldTex, i + vec2i(1, 0), 0));
  let f01 = bitcast<vec4f>(textureLoad(fieldTex, i + vec2i(0, 1), 0));
  let f11 = bitcast<vec4f>(textureLoad(fieldTex, i + vec2i(1, 1), 0));
  return shade(mix(mix(f00, f10, a.x), mix(f01, f11, a.x), a.y), px);
}`;
