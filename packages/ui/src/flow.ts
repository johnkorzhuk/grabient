/* The water behind every page. The wordmark's bar is a source of paint in water under frosted glass. Paint leaves the
   bar as streams in the bar's left-to-right order and the current carries it toward `aim`; the farther it travels, the
   more the water disturbs it, until it breaks into drifting clouds of the same colors. The water is clear when the page
   opens and fills from the bar. The palette at the source changes over time (`ramp(t)`): every DT seconds it is written
   into a ring of rows (`uHist`), and ink at a distance reads the row from when it left the bar, so a change travels out
   across the page. Most ink drifts far behind the glass, blurred by the frost; the bar is the one clear hole, and the
   streams stay sharp until they pull away. A lit card's glow enters the water as paint the current carries off, and a
   pane's bar breathes its colors out as smoke.
   Passes, each at the resolution its content needs: that paint at an eighth, only while some remains; the ink at half
   the CSS resolution; two blurs, at a quarter and an eighth; a field at an eighth (the glass's wobble and the ink's
   depth); and the composite at device resolution under a pixel budget, which picks a blur by depth and works the ink
   out per device pixel only near the bar, so the streams are exact at any DPR. WebGL2: one buffer-less triangle per
   pass, the noise a 256 by 256 lattice the hardware's filter interpolates, and each blur five fetches of linear taps.
   Browser only; nothing runs at import. */
import type { GlowTile } from "./glow.ts";
import { BLOOM } from "./panebar.ts";

const VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/* what every pass starts with: the noise lattice, fbm, the water's two layers, and sdBox (Inigo Quilez's rounded box) */
const HEAD = `#version 300 es
precision highp float;
uniform vec2 uRes;      // this pass's target, in px
uniform float uScale;   // target px per CSS px
uniform float uTime;
uniform sampler2D uLat; // the noise lattice: one random value per texel, REPEAT
out vec4 outColor;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
// value noise: the lattice's bilinear filter interpolates the four corners with these weights
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return texture(uLat, (i + f + 0.5)/256.0).r; }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return v; }
// the water's two layers: the drifting clouds, and a deeper, smoother layer, mixed with the contrast one alone has
float layers(vec2 a, vec2 b){
  float deep = 0.625*noise(b) + 0.3125*noise(b*2.03 + vec2(1.7, 9.2));
  return 0.47 + 1.4072*(0.55*fbm(a) + 0.45*deep - 0.47);
}
float sdBox(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
`;

