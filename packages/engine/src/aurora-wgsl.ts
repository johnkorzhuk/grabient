/* The aurora's pass in WGSL, for its WebGPU page (aurora-webgpu.ts): the player's GLSL (aurora-gl.ts) line for line.
   The canvas's rows run down from the top, as the pixel's place does in the player (it turns gl_FragCoord's y over),
   so the fragment's position is that place plus a half, and it draws premultiplied, the range at its cover. The
   uniforms are one struct at group 0, binding 0; the table at binding 1, read texel by texel (textureLoad), the noise
   and its soft copy at 2 and 3, read between their pixels by straight lines and repeating through the sampler at 4,
   as the player's textures are. */
import { AURORA_LIGHT, AURORA_RAMP, AURORA_SLOTS, AURORA_SOFT } from "./aurora.ts";
import { AURORA_SHEETS } from "./aurora-gl.ts";

const L = AURORA_LIGHT;
/* a number as a float's literal, as the GLSL writes it */
const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/** Where each uniform lies in the struct, in bytes, as WGSL lays a uniform struct out, and the struct's bytes: the
    WebGPU page writes its block by these. */
export const AURORA_WGSL_UNIFORMS = {
  size: 0,
  time: 8,
  frame: 16,
  path: 32,
  range: 48,
  fan: 64,
  sheets: 80,
  bytes: 80 + 16 * AURORA_SHEETS.length
} as const;

type SheetName = (typeof AURORA_SHEETS)[number];
/* a sheet's spans and start, and how far it slides a loop, the same for every shape */
const spans = (name: SheetName) => `A.sheets[${AURORA_SHEETS.indexOf(name)}]`;
/* where a sheet is read: along the fan, or over the picture itself */
const fanned = (name: SheetName) =>
  `vec2f(ang * ${spans(name)}.x + ${spans(name)}.z + ${f(L[name].du)} * A.time, r * ${spans(name)}.y + ${spans(name)}.w + ${f(L[name].dv)} * A.time)`;
const level = (name: SheetName) =>
  `vec2f(p.x * ${spans(name)}.x + ${spans(name)}.z + ${f(L[name].du)} * A.time, p.y * ${spans(name)}.y + ${spans(name)}.w + ${f(L[name].dv)} * A.time)`;
const step = ([lo, hi]: readonly number[], v: string) => `smoothstep(${f(lo)}, ${f(hi)}, ${v})`;
const read = (tile: "noiseTile" | "softTile", at: string) =>
  `textureSampleLevel(${tile}, linearRepeat, ${at}, 0.0)`;

