/* Whether WebGL here is drawn by the processor: SwiftShader, llvmpipe, Microsoft's Basic Render Driver or another
   software rasterizer. There the water takes seconds of main thread to compile and a core a frame, so a page without a
   GPU keeps the still fallback; lab runs such as PageSpeed's headless Chrome have no GPU either. The probe runs in a
   worker on an OffscreenCanvas, since a first WebGL context is itself slow on a software renderer, and in place where
   there are no workers. `grabient-water` = `software` in local storage draws the water anyway, as the browser checks do. */
let known: boolean | undefined;
let asking: Promise<boolean> | undefined;
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render driver|mesa offscreen/i;
/* the renderer's name, or none without a WebGL2 context: failing on a major performance caveat means software too */
const PROBE =
  "onmessage=()=>{let n='none';try{const g=new OffscreenCanvas(1,1).getContext('webgl2',{powerPreference:'low-power',failIfMajorPerformanceCaveat:true});if(g){const d=g.getExtension('WEBGL_debug_renderer_info');n=String((d&&g.getParameter(d.UNMASKED_RENDERER_WEBGL))||g.getParameter(g.RENDERER)||'');const l=g.getExtension('WEBGL_lose_context');l&&l.loseContext()}}catch(e){}postMessage(n)}";

function nameHere(): string {
  try {
    const gl = document
      .createElement("canvas")
      .getContext("webgl2", { powerPreference: "low-power", failIfMajorPerformanceCaveat: true });
    if (!gl) return "none";
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(
      (debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) ||
        gl.getParameter(gl.RENDERER) ||
        ""
    );
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch {
    return "none";
  }
}
const software = (name: string) => name === "none" || SOFTWARE.test(name);

/** Whether a renderer's name is a software rasterizer's. */
export const softwareNamed = (name: string): boolean => SOFTWARE.test(name);

/** The probe's answer where it has run (true: software), else undefined. */
export const knownSoftware = (): boolean | undefined => known;

function softwareRenderer(): Promise<boolean> {
  if (known !== undefined) return Promise.resolve(known);
  if (asking) return asking;
  asking = new Promise<boolean>(resolve => {
    const settle = (name: string) => {
      known = software(name);
      resolve(known);
    };
    try {
      if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined")
        return settle(nameHere());
      const url = URL.createObjectURL(new Blob([PROBE], { type: "text/javascript" }));
      const worker = new Worker(url);
      const done = (name: string) => {
        worker.terminate();
        URL.revokeObjectURL(url);
        settle(name);
      };
      worker.onmessage = e => done(String(e.data));
      worker.onerror = () => done(nameHere());
      worker.postMessage(0);
    } catch {
      settle(nameHere());
    }
  });
  return asking;
}

/** The water is drawn unless the renderer is software, or where the page asks for it anyway. Browser only. */
export async function waterAllowed(): Promise<boolean> {
  try {
    if (localStorage.getItem("grabient-water") === "software") return true;
  } catch {
    /* no storage: the renderer decides */
  }
  return !(await softwareRenderer());
}