/* the ink field, in CSS px, viewport coordinates, y down */
const INK = `
uniform vec4 uBar;      // the source: x y w h
uniform vec2 uAim;      // where the current heads
uniform vec2 uSway;     // the phases of the current's two slow waves, 0..1, wrapped on the CPU
uniform sampler2D uHist;                      // the palette at the source, one row per tick
uniform float uHead, uHeadT, uDt, uRows;      // the newest row, its time (>= now), the tick, the ring
const float SPEED = 52.0;                     // px/s along the current
// the palette that left the bar age seconds ago, read at t across it; the head row is written a moment ahead of now,
// so age 0 is an exact blend of the rows around now
vec3 hist(float t, float age){
  float back = clamp((uHeadT - uTime + age)/uDt, 0.0, uRows - 2.0);
  return texture(uHist, vec2(clamp(t, 0.0, 1.0)*0.984375 + 0.0078125, (uHead - back + 0.5)/uRows)).rgb;
}
// how long paint takes to travel s px down a current of speed v: the current slows as it spreads
float travel(float s, float v){ s = max(s, 0.0); return s/v * (0.85 + 0.45*s/(s + 1000.0)); }
// the current meanders: two slow waves travel down it, from nothing at the bar to about 26 px far out
float sway(float s){
  float a = max(s, 0.0);
  return 26.0*a*a/(a*a + 67600.0) * (0.6*sin(6.2831853*(a/1100.0 - uSway.x)) + 0.4*sin(6.2831853*(a/700.0 - uSway.y) + 1.7));
}
// the way the current runs at r from the source's center c: straight down from the bar, bending toward the sheet
vec2 heading(vec2 c, vec2 r){
  return normalize(mix(vec2(0.0, 1.0), normalize(uAim - c), smoothstep(0.0, 360.0, length(r))) + vec2(1e-4, 0.0));
}
// the flow's own frame at p: x across the current, s along it, and the distance from the source
vec3 frame(vec2 p){
  vec2 c = uBar.xy + uBar.zw*0.5;
  vec2 r = p - c;
  vec2 d = heading(c, r);
  vec2 n = vec2(d.y, -d.x);
  float s = dot(r, d);
  return vec3(dot(r, n) + sway(s), s, length(r));
}
float sdBar(vec2 p){ return sdBox(p - (uBar.xy + uBar.zw*0.5), uBar.zw*0.5, 1.5); }
// the ink at a point: its color, undiluted, and how much of it is there
vec3 ink(vec2 p, out float conc){
  vec3 f = frame(p);
  float x = f.x, s = f.y, dist = f.z;
  float hw = uBar.z*0.5;
  // the plume widens as it travels; u runs -1..1 across it, the bar's own order
  float W = hw + 0.5*max(s, 0.0) + 0.3*max(-s, 0.0);
  float u = x / W;
  // the water's disturbance grows with the distance from the source
  float amp = smoothstep(20.0, 560.0, dist);
  vec2 q = vec2(x, s - uTime*SPEED) / 260.0;
  vec2 w = vec2(fbm(q*1.25 + vec2(0.0, uTime*0.02)), fbm(q*1.25 + vec2(7.1, 3.3) - vec2(uTime*0.015, 0.0))) - 0.47;
  float uw = u + amp*w.x*2.4;
  float sw = s + amp*w.y*320.0;
  // how long ago this ink left the bar: the middle runs faster than the edges and each stream keeps a pace of its own,
  // so a new palette reaches down the plume as a tongue combed into strands
  float lane = 0.65*noise(vec2(uw*2.5 + 3.0, 11.5)) + 0.35*noise(vec2(uw*7.0 + 5.0, 23.5));
  float pace = (1.0 - 0.4*min(uw*uw, 1.0)) * (0.85 + 0.3*lane);
  float age = travel(sw, SPEED*pace);
  // the water around the stream takes new paint after it, one eddy at a time
  float ageF = max(travel(sw, SPEED*0.9) + 0.8 + 4.0*(0.6*noise(q*0.7 + vec2(4.3, 8.1)) + 0.4*noise(q*1.5 + vec2(9.4, 2.2)) - 0.45), 0.0);
  // inside the bar and just past it the paint is solid
  float src = exp(-max(sdBar(p), 0.0)/28.0);
  // the streams: fine filaments across the flow, sliding downstream
  float fil = 0.6 + 0.4*noise(vec2(uw*7.0 + 3.0, sw*0.014 - uTime*0.45));
  fil = mix(fil, 1.0, src);
  float plume = 1.0 - smoothstep(0.82, 1.3, abs(uw));
  float decay = exp(-dist/540.0);
  // what the paint becomes: clouds of the palette in two layers, the deeper drifting slower and a little sideways
  vec2 q2 = vec2(x + uTime*6.0, s - uTime*SPEED*0.55) / 300.0 + vec2(3.7, 1.9);
  vec3 far = hist(layers(q*0.55 + vec2(2.0, 5.0), q2*0.55 + vec2(8.0, 2.0))*1.1 + 0.4*w.x, ageF);
  float farC = 0.34*(1.0 - decay)*(0.5 + 0.5*clamp(layers(q*0.8 + vec2(9.0, 1.0), q2*0.8 + vec2(5.0, 12.0)), 0.0, 1.0));
  vec3 near = hist(0.5 + 0.5*uw, age);
  float nearC = max(plume*fil*(0.26 + 0.74*decay), src);
  // the water was clear when the page opened: no ink is older than the page
  float born = max(1.0 - smoothstep(uTime - 2.0, uTime + 0.3, age), src);
  float bornF = 1.0 - smoothstep(uTime - 2.0, uTime + 0.3, ageF);
  float wN = nearC*born, wF = farC*(1.0 - nearC)*bornF;
  conc = clamp(wN + wF, 0.0, 1.0);
  vec3 col = (near*wN + far*wF) / max(wN + wF, 1e-3);
  // very bright paint at the source, held short of clipping so no channel stalls mid-tween
  float g = 1.0 + 0.22*exp(-dist/90.0);
  return col * (g / max(1.0, g*max(col.r, max(col.g, col.b))));
}
`;

/* the paint a lit card or a pane's bar has let into the water, premultiplied, and whether there is any */
const DYE = `
uniform sampler2D uDye; uniform float uDyeOn;
`;

/* pass 0, while a card's or a pane bar's paint is in the water: that paint at an eighth, kept from frame to frame. The
   last step's paint is carried down the current and fades; a lit card's glow soaks in under and around it, the bar's
   colors along the bar. It reaches the page through the frost, so an eighth draws it as a quarter would */
