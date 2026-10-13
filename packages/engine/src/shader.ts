/* The palette as a fragment shader for Shadertoy, GLSL ES 3.00 and WGSL. The shader evaluates the editable OKLCH
   keyframes itself: the engine's Catmull-Rom curve, its 24-step chroma fit to sRGB, and the style's CSS geometry, so
   editing ANCHORS, STEPS or ANGLE still draws the edited palette. A palette with a near gray that keeps its own tint
   adds the tints as a curve of their own in OKLab, as the engine's sampleLCH does. The OKLab matrices are Björn
   Ottosson's (see NOTICE). */
import { DEG } from "./math.ts";
import type { Palette } from "./palette.ts";
import { isSwatchStyle, type View, viewSearch } from "./view.ts";

export type ShaderKind = "shadertoy" | "glsl" | "wgsl";
export const SHADER_KINDS: readonly (readonly [ShaderKind, string])[] = [
  ["shadertoy", "Shadertoy"],
  ["glsl", "GLSL"],
  ["wgsl", "WGSL"]
];

/** A number as shader source: 7 decimals, trailing zeros trimmed, always a float literal. */
const num = (n: number) => {
  const s = n.toFixed(7).replace(/0+$/, "");
  if (s === "-0.") return "0.0";
  return s.endsWith(".") ? `${s}0` : s;
};
/** For each keyframe, its near gray's tint as an offset in OKLab, or null for a palette with none. */
const tintsOf = (P: Palette): [number, number][] | null =>
  P.anchors.some(a => a.own !== undefined)
    ? P.anchors.map(a =>
        a.own === undefined
          ? [0, 0]
          : [
              a.c * (Math.cos(a.own * DEG) - Math.cos(a.h * DEG)),
              a.c * (Math.sin(a.own * DEG) - Math.sin(a.h * DEG))
            ]
      )
    : null;
const TINT_NOTE =
  "// The faint tint each near-gray keyframe keeps beside the hue it carries, as an offset in OKLab.";

type ShaderView = Pick<View, "style" | "angle">;
/* The credit every dialect carries, so a shader found later says where it came from. */
function header(seed: string, view: ShaderView, steps: number, origin?: string) {
  const lines = [`// grabient ${seed}`];
  if (origin) lines.push(`// ${origin}/${seed}${viewSearch({ ...view, steps })}`);
  lines.push(`// ${steps} ${isSwatchStyle(view.style) ? "hard bands" : "stops along the curve"}`);
  return lines.join("\n");
}
const gradTComment = (view: ShaderView) =>
  view.style.startsWith("radial")
    ? "// radial-gradient(circle at 50% 50%): the default reach is the farthest corner"
    : view.style.startsWith("angular")
      ? `// conic-gradient(from ${view.angle}deg): starts at up, turns clockwise`
      : `// linear-gradient(${view.angle}deg): measured from up, clockwise`;
const STOPS_COMMENT = {
  bands: "// Sample the curve into equal-width bands.",
  blend: "// Sample the curve at STEPS positions and blend in sRGB."
};

