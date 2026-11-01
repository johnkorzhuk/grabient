/* The fluted glass's passes in WGSL, for the shader exports' WebGPU page (glass-shader.ts): the player's GLSL passes
   (glass-gl.ts) with the same arithmetic in the same order, so each pass computes what the player's computes. WebGPU's
   targets run down where WebGL's run up, so the discs' quads are turned over to land on the rows the player's land on,
   and every texture is laid out as the player's is. A module a pass, its vertex stage and its fragment stage. */

/** The discs: each an instanced quad over its circle in the field's texels (y down), a soft circle opaque to its core,
    premultiplied for the blend over the field. WebGPU covers the pixels WebGL covers but sets the quad's second
    triangle up from another corner, which moves the last bit of a varying, so each pixel's varyings are worked out as
    the player's WebGL triangles give them: the corners snapped to 16ths of a pixel, the strip's triangles (v2, v0, v1)
    and (v2, v1, v3), each varying from its triangle's plane. */
export const GLASS_DISC_WGSL = `@group(0) @binding(0) var<uniform> uField: vec4f;   // the field's size in texels, xy; 1, w

struct Disc {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) disc: vec4f,
  @location(1) @interpolate(flat) color: vec3f,
}

@vertex
fn vs_main(@location(0) corner: vec2f, @location(1) disc: vec4f, @location(2) color: vec3f) -> Disc {
  // disc: middle x, y and radius in field texels (y down), core
  let pos = disc.xy + corner * disc.z;
  var out: Disc;
  out.disc = disc;
  out.color = color;
  // WebGL's clip y turned over: its first row is a WebGPU target's top
  out.position = vec4f(pos.x / uField.x * 2.0 - 1.0, -(1.0 - pos.y / uField.y * 2.0), 0.0, 1.0);
  return out;
}

// a clip x or y the player's vertex shader gives, snapped to 16ths of a pixel
fn snap(clip: f32, size: f32) -> f32 {
  return round((0.5 * size * 16.0 - 8.0) + clip * (0.5 * size * 16.0));
}

fn plane(M0: vec3f, M1: vec3f, M2: vec3f, v: vec3f, xy: vec2f, rhw: f32) -> f32 {
  let A = v.x * M0.x + v.y * M1.x + v.z * M2.x;
  let B = v.x * M0.y + v.y * M1.y + v.z * M2.y;
  return (xy.x * A + (v.x + xy.y * B)) * rhw;
}

struct Varyings {
  local: vec2f,
  color: vec3f,
}

// a triangle set up from its corners in 16ths, the first the origin; each varying from its plane, over the
// interpolated w
fn varyings(c0: vec2f, c1: vec2f, c2: vec2f, lx: vec3f, ly: vec3f, color: vec3f, px: vec2f) -> Varyings {
  let x1 = 0.0625 * (c1.x - c0.x);
  let y1 = 0.0625 * (c1.y - c0.y);
  let x2 = 0.0625 * (c2.x - c0.x);
  let y2 = 0.0625 * (c2.y - c0.y);
  let A = 1.0 / (x1 * y2 - x2 * y1);
  let M0 = vec3f((y1 - y2) * A, (x2 - x1) * A, 1.0);
  let M1 = vec3f(y2 * A, -x2 * A, 0.0);
  let M2 = vec3f(-y1 * A, x1 * A, 0.0);
  let xy = px - c0 * 0.0625;
  let w = xy.x * (M0.x + M1.x + M2.x) + (1.0 + xy.y * (M0.y + M1.y + M2.y));
  let rhw = 1.0 / w;
  var v: Varyings;
  v.local = vec2f(plane(M0, M1, M2, lx, xy, rhw), plane(M0, M1, M2, ly, xy, rhw));
  // the color's three corners as three numbers (uField.w is 1), so no compiler factors the color out of the sums
  let k1 = color * uField.w;
  let k2 = k1 * uField.w;
  v.color = vec3f(plane(M0, M1, M2, vec3f(color.r, k1.r, k2.r), xy, rhw), plane(M0, M1, M2, vec3f(color.g, k1.g, k2.g), xy, rhw),
    plane(M0, M1, M2, vec3f(color.b, k1.b, k2.b), xy, rhw));
  return v;
}

@fragment
fn fs_main(in: Disc) -> @location(0) vec4f {
  let size = uField.x;
  let d = in.disc;
  // the quad's corners: v0 (-1, -1) and v1 (1, -1) at yA, v2 (-1, 1) and v3 (1, 1) at yB, left at xL, right at xR
  let xL = snap((d.x - d.z) / size * 2.0 - 1.0, size);
  let xR = snap((d.x + d.z) / size * 2.0 - 1.0, size);
  let yA = snap(1.0 - (d.y - d.z) / size * 2.0, size);
  let yB = snap(1.0 - (d.y + d.z) / size * 2.0, size);
  let px = floor(in.position.xy);
  let h = i32(yA - yB);
  var v: Varyings;
  if (16 * i32(px.x) * h < i32(xL) * h + i32(xR - xL) * (16 * i32(px.y) - i32(yB))) {
    v = varyings(vec2f(xL, yB), vec2f(xL, yA), vec2f(xR, yA), vec3f(-1.0, -1.0, 1.0), vec3f(1.0, -1.0, -1.0), in.color, px);
  } else {
    v = varyings(vec2f(xL, yB), vec2f(xR, yA), vec2f(xR, yB), vec3f(-1.0, 1.0, 1.0), vec3f(1.0, -1.0, 1.0), in.color, px);
  }
  let r = length(v.local);
  if (r >= 1.0) {
    discard;
  }
  let a = select((1.0 - r) / (1.0 - d.w), 1.0, r <= d.w);
  return vec4f(v.color * a, a);
}
`;

