/* The rosette's pass in WGSL, for its WebGPU page (rosette-webgpu.ts): the player's GLSL (rosette-gl.ts) line for
   line. WebGPU's framebuffer rows run down from the top, as the pixel's place does in the player (it turns
   gl_FragCoord's y over), so the fragment's position is that place. Uniforms are the
   pass's struct at group 0, binding 0: the rings' keys four to a vector and each stop's color a vector of its own, as
   a uniform array's elements are 16 bytes apart. */
import { HEART_STOPS } from "./rosette.ts";
import { ROSETTE_MAX_KEYS } from "./rosette-gl.ts";

const STOPS = 4;
/* a number as the player's GLSL writes it (rosette-gl.ts), so both read the same float */
const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/** The vertex stage: one triangle over the target from the vertex's index, as the player's. */
const COVER_VS = `@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** The uniforms' bytes: where each lies in the struct, as the page writes them. */
export const ROSETTE_UNIFORMS = {
  size: 288 + 16 * ROSETTE_MAX_KEYS * STOPS,
  keys: 144,
  stops: 288
} as const;

/** The rosette's pass, the player's fragment shader in WGSL. */
export const ROSETTE_WGSL = `struct Rosette {
  uBox: vec2f,                      // the canvas, px
  uS: f32,                          // its half-diagonal, px
  uK: f32,                          // log radius a petal grows by
  uAlpha: f32,                      // turn a petal (radians, y down), signed by the hand
  uTurn0: f32,                      // the flower's turn at the loop's start
  uGroup: vec2f,                    // the loop's zoom (log) and turn now
  uEk: f32,                         // e^(-k): the radius ratio's step from one petal to the next out
  uAngMax: f32,                     // the most a petal reaches round from its anchor's direction
  uRange: vec2i,                    // the petals drawn, innermost and outermost index
  uLens: vec4f,                     // x0, x1, half-width w, the arcs' radius rho
  uLensMid: vec2f,                  // the lens's middle xm and its arcs' centres' offset d
  uHeartR: vec2f,                   // the glow's opaque middle and its end, shares of S
  uGrad: vec4f,                     // the gradient's middle (cu, cv) and radii (ru, rv) in the lens's box
  uStopAt: vec4f,                   // the stops' offsets
  uGround: vec3f,
  uFlow: i32,
  uHeart: vec3f,
  uPhase: i32,
  uKeyOfSlot: array<vec4i, ${Math.ceil(ROSETTE_MAX_KEYS / 4)}>,     // each slot's key, four to a vector
  uStop: array<vec4f, ${ROSETTE_MAX_KEYS * STOPS}>,    // each key's ${STOPS} stops' colors
}
@group(0) @binding(0) var<uniform> uni: Rosette;
${COVER_VS}

const TAU = 6.28318530718;

fn stopColor(key: i32, g: f32) -> vec3f {
  let b = key * ${STOPS};
  if (g <= uni.uStopAt.x) { return uni.uStop[b].xyz; }
  if (g <= uni.uStopAt.y) { return mix(uni.uStop[b].xyz, uni.uStop[b + 1].xyz, (g - uni.uStopAt.x) / (uni.uStopAt.y - uni.uStopAt.x)); }
  if (g <= uni.uStopAt.z) { return mix(uni.uStop[b + 1].xyz, uni.uStop[b + 2].xyz, (g - uni.uStopAt.y) / (uni.uStopAt.z - uni.uStopAt.y)); }
  if (g <= uni.uStopAt.w) { return mix(uni.uStop[b + 2].xyz, uni.uStop[b + 3].xyz, (g - uni.uStopAt.z) / (uni.uStopAt.w - uni.uStopAt.z)); }
  return uni.uStop[b + 3].xyz;
}

fn heartAlpha(x: f32) -> f32 {
  ${HEART_STOPS.slice(1)
    .map(
      ([g, a], i) =>
        `if (x <= ${f(g)}) { return mix(${f(HEART_STOPS[i][1])}, ${f(a)}, (x - ${f(HEART_STOPS[i][0])}) / ${f(g - HEART_STOPS[i][0])}); }`
    )
    .join("\n  ")}
  return ${f(HEART_STOPS[HEART_STOPS.length - 1][1])};
}

fn keyOf(s: i32) -> i32 {
  return uni.uKeyOfSlot[s / 4][s % 4];
}

@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = position.xy - 0.5 * uni.uBox;
  let rho = length(p);
  var acc = vec3f(0.0);
  var cover = 0.0;
  if (rho > 0.0) {
    let th = atan2(p.y, p.x) - uni.uGroup.y;
    let lr = log(rho / uni.uS) - uni.uGroup.x;
    let nMin = max(uni.uRange.x, i32(ceil((lr - log(uni.uLens.y)) / uni.uK)));
    let nMax = min(uni.uRange.y, i32(floor((lr - log(uni.uLens.x)) / uni.uK)));
    var d = th - (uni.uAlpha * f32(nMin) + uni.uTurn0);
    d -= TAU * floor(d / TAU + 0.5);
    var e = exp(lr - uni.uK * f32(nMin));
    var s = nMin + uni.uPhase;
    s -= uni.uFlow * i32(floor(f32(s) / f32(uni.uFlow)));
    for (var n = nMin; n <= nMax; n++) {
      if (abs(d) <= uni.uAngMax) {
        let d2 = d * d;
        let cd = 1.0 - d2 * (0.5 - d2 * (0.0416666667 - d2 * 0.0013888889));
        let sd = d * (1.0 - d2 * (0.1666666667 - d2 * (0.0083333333 - d2 * 0.0001984127)));
        let qx = e * cd;
        let qy = e * sd;
        let l = vec2f(qx - uni.uLensMid.x, abs(qy) + uni.uLensMid.y);
        let cov = clamp(0.5 - (length(l) - uni.uLens.w) * (rho / e), 0.0, 1.0);
        if (cov > 0.0) {
          let uv = vec2f((qx - uni.uLens.x) / (uni.uLens.y - uni.uLens.x), (qy + uni.uLens.z) / (2.0 * uni.uLens.z));
          let w = (1.0 - cover) * cov;
          acc += w * stopColor(keyOf(s), length((uv - uni.uGrad.xy) / uni.uGrad.zw));
          cover += w;
          if (cover > 0.99999) {
            break;
          }
        }
      }
      d -= uni.uAlpha;
      if (d < -3.14159265359) {
        d += TAU;
      } else if (d > 3.14159265359) {
        d -= TAU;
      }
      e *= uni.uEk;
      s += 1;
      if (s >= uni.uFlow) {
        s = 0;
      }
    }
  }
  var col = acc + (1.0 - cover) * uni.uGround;
  let hr = rho / uni.uS;
  if (hr < uni.uHeartR.y) {
    var a = 1.0;
    if (hr > uni.uHeartR.x) {
      a = heartAlpha((hr - uni.uHeartR.x) / (uni.uHeartR.y - uni.uHeartR.x));
    }
    col = mix(col, uni.uHeart, a);
  }
  return vec4f(col, 1.0);
}`;