const FS_DYE = `${HEAD}${INK}
uniform sampler2D uPrev;    // the paint a step ago
uniform sampler2D uCard;    // the lit card's picture
uniform vec4 uCardBox;      // its box, CSS px: x y w h
uniform float uCardRad;     // its corners
uniform float uEmit;        // 1 while the card glows
uniform float uStep;        // seconds since the last step
uniform vec2 uJit;          // where this step's dither starts
// how far a pane bar's ends trail its middle as its light comes on, and how thick a resting bar's paint is
const float BLOOM = ${BLOOM.toFixed(2)};
const float STRIP_REST = 0.45;
uniform vec4 uStrip;        // the bar a pane wears, CSS px: x y w h
uniform float uStripInk;    // how thick its paint soaks in where it is lit; 0 while no pane wears one
uniform float uStripLit;    // how lit it is, 0 at rest to 1
// the curl of the noise at e, in lattice units: a swirl that neither gathers the paint nor spreads it
vec2 swirl(vec2 e){
  float a = noise(e), ax = noise(e + vec2(0.3, 0.0)), ay = noise(e + vec2(0.0, 0.3));
  return vec2(ay - a, a - ax) / 0.3;
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p = vec2(fc.x, uRes.y - fc.y) / uScale;
  vec2 c = uBar.xy + uBar.zw*0.5, r = p - c;
  vec2 d = heading(c, r), n = vec2(d.y, -d.x);
  // the water moves as its clouds do, about 40 px/s down the current, and eddies riding along turn it
  vec2 e = vec2(dot(r, n), dot(r, d) - uTime*40.0);
  vec2 t = swirl(e/190.0 + vec2(uTime*0.02, 3.1))*34.0 + swirl(e/85.0 + vec2(7.4, uTime*0.03))*18.0;
  vec2 v = d*40.0 + t.x*n + t.y*d;
  // the glow lies under the card's box, dropped as the glow is, and spills out past the edges while it is lit
  vec2 hb = uCardBox.zw*0.5, q = p - (uCardBox.xy + hb + vec2(0.0, 6.0));
  float sd = sdBox(q, hb, uCardRad);
  vec2 o = q - clamp(q, -hb, hb);
  v += uEmit * o/max(length(o), 1e-3) * 20.0 * exp(-max(sd, 0.0)/40.0);
  // a pane's bar breathes its colors out along its length: they rise off the pane's edge, slower as they climb
  vec2 sh = uStrip.zw*0.5, sq = p - (uStrip.xy + sh);
  float worn = step(1e-3, uStripInk);
  float span = 1.0 - smoothstep(0.0, 60.0, abs(sq.x) - sh.x);
  float rise = worn*span*exp(-max(-sq.y - sh.y, 0.0)/160.0)*exp(-max(sq.y - sh.y, 0.0)/24.0);
  vec2 es = vec2(p.x, p.y + uTime*30.0);
  vec2 ts = swirl(es/70.0 + vec2(2.3, uTime*0.05))*22.0 + swirl(es/36.0 + vec2(uTime*0.04, 5.1))*10.0;
  v = mix(v, vec2(0.0, -36.0) + ts, rise);
  // the paint here was upstream a step ago; nothing comes in from past the page's edges
  vec2 b = (p - v*uStep) * uScale / uRes;
  b.y = 1.0 - b.y;
  vec4 k = texture(uPrev, b) * (step(0.0, b.x)*step(b.x, 1.0)*step(0.0, b.y)*step(b.y, 1.0));
  // it fades as it goes; the buffer holds bytes, so each step is dithered or a small step would stall it
  k = max(k*exp(-uStep/6.0) - uStep*0.03, 0.0);
  // the glow soaks in: the picture's color at the nearest point of the card, as thick as the glow is there
  float g = uEmit*(1.0 - smoothstep(-10.0, 44.0, sd));
  vec3 col = texture(uCard, clamp((q + hb)/uCardBox.zw, 0.0, 1.0)).rgb;
  k = mix(k, vec4(col, 1.0)*0.75, 1.0 - exp(-uStep*3.0*g));
  // the bar's colors soak in around it, thicker where its light is on: from the middle out as it comes
  float along = (p.x - uStrip.x)/max(uStrip.z, 1.0);
  float gs = worn*smoothstep(0.0, 0.2, along)*(1.0 - smoothstep(0.8, 1.0, along))*(1.0 - smoothstep(-2.0, 20.0, sdBox(sq, sh, 0.0)));
  float on = clamp(uStripLit*(1.0 + BLOOM) - BLOOM*abs(2.0*along - 1.0), 0.0, 1.0);
  k = mix(k, vec4(hist(along, 0.0), 1.0)*uStripInk*(STRIP_REST + (1.0 - STRIP_REST)*on), 1.0 - exp(-uStep*3.0*gs));
  outColor = k + (hash(fc + uJit) - 0.5)/255.0*step(0.5/255.0, k.a);
}`;

/* pass 1: the ink, premultiplied, with a lit card's paint over it */
const FS_INK = `${HEAD}${INK}${DYE}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p = vec2(fc.x, uRes.y - fc.y) / uScale;
  float conc; vec3 col = ink(p, conc);
  vec4 o = vec4(col*conc, conc);
  if (uDyeOn > 0.5) { vec4 d = texture(uDye, fc/uRes); o = d + o*(1.0 - d.a); }
  outColor = o;
}`;

/* passes 2 to 5: one separable Gaussian (the 9-tap weights), each pair of taps one fetch between them */
const FS_BLUR = `${HEAD}
uniform sampler2D uSrc; uniform vec2 uStep;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 c = texture(uSrc, uv) * 0.2270270270;
  c += (texture(uSrc, uv + uStep*1.3846153846) + texture(uSrc, uv - uStep*1.3846153846)) * 0.3162162162;
  c += (texture(uSrc, uv + uStep*3.2307692308) + texture(uSrc, uv - uStep*3.2307692308)) * 0.0702702703;
  outColor = c;
}`;

/* pass 6: the field, at an eighth. x y: the glass's wobble; z: how near the drifting ink comes to the glass, slow
   clouds of nearness riding the current; w: how thick a lit card's paint is here, which brings it near while fresh */
const FS_FIELD = `${HEAD}${INK}${DYE}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p = vec2(fc.x, uRes.y - fc.y) / uScale;
  vec3 f = frame(p);
  vec2 q = vec2(f.x, f.y - uTime*SPEED) / 640.0;
  vec2 q2 = vec2(f.x + uTime*6.0, f.y - uTime*SPEED*0.55) / 560.0;
  float cloud = smoothstep(0.5, 0.76, layers(q + vec2(11.0, 4.0) + vec2(uTime*0.012, 0.0), q2 + vec2(3.0, 17.0)));
  float dye = uDyeOn > 0.5 ? texture(uDye, fc/uRes).a : 0.0;
  outColor = vec4(noise(p*0.018 + uTime*0.06), noise(p*0.018 + vec2(4.7, 2.9) - uTime*0.05), cloud, dye);
}`;