const FULL = `@vertex
fn vs_main(@location(0) corner: vec2f) -> @builtin(position) vec4f {
  return vec4f(corner, 0.0, 1.0);
}`;

/** One pass of the field's blur along \`step\`: the middle and five bilinear pairs either side. */
export const GLASS_BLUR_WGSL = `struct Blur {
  step: vec2f,
  taps: array<vec4f, 6>,   // offset in texels and weight, xy
}
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var bilinear: sampler;
@group(0) @binding(2) var<uniform> blur: Blur;

${FULL}

@fragment
fn fs_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let uv = frag.xy / vec2f(textureDimensions(src, 0));
  var c = textureSample(src, bilinear, uv).rgb * blur.taps[0].y;
  for (var i = 1; i < 6; i++) {
    let off = blur.step * blur.taps[i].x;
    c += (textureSample(src, bilinear, uv + off).rgb + textureSample(src, bilinear, uv - off).rgb) * blur.taps[i].y;
  }
  return vec4f(c, 1.0);
}
`;

/** The glass: the rib map at the pixel, the blurred field read where its displacement points, and the ribs' light. */
export const GLASS_FINAL_WGSL = `struct Glass {
  origin: vec2f,   // the filter's region's corner in the design's pixels
  offset: vec2f,   // the canvas's corner in the design's pixels
  inv: vec2f,      // 1 / (q * fw), 1 / (q * fh)
  h: f32,          // the canvas's height
  scale: f32,      // the displacement's scale
}
@group(0) @binding(0) var map: texture_2d<f32>;
@group(0) @binding(1) var fieldT: texture_2d<f32>;
@group(0) @binding(2) var bilinear: sampler;
@group(0) @binding(3) var<uniform> glass: Glass;

${FULL}

@fragment
fn fs_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let p = vec2i(frag.xy);
  let m = textureLoad(map, p, 0).rgb;
  let s = vec2f(p) + glass.offset + floor(glass.scale * (m.rg - 0.5) + 0.5);
  let f = (s + 0.5 - glass.origin) * glass.inv;
  let c = textureSample(fieldT, bilinear, vec2f(f.x, 1.0 - f.y)).rgb;
  return vec4f(min(vec3f(1.0), floor(c * 255.0 + 0.5) / 255.0 * (2.0 * m.b)), 1.0);
}
`;

