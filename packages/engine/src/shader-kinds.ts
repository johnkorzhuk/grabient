/* The kinds of shader the editor's Shader tab offers: two pages that play it whole, each one copy (shader-page.ts),
   first, then the two texts they run (shader.ts), for a reader's own renderer. Apart from both, so the tab's spellings
   are all a page's start carries of them: the code loads once the tab shows. */
export type ShaderKind = "glsl" | "wgsl" | "webgl" | "webgpu";
/** The kinds that are a page running the shader rather than its text. */
export type ShaderPageKind = "webgl" | "webgpu";
export const SHADER_KINDS: readonly (readonly [ShaderKind, string])[] = [
  ["webgl", "WebGL"],
  ["webgpu", "WebGPU"],
  ["glsl", "GLSL"],
  ["wgsl", "WGSL"]
];
export const isShaderPage = (kind: ShaderKind): kind is ShaderPageKind =>
  kind === "webgl" || kind === "webgpu";
