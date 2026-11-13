/* The aurora's live drawing, WebGL 2, in one pass, the same arithmetic as the CPU drawing (aurora.ts auroraRange and
   auroraLight, aurora-render.ts) at every pixel: the range's edge under the pixel, the sheets of noise read along the
   fan, the light they make through the ramp, and the range in front, premultiplied, so a range that is clear or lets
   the page through shows the page under the canvas. The scene's numbers come in one float texture read texel by
   texel (auroraTable: the ramp, the path's pieces, the slots they are looked up by and the line the light rises
   from) and the noise in two textures of bytes read between their pixels by straight lines, repeating (aurora.ts
   auroraTiles), so the pass reads the numbers the CPU reads. The uniforms are plain numbers: the scene's once a
   palette, a view or a box changes (auroraSceneUniforms), the shape's fan and sheets among them (aurora.ts
   auroraDesign), and the loop's share a frame (aurora.ts auroraTime). */
import {
  AURORA_LIGHT,
  AURORA_RAMP,
  AURORA_SLOTS,
  AURORA_SOFT,
  type AuroraScene
} from "./aurora.ts";

const L = AURORA_LIGHT;
/** A number as a float's literal. */
const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

export const AURORA_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** The pass's uniforms: the box; the angle's cosine and sine and the picture's height in pixels; half the picture's
    width, how many pieces the path has and whether it has an upright wall; the range's color premultiplied by its
    cover, the cover last; the point the rays fan from and the six sheets, each how many tiles it spans across and
    along and where it starts (AURORA_SHEETS' order); the loop's share, 0 up to 1; and the table and the two noise
    tiles. */
export const AURORA_UNIFORMS = `
uniform vec2 uSize;
uniform vec3 uFrame;
uniform vec3 uPath;
uniform vec4 uRange;
uniform vec2 uFan;
uniform vec4 uSheets[6];
uniform float uTime;
uniform sampler2D uTable;
uniform sampler2D uNoise;
uniform sampler2D uSoft;`;

/** The sheets in the order the pass reads them from uSheets. */
export const AURORA_SHEETS = ["a", "b", "c", "h1", "h2", "g"] as const;
type SheetName = (typeof AURORA_SHEETS)[number];
/* a sheet's spans and start, from uSheets, and how far it slides a loop, the same for every shape */
const spans = (name: SheetName) => `uSheets[${AURORA_SHEETS.indexOf(name)}]`;
/* where a sheet is read: along the fan, or over the picture itself */
const fanned = (name: SheetName) =>
  `vec2(ang * ${spans(name)}.x + ${spans(name)}.z + ${f(L[name].du)} * uTime, r * ${spans(name)}.y + ${spans(name)}.w + ${f(L[name].dv)} * uTime)`;
const level = (name: SheetName) =>
  `vec2(p.x * ${spans(name)}.x + ${spans(name)}.z + ${f(L[name].du)} * uTime, p.y * ${spans(name)}.y + ${spans(name)}.w + ${f(L[name].dv)} * uTime)`;
const step = ([lo, hi]: readonly number[], v: string) => `smoothstep(${f(lo)}, ${f(hi)}, ${v})`;

/** A pixel's color, premultiplied, as aurora.ts's auroraRange and auroraLight work it out: px is the pixel's place
    from the top left. */
export const AURORA_SHADE = `
/* a piece's height at u along it: a its two places and two heights, b the two heights its curve bends by */
float heightAt(vec4 a, vec4 b, float u) {
  return a.z + 0.5 * u * (a.w - b.x + u * (2.0 * b.x - 5.0 * a.z + 4.0 * a.w - b.y + u * (3.0 * (a.z - a.w) + b.y - b.x)));
}
vec4 shade(vec2 px) {
  vec2 d = px + 0.5 - 0.5 * uSize;
  vec2 p = vec2((d.x * uFrame.x + d.y * uFrame.y) / uFrame.z, 0.5 - (-d.x * uFrame.y + d.y * uFrame.x) / uFrame.z);
  /* the piece of the range's path this point is over, and the path's height here */
  float s = clamp((p.x / uPath.x + 1.0) * 0.5, 0.0, 1.0);
  int i = int(texelFetch(uTable, ivec2(min(${AURORA_SLOTS - 1}, int(floor(s * ${f(AURORA_SLOTS)}))), 3), 0).x + 0.5);
  vec4 a = texelFetch(uTable, ivec2(i, 1), 0);
  if (s >= a.y && i < int(uPath.y + 0.5) - 1) {
    i++;
    a = texelFetch(uTable, ivec2(i, 1), 0);
  }
  /* b: the heights its curve bends by, and the heights the pieces beside it end and start at */
  vec4 b = texelFetch(uTable, ivec2(i, 2), 0);
  float wide = a.y - a.x;
  float edge = heightAt(a, b, (s - a.x) / wide);
  /* how much of the light shows: soft across the edge, and as soft across an upright wall */
  float show = smoothstep(${f(-AURORA_SOFT)}, ${f(AURORA_SOFT)}, p.y - edge);
  float softS = min(${f(AURORA_SOFT)} / (2.0 * uPath.x), 0.5 * wide);
  float dl = s - a.x;
  float dr = a.y - s;
  if (b.z != a.z && dl < softS) {
    float t = smoothstep(-1.0, 1.0, dl / softS);
    show = smoothstep(${f(-AURORA_SOFT)}, ${f(AURORA_SOFT)}, p.y - b.z) * (1.0 - t) + show * t;
  }
  if (b.w != a.w && dr < softS) {
    float t = smoothstep(-1.0, 1.0, -dr / softS);
    show = show * (1.0 - t) + smoothstep(${f(-AURORA_SOFT)}, ${f(AURORA_SOFT)}, p.y - b.w) * t;
  }
  /* the line the light rises from: the path, or where it has an upright wall the path eased toward its walls' feet */
  float base = edge;
  if (uPath.z > 0.5) {
    float q = s * ${f(AURORA_SLOTS - 1)};
    int k = min(${AURORA_SLOTS - 2}, int(floor(q)));
    base = mix(texelFetch(uTable, ivec2(k, 4), 0).x, texelFetch(uTable, ivec2(k + 1, 4), 0).x, q - float(k));
  }
  float h = p.y - base;
  /* along the fan: the angle from straight up, and the way out along the ray */
  vec2 e = p - uFan;
  float ang = atan(e.x, e.y);
  float r = length(e);
  float shaft = ${step(L.shaft, `texture(uNoise, ${fanned("a")}).r`)} * (0.4 + 0.6 * ${step(L.shaft, `texture(uNoise, ${fanned("b")}).g`)});
  float halo = ${step(L.halo, `texture(uSoft, ${fanned("a")}).r`)} * (0.4 + 0.6 * ${step(L.halo, `texture(uSoft, ${fanned("b")}).g`)});
  float fine = ${step(L.fine, `texture(uNoise, ${fanned("c")}).b`)};
  float hot = ${step(L.hot, `texture(uNoise, ${level("h1")}).a`)} * ${step([L.hot[0] - 0.15, L.hot[1]], `texture(uNoise, ${level("h2")}).r`)};
  float gather = 0.7 + 0.3 * ${step(L.gather, `texture(uSoft, vec2(ang * ${spans("g")}.x + ${spans("g")}.z + ${f(L.g.du)} * uTime, ${spans("g")}.w + ${f(L.g.dv)} * uTime)).b`)};
  /* how the light stands by height over the range: up in a short rise, then thinning away */
  float up = max(h, 0.0);
  float lift = smoothstep(-0.02, ${f(L.rise)}, h) * exp(-max(h - ${f(L.rise)}, 0.0) / ${f(L.fall)});
  float light = ${f(L.haze)} * exp(-up / ${f(L.hazeFall)}) + lift * gather * (${f(L.halos)} * halo + ${f(L.shafts)} * shaft * (0.7 + 0.3 * fine) + ${f(L.fines)} * fine * halo + ${f(L.hots)} * hot * (0.4 + 0.6 * halo) * exp(-up / ${f(L.hotFall)}));
  /* through the ramp */
  float v = min(light, 0.9999) * ${f(AURORA_RAMP - 1)};
  int j = int(floor(v));
  vec3 color = mix(texelFetch(uTable, ivec2(j, 0), 0).rgb, texelFetch(uTable, ivec2(j + 1, 0), 0).rgb, v - float(j));
  /* the range in front, its edge soft */
  float cov = 1.0 - show;
  return vec4(color * (1.0 - cov) + uRange.rgb * cov, 1.0 - cov + uRange.a * cov);
}`;

/** The pass: each pixel's color, premultiplied, its place from the top left. */
export const AURORA_FS = `#version 300 es
precision highp float;
precision highp int;${AURORA_UNIFORMS}
out vec4 o;
${AURORA_SHADE}
void main() {
  vec2 px = vec2(gl_FragCoord.x - 0.5, uSize.y - gl_FragCoord.y - 0.5);
  o = shade(px);
}`;

/** The table's width and height in texels, four floats each (RGBA32F), read with texelFetch. */
export const AURORA_TABLE = { width: AURORA_SLOTS, height: 5 } as const;

/** The scene's numbers as the pass reads them, a row each: the ramp (a color a texel), the path's pieces (their two
    places and two heights, then the heights they bend by and the ones beside them), the slots the pieces are looked
    up by, and the line the light rises from. */
export function auroraTable(m: AuroraScene): Float32Array {
  const W = AURORA_TABLE.width;
  const data = new Float32Array(W * AURORA_TABLE.height * 4);
  for (let i = 0; i < AURORA_RAMP; i++)
    data.set([m.ramp[i * 3], m.ramp[i * 3 + 1], m.ramp[i * 3 + 2], 1], i * 4);
  data.set(m.segA, W * 4);
  data.set(m.segB, W * 8);
  for (let i = 0; i < AURORA_SLOTS; i++) {
    data[(W * 3 + i) * 4] = m.slots[i];
    data[(W * 4 + i) * 4] = m.rise[i];
  }
  return data;
}

/** What the pass takes for a scene, set once a palette, a view or a box changes: the frame (the angle's cosine and
    sine, the picture's height in pixels), the path (half the picture's width, how many pieces, 1 where it has an
    upright wall), the range's color premultiplied by its cover, the cover last, the point the rays fan from, and the
    sheets (each how many tiles it spans across and along, then where it starts across and along). */
export interface AuroraSceneUniforms {
  frame: Float32Array;
  path: Float32Array;
  range: Float32Array;
  fan: Float32Array;
  sheets: Float32Array;
}

export function auroraSceneUniforms(m: AuroraScene): AuroraSceneUniforms {
  const D = m.design;
  return {
    frame: Float32Array.of(m.cs, m.sn, m.ext),
    path: Float32Array.of(m.half, m.segs, m.walls ? 1 : 0),
    range: Float32Array.of(...m.range.map(v => v * m.cover), m.cover),
    fan: Float32Array.of(D.fan.x, D.fan.y),
    sheets: Float32Array.from(
      AURORA_SHEETS.flatMap(name => [D[name].across, D[name].along, D[name].u0, D[name].v0])
    )
  };
}
