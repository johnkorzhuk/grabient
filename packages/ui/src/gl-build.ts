/* WebGL programs built without holding the page: every shader compiled and every program linked at once, and their
   state read only once the browser says the GPU is done with them (KHR_parallel_shader_compile), a frame at a time.
   Reading a shader's or a program's state waits for all the work the page queued for the GPU before it, which in a
   page's first second is much: a tenth of a second and more, where the compile itself takes a few milliseconds. A
   browser with no such word reads the state at the first ask, as before. */

export interface Programs {
  /** the programs, in the order of their sources: drawn with once `built()` says so */
  readonly list: readonly WebGLProgram[];
  /** true once every one is linked, false while the GPU is still at them, null where one failed or the context is
      lost */
  built(): boolean | null;
}

export function buildPrograms(
  gl: WebGL2RenderingContext,
  sources: readonly (readonly [vertex: string, fragment: string])[]
): Programs {
  const parallel = gl.getExtension("KHR_parallel_shader_compile");
  const list = sources.map(([vertex, fragment]) => {
    const program = gl.createProgram();
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment]
    ] as const) {
      /* none on a lost context: the link fails, and built() says so */
      const shader = gl.createShader(type);
      if (!shader) continue;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    return program;
  });
  let state: boolean | null | undefined;
  return {
    list,
    built() {
      if (state !== undefined) return state;
      if (gl.isContextLost()) {
        state = null;
        return state;
      }
      if (parallel && !list.every(p => gl.getProgramParameter(p, parallel.COMPLETION_STATUS_KHR)))
        return false;
      state = list.every(p => gl.getProgramParameter(p, gl.LINK_STATUS)) ? true : null;
      return state;
    }
  };
}
