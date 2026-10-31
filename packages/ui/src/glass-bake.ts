/* The fluted glass's rib map baked on the GPU in one pass: engine/glass-render.ts's glassMapRows, each pixel as it
   computes it (the smallest rib disc holding the pixel, its lens gray from that rib's stops, the normal's two
   channels, the arithmetic composite and the ribs' light, each rounded to 8 bits where it is), so the player's
   frames match the SVG's still as the CPU's map did. The CPU baked a slice a frame, a tenth to half a second for a new
   angle, shape or size; this bakes it in the frame it is asked for. The ribs and their stops go in a float texture,
   a row each; the normal's stops and the light's table in uniforms. */
import type { GlassGeometry } from "@grabient/engine/glass.ts";
import type { GlassWindow } from "@grabient/engine/glass-render.ts";
import { buildPrograms } from "./gl-build.ts";

const VS = `#version 300 es
layout(location=0) in vec2 corner;
void main() { gl_Position = vec4(corner, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uRibs;   // a row a rib: [cx, cy, r², 0], then each stop [offset, gray, 0, 0]
uniform int uCount;              // ribs
uniform int uStops;              // stops a rib
uniform vec2 uOrigin;            // the window's corner in the geometry's pixels
uniform vec4 uLine;              // the normal's line: x1, y1, x2 − x1, y2 − y1
uniform vec3 uNormals[17];       // the normal's stops: offset, red, green
uniform float uShade[17];        // the ribs' light, half the factor, at 16ths of the lens gray
out vec4 o;
vec2 stopAt(int rib, int k) { return texelFetch(uRibs, ivec2(1 + k, rib), 0).xy; }
void main() {
  /* the pixel's center in the geometry's pixels: a texel row is the CPU's row */
  vec2 p = gl_FragCoord.xy + uOrigin;
  /* the smallest disc holding it, painted last, so on top: the first in the ribs' order */
  int rib = -1;
  for (int k = 0; k < 256; k++) {
    if (k >= uCount) break;
    vec4 r = texelFetch(uRibs, ivec2(0, k), 0);
    vec2 d = p - r.xy;
    if (dot(d, d) <= r.z) { rib = k; break; }
  }
  float A = 128.0;
  if (rib >= 0) {
    vec4 r = texelFetch(uRibs, ivec2(0, rib), 0);
    vec2 d = p - r.xy;
    float t = sqrt(dot(d, d) / r.z);
    vec2 first = stopAt(rib, 0);
    vec2 last = stopAt(rib, uStops - 1);
    if (t <= first.x) A = first.y;
    else if (t > last.x) A = last.y;
    else {
      int lo = 0;
      int hi = uStops - 1;
      for (int i = 0; i < 12; i++) {
        if (hi - lo <= 1) break;
        int mid = (lo + hi) / 2;
        if (t <= stopAt(rib, mid).x) hi = mid; else lo = mid;
      }
      vec2 s0 = stopAt(rib, lo);
      vec2 s1 = stopAt(rib, lo + 1);
      float f = s1.x > s0.x ? (t - s0.x) / (s1.x - s0.x) : 1.0;
      A = s0.y + f * (s1.y - s0.y);
    }
    A = floor(A + 0.5);
  }
  float tn = clamp(dot(p - uLine.xy, uLine.zw) / dot(uLine.zw, uLine.zw), 0.0, 1.0);
  vec2 n;
  if (tn <= uNormals[0].x) n = uNormals[0].yz;
  else if (tn > uNormals[16].x) n = uNormals[16].yz;
  else {
    int k = 0;
    for (int i = 0; i < 16; i++) { if (tn > uNormals[i + 1].x) k = i + 1; }
    vec3 n0 = uNormals[k];
    vec3 n1 = uNormals[k + 1];
    float f = n1.x > n0.x ? (tn - n0.x) / (n1.x - n0.x) : 1.0;
    n = n0.yz + f * (n1.yz - n0.yz);
  }
  n = floor(n + 0.5);
  float a = A / 255.0;
  vec2 an = n / 255.0;
  vec2 v = clamp(2.0 * a * an - a - an + 1.0, 0.0, 1.0);
  float c = a * 16.0;
  int kk = min(15, int(floor(c)));
  float light = uShade[kk] + (c - float(kk)) * (uShade[kk + 1] - uShade[kk]);
  o = vec4(floor(255.0 * v + 0.5) / 255.0, floor(255.0 * light + 0.5) / 255.0, 1.0);
}`;

export interface GlassBake {
  /** its program: true once built, false while the GPU is still at it, null where it failed (gl-build.ts) */
  built(): boolean | null;
  /** the rib map of `geometry`'s `window` into `target`, an RGBA8 texture the window's size, once built */
  bake(geometry: GlassGeometry, window: GlassWindow, target: WebGLTexture): void;
  destroy(): void;
}

/** The baker for a context, its program built as the GPU gets to it. `quad` is a buffer of the two triangles over the
    whole target, as the player's own passes draw. */
export function glassBake(gl: WebGL2RenderingContext, quad: WebGLBuffer): GlassBake {
  const programs = buildPrograms(gl, [[VS, FS]]);
  const program = programs.list[0] as WebGLProgram;
  const at = (name: string) => gl.getUniformLocation(program, name);
  /* read once the program is built: reading them before waits for it */
  let U: Record<
    "ribs" | "count" | "stops" | "origin" | "line" | "normals" | "shade",
    WebGLUniformLocation | null
  > | null = null;
  const ribs = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, ribs);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
    gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
  const frame = gl.createFramebuffer();
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const normals = new Float32Array(17 * 3);
  const shade = new Float32Array(17);
  return {
    built: () => programs.built(),
    bake(geometry, window, target) {
      U ??= {
        ribs: at("uRibs"),
        count: at("uCount"),
        stops: at("uStops"),
        origin: at("uOrigin"),
        line: at("uLine"),
        normals: at("uNormals"),
        shade: at("uShade")
      };
      const list = geometry.ribs;
      const stops = list[0]?.stops.length ?? 0;
      const width = 1 + stops;
      const data = new Float32Array(width * list.length * 4);
      list.forEach((r, i) => {
        const row = i * width * 4;
        data[row] = r.cx;
        data[row + 1] = r.cy;
        data[row + 2] = r.r * r.r;
        r.stops.forEach(([o, v], k) => {
          data[row + 4 * (1 + k)] = o;
          data[row + 4 * (1 + k) + 1] = v;
        });
      });
      gl.bindTexture(gl.TEXTURE_2D, ribs);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        width,
        Math.max(1, list.length),
        0,
        gl.RGBA,
        gl.FLOAT,
        data
      );
      geometry.normal.stops.forEach(([o, r, g], k) => {
        normals[3 * k] = o;
        normals[3 * k + 1] = r;
        normals[3 * k + 2] = g;
      });
      geometry.shadeTable.forEach((v, k) => {
        shade[k] = v;
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
      gl.viewport(0, 0, window.w, window.h);
      gl.disable(gl.BLEND);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ribs);
      gl.uniform1i(U.ribs, 0);
      gl.uniform1i(U.count, list.length);
      gl.uniform1i(U.stops, stops);
      gl.uniform2f(U.origin, window.x, window.y);
      const n = geometry.normal;
      gl.uniform4f(U.line, n.x1, n.y1, n.x2 - n.x1, n.y2 - n.y1);
      gl.uniform3fv(U.normals, normals);
      gl.uniform1fv(U.shade, shade);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    destroy() {
      gl.deleteTexture(ribs);
      gl.deleteFramebuffer(frame);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    }
  };
}
