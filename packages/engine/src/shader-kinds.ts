/* The kinds of shader the editor's Shader tab offers: three texts (shader.ts) and two pages that run them
   (shader-page.ts). Apart from both, so the tab's spellings are all a page's start carries of them: the code loads
   once the tab shows. */
export type ShaderKind = "shadertoy" | "glsl" | "wgsl" | "webgl" | "webgpu";
/** The kinds that are a page running the shader rather than its text. */
export type ShaderPageKind = "webgl" | "webgpu";
export const SHADER_KINDS: readonly (readonly [ShaderKind, string])[] = [
  ["shadertoy", "Shadertoy"],
  ["glsl", "GLSL"],
  ["wgsl", "WGSL"],
  ["webgl", "WebGL"],
  ["webgpu", "WebGPU"]
];
export const isShaderPage = (kind: ShaderKind): kind is ShaderPageKind =>
  kind === "webgl" || kind === "webgpu";
