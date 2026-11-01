/* The fluted glass's rib map baked on the GPU in one pass: engine/glass-render.ts's glassMapRows, each pixel as it
   computes it (the smallest rib disc holding the pixel, its lens gray from that rib's stops, the normal's two
   channels, the arithmetic composite and the ribs' light, each rounded to 8 bits where it is), so the player's
   frames match the SVG's still as the CPU's map did. The CPU baked a slice a frame, a tenth to half a second for a new
   angle, shape or size; this bakes it in the frame it is asked for. The ribs and their stops go in a float texture,
   a row each; the normal's stops and the light's table in uniforms. */
import type { GlassGeometry } from "@grabient/engine/glass.ts";
import { GLASS_BAKE_FS, GLASS_FULL_VS } from "@grabient/engine/glass-gl.ts";
import type { GlassWindow } from "@grabient/engine/glass-render.ts";
import { buildPrograms } from "./gl-build.ts";

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
  const programs = buildPrograms(gl, [[GLASS_FULL_VS, GLASS_BAKE_FS]]);
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
