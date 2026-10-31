import { knownSoftware, softwareNamed } from "./renderer.ts";

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

/** Whether effects draw nowhere here: the renderer is software (renderer.ts: SwiftShader, llvmpipe, Windows' Basic
    Render Driver), a headless browser's, a virtual machine's, a GPU the browser blocks. An effect's every frame there
    is the page's thread's work, a tenth of a second and more on a phone's CPU, so the effects play nowhere such a
    context is all there is: their still stays, which is their first frame. The page's probe answers where it has run,
    else the context's own renderer's name. */
export function softwareContext(gl: WebGL2RenderingContext): boolean {
  const known = knownSoftware();
  if (known !== undefined) return known;
  const named = gl.getExtension("WEBGL_debug_renderer_info");
  return softwareNamed(
    String(named ? gl.getParameter(named.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
  );
}

/** Whether the page's probe has found the renderer software, so no effect makes a context at all. */
export const knownSoftwareRenderer = (): boolean => knownSoftware() === true;