/** The rib map, each pixel as the player's bake computes it, rounded to 8 bits where it is. */
export const GLASS_BAKE_WGSL = `struct Bake {
  origin: vec2f,                 // the canvas's corner in the design's pixels
  count: i32,                    // ribs
  stops: i32,                    // stops a rib
  line: vec4f,                   // the normal's line: x1, y1, x2 - x1, y2 - y1
  normals: array<vec4f, 17>,     // the normal's stops: offset, red, green
  shade: array<vec4f, 17>,       // the ribs' light, half the factor, at 16ths of the lens gray, x
}
// a row a rib: [cx, cy, r squared, 0], then each stop [offset, gray, 0, 0]
@group(0) @binding(0) var<storage, read> ribs: array<vec4f>;
@group(0) @binding(1) var<uniform> bake: Bake;

${FULL}

fn stopAt(rib: i32, k: i32) -> vec2f {
  return ribs[rib * (bake.stops + 1) + 1 + k].xy;
}

@fragment
fn fs_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  // the pixel's center in the design's pixels
  let p = frag.xy + bake.origin;
  // the smallest disc holding it, painted last, so on top: the first in the ribs' order
  var rib = -1;
  for (var k = 0; k < 256; k++) {
    if (k >= bake.count) {
      break;
    }
    let r = ribs[k * (bake.stops + 1)];
    let d = p - r.xy;
    if (dot(d, d) <= r.z) {
      rib = k;
      break;
    }
  }
  var A = 128.0;
  if (rib >= 0) {
    let r = ribs[rib * (bake.stops + 1)];
    let d = p - r.xy;
    let t = sqrt(dot(d, d) / r.z);
    let first = stopAt(rib, 0);
    let last = stopAt(rib, bake.stops - 1);
    if (t <= first.x) {
      A = first.y;
    } else if (t > last.x) {
      A = last.y;
    } else {
      var lo = 0;
      var hi = bake.stops - 1;
      for (var i = 0; i < 12; i++) {
        if (hi - lo <= 1) {
          break;
        }
        let mid = (lo + hi) / 2;
        if (t <= stopAt(rib, mid).x) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      let s0 = stopAt(rib, lo);
      let s1 = stopAt(rib, lo + 1);
      let f = select(1.0, (t - s0.x) / (s1.x - s0.x), s1.x > s0.x);
      A = s0.y + f * (s1.y - s0.y);
    }
    A = floor(A + 0.5);
  }
  let tn = clamp(dot(p - bake.line.xy, bake.line.zw) / dot(bake.line.zw, bake.line.zw), 0.0, 1.0);
  var n: vec2f;
  if (tn <= bake.normals[0].x) {
    n = bake.normals[0].yz;
  } else if (tn > bake.normals[16].x) {
    n = bake.normals[16].yz;
  } else {
    var k = 0;
    for (var i = 0; i < 16; i++) {
      if (tn > bake.normals[i + 1].x) {
        k = i + 1;
      }
    }
    let n0 = bake.normals[k];
    let n1 = bake.normals[k + 1];
    let f = select(1.0, (tn - n0.x) / (n1.x - n0.x), n1.x > n0.x);
    n = n0.yz + f * (n1.yz - n0.yz);
  }
  n = floor(n + 0.5);
  let a = A / 255.0;
  let an = n / 255.0;
  let v = clamp(2.0 * a * an - a - an + 1.0, vec2f(0.0), vec2f(1.0));
  let c = a * 16.0;
  let kk = min(15, i32(floor(c)));
  let light = bake.shade[kk].x + (c - f32(kk)) * (bake.shade[kk + 1].x - bake.shade[kk].x);
  return vec4f(floor(255.0 * v + 0.5) / 255.0, floor(255.0 * light + 0.5) / 255.0, 1.0);
}
`;
