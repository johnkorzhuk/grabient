/* The fluted glass's passes in GLSL ES 3.00: the player's own (ui/glass-player.ts, glass-bake.ts), which the shader
   exports (glass-shader.ts) write out and their WebGL page compiles, so the page draws what the player draws. Each frame
   the discs go as instanced quads into the field (GLASS_DISC_VS, GLASS_DISC_FS), the field is blurred across and down
   (GLASS_BLUR_FS) and one pass over the canvas reads the rib map and the field at the displaced pixel
   (GLASS_FINAL_FS); the rib map is baked in one pass for each size, angle and shape (GLASS_BAKE_FS). The full-target
   passes share one vertex shader (GLASS_FULL_VS). */

/** A disc as an instanced quad over its circle, in the field's texels with y down. */
export const GLASS_DISC_VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec4 disc;   // middle x, y and radius in field texels (y down), core
layout(location=2) in vec3 color;
uniform vec2 uField;
out vec2 vLocal; out vec3 vColor; flat out float vCore;
void main() {
  vec2 pos = disc.xy + corner * disc.z;
  vLocal = corner; vColor = color; vCore = disc.w;
  gl_Position = vec4(pos.x / uField.x * 2.0 - 1.0, 1.0 - pos.y / uField.y * 2.0, 0.0, 1.0);
}`;
/** A disc's soft circle, opaque to its core and clear at its rim, premultiplied for the blend over the field. */
export const GLASS_DISC_FS = `#version 300 es
precision highp float;
in vec2 vLocal; in vec3 vColor; flat in float vCore;
out vec4 o;
void main() {
  float r = length(vLocal);
  if (r >= 1.0) discard;
  float a = r <= vCore ? 1.0 : (1.0 - r) / (1.0 - vCore);
  o = vec4(vColor * a, a);
}`;
/** The quad over a whole target, for the blur, the glass and the bake. */
export const GLASS_FULL_VS = `#version 300 es
layout(location=0) in vec2 corner;
void main() { gl_Position = vec4(corner, 0.0, 1.0); }`;
/** One pass of the field's blur along uStep: the middle and five bilinear pairs either side. */
export const GLASS_BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uStep;
uniform vec2 uTaps[6];
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uSrc, 0));
  vec3 c = texture(uSrc, uv).rgb * uTaps[0].y;
  for (int i = 1; i < 6; i++) {
    vec2 off = uStep * uTaps[i].x;
    c += (texture(uSrc, uv + off).rgb + texture(uSrc, uv - off).rgb) * uTaps[i].y;
  }
  o = vec4(c, 1.0);
}`;
/** The glass: the rib map at the pixel, the blurred field read where its displacement points, and the ribs' light. */
export const GLASS_FINAL_FS = `#version 300 es
precision highp float;
uniform sampler2D uMap;
uniform sampler2D uFieldT;
uniform float uH;
uniform vec2 uOrigin;
uniform vec2 uOffset;
uniform vec2 uInv;
uniform float uScale;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  vec3 m = texelFetch(uMap, p, 0).rgb;
  vec2 s = vec2(p) + uOffset + floor(uScale * (m.rg - 0.5) + 0.5);
  vec2 f = (s + 0.5 - uOrigin) * uInv;
  vec3 c = texture(uFieldT, vec2(f.x, 1.0 - f.y)).rgb;
  o = vec4(min(vec3(1.0), floor(c * 255.0 + 0.5) / 255.0 * (2.0 * m.b)), 1.0);
}`;
/** The rib map, each pixel as engine/glass-render.ts's glassMapRows computes it, rounded to 8 bits where it is. */
export const GLASS_BAKE_FS = `#version 300 es
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