/* Each dialect is one template; `vec`, `fn` and the like are its spellings. */
function glslBody(P: Palette, view: ShaderView, steps: number): string {
  const tints = tintsOf(P);
  const rows = P.anchors.map(a => `  vec3(${num(a.l)}, ${num(a.c)}, ${num(a.h)})`).join(",\n");
  const tintRows = tints?.map(([a, b]) => `  vec2(${num(a)}, ${num(b)})`).join(",\n");
  const tintDecl = tints ? `\n${TINT_NOTE}\nconst vec2 TINT[] = vec2[](\n${tintRows}\n);` : "";
  const tintFn = tints
    ? `// The same curve through the tints.
vec2 tint(float t) {
  float x = clamp(t, 0.0, 1.0) * float(K - 1);
  int i = min(K - 2, int(floor(x)));
  float u = x - float(i);
  vec2 p0 = TINT[max(0, i - 1)], p1 = TINT[i];
  vec2 p2 = TINT[i + 1], p3 = TINT[min(K - 1, i + 2)];
  return p1 + 0.5 * u * (p2 - p0 + u * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3
       + u * (3.0 * (p1 - p2) + p3 - p0)));
}

`
    : "";
  const start = tints
    ? "  vec2 ab = lch.y * vec2(cos(h), sin(h)) + tint(t);\n  vec3 rgb = oklabToLinear(vec3(lch.x, ab));"
    : "  vec2 dir = vec2(cos(h), sin(h));\n  vec3 rgb = oklabToLinear(vec3(lch.x, lch.y * dir));";
  const scaled = (k: string) => (tints ? `ab * ${k}` : `(lch.y * ${k}) * dir`);
  const stopsFn = isSwatchStyle(view.style)
    ? `${STOPS_COMMENT.bands}
vec3 stops(float t) {
  float i = clamp(floor(clamp(t, 0.0, 1.0) * STEPS), 0.0, STEPS - 1.0);
  return palette(i / (STEPS - 1.0));
}`
    : `${STOPS_COMMENT.blend}
vec3 stops(float t) {
  float n = STEPS - 1.0;
  float x = clamp(t, 0.0, 1.0) * n;
  return mix(palette(floor(x) / n), palette(min(floor(x) + 1.0, n) / n), fract(x));
}`;
  const gradT = view.style.startsWith("radial")
    ? "  return length(q) / length(R * 0.5);"
    : view.style.startsWith("angular")
      ? "  return fract((atan(q.x, q.y) - radians(ANGLE)) / 6.2831853);"
      : "  vec2 dir = vec2(sin(radians(ANGLE)), cos(radians(ANGLE)));\n  float len = abs(R.x * dir.x) + abs(R.y * dir.y);\n  return dot(q, dir) / len + 0.5;";
  return `const float ANGLE = ${num(view.angle)};
const float STEPS = ${steps}.0;

// Editable OKLCH keyframes; hue is in degrees and may span multiple turns.
const vec3 ANCHORS[] = vec3[](
${rows}
);
const int K = ANCHORS.length();${tintDecl}

// Catmull-Rom in OKLCH. Clamp overshoot in lightness and chroma, keep hue unwrapped.
vec3 curve(float t) {
  float x = clamp(t, 0.0, 1.0) * float(K - 1);
  int i = min(K - 2, int(floor(x)));
  float u = x - float(i);
  vec3 p0 = ANCHORS[max(0, i - 1)], p1 = ANCHORS[i];
  vec3 p2 = ANCHORS[i + 1], p3 = ANCHORS[min(K - 1, i + 2)];
  vec3 lch = p1 + 0.5 * u * (p2 - p0 + u * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3
           + u * (3.0 * (p1 - p2) + p3 - p0)));
  return vec3(clamp(lch.x, 0.0, 1.0), max(lch.y, 0.0), lch.z);
}

${tintFn}vec3 oklabToLinear(vec3 lab) {
  vec3 lms = mat3(1.0, 1.0, 1.0,
                  0.3963377774, -0.1055613458, -0.0894841775,
                  0.2158037573, -0.0638541728, -1.2914855480) * lab;
  return mat3(4.0767416621, -1.2684380046, -0.0041960863,
             -3.3077115913, 2.6097574011, -0.7034186147,
              0.2309699292, -0.3413193965, 1.7076147010) * (lms * lms * lms);
}

bool inGamut(vec3 c) {
  return all(greaterThanEqual(c, vec3(-1e-4))) && all(lessThanEqual(c, vec3(1.0001)));
}

// Continuous sRGB color at t in [0, 1]. Reduce chroma to fit, preserving lightness and hue.
vec3 palette(float t) {
  vec3 lch = curve(t);
  float h = radians(lch.z);
${start}
  if (!inGamut(rgb)) {
    float lo = 0.0, hi = 1.0;
    for (int i = 0; i < 24; i++) {
      float mid = 0.5 * (lo + hi);
      if (inGamut(oklabToLinear(vec3(lch.x, ${scaled("mid")})))) lo = mid;
      else hi = mid;
    }
    rgb = oklabToLinear(vec3(lch.x, ${scaled("lo")}));
  }
  rgb = clamp(rgb, 0.0, 1.0);
  return mix(12.92 * rgb, 1.055 * pow(rgb, vec3(1.0 / 2.4)) - 0.055,
             step(vec3(0.0031308), rgb));
}

${stopsFn}

${gradTComment(view)}
float gradT(vec2 q, vec2 R) {
${gradT}
}`;
}