/* pass 7: the glass over the water, by depth */
const FS_GLASS = `${HEAD}${INK}
uniform sampler2D uSharp, uMid, uFar, uField;
uniform vec3 uPaper;    // the glass's own color
uniform float uTfar;    // how much of the far ink's light comes through the frost
uniform float uFade;    // 0..1 arrival
uniform float uGrain;   // the grain's roll, stepped at a fixed cadence
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / uRes;
  vec2 p = vec2(fc.x, uRes.y - fc.y) / uScale;
  vec4 fld = texture(uField, uv);
  // how close the ink is to the glass: the drifting clouds, the bar (always at the glass), a lit card's fresh paint
  float sb = uBar.z > 0.0 ? sdBar(p) : 1e5;
  float z = fld.z*0.25;
  z = max(z, exp(-max(sb, 0.0)/120.0));
  z = max(z, 0.65*fld.w);
  z = clamp(z, 0.0, 1.0);
  // the glass has a surface: a fine, slow wobble in where you see through it
  vec2 wob = (fld.xy - 0.5) * (5.0*uScale)/uRes;
  vec4 far = texture(uFar, uv + wob);
  vec4 mid = texture(uMid, uv + wob*0.4);
  // near the bar the sharp level is the ink itself at this pixel, so the streams are exact at any DPR
  vec4 sharp;
  if (sb < 83.0) { float c; vec3 k = ink(p, c); sharp = vec4(k*c, c); }
  else sharp = texture(uSharp, uv);
  // frost scatters the far ink's color toward gray
  float lum = dot(far.rgb, vec3(0.299, 0.587, 0.114));
  far.rgb = mix(vec3(lum), far.rgb, 0.7);
  vec4 img = z < 0.5 ? mix(far, mid, z*2.0) : mix(mid, sharp, z*2.0 - 1.0);
  float T = mix(uTfar, 1.0, z*z);
  vec3 col = uPaper*(1.0 - img.a*T) + img.rgb*T;
  col += (hash(mod(fc + vec2(uGrain), 256.0)) - 0.5) * 0.018 * (1.0 - z);
  vec3 raw = uPaper*(1.0 - sharp.a) + sharp.rgb;
  // the glass arrives over the hole, which is the ink itself from the first frame
  col = mix(uPaper, col, uFade);
  col = mix(col, raw, 1.0 - smoothstep(-0.5, 0.5, sb));
  outColor = vec4(col, 1.0);
}`;

export interface FlowOpts {
  /** the hole, in CSS px (viewport coordinates), or null for a whole sheet of frost */
  window: () => DOMRect | null;
  /** where the current heads, in CSS px */
  aim: () => { x: number; y: number } | null;
  /** the paint at the source at time t, in seconds: sRGB triples 0 to 1 across the bar */
  ramp: (t: number) => readonly (readonly number[])[];
  dark: () => boolean;
  /** called once the first frame is drawn */
  onFirstFrame?: () => void;
  /** drawing failed: the page shows its fallback */
  onFailure?: () => void;
  /** whether the page moves less: held still, the water draws a frame when something changes and never moves on its
      own. Read at start and on `motion()` */
  reduced?: () => boolean;
  /** the card whose glow is lit: its picture's box in CSS px, its corner radius and what it shows. Never read held
      still */
  glow?: () => { rect: DOMRect; radius: number; tiles: readonly GlowTile[] } | null;
  /** the bar a pane wears and how lit it is, 0 to 1: its colors soak in along it and rise off it. Never read held
      still; shares the glow's pass, which `glow` asks for */
  strip?: () => { rect: DOMRect; lit: number } | null;
  /** after each frame drawn, the paint at the source as the open bar shows it: sRGB byte triples */
  onFrame?: (source: Uint8Array) => void;
}
export interface Flow {
  stop(): void;
  /** draws again after something outside the loop changed, such as the theme */
  refresh(): void;
  /** forgets the water's memory for the palette `ramp` returns now */
  reseed(): void;
  /** reads `reduced` again: the water stops where it is, or moves on */
  motion(): void;
  /** whether it takes a lit card's glow in (it was given `glow` and its program compiled) */
  readonly glows: boolean;
}

type GL = WebGL2RenderingContext;
interface Prog {
  prog: WebGLProgram;
  u: (name: string) => WebGLUniformLocation | null;
}
interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}
interface Owned {
  textures: WebGLTexture[];
  framebuffers: WebGLFramebuffer[];
}

function compile(g: GL, type: number, src: string): WebGLShader | null {
  const s = g.createShader(type);
  if (!s) return null;
  g.shaderSource(s, src);
  g.compileShader(s);
  if (g.getShaderParameter(s, g.COMPILE_STATUS)) return s;
  console.warn("flow shader:", g.getShaderInfoLog(s));
  g.deleteShader(s);
  return null;
}
function program(g: GL, fs: string): Prog | null {
  const v = compile(g, g.VERTEX_SHADER, VS);
  const f = compile(g, g.FRAGMENT_SHADER, fs);
  const p = g.createProgram();
  if (v && f) {
    g.attachShader(p, v);
    g.attachShader(p, f);
    g.linkProgram(p);
  }
  if (v) g.deleteShader(v);
  if (f) g.deleteShader(f);
  if (!v || !f || !g.getProgramParameter(p, g.LINK_STATUS)) {
    g.deleteProgram(p);
    return null;
  }
  const known = new Map<string, WebGLUniformLocation | null>();
  return {
    prog: p,
    u: name => {
      if (!known.has(name)) known.set(name, g.getUniformLocation(p, name));
      return known.get(name) ?? null;
    }
  };
}
function texture(g: GL, owned: Owned, wrap: number = g.CLAMP_TO_EDGE): WebGLTexture {
  const t = g.createTexture();
  owned.textures.push(t);
  g.bindTexture(g.TEXTURE_2D, t);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, wrap);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, wrap);
  return t;
}
function target(g: GL, owned: Owned): Target {
  const tex = texture(g, owned);
  const fbo = g.createFramebuffer();
  owned.framebuffers.push(fbo);
  g.bindFramebuffer(g.FRAMEBUFFER, fbo);
  g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
  return { tex, fbo, w: 0, h: 0 };
}
function size(g: GL, t: Target, w: number, h: number) {
  if (t.w === w && t.h === h) return;
  g.bindTexture(g.TEXTURE_2D, t.tex);
  g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, w, h, 0, g.RGBA, g.UNSIGNED_BYTE, null);
  g.bindFramebuffer(g.FRAMEBUFFER, t.fbo);
  if (
    g.getError() !== g.NO_ERROR ||
    g.checkFramebufferStatus(g.FRAMEBUFFER) !== g.FRAMEBUFFER_COMPLETE
  )
    throw new Error("Unable to size the water's buffers");
  t.w = w;
  t.h = h;
}
/* 256 by 256 random bytes from mulberry32 with a fixed seed, so every load draws the same water */
function lattice(): Uint8Array {
  const out = new Uint8Array(256 * 256);
  let s = 0x9e3779b9;
  for (let i = 0; i < out.length; i++) {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    out[i] = ((t ^ (t >>> 14)) >>> 0) & 255;
  }
  return out;
}

