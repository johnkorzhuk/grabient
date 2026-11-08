/* The strings' pass in WGSL, for its WebGPU page (strings-webgpu.ts): the player's GLSL (strings-gl.ts) line for line.
   The canvas's rows run down from the top, as the pixel's place does in the player (it turns gl_FragCoord's y over),
   so the fragment's position is that place plus a half, and it draws premultiplied, the ground at its alpha. The
   uniforms are one struct at group 0, binding 0; a uniform array's elements are 16 bytes apart, so the phases are four
   to a vector and each lump and stop a vector of its own. */
import {
  STRINGS_FRAME_SIZE,
  STRINGS_LUMPS,
  STRINGS_SHEARS,
  STRINGS_STOPS,
  STRINGS_TOP_RANK,
  STRINGS_WAVES
} from "./strings.ts";

/** The phases' vectors, four phases to one. */
const PHASES = Math.ceil(STRINGS_FRAME_SIZE / 4);

/** Where each uniform lies in the struct, in bytes, as WGSL lays a uniform struct out, and the struct's bytes: the
    WebGPU page writes its block by these. */
export const STRINGS_WGSL_UNIFORMS = {
  size: 0,
  D: 8,
  n: 12,
  sat: 16,
  line: 32,
  blob: 48,
  ground: 64,
  shear: 80,
  wave: 80 + 16 * STRINGS_SHEARS,
  lump: 80 + 16 * (STRINGS_SHEARS + STRINGS_WAVES),
  phase: 80 + 16 * (STRINGS_SHEARS + STRINGS_WAVES + STRINGS_LUMPS),
  stops: 80 + 16 * (STRINGS_SHEARS + STRINGS_WAVES + STRINGS_LUMPS + PHASES),
  bytes: 80 + 16 * (STRINGS_SHEARS + STRINGS_WAVES + STRINGS_LUMPS + PHASES + STRINGS_STOPS)
} as const;