function wgslText(P: Palette, view: ShaderView, steps: number, head: string): string {
  const tints = tintsOf(P);
  const rows = P.anchors.map(a => `  vec3f(${num(a.l)}, ${num(a.c)}, ${num(a.h)})`).join(",\n");
  const tintDecl = tints
    ? `${TINT_NOTE}\nconst TINT = array<vec2f, K>(\n${tints.map(([a, b]) => `  vec2f(${num(a)}, ${num(b)})`).join(",\n")}\n);\n\n`
    : "";
  const tintFn = tints
    ? `// The same curve through the tints.
fn tint(t: f32) -> vec2f {
  let x = clamp(t, 0.0, 1.0) * f32(K - 1);
  let i = min(K - 2, i32(floor(x)));
  let u = x - f32(i);
  let p0 = TINT[max(0, i - 1)];
  let p1 = TINT[i];
  let p2 = TINT[i + 1];
  let p3 = TINT[min(K - 1, i + 2)];
  return p1 + 0.5 * u * (p2 - p0 + u * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3
         + u * (3.0 * (p1 - p2) + p3 - p0)));
}

`
    : "";
  const start = tints
    ? "  let ab = lch.y * vec2f(cos(h), sin(h)) + tint(t);\n  var rgb = oklabToLinear(vec3f(lch.x, ab));"
    : "  let dir = vec2f(cos(h), sin(h));\n  var rgb = oklabToLinear(vec3f(lch.x, lch.y * dir));";
  const scaled = (k: string) => (tints ? `ab * ${k}` : `(lch.y * ${k}) * dir`);
  const stopsFn = isSwatchStyle(view.style)
    ? `${STOPS_COMMENT.bands}
fn stops(t: f32) -> vec3f {
  let i = clamp(floor(clamp(t, 0.0, 1.0) * STEPS), 0.0, STEPS - 1.0);
  return palette(i / (STEPS - 1.0));
}`
    : `${STOPS_COMMENT.blend}
fn stops(t: f32) -> vec3f {
  let n = STEPS - 1.0;
  let x = clamp(t, 0.0, 1.0) * n;
  return mix(palette(floor(x) / n), palette(min(floor(x) + 1.0, n) / n), fract(x));
}`;
  const gradT = view.style.startsWith("radial")
    ? "  return length(q) / length(R * 0.5);"
    : view.style.startsWith("angular")
      ? "  return fract((atan2(q.x, q.y) - radians(ANGLE)) / 6.2831853);"
      : "  let dir = vec2f(sin(radians(ANGLE)), cos(radians(ANGLE)));\n  let len = abs(R.x * dir.x) + abs(R.y * dir.y);\n  return dot(q, dir) / len + 0.5;";
  return `${head}

@group(0) @binding(0) var<uniform> uResolution: vec2f;

const ANGLE: f32 = ${num(view.angle)};
const STEPS: f32 = ${steps}.0;

// Editable OKLCH keyframes; hue is in degrees and may span multiple turns.
const K: i32 = ${P.anchors.length};
const ANCHORS = array<vec3f, K>(
${rows}
);

${tintDecl}// Catmull-Rom in OKLCH. Clamp overshoot in lightness and chroma, keep hue unwrapped.
fn curve(t: f32) -> vec3f {
  let x = clamp(t, 0.0, 1.0) * f32(K - 1);
  let i = min(K - 2, i32(floor(x)));
  let u = x - f32(i);
  let p0 = ANCHORS[max(0, i - 1)];
  let p1 = ANCHORS[i];
  let p2 = ANCHORS[i + 1];
  let p3 = ANCHORS[min(K - 1, i + 2)];
  let lch = p1 + 0.5 * u * (p2 - p0 + u * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3
            + u * (3.0 * (p1 - p2) + p3 - p0)));
  return vec3f(clamp(lch.x, 0.0, 1.0), max(lch.y, 0.0), lch.z);
}

${tintFn}fn oklabToLinear(lab: vec3f) -> vec3f {
  let lms = mat3x3f(vec3f(1.0, 1.0, 1.0),
                   vec3f(0.3963377774, -0.1055613458, -0.0894841775),
                   vec3f(0.2158037573, -0.0638541728, -1.2914855480)) * lab;
  return mat3x3f(vec3f(4.0767416621, -1.2684380046, -0.0041960863),
                 vec3f(-3.3077115913, 2.6097574011, -0.7034186147),
                 vec3f(0.2309699292, -0.3413193965, 1.7076147010)) * (lms * lms * lms);
}

fn inGamut(c: vec3f) -> bool {
  return all(c >= vec3f(-1e-4)) && all(c <= vec3f(1.0001));
}

// Continuous sRGB color at t in [0, 1]. Reduce chroma to fit, preserving lightness and hue.
fn palette(t: f32) -> vec3f {
  let lch = curve(t);
  let h = radians(lch.z);
${start}
  if (!inGamut(rgb)) {
    var lo = 0.0;
    var hi = 1.0;
    for (var i = 0; i < 24; i++) {
      let mid = 0.5 * (lo + hi);
      if (inGamut(oklabToLinear(vec3f(lch.x, ${scaled("mid")})))) { lo = mid; }
      else { hi = mid; }
    }
    rgb = oklabToLinear(vec3f(lch.x, ${scaled("lo")}));
  }
  rgb = clamp(rgb, vec3f(0.0), vec3f(1.0));
  return mix(12.92 * rgb, 1.055 * pow(rgb, vec3f(1.0 / 2.4)) - vec3f(0.055),
             step(vec3f(0.0031308), rgb));
}

${stopsFn}

${gradTComment(view)}
fn gradT(q: vec2f, R: vec2f) -> f32 {
${gradT}
}

@fragment
fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  // Convert WebGPU's top-left origin to the y-up coordinates used by gradT.
  let q = vec2f(pos.x, uResolution.y - pos.y) - uResolution * 0.5;
  return vec4f(stops(gradT(q, uResolution)), 1.0);
}
`;
}

/** The palette's shader in a dialect, `steps` stops in the view's style. `origin` adds the palette's address to the
    credit. */
export function shaderText(
  kind: ShaderKind,
  P: Palette,
  view: ShaderView,
  steps: number,
  seed: string,
  origin?: string
): string {
  const head = header(seed, view, steps, origin);
  if (kind === "wgsl") return wgslText(P, view, steps, head);
  const body = glslBody(P, view, steps);
  if (kind === "glsl") {
    return `#version 300 es\nprecision highp float;\n\n${head}\n\nuniform vec2 uResolution;\nout vec4 fragColor;\n\n${body}\n\nvoid main() {\n  vec2 q = gl_FragCoord.xy - 0.5 * uResolution;\n  fragColor = vec4(stops(gradT(q, uResolution)), 1.0);\n}\n`;
  }
  return `${head}\n\n${body}\n\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  vec2 q = fragCoord - 0.5 * iResolution.xy;\n  fragColor = vec4(stops(gradT(q, iResolution.xy)), 1.0);\n}\n`;
}
