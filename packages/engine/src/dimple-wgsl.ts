/* The dimple's pass in WGSL, for its WebGPU page (dimple-webgpu.ts): the player's GLSL (dimple-gl.ts) line for line.
   The canvas's rows run down from the top, as the pixel's place does in the player (it turns gl_FragCoord's y over),
   so the fragment's position is that place plus a half. The uniforms are one struct at group 0, binding 0; a uniform
   array's elements are 16 bytes apart, so each of the ground's colors and each stop is a vector of its own. */
import { DIMPLE_GROUND_STEPS, DIMPLE_LOOK, DIMPLE_STOPS } from "./dimple.ts";

const L = DIMPLE_LOOK;
const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/** Where each uniform lies in the struct, in bytes, as WGSL lays a uniform struct out, and the struct's bytes: the
    WebGPU page writes its block by these. */
export const DIMPLE_WGSL_UNIFORMS = {
  size: 0,
  rest: 8,
  hollow: 16,
  far: 24,
  lattice: 32,
  back: 48,
  bowl: 64,
  disc: 80,
  ground: 96,
  stops: 96 + 16 * (DIMPLE_GROUND_STEPS + 1),
  bytes: 96 + 16 * (DIMPLE_GROUND_STEPS + 1 + DIMPLE_STOPS)
} as const;

/** The pass: each pixel's color, its place from the top left. */
export const DIMPLE_WGSL = `struct Dimple {
  size: vec2f,                            // the canvas's pixels
  rest: vec2f,                            // the hollow's rest, which lattice place (0, 0) lies on
  hollow: vec2f,                          // where the hollow is
  far: f32,                               // how far the ground's colors reach from the hollow
  lattice: vec4f,                         // the lattice's two steps
  back: vec4f,                            // from a point to lattice steps
  bowl: vec4f,                            // the palette's reach, the pinch's strength and width, where the wall is steepest
  disc: vec4f,                            // a disc's radius, the heart's width, and toward the light
  ground: array<vec4f, ${DIMPLE_GROUND_STEPS + 1}>,              // the ground's colors about the hollow
  stops: array<vec4f, ${DIMPLE_STOPS}>,               // the palette's stops
}
@group(0) @binding(0) var<uniform> S: Dimple;
@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
// how much of its distance from the hollow a point keeps once the sheet is drawn in
fn drawn(d: f32) -> f32 {
  return 1.0 - S.bowl.y * exp(-d * d / (2.0 * S.bowl.z * S.bowl.z));
}
// the palette's place at a distance from the hollow's heart
fn level(d: f32) -> f32 {
  return ${f(L.floor)} + ${f(1 - L.run - L.floor)} * min(1.0, d / S.bowl.x);
}
// the palette at t, straight lines between its stops
fn ramp(t: f32) -> vec3f {
  let x = clamp(t, 0.0, 1.0) * ${f(DIMPLE_STOPS - 1)};
  let i = min(${DIMPLE_STOPS - 2}, i32(floor(x)));
  let f = x - f32(i);
  return S.stops[i].xyz + (S.stops[i + 1].xyz - S.stops[i].xyz) * f;
}
fn shade(px: vec2f) -> vec4f {
  let p = px + 0.5;
  let q = p - S.hollow;
  let dd = length(q);
  // the ground, a gradient about the hollow
  let gd = min(1.0, dd / S.far) * ${f(DIMPLE_GROUND_STEPS)};
  let gi = min(${DIMPLE_GROUND_STEPS - 1}, i32(floor(gd)));
  var col = S.ground[gi].xyz + (S.ground[gi + 1].xyz - S.ground[gi].xyz) * (gd - f32(gi));
  // the pixel's lattice cell once the drawing-in is undone: the discs at its corners are all that can cover it
  var rho = dd;
  for (var n = 0; n < 4; n++) {
    rho = dd / drawn(rho);
  }
  var k = 1.0;
  if (dd > 1e-6) {
    k = rho / dd;
  }
  let s = S.hollow + q * k - S.rest;
  let cell = floor(vec2f(S.back.x * s.x + S.back.y * s.y, S.back.z * s.x + S.back.w * s.y));
  var mid: array<vec2f, 4>;
  var toward: array<vec2f, 4>;
  var away: array<f32, 4>;
  var rank: array<f32, 4>;
  for (var n = 0; n < 4; n++) {
    let ij = cell + vec2f(f32(n & 1), f32(n >> 1u));
    // from the hollow's rest, which lattice place (0, 0) lies on, and from the hollow
    let Q = ij.x * S.lattice.xy + ij.y * S.lattice.zw;
    let P = S.rest + Q - S.hollow;
    let r0 = length(P);
    let g = drawn(r0);
    mid[n] = S.hollow + P * g;
    toward[n] = vec2f(0.0);
    if (r0 > 1e-6) {
      toward[n] = -P / r0;
    }
    away[n] = r0 * g;
    // its place in the stack, read at the rest: the same wherever the hollow is
    let q0 = length(Q);
    var facing = 0.0;
    if (q0 > 1e-6) {
      facing = -dot(Q, S.disc.zw) / q0;
    }
    rank[n] = q0 * drawn(q0) * (1.0 - ${f(L.over)} * facing);
  }
  // laid in the stack's order, the bottom disc first
  for (var turn = 0; turn < 4; turn++) {
    var m = 0;
    for (var n = 1; n < 4; n++) {
      if (rank[n] > rank[m]) {
        m = n;
      }
    }
    rank[m] = -1.0;
    let e = p - mid[m];
    let cover = clamp(S.disc.x - length(e) + 0.5, 0.0, 1.0);
    if (cover <= 0.0) {
      continue;
    }
    let d = away[m];
    let w = d / S.bowl.w;
    let wall = w * exp(1.0 - w) * clamp((S.bowl.x - d) / (${f(L.litOut)} * S.bowl.x), 0.0, 1.0);
    let facing = dot(toward[m], S.disc.zw);
    let t = clamp(level(d) + ${f(L.lit)} * wall * facing, 0.0, 1.0);
    let run = ${f(L.run)} * max(${f(L.least)}, min(1.0, d / S.disc.y));
    let along = clamp(dot(e, toward[m]) / S.disc.x, -1.0, 1.0);
    col += (ramp(t + run * along) - col) * cover;
  }
  return vec4f(col, 1.0);
}
@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let px = position.xy - 0.5;
  return shade(px);
}`;
