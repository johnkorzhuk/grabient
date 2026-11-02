/* The blob's passes in WGSL, for its WebGPU page (blob-page.ts): the player's GLSL (blob-gl.ts) line for line, each
   pass one module of a vertex and a fragment stage. WebGPU's framebuffer rows run down from the top where WebGL's run
   up, so the balls' quads are flipped as they go to the melt, which then holds the rows the player's does, and the
   canvas's pass reads its own row from the fragment's place: every texture holds what the player's holds, texel for
   texel. Uniforms are each pass's struct at group 0, binding 0. */
import { BLOB_RADIUS } from "./blob-gl.ts";

/** The vertex stage of the passes that cover their target: the quad the balls are drawn on, corner to corner. */
const COVER_VS = `@vertex
fn vs_main(@location(0) corner: vec2f) -> @builtin(position) vec4f {
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Weights a uniform array holds four to a vec4f. */
const WEIGHTS = Math.ceil((BLOB_RADIUS + 1) / 4);

export const BLOB_WGSL = {
  dots: `struct Dots {
  size: vec2f,                      // the melt's texels
}
@group(0) @binding(0) var<uniform> uni: Dots;
struct Ball {
  @builtin(position) position: vec4f,
  @location(0) here: vec2f,
  @location(1) center: vec3f,
  @location(2) tint: vec4f,
}
@vertex
fn vs_main(@location(0) corner: vec2f, @location(1) disc: vec4f, @location(2) paint: vec4f) -> Ball {
  let at = disc.xy + (corner * 2.0 - 1.0) * (disc.z + 1.0);
  let clip = at / uni.size * 2.0 - 1.0;
  var out: Ball;
  out.here = at;
  out.center = disc.xyz;
  out.tint = paint;
  // flipped, so the melt's rows run as the WebGL player's do
  out.position = vec4f(clip.x, -clip.y, 0.0, 1.0);
  return out;
}
// each texel as much as the disc covers it
@fragment
fn fs_main(ball: Ball) -> @location(0) vec4f {
  let cover = clamp(ball.center.z - distance(floor(ball.here) + 0.5, ball.center.xy) + 0.5, 0.0, 1.0);
  return vec4f(ball.tint.rgb * cover, cover);
}`,
  blur: `struct Blur {
  step_by: vec2i,
  taps: i32,
  weights: array<vec4f, ${WEIGHTS}>,
}
@group(0) @binding(0) var<uniform> uni: Blur;
@group(0) @binding(1) var source: texture_2d<f32>;
${COVER_VS}
fn weight(i: i32) -> f32 {
  return uni.weights[i / 4][i % 4];
}
@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let at = vec2i(position.xy);
  let size = vec2i(textureDimensions(source));
  var sum = textureLoad(source, at, 0) * weight(0);
  for (var i = 1; i <= ${BLOB_RADIUS}; i++) {
    if (i > uni.taps) {
      break;
    }
    let a = at + uni.step_by * i;
    let b = at - uni.step_by * i;
    if (a.x < size.x && a.y < size.y) {
      sum += textureLoad(source, a, 0) * weight(i);
    }
    if (b.x >= 0 && b.y >= 0) {
      sum += textureLoad(source, b, 0) * weight(i);
    }
  }
  return sum;
}`,
  noise: `struct Noise {
  scale: vec2f,                     // device pixels a design unit, across and down
  offset: vec2f,                    // the design's corner in device pixels
  frequency: f32,
}
@group(0) @binding(0) var<uniform> uni: Noise;
@group(0) @binding(1) var lattice: texture_2d<u32>;      // 256 x 1
@group(0) @binding(2) var gradients: texture_2d<f32>;    // 256 x 4, Skia's noise bitmap
${COVER_VS}
fn gradient(index: i32, channel: i32) -> vec2f {
  let g = textureLoad(gradients, vec2i(index & 255, channel), 0);
  return (g.ga + g.rb * 0.00390625) * 2.0 - 1.0;
}
fn selector(x: f32) -> i32 {
  let l = i32(textureLoad(lattice, vec2i(i32(x) & 255, 0), 0).r);
  return select(l, 256, l == 255);
}
// feTurbulence fractalNoise, two octaves, as Ganesh computes it; clamped and premultiplied
@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  var v = ((position.xy - uni.offset) / uni.scale + 0.5) * uni.frequency;
  var sum = vec4f(0.0);
  var ratio = 1.0;
  for (var octave = 0; octave < 2; octave++) {
    let f0 = floor(v);
    let f = v - f0;
    let s = f * f * (3.0 - 2.0 * f);
    let i = selector(f0.x);
    let j = selector(f0.x + 1.0);
    let y = i32(f0.y);
    let b00 = i + y;
    let b10 = j + y;
    let b01 = i + y + 1;
    let b11 = j + y + 1;
    var n = vec4f(0.0);
    for (var c = 0; c < 4; c++) {
      var u = dot(gradient(b00, c), f);
      var w = dot(gradient(b10, c), f - vec2f(1.0, 0.0));
      let a = mix(u, w, s.x);
      w = dot(gradient(b11, c), f - vec2f(1.0));
      u = dot(gradient(b01, c), f - vec2f(0.0, 1.0));
      let b = mix(u, w, s.x);
      n[c] = mix(a, b, s.y);
    }
    sum += n * ratio;
    v *= 2.0;
    ratio *= 0.5;
  }
  let c = clamp(sum * 0.5 + 0.5, vec4f(0.0), vec4f(1.0));
  return vec4f(c.rgb * c.a, c.a);
}`,
  final: `struct Final {
  region: vec4f,                    // the filter region, whole device pixels [x0, y0, x1, y1)
  ground: vec4f,                    // the ground, premultiplied; 0s for none
  melt_origin: vec2f,               // device pixels of the melt's corner
  scatter: vec2f,                   // the displacement's scale in device pixels, across and down
  lift: vec2f,                      // alpha * lift.x + lift.y
  gray: vec2f,                      // blue * gray.x + gray.y
  k: vec2f,                         // the arithmetic's k1 and k2
  melt_texel: f32,                  // device pixels a texel spans
  frosted: u32,
}
@group(0) @binding(0) var<uniform> uni: Final;
@group(0) @binding(1) var melt: texture_2d<f32>;
@group(0) @binding(2) var melt_sampler: sampler;
@group(0) @binding(3) var noise: texture_2d<f32>;
${COVER_VS}
fn within(p: vec2f) -> bool {
  return all(p >= uni.region.xy) && all(p < uni.region.zw);
}
fn bytes(v: vec4f) -> vec4f {
  return floor(clamp(v, vec4f(0.0), vec4f(1.0)) * 255.0 + 0.5) / 255.0;
}
// every pixel: the scatter, the lift of the edge, the speckle, each on 8-bit values; then the ground
@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(position.xy);
  let at = vec2f(p);
  let frosted = uni.frosted != 0u;
  var n = vec4f(0.0);
  if (frosted) {
    n = textureLoad(noise, p, 0);
  }
  let un = clamp(n.rgb / max(n.a, 0.0001), vec3f(0.0), vec3f(1.0));
  var q = at;
  if (frosted) {
    q = floor(at + 0.5 + uni.scatter * (un.rg - 0.5));
  }
  var d = vec4f(0.0);
  if (within(q)) {
    let size = vec2f(textureDimensions(melt));
    d = bytes(textureSampleLevel(melt, melt_sampler, (q + 0.5 - uni.melt_origin) / uni.melt_texel / size, 0.0));
  }
  let a = clamp(d.a * uni.lift.x + uni.lift.y, 0.0, 1.0);
  let g = vec4f(clamp(d.rgb / max(d.a, 0.0001), vec3f(0.0), vec3f(1.0)) * a, a);
  var s = g;
  if (frosted) {
    let grain = clamp(un.b * uni.gray.x + uni.gray.y, 0.0, 1.0);
    s = clamp(uni.k.x * g * vec4f(vec3f(grain), 1.0) + uni.k.y * g, vec4f(0.0), vec4f(1.0));
    s = vec4f(min(s.rgb, vec3f(s.a)), s.a);
  }
  if (within(at)) {
    s = bytes(s);
  } else {
    s = vec4f(0.0);
  }
  return s + uni.ground * (1.0 - s.a);
}`
} as const;