/** The pass: each pixel's color, premultiplied, its place from the top left. */
export const AURORA_WGSL = `struct Aurora {
  size: vec2f,                            // the canvas's pixels
  time: f32,                              // the loop's share gone by, 0 up to 1
  frame: vec3f,                           // the angle's cosine and sine, the picture's height in pixels
  path: vec3f,                            // half the picture's width, how many pieces, 1 where it has an upright wall
  range: vec4f,                           // the range's color premultiplied by its cover, the cover last
  fan: vec2f,                             // the point the rays fan from
  sheets: array<vec4f, ${AURORA_SHEETS.length}>,               // each sheet's tiles a radian across and a unit along, then where it starts
}
@group(0) @binding(0) var<uniform> A: Aurora;
@group(0) @binding(1) var table: texture_2d<f32>;      // the ramp, the pieces, their slots, the line the light rises from
@group(0) @binding(2) var noiseTile: texture_2d<f32>;  // the noise, four channels
@group(0) @binding(3) var softTile: texture_2d<f32>;   // the same made soft
@group(0) @binding(4) var linearRepeat: sampler;       // between pixels by straight lines, repeating
@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
// a piece's height at u along it: a its two places and two heights, b the two heights its curve bends by
fn heightAt(a: vec4f, b: vec4f, u: f32) -> f32 {
  return a.z + 0.5 * u * (a.w - b.x + u * (2.0 * b.x - 5.0 * a.z + 4.0 * a.w - b.y + u * (3.0 * (a.z - a.w) + b.y - b.x)));
}
fn tableAt(x: i32, y: i32) -> vec4f {
  return textureLoad(table, vec2i(x, y), 0);
}
fn shade(px: vec2f) -> vec4f {
  let d = px + 0.5 - 0.5 * A.size;
  let p = vec2f((d.x * A.frame.x + d.y * A.frame.y) / A.frame.z, 0.5 - (-d.x * A.frame.y + d.y * A.frame.x) / A.frame.z);
  // the piece of the range's path this point is over, and the path's height here
  let s = clamp((p.x / A.path.x + 1.0) * 0.5, 0.0, 1.0);
  var i = i32(tableAt(min(${AURORA_SLOTS - 1}, i32(floor(s * ${f(AURORA_SLOTS)}))), 3).x + 0.5);
  var a = tableAt(i, 1);
  if (s >= a.y && i < i32(A.path.y + 0.5) - 1) {
    i++;
    a = tableAt(i, 1);
  }
  // b: the heights its curve bends by, and the heights the pieces beside it end and start at
  let b = tableAt(i, 2);
  let wide = a.y - a.x;
  let edge = heightAt(a, b, (s - a.x) / wide);
  // how much of the light shows: soft across the edge, and as soft across an upright wall
  var show = smoothstep(${f(-AURORA_SOFT)}, ${f(AURORA_SOFT)}, p.y - edge);
  let softS = min(${f(AURORA_SOFT)} / (2.0 * A.path.x), 0.5 * wide);
  let dl = s - a.x;
  let dr = a.y - s;
  if (b.z != a.z && dl < softS) {
    let t = smoothstep(-1.0, 1.0, dl / softS);
    show = smoothstep(${f(-AURORA_SOFT)}, ${f(AURORA_SOFT)}, p.y - b.z) * (1.0 - t) + show * t;
  }
  if (b.w != a.w && dr < softS) {
    let t = smoothstep(-1.0, 1.0, -dr / softS);
    show = show * (1.0 - t) + smoothstep(${f(-AURORA_SOFT)}, ${f(AURORA_SOFT)}, p.y - b.w) * t;
  }
  // the line the light rises from: the path, or where it has an upright wall the path eased toward its walls' feet
  var base = edge;
  if (A.path.z > 0.5) {
    let q = s * ${f(AURORA_SLOTS - 1)};
    let k = min(${AURORA_SLOTS - 2}, i32(floor(q)));
    base = mix(tableAt(k, 4).x, tableAt(k + 1, 4).x, q - f32(k));
  }
  let h = p.y - base;
  // along the fan: the angle from straight up, and the way out along the ray
  let e = p - A.fan;
  let ang = atan2(e.x, e.y);
  let r = length(e);
  let shaft = ${step(L.shaft, `${read("noiseTile", fanned("a"))}.r`)} * (0.4 + 0.6 * ${step(L.shaft, `${read("noiseTile", fanned("b"))}.g`)});
  let halo = ${step(L.halo, `${read("softTile", fanned("a"))}.r`)} * (0.4 + 0.6 * ${step(L.halo, `${read("softTile", fanned("b"))}.g`)});
  let fine = ${step(L.fine, `${read("noiseTile", fanned("c"))}.b`)};
  let hot = ${step(L.hot, `${read("noiseTile", level("h1"))}.a`)} * ${step([L.hot[0] - 0.15, L.hot[1]], `${read("noiseTile", level("h2"))}.r`)};
  let gather = 0.7 + 0.3 * ${step(L.gather, `${read("softTile", `vec2f(ang * ${spans("g")}.x + ${spans("g")}.z + ${f(L.g.du)} * A.time, ${spans("g")}.w + ${f(L.g.dv)} * A.time)`)}.b`)};
  // how the light stands by height over the range: up in a short rise, then thinning away
  let up = max(h, 0.0);
  let lift = smoothstep(-0.02, ${f(L.rise)}, h) * exp(-max(h - ${f(L.rise)}, 0.0) / ${f(L.fall)});
  let light = ${f(L.haze)} * exp(-up / ${f(L.hazeFall)}) + lift * gather * (${f(L.halos)} * halo + ${f(L.shafts)} * shaft * (0.7 + 0.3 * fine) + ${f(L.fines)} * fine * halo + ${f(L.hots)} * hot * (0.4 + 0.6 * halo) * exp(-up / ${f(L.hotFall)}));
  // through the ramp
  let v = min(light, 0.9999) * ${f(AURORA_RAMP - 1)};
  let j = i32(floor(v));
  let color = mix(tableAt(j, 0).rgb, tableAt(j + 1, 0).rgb, v - f32(j));
  // the range in front, its edge soft
  let cov = 1.0 - show;
  return vec4f(color * (1.0 - cov) + A.range.rgb * cov, 1.0 - cov + A.range.a * cov);
}
@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let px = position.xy - 0.5;
  return shade(px);
}`;