/* The water's memory: a ring of RW by ROWS palettes, one row every DT seconds, about two and a half minutes: the longest
   journey ink makes across a 4K screen, the older water around the stream included, so no part of a page holds the
   oldest row and changes all at once. */
const RW = 64;
const ROWS = 1024;
const DT = 0.15;
/* the current's two slow waves take 26 s and 19.5 s to pass a point: their phases wrapped here in double precision, so
   the shader's sine never loses its place however long the page is open */
const SWAY: readonly [number, number] = [26, 19.5];
function rowBytes(ramp: readonly (readonly number[])[], out: Uint8Array) {
  for (let i = 0; i < RW; i++) {
    const c = ramp[Math.min(Math.floor((i / (RW - 1)) * (ramp.length - 1)), ramp.length - 1)] ?? [
      0.5, 0.5, 0.5
    ];
    out[i * 3] = Math.round(c[0] * 255);
    out[i * 3 + 1] = Math.round(c[1] * 255);
    out[i * 3 + 2] = Math.round(c[2] * 255);
  }
}

/* A lit card's picture as the water takes it in: CARD by CARD texels over the card's box, each the color its artwork
   shows there, in CSS's own geometry, drawn once each time a card lights. The glow is a blur, so this small holds it. */
const CARD = 32;
/* seconds the water keeps drawing a card's paint after it is let go: past the time its last fades at any frame rate */
const DYE_HOLD = 15;
const hexRgb = (hex: string): [number, number, number] => {
  const v = Number.parseInt(hex.trim().replace(/^#/, "").slice(0, 6), 16);
  return Number.isFinite(v) ? [(v >> 16) & 255, (v >> 8) & 255, v & 255] : [128, 128, 128];
};
/* how far along the palette a picture drawn in `style` at `angle` is at (x, y) of a w by h box */
function along(style: string, angle: number, x: number, y: number, w: number, h: number): number {
  const dx = x - w / 2;
  const dy = y - h / 2;
  const a = (angle * Math.PI) / 180;
  if (style.startsWith("radial"))
    return Math.hypot(dx, dy) / Math.max(Math.hypot(w / 2, h / 2), 1e-6);
  if (style.startsWith("angular")) {
    const turn = (Math.atan2(dx, -dy) - a) / (2 * Math.PI);
    return turn - Math.floor(turn);
  }
  const sx = Math.sin(a);
  const sy = -Math.cos(a);
  return (dx * sx + dy * sy) / Math.max(Math.abs(w * sx) + Math.abs(h * sy), 1e-6) + 0.5;
}
function paintCard(tiles: readonly GlowTile[], w: number, h: number, out: Uint8Array) {
  const drawn = tiles.map(t => ({
    x: t.x ?? 0,
    y: t.y ?? 0,
    w: t.w ?? 1,
    h: t.h ?? 1,
    style: t.style ?? "linearGradient",
    angle: t.angle ?? 90,
    rgb: t.stops.map(hexRgb)
  }));
  for (let j = 0; j < CARD; j++)
    for (let i = 0; i < CARD; i++) {
      const u = (i + 0.5) / CARD;
      const v = (j + 0.5) / CARD;
      const tile =
        drawn.find(t => u >= t.x && u <= t.x + t.w && v >= t.y && v <= t.y + t.h) ?? drawn[0];
      const o = (j * CARD + i) * 4;
      out[o + 3] = 255;
      if (!tile?.rgb.length) {
        out[o] = out[o + 1] = out[o + 2] = 128;
        continue;
      }
      const n = tile.rgb.length;
      const f = Math.min(
        Math.max(
          along(tile.style, tile.angle, (u - tile.x) * w, (v - tile.y) * h, tile.w * w, tile.h * h),
          0
        ),
        1
      );
      /* bands are hard: each stop holds its share; a gradient runs between its stops */
      if (tile.style.endsWith("Swatches") || n === 1) {
        const c = tile.rgb[Math.min(Math.floor(f * n), n - 1)];
        out.set(c, o);
        continue;
      }
      const s = f * (n - 1);
      const k = Math.min(Math.floor(s), n - 2);
      const m = s - k;
      for (let ch = 0; ch < 3; ch++)
        out[o + ch] = Math.round(tile.rgb[k][ch] + (tile.rgb[k + 1][ch] - tile.rgb[k][ch]) * m);
    }
}

const PAPER_DARK = [0.047, 0.047, 0.055] as const;
const PAPER_LIGHT = [0.953, 0.949, 0.933] as const;
/* device pixels the composite may spend; past it the backing store scales down instead of up */
const PIXEL_BUDGET = 6e6;
/* a held frame is the water 13.5 s after it opened, the clouds spread well out from the bar */
const HELD_AT = 13.5;

/** compiled programs per context: ink, blur, field, glass, and the card paint's (undefined until a page with `glow`
    asks for it, null when it failed), so the water taken away and given back compiles nothing */
const PROGRAMS = new WeakMap<GL, [Prog, Prog, Prog, Prog, Prog | null | undefined]>();

/** Starts the water on `canvas`; null where WebGL2, its programs or its buffers are not to be had. */
export function startFlow(canvas: HTMLCanvasElement, opts: FlowOpts): Flow | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power"
  });
  if (!gl) return null;
  const owned: Owned = { textures: [], framebuffers: [] };
  const release = () => {
    for (const t of owned.textures.splice(0)) gl.deleteTexture(t);
    for (const f of owned.framebuffers.splice(0)) gl.deleteFramebuffer(f);
  };
  try {
    let compiled = PROGRAMS.get(gl);
    if (!compiled) {
      const made = [FS_INK, FS_BLUR, FS_FIELD, FS_GLASS].map(fs => program(gl, fs));
      if (made.some(p => !p)) {
        for (const p of made) if (p) gl.deleteProgram(p.prog);
        return null;
      }
      compiled = [...(made as Prog[]), undefined] as [Prog, Prog, Prog, Prog, undefined];
      PROGRAMS.set(gl, compiled);
      canvas.addEventListener("webglcontextlost", () => PROGRAMS.delete(gl), { once: true });
    }
    /* the card paint's program, only for a page that passes `glow` */
    if (opts.glow && compiled[4] === undefined) compiled[4] = program(gl, FS_DYE);
    const [pInk, pBlur, pField, pGlass] = compiled;
    const pDye = opts.glow ? (compiled[4] ?? null) : null;
    const tInk = target(gl, owned);
    const tM1 = target(gl, owned);
    const tM2 = target(gl, owned);
    const tF1 = target(gl, owned);
    const tF2 = target(gl, owned);
    const tField = target(gl, owned);
    /* a card's paint moves between two buffers, one step a frame, sized only once a card lights */
    const tDye = [target(gl, owned), target(gl, owned)] as const;
    /* units 0 to 2 change by pass; 3 is the memory, 4 the lattice, 5 the field, 6 a card's paint, 7 its picture */
    for (const p of [pInk, pField, pGlass, pDye]) {
      if (!p) continue;
      gl.useProgram(p.prog);
      gl.uniform1i(p.u("uHist"), 3);
      gl.uniform1i(p.u("uLat"), 4);
      gl.uniform1i(p.u("uDye"), 6);
    }
    gl.useProgram(pBlur.prog);
    gl.uniform1i(pBlur.u("uSrc"), 0);
    gl.useProgram(pGlass.prog);
    gl.uniform1i(pGlass.u("uSharp"), 0);
    gl.uniform1i(pGlass.u("uMid"), 1);
    gl.uniform1i(pGlass.u("uFar"), 2);
    gl.uniform1i(pGlass.u("uField"), 5);
    if (pDye) {
      gl.useProgram(pDye.prog);
      gl.uniform1i(pDye.u("uPrev"), 6);
      gl.uniform1i(pDye.u("uCard"), 7);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    /* the ink and the field always read a whole texture on unit 6, empty until a card lights */
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, tDye[0].tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(4)
    );
    gl.activeTexture(gl.TEXTURE7);
    const tCard = texture(gl, owned);
    const cardPx = new Uint8Array(CARD * CARD * 4);
    gl.activeTexture(gl.TEXTURE4);
    texture(gl, owned, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 256, 0, gl.RED, gl.UNSIGNED_BYTE, lattice());
    gl.activeTexture(gl.TEXTURE3);
    const hist = texture(gl, owned, gl.REPEAT);

    let head = 0;
    let headT = 0;
    let remembered = false;
    /* the head row and the one before it, and the source between them now, as the open bar reads it */
    const row = new Uint8Array(RW * 3);
    const before = new Uint8Array(RW * 3);
    const atSource = new Uint8Array(RW * 3);
    const all = new Uint8Array(RW * ROWS * 3);
    const remember = (time: number) => {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, hist);
      /* the first frame, or a gap longer than the ring: the whole memory is now */
      if (!remembered || time - headT > ROWS * DT) {
        rowBytes(opts.ramp(time), row);
        before.set(row);
        for (let r = 0; r < ROWS; r++) all.set(row, r * RW * 3);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, RW, ROWS, 0, gl.RGB, gl.UNSIGNED_BYTE, all);
        if (gl.getError() !== gl.NO_ERROR) throw new Error("Unable to allocate the water's memory");
        head = 0;
        headT = time;
        remembered = true;
      }
      /* the head stays a row ahead of now, so now is always between two written rows */
      while (headT < time) {
        head = (head + 1) % ROWS;
        headT += DT;
        before.set(row);
        rowBytes(opts.ramp(headT), row);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, head, RW, 1, gl.RGB, gl.UNSIGNED_BYTE, row);
      }
      /* the hole's own blend of the two rows around now */
      const f = Math.min(Math.max(1 - (headT - time) / DT, 0), 1);
      for (let i = 0; i < atSource.length; i++)
        atSource[i] = Math.round(before[i] + (row[i] - before[i]) * f);
    };

    let reduced = !!opts.reduced?.();
    let motionTime = reduced ? HELD_AT : 0;
    let raf = 0;
    let t0 = 0;
    let stopped = false;
    let lastDrawn = 0;
    let hiddenAt = 0;
    let dirty = false;
    let drawnOnce = false;
    /* a card's paint: whether any is in the water, the buffer holding it, its last step, until when it is kept, and
       the picture the card showed */
    let dyeOn = false;
    let dyeCur = 0;
    let dyeAt = 0;
    let dyeUntil = 0;
    let cardTiles: readonly GlowTile[] | null = null;

    const source = (): [number, number, number, number] => {
      const w = opts.window();
      return w && w.width > 0 ? [w.left, w.top, w.width, w.height] : [0, 0, 0, 0];
    };
    const aimOf = (bar: readonly number[]): [number, number] => {
      const a = opts.aim() ?? { x: innerWidth / 2, y: innerHeight / 2 };
      const cx = bar[0] + bar[2] / 2;
      const cy = bar[1] + bar[3] / 2;
      /* never aim at the source itself */
      return Math.hypot(a.x - cx, a.y - cy) < 2 ? [cx, cy + 300] : [a.x, a.y];
    };
    const use = (
      p: Prog,
      time: number,
      bar: readonly number[],
      aim: readonly number[],
      w: number,
      h: number,
      scale: number
    ) => {
      gl.useProgram(p.prog);
      gl.uniform2f(p.u("uRes"), w, h);
      gl.uniform1f(p.u("uScale"), scale);
      gl.uniform1f(p.u("uTime"), time);
      gl.uniform4f(p.u("uBar"), bar[0], bar[1], bar[2], bar[3]);
      gl.uniform2f(p.u("uAim"), aim[0], aim[1]);
      gl.uniform1f(p.u("uHead"), head);
      gl.uniform1f(p.u("uHeadT"), headT);
      gl.uniform1f(p.u("uDt"), DT);
      gl.uniform1f(p.u("uRows"), ROWS);
      gl.uniform2f(p.u("uSway"), (time / SWAY[0]) % 1, (time / SWAY[1]) % 1);
      gl.uniform1f(p.u("uDyeOn"), dyeOn ? 1 : 0);
    };
    const pass = (to: Target | null, w: number, h: number) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, to?.fbo ?? null);
      gl.viewport(0, 0, w, h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const drawPage = (time: number) => {
      const bar = source();
      const aim = aimOf(bar);
      /* the canvas's own box: the layer gives it its size, and a new size clears the paint */
      const W = canvas.clientWidth || innerWidth;
      const H = canvas.clientHeight || innerHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const sc = Math.min(dpr, Math.sqrt(PIXEL_BUDGET / (W * H)));
      const cw = Math.max(1, Math.round(W * sc));
      const ch = Math.max(1, Math.round(H * sc));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const inkScale = Math.min(0.5, sc * 0.5);
      const fieldScale = inkScale * 0.25;
      const at = (k: number) =>
        [Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k))] as const;
      const [w0, h0] = at(inkScale);
      const [wm, hm] = at(inkScale * 0.5);
      const [wf, hf] = at(fieldScale);
      size(gl, tInk, w0, h0);
      size(gl, tM1, wm, hm);
      size(gl, tM2, wm, hm);
      size(gl, tF1, wf, hf);
      size(gl, tF2, wf, hf);
      size(gl, tField, wf, hf);
      /* the card lit now while any of it is on the page, and a pane's bar near enough the window for its paint to show */
      const lit = pDye && !reduced ? (opts.glow?.() ?? null) : null;
      const card =
        lit &&
        lit.rect.width > 0 &&
        lit.rect.right > 0 &&
        lit.rect.left < W &&
        lit.rect.bottom > 0 &&
        lit.rect.top < H
          ? lit
          : null;
      const worn = pDye && !reduced ? (opts.strip?.() ?? null) : null;
      const sr = worn?.rect;
      const strip =
        sr && sr.width > 0 && sr.right > 0 && sr.left < W && sr.bottom > -120 && sr.top < H + 120
          ? sr
          : null;
      if (card || strip) dyeUntil = time + DYE_HOLD;
      else if (dyeOn && time > dyeUntil) {
        dyeOn = false;
        cardTiles = null;
      }
      if (card || strip || dyeOn) {
        size(gl, tDye[0], wf, hf);
        size(gl, tDye[1], wf, hf);
      }
      const fade = reduced ? 1 : Math.min(1, (performance.now() - t0) / 900);
      const paper = opts.dark() ? PAPER_DARK : PAPER_LIGHT;
      remember(time);
      if ((card || strip) && !dyeOn) {
        /* the buffers start clear: what an earlier card left has faded, but a byte of it may still be there */
        gl.clearColor(0, 0, 0, 0);
        for (const t of tDye) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        dyeOn = true;
        dyeAt = time;
      }
      if (card && card.tiles !== cardTiles) {
        cardTiles = card.tiles;
        paintCard(card.tiles, card.rect.width, card.rect.height, cardPx);
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, tCard);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, CARD, CARD, 0, gl.RGBA, gl.UNSIGNED_BYTE, cardPx);
      }
      if (dyeOn && pDye) {
        /* one step of the paint: from the buffer that holds it into the other, which then holds it */
        use(pDye, time, bar, aim, wf, hf, fieldScale);
        const r = card?.rect;
        gl.uniform4f(pDye.u("uCardBox"), r?.left ?? 0, r?.top ?? 0, r?.width ?? 0, r?.height ?? 0);
        gl.uniform1f(pDye.u("uCardRad"), card?.radius ?? 0);
        gl.uniform1f(pDye.u("uEmit"), card ? 1 : 0);
        gl.uniform4f(
          pDye.u("uStrip"),
          strip?.left ?? 0,
          strip?.top ?? 0,
          strip?.width ?? 0,
          strip?.height ?? 0
        );
        /* lighter on light paper, where the same paint shows twice as strongly */
        gl.uniform1f(pDye.u("uStripInk"), strip ? (opts.dark() ? 0.75 : 0.55) : 0);
        gl.uniform1f(pDye.u("uStripLit"), worn?.lit ?? 0);
        gl.uniform1f(pDye.u("uStep"), Math.min(Math.max(time - dyeAt, 0), 0.1));
        gl.uniform2f(pDye.u("uJit"), Math.random() * 256, Math.random() * 256);
        dyeAt = time;
        gl.activeTexture(gl.TEXTURE6);
        gl.bindTexture(gl.TEXTURE_2D, tDye[dyeCur].tex);
        pass(tDye[1 - dyeCur], wf, hf);
        dyeCur = 1 - dyeCur;
        /* the ink and the field read it from here */
        gl.bindTexture(gl.TEXTURE_2D, tDye[dyeCur].tex);
      }
      use(pInk, time, bar, aim, w0, h0, inkScale);
      pass(tInk, w0, h0);
      /* one direction of the blur: src into dst, stepping (dx, dy) of dst's texels */
      gl.useProgram(pBlur.prog);
      gl.activeTexture(gl.TEXTURE0);
      const blur = (src: Target, dst: Target, dx: number, dy: number) => {
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform2f(pBlur.u("uRes"), dst.w, dst.h);
        gl.uniform2f(pBlur.u("uStep"), dx / dst.w, dy / dst.h);
        pass(dst, dst.w, dst.h);
      };
      blur(tInk, tM1, 1.2, 0);
      blur(tM1, tM2, 0, 1.2);
      blur(tM2, tF1, 2.2, 0);
      blur(tF1, tF2, 0, 2.2);
      use(pField, time, bar, aim, wf, hf, fieldScale);
      pass(tField, wf, hf);
      use(pGlass, time, bar, aim, cw, ch, sc);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tInk.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, tM2.tex);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, tF2.tex);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, tField.tex);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform3f(pGlass.u("uPaper"), paper[0], paper[1], paper[2]);
      gl.uniform1f(pGlass.u("uTfar"), opts.dark() ? 0.28 : 0.4);
      gl.uniform1f(pGlass.u("uFade"), fade * fade * (3 - 2 * fade));
      gl.uniform1f(pGlass.u("uGrain"), (Math.floor(time * 24) * 17) % 256);
      pass(null, cw, ch);
      return fade;
    };

    const draw = (now: number) => {
      raf = 0;
      if (stopped || document.hidden) return;
      /* this slow current needs no more than about 30 frames a second, on high-refresh screens too */
      if (drawnOnce && now - lastDrawn < 32) return schedule();
      t0 ||= now;
      const dt = lastDrawn ? (now - lastDrawn) / 1000 : 1 / 60;
      lastDrawn = now;
      if (!reduced) motionTime += Math.min(dt, 0.1);
      let fade = 1;
      /* held still, the frame stands; a change outside the loop draws it again */
      if (!reduced || !drawnOnce || dirty) {
        dirty = false;
        try {
          fade = drawPage(motionTime);
        } catch {
          stop();
          opts.onFailure?.();
          return;
        }
        opts.onFrame?.(atSource);
        if (!drawnOnce) {
          drawnOnce = true;
          opts.onFirstFrame?.();
        }
      }
      if (!reduced || fade < 1) schedule();
    };
    const schedule = () => {
      if (!raf && !stopped && !document.hidden) raf = requestAnimationFrame(draw);
    };
    const refresh = () => {
      dirty = true;
      schedule();
    };
    /* the clock stops while the tab is hidden, so nothing catches up or jumps on return */
    const visible = () => {
      if (document.hidden) {
        hiddenAt = performance.now();
        cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      if (hiddenAt && t0) {
        const gap = performance.now() - hiddenAt;
        t0 += gap;
        lastDrawn += gap;
      }
      hiddenAt = 0;
      schedule();
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", visible);
      removeEventListener("resize", refresh);
      removeEventListener("scroll", refresh);
      /* every owned object goes, but never the context: a browser that restores it can start the water again on the
         same canvas, and the compiled programs stay with it */
      release();
    };
    document.addEventListener("visibilitychange", visible);
    addEventListener("resize", refresh);
    addEventListener("scroll", refresh, { passive: true });
    schedule();
    return {
      stop,
      refresh,
      reseed() {
        remembered = false;
        refresh();
      },
      motion() {
        reduced = !!opts.reduced?.();
        /* held still, a card's paint leaves the water at once rather than stand in a frame */
        if (reduced) {
          dyeOn = false;
          cardTiles = null;
        }
        lastDrawn = 0;
        refresh();
      },
      glows: !!pDye
    };
  } catch {
    release();
    return null;
  }
}