/** The pass: each pixel's color, premultiplied, its place from the top left. */
export const STRINGS_WGSL = `struct Strings {
  size: vec2f,                            // the canvas's pixels
  D: f32,                                 // D units' pixels
  n: f32,                                 // N: the field runs between -N and N
  sat: f32,                               // where the field saturates
  line: vec4f,                            // a thread's half width, least spacing (px), its jitter and its ends' stagger
  blob: vec4f,                            // the stirring's share in the blob, its half sides, its lumps' height
  ground: vec4f,                          // the ground's color, premultiplied by its alpha, and its alpha
  shear: array<vec4f, ${STRINGS_SHEARS}>,               // each shear's direction, wavenumber and reach
  wave: array<vec4f, ${STRINGS_WAVES}>,                // each wave's direction, wavenumber and height
  lump: array<vec4f, ${STRINGS_LUMPS}>,                // each lump's direction and wavenumber
  phase: array<vec4f, ${PHASES}>,                 // the shears', waves' and lumps' phases this frame, four to a vector
  stops: array<vec4f, ${STRINGS_STOPS}>,              // the palette's stops
}
@group(0) @binding(0) var<uniform> S: Strings;
@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
fn phaseOf(i: i32) -> f32 {
  return S.phase[i / 4][i % 4];
}
fn hash(k: i32) -> f32 {
  return f32(((u32(k + 4096) * 2654435761u) >> 16u) & 1023u) / 1023.0;
}
fn rank(k: i32) -> f32 {
  if (k == 0) {
    return ${STRINGS_TOP_RANK.toFixed(1)};
  }
  return f32(min(${STRINGS_TOP_RANK}, i32(countTrailingZeros(k))));
}
fn need(k: i32) -> f32 {
  return S.line.y * (1.0 + S.line.z * (hash(7 * k + 3) - 0.5));
}
fn colorOf(k: i32) -> vec3f {
  let u = clamp((f32(k) + S.n) / (2.0 * S.n), 0.0, 1.0) * ${(STRINGS_STOPS - 1).toFixed(1)};
  let i = min(${STRINGS_STOPS - 2}, i32(floor(u)));
  let f = u - f32(i);
  return S.stops[i].rgb + (S.stops[i + 1].rgb - S.stops[i].rgb) * f;
}
// the slope level k has where the waves climb climb a px (strings.ts stringsLevelSlope)
fn levelSlope(k: i32, climb: f32) -> f32 {
  let u = f32(k) / S.n;
  let w = max(0.0, 1.0 - u * u);
  return climb * S.n / S.sat * w * sqrt(w);
}
fn cover(d: f32) -> f32 {
  return min(d + S.line.x, 0.5) - max(d - S.line.x, -0.5);
}
fn shade(px: vec2f) -> vec4f {
  let q = (px + 0.5 - 0.5 * S.size) / S.D;
  var p = q;
  var j00 = 1.0;
  var j01 = 0.0;
  var j10 = 0.0;
  var j11 = 1.0;
  for (var i = 0; i < ${STRINGS_SHEARS}; i++) {
    let v = S.shear[i];
    let s = v.z * (v.x * p.x + v.y * p.y) + phaseOf(i);
    let sn = sin(s);
    let c = v.w * v.z * cos(s);
    p += v.w * sn * vec2f(-v.y, v.x);
    let r0 = v.x * j00 + v.y * j10;
    let r1 = v.x * j01 + v.y * j11;
    j00 -= c * v.y * r0;
    j01 -= c * v.y * r1;
    j10 += c * v.x * r0;
    j11 += c * v.x * r1;
  }
  var f = 0.0;
  var g = vec2f(0.0);
  for (var i = 0; i < ${STRINGS_WAVES}; i++) {
    let v = S.wave[i];
    let s = v.z * (v.x * p.x + v.y * p.y) + phaseOf(${STRINGS_SHEARS} + i);
    f += v.w * sin(s);
    g += v.w * v.z * cos(s) * v.xy;
  }
  // saturated: F = N x / sqrt(1 + x^2) of x = f / sat, its slope N / (sat (1 + x^2)^1.5) times f's
  let x = f / S.sat;
  let root = sqrt(1.0 + x * x);
  let F = S.n * x / root;
  let G = S.n / (S.sat * root * root * root) * vec2f(g.x * j00 + g.y * j10, g.x * j01 + g.y * j11);
  let gpx = max(1e-9, length(G) / S.D);
  let climb = gpx * (S.sat * root * root * root / S.n);
  // the levels that may show, a step apart, and the nearest either side that its crowding leaves
  let least = S.line.y * (1.0 - 0.5 * S.line.z) * gpx;
  var step = 1.0;
  for (var i = 0; i < ${STRINGS_TOP_RANK}; i++) {
    if (step >= least) {
      break;
    }
    step *= 2.0;
  }
  var lo = i32(step * floor(F / step));
  var hi = lo + i32(step);
  if (exp2(rank(lo)) < need(lo) * levelSlope(lo, climb)) {
    lo -= i32(step);
  }
  if (exp2(rank(hi)) < need(hi) * levelSlope(hi, climb)) {
    hi += i32(step);
  }
  // each thread's distance over the mean of the pixel's slope and the level's
  let dlo = (F - f32(lo)) / (0.5 * (gpx + levelSlope(lo, climb)));
  let dhi = (f32(hi) - F) / (0.5 * (gpx + levelSlope(hi, climb)));
  let near = dlo < dhi;
  let k = select(hi, lo, near);
  let k2 = select(lo, hi, near);
  // a level past -(N - 1) or N - 1 is no thread
  var c1 = select(0.0, cover(select(dhi, dlo, near)), abs(f32(k)) < S.n);
  var c2 = select(0.0, cover(select(dlo, dhi, near)), abs(f32(k2)) < S.n);
  var c = S.ground;
  if (c1 <= 0.0 && c2 <= 0.0) {
    return c;
  }
  // the blob, its point moved by a share of the stirring
  let s = S.blob.x;
  let u = q + s * (p - q);
  let e = u / S.blob.yz;
  var b = 1.0 - dot(e, e);
  var bg = -2.0 * e / S.blob.yz;
  for (var i = 0; i < ${STRINGS_LUMPS}; i++) {
    let l = S.lump[i];
    let a = l.z * (l.x * u.x + l.y * u.y) + phaseOf(${STRINGS_SHEARS + STRINGS_WAVES} + i);
    b += S.blob.w * sin(a);
    bg += S.blob.w * l.z * cos(a) * l.xy;
  }
  let B = vec2f(bg.x * (1.0 - s + s * j00) + bg.y * s * j10, bg.x * s * j01 + bg.y * (1.0 - s + s * j11));
  let bpx = max(1e-9, length(B) / S.D);
  if (c2 > 0.0) {
    c2 *= clamp((b - S.line.w * (hash(k2) - 0.5)) / bpx + 0.5, 0.0, 1.0);
    c += (vec4f(colorOf(k2), 1.0) - c) * c2;
  }
  if (c1 > 0.0) {
    c1 *= clamp((b - S.line.w * (hash(k) - 0.5)) / bpx + 0.5, 0.0, 1.0);
    c += (vec4f(colorOf(k), 1.0) - c) * c1;
  }
  return c;
}
@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let px = position.xy - 0.5;
  return shade(px);
}`;
