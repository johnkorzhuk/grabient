/* The silk's pass in WGSL, for its WebGPU page (silk-webgpu.ts): the player's GLSL (silk-gl.ts) line for line.
   WebGPU's framebuffer rows run down from the top, as the pixel's place p does in the player (it turns gl_FragCoord's
   y over), so the fragment's position is p. Uniforms are the pass's struct at group 0, binding 0; the rings' bands are
   two to a vector, as a uniform array's elements are 16 bytes apart. */
import { MAX_FOLDS } from "./silk.ts";

/** The vertex stage: one triangle over the target from the vertex's index, as the player's. */
const COVER_VS = `@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** The silk's pass, the player's fragment shader in WGSL. */
export const SILK_WGSL = `struct Silk {
  D: vec4f,                         // the dye's line as a texel coordinate, u = dot(p, D.xy) + D.z; D.w the canvas's height
  F: array<vec4f, ${MAX_FOLDS}>,    // ring i's middle (px, y down) and its profile's texel coordinate, x = distance * F.z + F.w
  G: array<vec4f, ${MAX_FOLDS / 2}>,     // the rings' bands' squared radii, inner and outer, two rings a vector
  N: i32,                           // the rings
}
@group(0) @binding(0) var<uniform> uni: Silk;
@group(0) @binding(1) var T: texture_2d<f32>;   // the dye, 32 x 3 rgba8unorm: rows dyed, shade, light
@group(0) @binding(2) var S: texture_2d<f32>;   // the profiles, 65 x 1 rg16float: valley, crest
@group(0) @binding(3) var lerped: sampler;      // linear, clamp to edge
${COVER_VS}
@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = position.xy;
  var tv = 1.0;
  var tc = 1.0;
  for (var i = 0; i < ${MAX_FOLDS}; i++) {
    if (i >= uni.N) {
      break;
    }
    let f = uni.F[i];
    let d = p - f.xy;
    let q = dot(d, d);
    let bands = uni.G[i / 2];
    let g = select(bands.xy, bands.zw, (i & 1) == 1);
    if (q > g.x && q < g.y) {
      let a = textureSampleLevel(S, lerped, vec2f(sqrt(q) * f.z + f.w, 0.5), 0.0).rg;
      tv -= tv * a.r;
      tc -= tc * a.g;
    }
  }
  let u = dot(p, uni.D.xy) + uni.D.z;
  let b = textureSampleLevel(T, lerped, vec2f(u, 1.0 / 6.0), 0.0).rgb;
  let s = textureSampleLevel(T, lerped, vec2f(u, 0.5), 0.0).rgb;
  let l = textureSampleLevel(T, lerped, vec2f(u, 5.0 / 6.0), 0.0).rgb;
  return vec4f(mix(mix(b, s, 1.0 - tv), l, 1.0 - tc), 1.0);
}`;
