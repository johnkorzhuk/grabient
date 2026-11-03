/* A palette's effect as H.264, in one module with no C library and no imports, for the Worker and the browser alike:
   the fluted glass's, the blob's, the silk's and the rosette's pixels (engine/glass-render.ts's glassRenderer,
   engine/blob.ts's blobRenderer, silk-render.ts's renderSilk and rosette-render.ts's renderRosette, their arithmetic in
   single precision and wasm SIMD, within a level of theirs) and the papercut's (papercut-render.ts's renderPapercut,
   its own double precision two pixels at a time, its bytes, its sin, cos and exp within an ulp of V8's), finished with
   the soft and the grain as fx-finish.ts's finishPixels finishes a frame, BT.709 YUV 4:2:0 written as they are drawn,
   and minih264 (CC0, lieff/minih264, patched for the level, the Constrained Baseline flags and the colors' VUI; its
   SSE2 code through emscripten's SSE headers) to code them.

   JS says where an effect stands in each frame (the glass's discs, the blob's balls, the silk's folds, the rosette's
   petals, the papercut's hills, waves and light: engine code, which moves them) and this draws it. One encoder an
   instance: create(), a setup, the finish's setups where the clip has a soft or a grain, then per frame a draw and
   frame(). */
#include <wasm_simd128.h>

static int grabient_fps = 0;
static int grabient_primaries = 1;
static int grabient_transfer = 1;
static int grabient_matrix = 1;
#define GRABIENT_FPS grabient_fps
#define GRABIENT_PRIMARIES grabient_primaries
#define GRABIENT_TRANSFER grabient_transfer
#define GRABIENT_MATRIX grabient_matrix
#define H264E_MAX_THREADS 0
#define H264E_SVC_API 0
#define H264E_ENABLE_DENOISE 0
#define MINIH264_IMPLEMENTATION
#include "minih264e.h"

#define EXPORT(name) __attribute__((export_name(#name)))

extern unsigned char __heap_base;
static unsigned char *top = &__heap_base;

/* n bytes, 64-aligned, growing the memory as it fills; 0 where it cannot */
static void *take(unsigned n) {
  unsigned char *at = (unsigned char *)(((unsigned)top + 63) & ~63u);
  unsigned end = (unsigned)at + n;
  unsigned have = __builtin_wasm_memory_size(0) * 65536u;
  if (end < (unsigned)at) return 0;
  if (end > have && __builtin_wasm_memory_grow(0, (end - have + 65535) / 65536) == (unsigned)-1) return 0;
  top = at + n;
  return at;
}

static inline double dmax(double a, double b) { return a > b ? a : b; }
static inline float fmaxs(float a, float b) { return a > b ? a : b; }
static inline float fmins(float a, float b) { return a < b ? a : b; }
static inline double dmin(double a, double b) { return a < b ? a : b; }
static inline double clampd(double v, double lo, double hi) { return v < lo ? lo : v > hi ? hi : v; }
static inline int clampi(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }

/* Math.round: the nearest whole number, a half up */
static inline double jsRound(double x) {
  double r = __builtin_floor(x);
  return x - r >= 0.5 ? r + 1 : r;
}

/* What JS hands over: a frame's discs or balls, the blur's taps */
static double params[4096];
EXPORT(params)
double *paramsAt(void) { return params; }

/* ---------------------------------------------------------------- the encoder, and the frame's planes */

static H264E_persist_t *enc;
static H264E_scratch_t *scratch;
static H264E_create_param_t cp;
static H264E_run_param_t rp;
static H264E_io_yuv_t io;
/* a frame's pixels, four bytes each: the glass's map while it is set up, then, for a clip with a soft, each frame's
   own RGBA before it is finished, or, where its blur runs at a half or a quarter of the frame's resolution, the
   averaged frame (finish_setup), which at a half takes the bytes of a frame four pixels wider and taller */
static unsigned char *pixels;
/* whether a drawing keeps its RGB, finished, for a test to read, and where */
static int keepRgb;
static unsigned char *rgbOut;
static int W, H, N;
static unsigned char *coded;
static int persistBytes;

/* An encoder for frames of width by height (even), `fps` frames a second (for the level and the stream's timing), a
   key frame every `gop` (0 the first alone), `speed` 0 (best) to 10, at a constant quantizer `qp` (10 to 51); then the
   colors' tags (H.273: primaries, transfer, matrix). The pixels' address, or 0 where it could not. */
EXPORT(create)
int create(int width, int height, int fps, int gop, int speed, int qp, int primaries, int transfer, int matrix) {
  int persist, scratchBytes;
  if (enc || (width | height) & 1 || width <= 0 || height <= 0) return 0;
  grabient_fps = fps;
  grabient_primaries = primaries;
  grabient_transfer = transfer;
  grabient_matrix = matrix;
  cp.width = width;
  cp.height = height;
  cp.gop = gop;
  cp.const_input_flag = 1;
  if (H264E_sizeof(&cp, &persist, &scratchBytes)) return 0;
  enc = take(persist);
  persistBytes = persist;
  scratch = take(scratchBytes);
  W = width;
  H = height;
  N = W * H;
  pixels = take(4 * (W + 4) * (H + 4));
  /* rows padded to 32 bytes: the SIMD code reads 8-aligned rows */
  io.stride[0] = (W + 31) & ~31;
  io.stride[1] = io.stride[0] / 2;
  io.stride[2] = io.stride[0] / 2;
  io.yuv[0] = take(io.stride[0] * H);
  io.yuv[1] = take(io.stride[1] * H / 2);
  io.yuv[2] = take(io.stride[2] * H / 2);
  if (!enc || !scratch || !pixels || !io.yuv[2] || H264E_init(enc, &cp)) return 0;
  rp.encode_speed = speed;
  rp.qp_min = qp;
  rp.qp_max = qp;
  rp.desired_frame_bytes = N;
  return (int)pixels;
}

/* Whether drawings keep their RGB, three bytes a pixel, as well as writing the planes: where they keep it, or 0 where
   the memory is short. */
EXPORT(keep_rgb)
int keep_rgb(int on) {
  keepRgb = on;
  if (on && !rgbOut) rgbOut = take(N * 3);
  if (!rgbOut) keepRgb = 0;
  return (int)rgbOut;
}

/* BT.709, limited range, rounded, in 16.16 fixed point */
#define FIX(v) ((int)((v) * 65536.0 + ((v) < 0 ? -0.5 : 0.5)))
#define KR 0.2126
#define KB 0.0722
#define KG (1.0 - KR - KB)
#define YS (219.0 / 255.0)
#define CS (224.0 / 255.0)
static const int yr = FIX(KR * YS), yg = FIX(KG * YS), yb = FIX(KB * YS);
static const int ur = FIX(-KR / (2 * (1 - KB)) * CS), ug = FIX(-KG / (2 * (1 - KB)) * CS), ub = FIX(0.5 * CS);
static const int vr = FIX(0.5 * CS), vg = FIX(-KG / (2 * (1 - KR)) * CS), vb = FIX(-KB / (2 * (1 - KR)) * CS);

/* BT.709's luma and chroma weights for 0 to 255 a channel, chroma's a quarter each: a 2 by 2 block's mean */
static const float kYr = KR * YS, kYg = KG * YS, kYb = KB * YS;
static const float kUr = -KR / (2 * (1 - KB)) * CS / 4, kUg = -KG / (2 * (1 - KB)) * CS / 4, kUb = 0.5 * CS / 4;
static const float kVr = 0.5 * CS / 4, kVg = -KG / (2 * (1 - KR)) * CS / 4, kVb = -KB / (2 * (1 - KR)) * CS / 4;

/* four pixels' R, G and B (lanes 0 to 2 of each) as a vector of each, a pixel a lane */
static inline void planar(v128_t p0, v128_t p1, v128_t p2, v128_t p3, v128_t *R, v128_t *G, v128_t *B) {
  v128_t t0 = wasm_i32x4_shuffle(p0, p1, 0, 4, 1, 5);
  v128_t t1 = wasm_i32x4_shuffle(p2, p3, 0, 4, 1, 5);
  v128_t t2 = wasm_i32x4_shuffle(p0, p1, 2, 6, 2, 6);
  v128_t t3 = wasm_i32x4_shuffle(p2, p3, 2, 6, 2, 6);
  *R = wasm_i32x4_shuffle(t0, t1, 0, 1, 4, 5);
  *G = wasm_i32x4_shuffle(t0, t1, 2, 3, 6, 7);
  *B = wasm_i32x4_shuffle(t2, t3, 0, 1, 4, 5);
}

/* the weighed sum plus `at`, a half up to a whole number (all of it above 0) */
static inline v128_t weigh(v128_t R, v128_t G, v128_t B, float r, float g, float b, float at) {
  v128_t v = wasm_f32x4_add(wasm_f32x4_add(wasm_f32x4_mul(R, wasm_f32x4_splat(r)), wasm_f32x4_mul(G, wasm_f32x4_splat(g))),
                            wasm_f32x4_add(wasm_f32x4_mul(B, wasm_f32x4_splat(b)), wasm_f32x4_splat(at)));
  return wasm_i32x4_trunc_sat_f32x4(v);
}

static inline v128_t bytes(v128_t v) { return wasm_u8x16_narrow_i16x8(wasm_i16x8_narrow_i32x4(v, v), wasm_i16x8_narrow_i32x4(v, v)); }

/* The grain (grain.ts): its tile's specks as what a pixel keeps of itself and what its speck adds, (255 - a) / 255
   and v a / 255 for a speck of alpha a, black or white (v 0 or 255), so a pixel p becomes the whole number nearest
   p keep + add, which is grainOver's (p (255 - a) + v a) / 255 rounded: that quotient is never within 1/510 of a half,
   and single precision errs by far less. */
#define GRAIN_SIDE 128
static float *gKeep, *gAdd;
static int grainOn;

static inline v128_t grained(v128_t p, int k) {
  return wasm_f32x4_nearest(wasm_f32x4_add(wasm_f32x4_mul(p, wasm_f32x4_splat(gKeep[k])), wasm_f32x4_splat(gAdd[k])));
}

/* Four pixels of two rows from (x, y): their R, G, B as whole numbers 0 to 255 in lanes 0 to 2, `a` above `b`; `n`
   of them written (4, or 2 at a row's end, the last two the first's again), the grain over them where the clip has
   one, into the planes and kept where asked. */
static inline void put(int x, int y, int n, v128_t a0, v128_t a1, v128_t a2, v128_t a3, v128_t b0, v128_t b1, v128_t b2,
                       v128_t b3) {
  if (grainOn) {
    /* the tile's corner at the picture's: x is even, so the four lie in one row of the tile */
    int ka = ((y & (GRAIN_SIDE - 1)) << 7) | (x & (GRAIN_SIDE - 1));
    int kb = (((y + 1) & (GRAIN_SIDE - 1)) << 7) | (x & (GRAIN_SIDE - 1));
    a0 = grained(a0, ka);
    a1 = grained(a1, ka + 1);
    b0 = grained(b0, kb);
    b1 = grained(b1, kb + 1);
    if (n == 4) {
      a2 = grained(a2, ka + 2);
      a3 = grained(a3, ka + 3);
      b2 = grained(b2, kb + 2);
      b3 = grained(b3, kb + 3);
    } else {
      a2 = a0;
      a3 = a1;
      b2 = b0;
      b3 = b1;
    }
  }
  v128_t R, G, B, R2, G2, B2;
  planar(a0, a1, a2, a3, &R, &G, &B);
  planar(b0, b1, b2, b3, &R2, &G2, &B2);
  v128_t ya = bytes(weigh(R, G, B, kYr, kYg, kYb, 16.5f));
  v128_t yb = bytes(weigh(R2, G2, B2, kYr, kYg, kYb, 16.5f));
  unsigned char *Y = io.yuv[0] + y * io.stride[0] + x;
  /* each block's sum in lanes 0 and 2 */
  R = wasm_f32x4_add(R, R2);
  G = wasm_f32x4_add(G, G2);
  B = wasm_f32x4_add(B, B2);
  R = wasm_f32x4_add(R, wasm_i32x4_shuffle(R, R, 1, 0, 3, 2));
  G = wasm_f32x4_add(G, wasm_i32x4_shuffle(G, G, 1, 0, 3, 2));
  B = wasm_f32x4_add(B, wasm_i32x4_shuffle(B, B, 1, 0, 3, 2));
  v128_t u = weigh(R, G, B, kUr, kUg, kUb, 128.5f);
  v128_t v = weigh(R, G, B, kVr, kVg, kVb, 128.5f);
  int c = (y / 2) * io.stride[1] + x / 2;
  if (n == 4) {
    wasm_v128_store32_lane(Y, ya, 0);
    wasm_v128_store32_lane(Y + io.stride[0], yb, 0);
    io.yuv[1][c + 1] = (unsigned char)wasm_i32x4_extract_lane(u, 2);
    io.yuv[2][c + 1] = (unsigned char)wasm_i32x4_extract_lane(v, 2);
  } else {
    wasm_v128_store16_lane(Y, ya, 0);
    wasm_v128_store16_lane(Y + io.stride[0], yb, 0);
  }
  io.yuv[1][c] = (unsigned char)wasm_i32x4_extract_lane(u, 0);
  io.yuv[2][c] = (unsigned char)wasm_i32x4_extract_lane(v, 0);
  if (keepRgb) {
    v128_t q[8] = {a0, a1, a2, a3, b0, b1, b2, b3};
    for (int k = 0; k < 8; k++) {
      if ((k & 3) >= n) continue;
      unsigned char *at = rgbOut + 3 * ((y + (k >> 2)) * W + x + (k & 3));
      at[0] = (unsigned char)wasm_f32x4_extract_lane(q[k], 0);
      at[1] = (unsigned char)wasm_f32x4_extract_lane(q[k], 1);
      at[2] = (unsigned char)wasm_f32x4_extract_lane(q[k], 2);
    }
  }
}

/* The planes the last drawing wrote, coded at quantizer `qp`: a key frame where `key`, else as the GOP says. A held
   effect codes one drawing again and again. The coded bytes' length, or minus minih264's error. */
EXPORT(frame)
int frame(int key, int qp) {
  int size, error;
  rp.frame_type = key ? H264E_FRAME_TYPE_KEY : H264E_FRAME_TYPE_DEFAULT;
  rp.qp_min = qp;
  rp.qp_max = qp;
  error = H264E_encode(enc, scratch, &rp, &io, &coded, &size);
  return error ? -error : size;
}

/* Where the last frame's coded bytes are: Annex B, start codes and all */
EXPORT(out)
int out(void) { return (int)coded; }

/* The encoder's state, its reference frame and its counts, all within one block: a part of a clip hands it to the
   next, whose encoder, made alike, lays its memory out alike, takes it in and goes on from the same frame, so a clip
   drawn in parts is one stream with one key frame. Its address and its length. */
EXPORT(state)
int state(void) { return (int)enc; }
EXPORT(state_size)
int state_size(void) { return persistBytes; }

/* ---------------------------------------------------------------- the finish (fx-finish.ts's finishPixels) */

/* Whether the clip has a soft: then each frame is drawn as RGBA, its own pixels with no ground under them as the
   site's layer holds them, blurred, laid over what lies under it, and only then written into the planes. Without, a
   drawing goes straight to the planes. */
static int fSoft;
/* the resolution the blur runs at: 1, the frame's own, its pixels kept in `pixels` as bytes; or 2 or 4, the frame
   averaged f by f into fSmall as it is drawn, blurred there and drawn back up bilinearly, as a browser's blur draws a
   wide one (the boxes then match the frame's own blur less what the averaging and the drawing back spread) */
static int fScale;
/* whether drawings carry an alpha of their own (the blob's layer), so their colors are premultiplied, else opaque */
static int fLayer;
/* the blur's three boxes, each reaching `fL` before a sample and `fR` after it (none where the blur is too small),
   and the room either side of a line they spread into */
static int fBoxes, fL[3], fR[3], fPad;
/* what lies under the blurred frame: the palette's gradient, four bytes a pixel, or one color (the clip's backdrop,
   0 to 255 a channel) where none is */
static unsigned char *fUnder;
static v128_t fBack;
/* the blur's lines: four rows at once across, eight columns at once down, in three buffers so no pass reads what
   another line left */
static v128_t *fInH, *fInV, *fP1, *fP2;
/* the averaged frame, premultiplied, its sides fSw by fSh with a border of one sample all round, which the blur spreads
   into and the drawing back reads at the picture's edge; and where each pixel reads it: its sample and its share past
   it, across and down */
static int fSw, fSh, fStride;
static v128_t *fSmall;
static int *fJ0, *fI0;
static v128_t *fFx;
static float *fFy;
/* two rows of the averaged frame read down to two rows of pixels, which their pixels read across */
static v128_t *fRow0, *fRow1;
#define SMALL(i, j) fSmall[((i) + 1) * fStride + (j) + 1]

#define BYTE wasm_f32x4_splat(255.0f)
#define PER_BYTE (1.0f / 255.0f)

/* a pixel's colors times its alpha, its alpha kept */
static inline v128_t premultiplied(v128_t p) {
  v128_t k = wasm_f32x4_mul(wasm_i32x4_shuffle(p, p, 3, 3, 3, 3), wasm_f32x4_splat(PER_BYTE));
  return wasm_f32x4_mul(p, wasm_f32x4_replace_lane(k, 3, 1.0f));
}

/* Where the frame's pixels go: four of two rows as `put` takes them, their alpha in lane 3, kept to be finished. At
   the frame's own resolution, as bytes, straight alpha, in `pixels`; else each 2 by 2 block's (or each 4 by 4 block's,
   whose two halves come in two calls) mean, premultiplied, in fSmall, a block the picture's edge cuts clear past it. */
static inline void keepPixels(int x, int y, int n, v128_t a0, v128_t a1, v128_t a2, v128_t a3, v128_t b0, v128_t b1,
                              v128_t b2, v128_t b3) {
  if (fScale == 1) {
    v128_t top = wasm_u8x16_narrow_i16x8(
        wasm_i16x8_narrow_i32x4(wasm_i32x4_trunc_sat_f32x4(a0), wasm_i32x4_trunc_sat_f32x4(a1)),
        wasm_i16x8_narrow_i32x4(wasm_i32x4_trunc_sat_f32x4(a2), wasm_i32x4_trunc_sat_f32x4(a3)));
    v128_t bottom = wasm_u8x16_narrow_i16x8(
        wasm_i16x8_narrow_i32x4(wasm_i32x4_trunc_sat_f32x4(b0), wasm_i32x4_trunc_sat_f32x4(b1)),
        wasm_i16x8_narrow_i32x4(wasm_i32x4_trunc_sat_f32x4(b2), wasm_i32x4_trunc_sat_f32x4(b3)));
    unsigned char *at = pixels + 4 * (y * W + x);
    if (n == 4) {
      wasm_v128_store(at, top);
      wasm_v128_store(at + 4 * W, bottom);
    } else {
      wasm_v128_store64_lane(at, top, 0);
      wasm_v128_store64_lane(at + 4 * W, bottom, 0);
    }
    return;
  }
  if (fLayer) {
    a0 = premultiplied(a0);
    a1 = premultiplied(a1);
    b0 = premultiplied(b0);
    b1 = premultiplied(b1);
    if (n == 4) {
      a2 = premultiplied(a2);
      a3 = premultiplied(a3);
      b2 = premultiplied(b2);
      b3 = premultiplied(b3);
    }
  }
  v128_t left = wasm_f32x4_add(wasm_f32x4_add(a0, a1), wasm_f32x4_add(b0, b1));
  v128_t right = n == 4 ? wasm_f32x4_add(wasm_f32x4_add(a2, a3), wasm_f32x4_add(b2, b3)) : wasm_f32x4_splat(0);
  if (fScale == 2) {
    const v128_t quarter = wasm_f32x4_splat(0.25f);
    SMALL(y >> 1, x >> 1) = wasm_f32x4_mul(left, quarter);
    if (n == 4) SMALL(y >> 1, (x >> 1) + 1) = wasm_f32x4_mul(right, quarter);
  } else {
    v128_t mean = wasm_f32x4_mul(wasm_f32x4_add(left, right), wasm_f32x4_splat(1.0f / 16));
    v128_t *at = &SMALL(y >> 2, x >> 2);
    *at = y & 2 ? wasm_f32x4_add(*at, mean) : mean;
  }
}

/* Where a drawing's pixels go, four of two rows as `put` takes them, for an effect with no alpha of its own (the glass,
   the silk, the rosette): kept, opaque, to be finished where the clip has a soft, else to the planes. */
static inline v128_t opaque(v128_t p) { return wasm_f32x4_replace_lane(p, 3, 255.0f); }
static inline void emitOpaque(int x, int y, int n, v128_t a0, v128_t a1, v128_t a2, v128_t a3, v128_t b0, v128_t b1,
                              v128_t b2, v128_t b3) {
  if (fSoft)
    keepPixels(x, y, n, opaque(a0), opaque(a1), opaque(a2), opaque(a3), opaque(b0), opaque(b1), opaque(b2), opaque(b3));
  else
    put(x, y, n, a0, a1, a2, a3, b0, b1, b2, b3);
}

/* The grain's tile, from params read as bytes: GRAIN_SIDE by GRAIN_SIDE specks, each its alpha (an even number, 0 to
   254) with its low bit set where it is white, as grain.ts's grainSpeck and grainAlpha make them at the clip's grain.
   1, or 0 where the memory is short. */
EXPORT(grain_setup)
int grain_setup(void) {
  const unsigned char *tile = (const unsigned char *)params;
  gKeep = take(GRAIN_SIDE * GRAIN_SIDE * 4);
  gAdd = take(GRAIN_SIDE * GRAIN_SIDE * 4);
  if (!gKeep || !gAdd) return 0;
  for (int k = 0; k < GRAIN_SIDE * GRAIN_SIDE; k++) {
    int a = tile[k] & 254;
    gKeep[k] = (float)((255.0 - a) / 255.0);
    gAdd[k] = (float)((tile[k] & 1 ? 255.0 * a : 0.0) / 255.0);
  }
  grainOn = 1;
  return 1;
}

/* where pixel x of a side reads that side averaged f by f: the sample before its middle, and its share toward the
   next */
static inline int readAt(int x, int f, float *share) {
  double u = (2.0 * x + 1 - f) / (2.0 * f);
  double j = __builtin_floor(u);
  *share = (float)(u - j);
  return (int)j;
}

/* The soft: the frame blurred at 1/`scale` of its resolution by `boxes` boxes (0 or 3), each reaching l before a sample
   and r after it, then laid over what lies under it: the palette's gradient (`under` 1: params hold its stops' count,
   then the line's dx and dy as linearGradientPixels takes them, then each stop's red, green, blue and place along the
   line), or the color (br, bg, bb) where none is (`under` 0). 1, or 0 where the memory is short. */
EXPORT(finish_setup)
int finish_setup(int scale, int boxes, int l0, int r0, int l1, int r1, int l2, int r2, int under, int br, int bg,
                 int bb) {
  fScale = scale == 2 || scale == 4 ? scale : 1;
  fBoxes = boxes == 3 ? 3 : 0;
  fL[0] = l0;
  fR[0] = r0;
  fL[1] = l1;
  fR[1] = r1;
  fL[2] = l2;
  fR[2] = r2;
  /* a sample either side for the drawing back up, and one more for the running sums' last step */
  fPad = 2;
  for (int i = 0; i < fBoxes; i++) fPad += fL[i] > fR[i] ? fL[i] : fR[i];
  fSw = (W + fScale - 1) / fScale;
  fSh = (H + fScale - 1) / fScale;
  int across = (fSw + 2 * fPad) * 4, down = (fSh + 2 + 2 * fPad) * 8, most = across > down ? across : down;
  fInH = take(across * 16);
  fInV = take(down * 16);
  fP1 = take(most * 16);
  fP2 = take(most * 16);
  if (!fInH || !fInV || !fP1 || !fP2) return 0;
  /* the lines read clear past the picture: what lies there stays 0 */
  __builtin_memset(fInH, 0, across * 16);
  __builtin_memset(fInV, 0, down * 16);
  if (fScale > 1) {
    fStride = fSw + 2;
    /* in the frame's own pixels, which a drawing at a half or a quarter never keeps: (W / 2 + 2) by (H / 2 + 2)
       samples of 16 bytes at a half, fewer at a quarter, within the 4 (W + 4) (H + 4) bytes `create` took; the
       glass's map they held was read at its setup, before this */
    fSmall = (v128_t *)pixels;
    fJ0 = take(W * 4);
    fFx = take(W * 16);
    fI0 = take(H * 4);
    fFy = take(H * 4);
    fRow0 = take(fStride * 16);
    fRow1 = take(fStride * 16);
    if (!fJ0 || !fFx || !fI0 || !fFy || !fRow0 || !fRow1) return 0;
    __builtin_memset(fSmall, 0, fStride * (fSh + 2) * 16);
    for (int x = 0; x < W; x++) {
      float share;
      fJ0[x] = readAt(x, fScale, &share);
      fFx[x] = wasm_f32x4_splat(share);
    }
    for (int y = 0; y < H; y++) fI0[y] = readAt(y, fScale, fFy + y);
  }
  fBack = wasm_f32x4_make((float)br, (float)bg, (float)bb, 0);
  fUnder = 0;
  if (under) {
    fUnder = take(N * 4);
    if (!fUnder) return 0;
    /* linearGradientPixels: each pixel's middle read along the line, the stops blended between their places */
    int n = (int)params[0];
    double dx = params[1], dy = params[2];
    const double *stop = params + 3;
    double length = __builtin_fabs(W * dx) + __builtin_fabs(H * dy);
    if (length == 0) length = 1;
    for (int y = 0, j = 1; y < H; y++) {
      double py = y + 0.5 - H / 2.0;
      for (int x = 0; x < W; x++) {
        double t = ((x + 0.5 - W / 2.0) * dx + py * dy) / length + 0.5;
        unsigned char *at = fUnder + 4 * (y * W + x);
        at[3] = 255;
        if (t <= stop[3] || n == 1 || t >= stop[4 * (n - 1) + 3]) {
          const double *c = t <= stop[3] || n == 1 ? stop : stop + 4 * (n - 1);
          at[0] = (unsigned char)c[0];
          at[1] = (unsigned char)c[1];
          at[2] = (unsigned char)c[2];
          continue;
        }
        /* the first stop at or past t, found from the last pixel's */
        while (j > 1 && stop[4 * (j - 1) + 3] >= t) j--;
        while (j < n - 1 && stop[4 * j + 3] < t) j++;
        const double *a = stop + 4 * (j - 1), *b = stop + 4 * j;
        double span = b[3] - a[3];
        double u = span > 0 ? (t - a[3]) / span : 1;
        at[0] = (unsigned char)jsRound(a[0] + (b[0] - a[0]) * u);
        at[1] = (unsigned char)jsRound(a[1] + (b[1] - a[1]) * u);
        at[2] = (unsigned char)jsRound(a[2] + (b[2] - a[2]) * u);
      }
    }
  }
  fSoft = 1;
  return 1;
}

/* One box over a line of `S` lanes a step, from `from` to `to` (places along the line, 0 its first sample): each the
   mean of `left` before it to `right` after it, which `src` holds; `fPad` places either side of the line are room. */
#define BOX_PASS(name, S)                                                                                             \
  static void name(const v128_t *src, v128_t *dst, int from, int to, int left, int right) {                            \
    v128_t sum[S];                                                                                                     \
    const v128_t inv = wasm_f32x4_splat(1.0f / (float)(left + right + 1));                                             \
    for (int s = 0; s < S; s++) sum[s] = wasm_f32x4_splat(0);                                                          \
    for (int i = from - left; i <= from + right; i++)                                                                  \
      for (int s = 0; s < S; s++) sum[s] = wasm_f32x4_add(sum[s], src[(i + fPad) * S + s]);                            \
    for (int x = from; x < to; x++) {                                                                                  \
      const v128_t *in = src + (x + right + 1 + fPad) * S, *out = src + (x - left + fPad) * S;                         \
      v128_t *d = dst + (x + fPad) * S;                                                                                \
      for (int s = 0; s < S; s++) {                                                                                    \
        d[s] = wasm_f32x4_mul(sum[s], inv);                                                                            \
        sum[s] = wasm_f32x4_add(sum[s], wasm_f32x4_sub(in[s], out[s]));                                                \
      }                                                                                                                \
    }                                                                                                                  \
  }
BOX_PASS(boxAcross, 4)
BOX_PASS(boxDown, 8)

/* The three boxes over a line of n places held in `in` from place 0, out to `m` places past either end: each pass only
   where the passes after it read, spread past the line as a layer's blur spreads past its box before the box clips
   it. The blurred line is in fP1; with no boxes, it is `in`. */
static const v128_t *blurLine(const v128_t *in, int n, int m,
                              void (*pass)(const v128_t *, v128_t *, int, int, int, int)) {
  if (!fBoxes) return in;
  pass(in, fP1, -m - fL[2] - fL[1], n + m + fR[2] + fR[1], fL[0], fR[0]);
  pass(fP1, fP2, -m - fL[2], n + m + fR[2], fL[1], fR[1]);
  pass(fP2, fP1, -m, n + m, fL[2], fR[2]);
  return fP1;
}

/* one pixel's four bytes as floats */
static inline v128_t pixelAt(const unsigned char *p) {
  return wasm_f32x4_convert_u32x4(wasm_u32x4_extend_low_u16x8(wasm_u16x8_extend_low_u8x16(wasm_v128_load32_zero(p))));
}
/* four floats, whole numbers 0 to 255, as one pixel's four bytes */
static inline void pixelTo(unsigned char *p, v128_t v) {
  v128_t i = wasm_i32x4_trunc_sat_f32x4(wasm_f32x4_nearest(v));
  wasm_v128_store32_lane(p, wasm_u8x16_narrow_i16x8(wasm_i16x8_narrow_i32x4(i, i), wasm_i16x8_narrow_i32x4(i, i)), 0);
}

/* a blurred pixel, premultiplied, laid over what lies under it: whole numbers 0 to 255. Where the blur left it opaque,
   as it leaves an opaque frame all but near its edges, nothing under it shows (its share is under a hundredth of a
   level there, which the blur's single precision leaves short of 255 by far less) */
static inline v128_t over(v128_t pre, int x, int y) {
  if (wasm_f32x4_extract_lane(pre, 3) >= 254.99f) return wasm_f32x4_min(wasm_f32x4_nearest(pre), BYTE);
  v128_t under = fUnder ? pixelAt(fUnder + 4 * (y * W + x)) : fBack;
  v128_t keep = wasm_f32x4_sub(wasm_f32x4_splat(1),
                               wasm_f32x4_mul(wasm_i32x4_shuffle(pre, pre, 3, 3, 3, 3), wasm_f32x4_splat(PER_BYTE)));
  return wasm_f32x4_min(wasm_f32x4_nearest(wasm_f32x4_add(pre, wasm_f32x4_mul(under, keep))), BYTE);
}

/* row y of pixels read down from the averaged frame's two rows about it, across all its samples */
static void rowDown(v128_t *out, int y) {
  const v128_t *r0 = fSmall + (fI0[y] + 1) * fStride, *r1 = r0 + fStride;
  v128_t fy = wasm_f32x4_splat(fFy[y]);
  for (int j = 0; j < fStride; j++) out[j] = wasm_f32x4_add(r0[j], wasm_f32x4_mul(wasm_f32x4_sub(r1[j], r0[j]), fy));
}
/* pixel x of a row read down, read across */
static inline v128_t upAt(const v128_t *row, int x) {
  const v128_t *at = row + fJ0[x] + 1;
  return wasm_f32x4_add(at[0], wasm_f32x4_mul(wasm_f32x4_sub(at[1], at[0]), fFx[x]));
}

/* The frame finished at its own resolution: premultiplied, blurred across (four rows at once), kept so in `pixels`,
   blurred down (eight columns at once), laid over what lies under it and written into the planes, the grain over it
   there. */
static void finishWhole(void) {
  for (int y0 = 0; y0 < H; y0 += 4) {
    int rows = H - y0 < 4 ? H - y0 : 4;
    for (int x = 0; x < W; x++)
      for (int r = 0; r < rows; r++) fInH[(x + fPad) * 4 + r] = premultiplied(pixelAt(pixels + 4 * ((y0 + r) * W + x)));
    const v128_t *done = blurLine(fInH, W, 0, boxAcross);
    for (int x = 0; x < W; x++)
      for (int r = 0; r < rows; r++) pixelTo(pixels + 4 * ((y0 + r) * W + x), done[(x + fPad) * 4 + r]);
  }
  for (int x0 = 0; x0 < W; x0 += 8) {
    int cols = W - x0 < 8 ? W - x0 : 8;
    for (int y = 0; y < H; y++)
      for (int c = 0; c < cols; c++) fInV[(y + fPad) * 8 + c] = pixelAt(pixels + 4 * (y * W + x0 + c));
    const v128_t *done = blurLine(fInV, H, 0, boxDown);
    for (int y = 0; y < H; y += 2) {
      for (int c = 0; c < cols; c += 4) {
        int n = cols - c < 4 ? cols - c : 4;
        v128_t q[8];
        for (int k = 0; k < 8; k++) {
          int cx = c + ((k & 3) < n ? (k & 3) : (k & 3) - 2), cy = y + (k >> 2);
          q[k] = over(done[(cy + fPad) * 8 + cx], x0 + cx, cy);
        }
        put(x0 + c, y, n, q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7]);
      }
    }
  }
}

/* The frame finished from its average: blurred across (four rows at once) and down (eight columns at once), each out
   to the border, then each pixel read back up, laid over what lies under it and written into the planes, the grain
   over it there. */
static void finishSmall(void) {
  for (int i0 = 0; i0 < fSh; i0 += 4) {
    int rows = fSh - i0 < 4 ? fSh - i0 : 4;
    for (int j = 0; j < fSw; j++)
      for (int r = 0; r < rows; r++) fInH[(j + fPad) * 4 + r] = SMALL(i0 + r, j);
    const v128_t *done = blurLine(fInH, fSw, 1, boxAcross);
    for (int j = -1; j <= fSw; j++)
      for (int r = 0; r < rows; r++) SMALL(i0 + r, j) = done[(j + fPad) * 4 + r];
  }
  for (int j0 = -1; j0 <= fSw; j0 += 8) {
    int cols = fSw + 1 - j0 < 8 ? fSw + 1 - j0 : 8;
    for (int i = 0; i < fSh; i++)
      for (int c = 0; c < cols; c++) fInV[(i + fPad) * 8 + c] = SMALL(i, j0 + c);
    const v128_t *done = blurLine(fInV, fSh, 1, boxDown);
    for (int i = -1; i <= fSh; i++)
      for (int c = 0; c < cols; c++) SMALL(i, j0 + c) = done[(i + fPad) * 8 + c];
  }
  for (int y = 0; y < H; y += 2) {
    const v128_t *a = fRow0, *b = fRow1;
    rowDown(fRow0, y);
    rowDown(fRow1, y + 1);
    int x = 0;
    for (; x + 4 <= W; x += 4)
      put(x, y, 4, over(upAt(a, x), x, y), over(upAt(a, x + 1), x + 1, y), over(upAt(a, x + 2), x + 2, y),
          over(upAt(a, x + 3), x + 3, y), over(upAt(b, x), x, y + 1), over(upAt(b, x + 1), x + 1, y + 1),
          over(upAt(b, x + 2), x + 2, y + 1), over(upAt(b, x + 3), x + 3, y + 1));
    if (x < W) {
      v128_t a0 = over(upAt(a, x), x, y), a1 = over(upAt(a, x + 1), x + 1, y);
      v128_t b0 = over(upAt(b, x), x, y + 1), b1 = over(upAt(b, x + 1), x + 1, y + 1);
      put(x, y, 2, a0, a1, a0, a1, b0, b1, b0, b1);
    }
  }
}

static void finishFrame(void) {
  if (fScale == 1)
    finishWhole();
  else
    finishSmall();
}

/* ---------------------------------------------------------------- the fluted glass (glassRenderer) */

/* each pixel's read: its texel's index, its share across and down, and the ribs' light; 16 bytes, one load */
typedef struct {
  int idx;
  float ax, ay, sh;
} GlassRead;

static int gfw, gfh, gr;
static GlassRead *gRead;
/* the field, four floats a texel (R, G, B and nothing), and the blur's other half */
static float *gF, *gTmp;
/* the blur as weights on whole texels either side, gr each way: the player's bilinear pairs folded */
static float gK[64];

/* Each pixel's read through the ribs, from the map at pixels (glassMap's bytes for the box's window), and the blur's
   taps from params (offset, weight pairs): glassRenderer's setup. 0 where the memory is short. */
EXPORT(glass_setup)
int glass_setup(int fw, int fh, int nT, double regionX, double regionY, double scale, double q, int windowX,
                int windowY) {
  gfw = fw;
  gfh = fh;
  /* the farthest tap's reach in whole texels, one more for its pair */
  double reach = 0;
  for (int k = 1; k < nT; k++) reach = dmax(reach, params[2 * k]);
  gr = (int)__builtin_ceil(reach) + 1;
  if (2 * gr + 1 > 64) return 0;
  double K[64] = {0};
  K[gr] += params[1];
  for (int k = 1; k < nT; k++) {
    for (int sgn = -1; sgn <= 1; sgn += 2) {
      double o = sgn * params[2 * k];
      double fl = __builtin_floor(o);
      double fr = o - fl;
      K[(int)fl + gr] += params[2 * k + 1] * (1 - fr);
      K[(int)fl + 1 + gr] += params[2 * k + 1] * fr;
    }
  }
  for (int j = 0; j <= 2 * gr; j++) gK[j] = (float)K[j];
  gRead = take(N * sizeof(GlassRead));
  gF = take(fw * fh * 16);
  gTmp = take(fw * fh * 16);
  if (!gRead || !gF || !gTmp) return 0;
  const unsigned char *map = pixels;
  for (int y = 0, i = 0; y < H; y++) {
    for (int x = 0; x < W; x++, i++) {
      int p = 4 * i;
      double sx = x + windowX + __builtin_floor(scale * (map[p] / 255.0 - 0.5) + 0.5);
      double sy = y + windowY + __builtin_floor(scale * (map[p + 1] / 255.0 - 0.5) + 0.5);
      double fxp = (sx + 0.5 - regionX) / q - 0.5;
      double fyp = (sy + 0.5 - regionY) / q - 0.5;
      double x0 = __builtin_floor(fxp);
      double y0 = __builtin_floor(fyp);
      double ax = fxp - x0;
      double ay = fyp - y0;
      if (x0 < 0) {
        x0 = 0;
        ax = 0;
      }
      if (x0 > fw - 2) {
        x0 = fw - 2;
        ax = 1;
      }
      if (y0 < 0) {
        y0 = 0;
        ay = 0;
      }
      if (y0 > fh - 2) {
        y0 = fh - 2;
        ay = 1;
      }
      gRead[i].idx = 4 * ((int)y0 * fw + (int)x0);
      gRead[i].ax = (float)ax;
      gRead[i].ay = (float)ay;
      gRead[i].sh = (float)((2.0 * map[p + 2]) / 255.0);
    }
  }
  return 1;
}

/* the blur along one way: each texel the weighed sum of gr texels either side, edges clamped */
static void glassBlur(const float *src, float *dst, int along) {
  int n = along ? gfw : gfh;
  int lines = along ? gfh : gfw;
  int stepI = along ? 4 : 4 * gfw;
  int stepL = along ? 4 * gfw : 4;
  int taps = 2 * gr + 1;
  v128_t k[64];
  for (int j = 0; j < taps; j++) k[j] = wasm_f32x4_splat(gK[j]);
  for (int l = 0; l < lines; l++) {
    const float *line = src + l * stepL;
    float *to = dst + l * stepL;
    for (int x = 0; x < n; x++) {
      v128_t acc = wasm_f32x4_splat(0);
      if (x >= gr && x + gr < n) {
        const float *at = line + (x - gr) * stepI;
        for (int j = 0; j < taps; j++, at += stepI) acc = wasm_f32x4_add(acc, wasm_f32x4_mul(k[j], wasm_v128_load(at)));
      } else {
        for (int j = 0; j < taps; j++)
          acc = wasm_f32x4_add(acc, wasm_f32x4_mul(k[j], wasm_v128_load(line + clampi(x - gr + j, 0, n - 1) * stepI)));
      }
      wasm_v128_store(to + x * stepI, acc);
    }
  }
}

static inline v128_t glassPixel(const GlassRead *r) {
  const float *t = gF + r->idx;
  v128_t t00 = wasm_v128_load(t), t10 = wasm_v128_load(t + 4);
  v128_t t01 = wasm_v128_load(t + 4 * gfw), t11 = wasm_v128_load(t + 4 * gfw + 4);
  v128_t ax = wasm_f32x4_splat(r->ax), ay = wasm_f32x4_splat(r->ay);
  v128_t top = wasm_f32x4_add(t00, wasm_f32x4_mul(wasm_f32x4_sub(t10, t00), ax));
  v128_t bottom = wasm_f32x4_add(t01, wasm_f32x4_mul(wasm_f32x4_sub(t11, t01), ax));
  v128_t v = wasm_f32x4_nearest(wasm_f32x4_add(top, wasm_f32x4_mul(wasm_f32x4_sub(bottom, top), ay)));
  v = wasm_f32x4_min(wasm_f32x4_mul(v, wasm_f32x4_splat(r->sh)), wasm_f32x4_splat(255));
  return wasm_f32x4_nearest(v);
}

/* The frame into the planes: the ground (br, bg, bb, 0 to 1), the discs from params (X, Y, R in texels, then their
   color 0 to 1, six numbers each), melted at the field's `core`, blurred, and read through the ribs. */
EXPORT(glass_frame)
void glass_frame(int nDiscs, double core, double br, double bg, double bb) {
  int n = gfw * gfh;
  /* the field holds 0 to 255 a channel: the blur and the reads are linear, so the scale comes first */
  v128_t ground = wasm_f32x4_make((float)(255 * br), (float)(255 * bg), (float)(255 * bb), 0);
  for (int i = 0; i < n; i++) wasm_v128_store(gF + 4 * i, ground);
  for (int d = 0; d < nDiscs; d++) {
    const double *disc = params + 6 * d;
    double X = disc[0], Y = disc[1], R = disc[2];
    v128_t color = wasm_f32x4_make((float)(255 * disc[3]), (float)(255 * disc[4]), (float)(255 * disc[5]), 0);
    double yTo = dmin(gfh, __builtin_ceil(Y + R + 1)), xTo = dmin(gfw, __builtin_ceil(X + R + 1));
    for (double yf = dmax(0, __builtin_floor(Y - R)); yf < yTo; yf++) {
      for (double xf = dmax(0, __builtin_floor(X - R)); xf < xTo; xf++) {
        double ex = xf + 0.5 - X;
        double ey = yf + 0.5 - Y;
        double r = __builtin_sqrt(ex * ex + ey * ey) / R;
        if (r >= 1) continue;
        float a = (float)(r <= core ? 1 : (1 - r) / (1 - core));
        float *f = gF + 4 * ((int)yf * gfw + (int)xf);
        wasm_v128_store(f, wasm_f32x4_add(wasm_f32x4_mul(color, wasm_f32x4_splat(a)),
                                          wasm_f32x4_mul(wasm_v128_load(f), wasm_f32x4_splat(1 - a))));
      }
    }
  }
  glassBlur(gF, gTmp, 1);
  glassBlur(gTmp, gF, 0);
  for (int y = 0; y < H; y += 2) {
    const GlassRead *a = gRead + y * W, *b = a + W;
    int x = 0;
    for (; x + 4 <= W; x += 4)
      emitOpaque(x, y, 4, glassPixel(a + x), glassPixel(a + x + 1), glassPixel(a + x + 2), glassPixel(a + x + 3),
                 glassPixel(b + x), glassPixel(b + x + 1), glassPixel(b + x + 2), glassPixel(b + x + 3));
    if (x < W) {
      v128_t a0 = glassPixel(a + x), a1 = glassPixel(a + x + 1), b0 = glassPixel(b + x), b1 = glassPixel(b + x + 1);
      emitOpaque(x, y, 2, a0, a1, a0, a1, b0, b1, b0, b1);
    }
  }
  if (fSoft) finishFrame();
}

/* ---------------------------------------------------------------- the blob (blobRenderer, on a ground) */

/* blob.ts's numbers: the melt, its lift, and the frost's noise */
#define MELT 0.24
#define SLOPE 2.2
#define CONTRAST 2.2
#define SPREAD (0.292 / 255)

/* each pixel's read: the melt's texel, its share across and down, and its speckle; 16 bytes, one load */
typedef struct {
  int corner;
  float fx, fy, grain;
} BlobRead;

static int bq, bPad, bw, bh, bWidths[3];
static double bFitX, bFitY, bK;
static float bSpeckle;
static v128_t bUnder;
static BlobRead *bRead;
static float *bMelt, *bTmp;

static inline unsigned noise(unsigned n) {
  n = (n ^ (n >> 16)) * 0x7feb352du;
  n = (n ^ (n >> 15)) * 0x846ca68bu;
  return n ^ (n >> 16);
}
static inline double near(unsigned bits) { return 0.5 + ((double)(bits & 255) + ((bits >> 8) & 255) - 255) * SPREAD; }

/* Math.hypot as V8 computes it: scaled by the larger, Kahan-summed */
static inline double v8hypot(double a, double b) {
  a = __builtin_fabs(a);
  b = __builtin_fabs(b);
  double max = b > a ? b : a;
  if (max == 0) return 0;
  double sum = 0, comp = 0, n, summand, pre;
  n = a / max;
  summand = n * n - comp;
  pre = sum + summand;
  comp = (pre - sum) - summand;
  sum = pre;
  n = b / max;
  summand = n * n - comp;
  pre = sum + summand;
  sum = pre;
  return __builtin_sqrt(sum) * max;
}

/* boxes(): three box widths whose blur is a Gaussian of sigma */
static void boxes(double sigma, int *out) {
  double ideal = __builtin_sqrt(4 * sigma * sigma + 1);
  int lower = (int)__builtin_floor(ideal);
  if (lower % 2 == 0) lower--;
  double m = jsRound((12 * sigma * sigma - 3.0 * lower * lower - 12.0 * lower - 9) / (-4.0 * lower - 4));
  for (int i = 0; i < 3; i++) out[i] = i < m ? lower : lower + 2;
}

/* The melt's layout and each pixel's scattered read and speckle: blobRenderer's setup for a box of W by H on a ground
   `under` (0 to 255 a channel), the design S pixels wide drawn at k from (fitX, fitY), its largest ball R and the melt
   padded by `pad` (the scene's, in the box's pixels), its noise from `seed` (the scene's) and its `frost`. The melt's
   texel q, or 0 where the memory is short. */
EXPORT(blob_setup)
int blob_setup(double S, double R, double pad, double fitX, double fitY, double k, int seed, double frost, int ur_,
               int ug_, int ub_) {
  bq = (int)dmax(1, __builtin_floor((MELT * R) / 4));
  bPad = (int)__builtin_ceil(pad / bq) + 1;
  bw = (int)__builtin_ceil((double)W / bq) + 2 * bPad;
  bh = (int)__builtin_ceil((double)H / bq) + 2 * bPad;
  bFitX = fitX;
  bFitY = fitY;
  bK = k;
  bUnder = wasm_f32x4_make((float)ur_, (float)ug_, (float)ub_, 0);
  boxes((MELT * R) / bq, bWidths);
  double scatter = 0.075 * frost;
  double speckle = dmin(0.4, 0.1 * frost);
  bSpeckle = (float)speckle;
  bRead = take(N * sizeof(BlobRead));
  bMelt = take(4 * bw * bh * 4);
  bTmp = take(4 * bw * bh * 4);
  if (!bRead || !bMelt || !bTmp) return 0;
  unsigned s = ((unsigned)seed + 1u) * 0x9e3779b1u;
  for (int y = 0, p = 0; y < H; y++) {
    for (int x = 0; x < W; x++, p++) {
      unsigned a = noise((2u * p) ^ s);
      unsigned b = noise((2u * p + 1) ^ s);
      double u = clampd((x + 0.5 + scatter * S * (near(a) - 0.5)) / bq - 0.5 + bPad, 0, bw - 1.001);
      double v = clampd((y + 0.5 + scatter * S * (near(a >> 16) - 0.5)) / bq - 0.5 + bPad, 0, bh - 1.001);
      double x0 = __builtin_floor(u);
      double y0 = __builtin_floor(v);
      bRead[p].corner = 4 * ((int)y0 * bw + (int)x0);
      bRead[p].fx = (float)(u - x0);
      bRead[p].fy = (float)(v - y0);
      bRead[p].grain = (float)(1 - speckle + 2 * speckle * clampd(0.5 + CONTRAST * (near(b) - 0.5), 0, 1));
    }
  }
  return bq;
}

/* boxBlur(): one box of `width` along `length` texels of each of `lines`, four channels at once */
static void boxBlur(const float *from, float *to, int lines, int length, int line, int step, int width) {
  int r = (width - 1) / 2;
  v128_t inv = wasm_f32x4_splat(1.0f / width);
  for (int l = 0; l < lines; l++) {
    const float *src = from + l * line;
    float *dst = to + l * line;
    v128_t sum = wasm_f32x4_splat(0);
    for (int i = 0; i <= r && i < length; i++) sum = wasm_f32x4_add(sum, wasm_v128_load(src + i * step));
    for (int i = 0; i < length; i++) {
      wasm_v128_store(dst + i * step, wasm_f32x4_mul(sum, inv));
      if (i + r + 1 < length) sum = wasm_f32x4_add(sum, wasm_v128_load(src + (i + r + 1) * step));
      if (i - r >= 0) sum = wasm_f32x4_sub(sum, wasm_v128_load(src + (i - r) * step));
    }
  }
}

/* the blob's own ground, for a clip with a soft, whose frames are the blob's layer alone (blobRenderer with no
   backdrop): its color, 0 to 255 a channel, and its alpha, 1 opaque, 0 none; and the pixel where no ball reaches */
static v128_t bGround, bBare;
static float bGa;

/* The ground the blob's layer lies on, for a clip with a soft (its color 0 to 255 a channel, its alpha 0 to 1): the
   blob is then drawn alone, as blobRenderer draws it with no backdrop, and laid over the palette's gradient or the
   clip's backdrop as it is finished. */
EXPORT(blob_ground)
void blob_ground(int r, int g, int b, double alpha) {
  bGround = wasm_f32x4_make((float)r, (float)g, (float)b, 0);
  bGa = (float)alpha;
  fLayer = 1;
  bBare = alpha > 0 ? wasm_f32x4_make((float)r, (float)g, (float)b, alpha >= 1 ? 255.0f : __builtin_floorf((float)(255 * alpha + 0.5)))
                    : wasm_f32x4_splat(0);
}

/* A pixel of the blob's layer, straight alpha, its four channels whole numbers 0 to 255: over its ground, where it
   has one, as blobRenderer writes it with no backdrop. */
static inline v128_t blobLayer(const BlobRead *r, int row) {
  const float *at = bMelt + r->corner;
  float fx = r->fx, fy = r->fy;
  v128_t m = wasm_f32x4_add(
      wasm_f32x4_add(wasm_f32x4_mul(wasm_v128_load(at), wasm_f32x4_splat((1 - fx) * (1 - fy))),
                     wasm_f32x4_mul(wasm_v128_load(at + 4), wasm_f32x4_splat(fx * (1 - fy)))),
      wasm_f32x4_add(wasm_f32x4_mul(wasm_v128_load(at + row), wasm_f32x4_splat((1 - fx) * fy)),
                     wasm_f32x4_mul(wasm_v128_load(at + row + 4), wasm_f32x4_splat(fx * fy))));
  float a0 = wasm_f32x4_extract_lane(m, 3);
  float lift = a0 > 0 ? fmins(1, fmaxs(0, SLOPE * a0 + (0.5f - SLOPE / 2))) : 0;
  float alpha = fmins(1, lift * (1 + bSpeckle));
  if (!(alpha > 0)) return bBare;
  v128_t color = wasm_f32x4_mul(
      wasm_f32x4_min(wasm_f32x4_splat(alpha), wasm_f32x4_mul(m, wasm_f32x4_splat((lift * r->grain) / a0))), BYTE);
  v128_t v;
  float a;
  if (bGa >= 1) {
    v = wasm_f32x4_add(color, wasm_f32x4_mul(bGround, wasm_f32x4_splat(1 - alpha)));
    a = 255;
  } else if (bGa > 0) {
    float rest = bGa * (1 - alpha), all = alpha + rest;
    v = wasm_f32x4_div(wasm_f32x4_add(color, wasm_f32x4_mul(bGround, wasm_f32x4_splat(rest))), wasm_f32x4_splat(all));
    a = __builtin_floorf(255 * all + 0.5f);
  } else {
    v = wasm_f32x4_div(color, wasm_f32x4_splat(alpha));
    a = __builtin_floorf(255 * alpha + 0.5f);
  }
  return wasm_f32x4_replace_lane(wasm_f32x4_trunc(wasm_f32x4_add(v, wasm_f32x4_splat(0.5f))), 3, a);
}

static inline v128_t blobPixel(const BlobRead *r, int row) {
  const float *at = bMelt + r->corner;
  float fx = r->fx, fy = r->fy;
  v128_t m = wasm_f32x4_add(
      wasm_f32x4_add(wasm_f32x4_mul(wasm_v128_load(at), wasm_f32x4_splat((1 - fx) * (1 - fy))),
                     wasm_f32x4_mul(wasm_v128_load(at + 4), wasm_f32x4_splat(fx * (1 - fy)))),
      wasm_f32x4_add(wasm_f32x4_mul(wasm_v128_load(at + row), wasm_f32x4_splat((1 - fx) * fy)),
                     wasm_f32x4_mul(wasm_v128_load(at + row + 4), wasm_f32x4_splat(fx * fy))));
  float a0 = wasm_f32x4_extract_lane(m, 3);
  float lift = a0 > 0 ? fmins(1, fmaxs(0, SLOPE * a0 + (0.5f - SLOPE / 2))) : 0;
  float alpha = fmins(1, lift * (1 + bSpeckle));
  if (!(alpha > 0)) return bUnder;
  v128_t color = wasm_f32x4_min(wasm_f32x4_splat(alpha), wasm_f32x4_mul(m, wasm_f32x4_splat((lift * r->grain) / a0)));
  v128_t v = wasm_f32x4_add(wasm_f32x4_add(wasm_f32x4_mul(color, wasm_f32x4_splat(255)),
                                           wasm_f32x4_mul(bUnder, wasm_f32x4_splat(1 - alpha))),
                            wasm_f32x4_splat(0.5f));
  return wasm_f32x4_trunc(v);
}

/* The frame into the planes: the balls from params (x, y, r in the design's units, then their color 0 to 1, six
   numbers each), melted, blurred, lifted, speckled and laid over the ground. */
EXPORT(blob_frame)
void blob_frame(int nDots) {
  float *melt = bMelt;
  v128_t zero = wasm_f32x4_splat(0);
  for (int i = 0; i < bw * bh; i++) wasm_v128_store(melt + 4 * i, zero);
  for (int d = 0; d < nDots; d++) {
    const double *dot = params + 6 * d;
    double cx = (bFitX + dot[0] * bK) / bq + bPad;
    double cy = (bFitY + dot[1] * bK) / bq + bPad;
    double r = (dot[2] * bK) / bq;
    v128_t color = wasm_f32x4_make((float)dot[3], (float)dot[4], (float)dot[5], 1);
    double yTo = dmin(bh - 1, cy + r + 1), xTo = dmin(bw - 1, cx + r + 1);
    for (double yf = dmax(1, __builtin_floor(cy - r - 1)); yf < yTo; yf++) {
      for (double xf = dmax(1, __builtin_floor(cx - r - 1)); xf < xTo; xf++) {
        double cover = clampd(r - v8hypot(xf + 0.5 - cx, yf + 0.5 - cy) + 0.5, 0, 1);
        if (!cover) continue;
        float *at = melt + 4 * ((int)yf * bw + (int)xf);
        wasm_v128_store(at, wasm_f32x4_add(wasm_f32x4_mul(color, wasm_f32x4_splat((float)cover)),
                                           wasm_f32x4_mul(wasm_v128_load(at), wasm_f32x4_splat((float)(1 - cover)))));
      }
    }
  }
  for (int i = 0; i < 3; i++) {
    boxBlur(melt, bTmp, bh, bw, 4 * bw, 4, bWidths[i]);
    boxBlur(bTmp, melt, bw, bh, 4, 4 * bw, bWidths[i]);
  }
  int row = 4 * bw;
  if (fSoft) {
    /* the layer alone, finished */
    for (int y = 0; y < H; y += 2) {
      const BlobRead *a = bRead + y * W, *b = a + W;
      int x = 0;
      for (; x + 4 <= W; x += 4)
        keepPixels(x, y, 4, blobLayer(a + x, row), blobLayer(a + x + 1, row), blobLayer(a + x + 2, row),
                   blobLayer(a + x + 3, row), blobLayer(b + x, row), blobLayer(b + x + 1, row), blobLayer(b + x + 2, row),
                   blobLayer(b + x + 3, row));
      if (x < W) {
        v128_t a0 = blobLayer(a + x, row), a1 = blobLayer(a + x + 1, row);
        v128_t b0 = blobLayer(b + x, row), b1 = blobLayer(b + x + 1, row);
        keepPixels(x, y, 2, a0, a1, a0, a1, b0, b1, b0, b1);
      }
    }
    finishFrame();
    return;
  }
  for (int y = 0; y < H; y += 2) {
    const BlobRead *a = bRead + y * W, *b = a + W;
    int x = 0;
    for (; x + 4 <= W; x += 4)
      put(x, y, 4, blobPixel(a + x, row), blobPixel(a + x + 1, row), blobPixel(a + x + 2, row), blobPixel(a + x + 3, row),
          blobPixel(b + x, row), blobPixel(b + x + 1, row), blobPixel(b + x + 2, row), blobPixel(b + x + 3, row));
    if (x < W) {
      v128_t a0 = blobPixel(a + x, row), a1 = blobPixel(a + x + 1, row);
      v128_t b0 = blobPixel(b + x, row), b1 = blobPixel(b + x + 1, row);
      put(x, y, 2, a0, a1, a0, a1, b0, b1, b0, b1);
    }
  }
}

/* ---------------------------------------------------------------- the silk (silk-render.ts's renderSilk) */

/* silk.ts's sizes: the folds at most, the dye's lookup table, the profiles' grid */
#define SILK_FOLDS 8
#define SILK_LUT 32
#define SILK_PROF 65

static int sN;
/* each fold's radius and its band's inverse half-width, and the band's inner and outer radii squared */
static float sR[SILK_FOLDS], sIw[SILK_FOLDS], sIn2[SILK_FOLDS], sOut2[SILK_FOLDS];
/* the valley's and the crest's profiles at each grid point and the next, read in one load */
static v128_t sProf[SILK_PROF];
/* the dye's three rows, base, shade and lift, 0 to 255 a channel, each entry and the step to the next */
static v128_t sBase[SILK_LUT], sShade[SILK_LUT], sLift[SILK_LUT], sBaseD[SILK_LUT], sShadeD[SILK_LUT], sLiftD[SILK_LUT];
/* the dye's line: from (x1, y1), its direction (ux, uy) over its length squared (ul) */
static float sX1, sY1, sUx, sUy, sUl;

/* The silk's scene for the box: its `n` folds and the dye's line; params hold each fold's radius R and its band's
   inverse half-width, then the valley's and the crest's profiles (SILK_PROF each, 0 to 1), then the dye's base,
   shade and lift (SILK_LUT colors each, three bytes a color). */
EXPORT(silk_setup)
int silk_setup(int n, double x1, double y1, double ux, double uy, double ul) {
  if (n < 0 || n > SILK_FOLDS) return 0;
  sN = n;
  const double *p = params;
  for (int i = 0; i < n; i++) sR[i] = (float)*p++;
  for (int i = 0; i < n; i++) {
    sIw[i] = (float)*p++;
    double w = 1 / (double)sIw[i], lo = sR[i] - w, hi = sR[i] + w;
    sIn2[i] = (float)(lo * lo);
    sOut2[i] = (float)(hi * hi);
  }
  const double *valley = p, *crest = p + SILK_PROF;
  for (int k = 0; k < SILK_PROF; k++) {
    int next = k + 1 < SILK_PROF ? k + 1 : k;
    sProf[k] = wasm_f32x4_make((float)valley[k], (float)crest[k], (float)valley[next], (float)crest[next]);
  }
  p += 2 * SILK_PROF;
  v128_t *rows[3] = {sBase, sShade, sLift};
  for (int r = 0; r < 3; r++)
    for (int k = 0; k < SILK_LUT; k++, p += 3) rows[r][k] = wasm_f32x4_make((float)p[0], (float)p[1], (float)p[2], 0);
  for (int k = 0; k < SILK_LUT; k++) {
    int next = k + 1 < SILK_LUT ? k + 1 : k;
    sBaseD[k] = wasm_f32x4_sub(sBase[next], sBase[k]);
    sShadeD[k] = wasm_f32x4_sub(sShade[next], sShade[k]);
    sLiftD[k] = wasm_f32x4_sub(sLift[next], sLift[k]);
  }
  sX1 = (float)x1;
  sY1 = (float)y1;
  sUx = (float)ux;
  sUy = (float)uy;
  sUl = (float)ul;
  return 1;
}

/* silk.ts's profileAt for four pixels at once, the valley's into v and the crest's into c: the line through the grid's
   values at each x, 0 where x is not within -1 and 1 */
static inline void silkProfiles(v128_t x, v128_t *v, v128_t *c) {
  const v128_t one = wasm_f32x4_splat(1);
  v128_t in = wasm_f32x4_lt(wasm_f32x4_abs(x), one);
  v128_t g = wasm_f32x4_mul(wasm_f32x4_add(x, one), wasm_f32x4_splat(0.5f * (SILK_PROF - 1)));
  g = wasm_f32x4_min(wasm_f32x4_max(g, wasm_f32x4_splat(0)), wasm_f32x4_splat(SILK_PROF - 1));
  v128_t i = wasm_i32x4_min(wasm_i32x4_trunc_sat_f32x4(g), wasm_i32x4_splat(SILK_PROF - 2));
  v128_t f = wasm_f32x4_sub(g, wasm_f32x4_convert_i32x4(i));
  /* each pixel's grid point and the next, valley and crest, turned into a row of each */
  v128_t a0 = sProf[wasm_i32x4_extract_lane(i, 0)], a1 = sProf[wasm_i32x4_extract_lane(i, 1)];
  v128_t a2 = sProf[wasm_i32x4_extract_lane(i, 2)], a3 = sProf[wasm_i32x4_extract_lane(i, 3)];
  v128_t t0 = wasm_i32x4_shuffle(a0, a1, 0, 4, 1, 5), t1 = wasm_i32x4_shuffle(a2, a3, 0, 4, 1, 5);
  v128_t t2 = wasm_i32x4_shuffle(a0, a1, 2, 6, 3, 7), t3 = wasm_i32x4_shuffle(a2, a3, 2, 6, 3, 7);
  v128_t v0 = wasm_i32x4_shuffle(t0, t1, 0, 1, 4, 5), c0 = wasm_i32x4_shuffle(t0, t1, 2, 3, 6, 7);
  v128_t v1 = wasm_i32x4_shuffle(t2, t3, 0, 1, 4, 5), c1 = wasm_i32x4_shuffle(t2, t3, 2, 3, 6, 7);
  *v = wasm_v128_and(wasm_f32x4_add(v0, wasm_f32x4_mul(wasm_f32x4_sub(v1, v0), f)), in);
  *c = wasm_v128_and(wasm_f32x4_add(c0, wasm_f32x4_mul(wasm_f32x4_sub(c1, c0), f)), in);
}

/* Four pixels of a row from (x, y), the folds' centres at C: each the dye at its place along the line, under the
   valleys' shade and the crests' lift by every band's profiles there, joined as layers are. */
static inline void silkFour(int x, int y, const double *C, v128_t out[4]) {
  const v128_t px = wasm_f32x4_add(wasm_f32x4_splat(x + 0.5f), wasm_f32x4_make(0, 1, 2, 3));
  const float py = y + 0.5f;
  const v128_t one = wasm_f32x4_splat(1);
  /* what each pixel keeps through the valleys' and the crests' masks so far */
  v128_t tv = one, tc = one;
  for (int i = 0; i < sN; i++) {
    /* in the band by the distance squared, as the player tests it, so a band that reaches none of the four costs no
       root (at the band's very edge a profile is 0, so either side of the test there draws alike) */
    v128_t dx = wasm_f32x4_sub(px, wasm_f32x4_splat((float)C[2 * i]));
    float dy = py - (float)C[2 * i + 1];
    v128_t d2 = wasm_f32x4_add(wasm_f32x4_mul(dx, dx), wasm_f32x4_splat(dy * dy));
    v128_t in = wasm_v128_and(wasm_f32x4_gt(d2, wasm_f32x4_splat(sIn2[i])), wasm_f32x4_lt(d2, wasm_f32x4_splat(sOut2[i])));
    if (!wasm_v128_any_true(in)) continue;
    v128_t xb = wasm_f32x4_mul(wasm_f32x4_sub(wasm_f32x4_sqrt(d2), wasm_f32x4_splat(sR[i])), wasm_f32x4_splat(sIw[i]));
    v128_t v, c;
    silkProfiles(xb, &v, &c);
    tv = wasm_f32x4_mul(tv, wasm_f32x4_sub(one, v));
    tc = wasm_f32x4_mul(tc, wasm_f32x4_sub(one, c));
  }
  float V[4], Cm[4], g[4];
  wasm_v128_store(V, wasm_f32x4_sub(one, tv));
  wasm_v128_store(Cm, wasm_f32x4_sub(one, tc));
  v128_t u = wasm_f32x4_mul(
      wasm_f32x4_add(wasm_f32x4_mul(wasm_f32x4_sub(px, wasm_f32x4_splat(sX1)), wasm_f32x4_splat(sUx)),
                     wasm_f32x4_splat((py - sY1) * sUy)),
      wasm_f32x4_splat(sUl));
  u = wasm_f32x4_min(wasm_f32x4_max(u, wasm_f32x4_splat(0)), one);
  wasm_v128_store(g, wasm_f32x4_mul(u, wasm_f32x4_splat(SILK_LUT - 1)));
  for (int l = 0; l < 4; l++) {
    int i0 = (int)g[l];
    if (i0 > SILK_LUT - 2) i0 = SILK_LUT - 2;
    v128_t fr = wasm_f32x4_splat(g[l] - i0);
    v128_t base = wasm_f32x4_add(sBase[i0], wasm_f32x4_mul(sBaseD[i0], fr));
    v128_t shade = wasm_f32x4_add(sShade[i0], wasm_f32x4_mul(sShadeD[i0], fr));
    v128_t lift = wasm_f32x4_add(sLift[i0], wasm_f32x4_mul(sLiftD[i0], fr));
    v128_t m = wasm_f32x4_add(base, wasm_f32x4_mul(wasm_f32x4_sub(shade, base), wasm_f32x4_splat(V[l])));
    out[l] = wasm_f32x4_nearest(wasm_f32x4_add(m, wasm_f32x4_mul(wasm_f32x4_sub(lift, m), wasm_f32x4_splat(Cm[l]))));
  }
}

/* The frame into the planes: params hold the folds' centres this frame (x and y each, as silk.ts's centresAt). */
EXPORT(silk_frame)
void silk_frame(void) {
  double C[2 * SILK_FOLDS];
  for (int i = 0; i < 2 * sN; i++) C[i] = params[i];
  v128_t a[4], b[4];
  for (int y = 0; y < H; y += 2) {
    int x = 0;
    for (; x + 4 <= W; x += 4) {
      silkFour(x, y, C, a);
      silkFour(x, y + 1, C, b);
      emitOpaque(x, y, 4, a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3]);
    }
    if (x < W) {
      silkFour(x, y, C, a);
      silkFour(x, y + 1, C, b);
      emitOpaque(x, y, 2, a[0], a[1], a[0], a[1], b[0], b[1], b[0], b[1]);
    }
  }
  if (fSoft) finishFrame();
}

/* ---------------------------------------------------------------- the rosette (rosette-render.ts's renderRosette) */

/* rows drawn at once: the petals are laid band by band, so the colors being mixed stay small */
#define ROSETTE_BAND 32
#define ROSETTE_KEYS 34

/* the lens in a petal's frame (rosette.ts's RosetteLens): x0, x1, half-width w, middle xm, its arcs' centres' offset d
   and radius rho, and its reach from its anchor */
static double rX0, rX1, rW, rXm, rD, rRho, rReach;
/* the petal's gradient in its box (cu, cv, ru, rv), its stops' places and each key's four stops' colors, 0 to 1 */
static float rCu, rCv, rRu, rRv, rStopAt[4], rStops[ROSETTE_KEYS * 12];
static float rGround[3], rHeart[3], rHeartStops[8];
static double rS, rHeartIn, rHeartOut;
static int rKeys, rStride;
/* the band's colors, three planes of ROSETTE_BAND rows */
static float *rAcc;

/* The rosette's scene for the box: `keys` ring gradients, the flower's scale S (px) and the heart's glow from heartIn
   to heartOut (shares of S); params hold the lens (x0, x1, w, xm, d, rho, reach), the gradient's middle and radii
   (cu, cv, ru, rv), its stops' places (4), the glow's stops (4 places and alphas), the ground's and the heart's
   colors (0 to 1), then each key's four stops' colors. 1, or 0 where the memory is short. */
EXPORT(rosette_setup)
int rosette_setup(int keys, double S, double heartIn, double heartOut) {
  if (keys < 1 || keys > ROSETTE_KEYS) return 0;
  const double *p = params;
  rX0 = p[0];
  rX1 = p[1];
  rW = p[2];
  rXm = p[3];
  rD = p[4];
  rRho = p[5];
  rReach = p[6];
  rCu = (float)p[7];
  rCv = (float)p[8];
  rRu = (float)p[9];
  rRv = (float)p[10];
  for (int i = 0; i < 4; i++) rStopAt[i] = (float)p[11 + i];
  for (int i = 0; i < 8; i++) rHeartStops[i] = (float)p[15 + i];
  for (int i = 0; i < 3; i++) {
    rGround[i] = (float)p[23 + i];
    rHeart[i] = (float)p[26 + i];
  }
  for (int i = 0; i < keys * 12; i++) rStops[i] = (float)p[29 + i];
  rKeys = keys;
  rS = S;
  rHeartIn = heartIn;
  rHeartOut = heartOut;
  rStride = (W + 3) & ~3;
  rAcc = take(3 * ROSETTE_BAND * rStride * 4);
  return rAcc ? 1 : 0;
}

/* rosette.ts's stopValue: piecewise linear by (place, value) stops, flat past either end */
static inline float rosetteStopValue(const float *stops, float g) {
  if (g <= stops[0]) return stops[1];
  for (int i = 1; i < 4; i++)
    if (g <= stops[2 * i]) return stops[2 * i - 1] + (stops[2 * i + 1] - stops[2 * i - 1]) * (g - stops[2 * i - 2]) / (stops[2 * i] - stops[2 * i - 2]);
  return stops[7];
}

/* One petal laid over the band's rows from b0 to b1 (paintPetal): its anchor radius r and turn's cosine and sine, its
   key; only where the lens, with its half pixel of edge, can reach a row: the two discs it is the meeting of, each
   widened by a pixel and a half. */
static void rosettePetal(int b0, int b1, double r, double cs, double sn, int key) {
  double cx = W / 2.0, cy = H / 2.0;
  double ax = cx + r * cs, ay = cy + r * sn;
  double reach = r * rReach + 2;
  int x0 = (int)dmax(0, __builtin_floor(ax - reach)), x1 = (int)dmin(W - 1, __builtin_ceil(ax + reach));
  int y0 = (int)dmax(0, __builtin_floor(ay - reach)), y1 = (int)dmin(H - 1, __builtin_ceil(ay + reach));
  if (x0 > x1 || y0 > y1) return;
  if (y0 < b0) y0 = b0;
  if (y1 > b1 - 1) y1 = b1 - 1;
  if (y0 > y1) return;
  /* the discs' centres, (xm, -d) and (xm, d) of the petal's frame, and their radius, in the box's pixels */
  double c1x = cx + r * (rXm * cs + rD * sn), c1y = cy + r * (rXm * sn - rD * cs);
  double c2x = cx + r * (rXm * cs - rD * sn), c2y = cy + r * (rXm * sn + rD * cs);
  double rr = r * rRho + 1.5;
  const float inv = (float)(1 / r), rf = (float)r;
  const float fcx = (float)cx, fcs = (float)cs, fsn = (float)sn;
  const float xm = (float)rXm, dd = (float)rD, rho = (float)rRho, lx0 = (float)rX0;
  const float du = (float)(1 / (rX1 - rX0)), w = (float)rW, dv = (float)(1 / (2 * rW));
  const float *st = rStops + 12 * key;
  /* the stops' colors as steps from one to the next, and each step's span's inverse */
  v128_t s01 = wasm_f32x4_splat(1 / (rStopAt[1] - rStopAt[0])), s12 = wasm_f32x4_splat(1 / (rStopAt[2] - rStopAt[1]));
  v128_t s23 = wasm_f32x4_splat(1 / (rStopAt[3] - rStopAt[2]));
  const v128_t zero = wasm_f32x4_splat(0), one = wasm_f32x4_splat(1);
  for (int y = y0; y <= y1; y++) {
    double py = y + 0.5;
    double e1 = rr * rr - (py - c1y) * (py - c1y), e2 = rr * rr - (py - c2y) * (py - c2y);
    if (e1 <= 0 || e2 <= 0) continue;
    double h1 = __builtin_sqrt(e1), h2 = __builtin_sqrt(e2);
    double lo = dmax(c1x - h1, c2x - h2), hi = dmin(c1x + h1, c2x + h2);
    if (lo > hi) continue;
    int xa = (int)dmax(x0, __builtin_floor(lo - 0.5)), xb = (int)dmin(x1, __builtin_ceil(hi - 0.5));
    if (xa > xb) continue;
    float *R = rAcc + (y - b0) * rStride, *G = R + ROSETTE_BAND * rStride, *B = G + ROSETTE_BAND * rStride;
    const float dy = (float)(py - cy);
    for (int x = xa & ~3; x <= xb; x += 4) {
      v128_t px = wasm_f32x4_add(wasm_f32x4_splat(x + 0.5f), wasm_f32x4_make(0, 1, 2, 3));
      v128_t dx = wasm_f32x4_sub(px, wasm_f32x4_splat(fcx));
      /* into the petal's frame: the heart at the origin, the anchor at (1, 0) */
      v128_t qx = wasm_f32x4_mul(wasm_f32x4_add(wasm_f32x4_mul(dx, wasm_f32x4_splat(fcs)), wasm_f32x4_splat(dy * fsn)),
                                 wasm_f32x4_splat(inv));
      v128_t qy = wasm_f32x4_mul(wasm_f32x4_sub(wasm_f32x4_splat(dy * fcs), wasm_f32x4_mul(dx, wasm_f32x4_splat(fsn))),
                                 wasm_f32x4_splat(inv));
      v128_t lx = wasm_f32x4_sub(qx, wasm_f32x4_splat(xm));
      v128_t ly = wasm_f32x4_add(wasm_f32x4_abs(qy), wasm_f32x4_splat(dd));
      v128_t sd = wasm_f32x4_sub(wasm_f32x4_sqrt(wasm_f32x4_add(wasm_f32x4_mul(lx, lx), wasm_f32x4_mul(ly, ly))),
                                 wasm_f32x4_splat(rho));
      v128_t cov = wasm_f32x4_min(one, wasm_f32x4_max(zero, wasm_f32x4_sub(wasm_f32x4_splat(0.5f),
                                                                           wasm_f32x4_mul(sd, wasm_f32x4_splat(rf)))));
      /* only the pixels of the row's reach */
      v128_t lane = wasm_i32x4_add(wasm_i32x4_splat(x), wasm_i32x4_make(0, 1, 2, 3));
      v128_t inside = wasm_v128_and(wasm_i32x4_ge(lane, wasm_i32x4_splat(xa)), wasm_i32x4_le(lane, wasm_i32x4_splat(xb)));
      cov = wasm_v128_and(cov, inside);
      if (!wasm_v128_any_true(wasm_f32x4_gt(cov, zero))) continue;
      /* the gradient's place in the lens's box, and its color there */
      v128_t gu = wasm_f32x4_mul(wasm_f32x4_sub(wasm_f32x4_mul(wasm_f32x4_sub(qx, wasm_f32x4_splat(lx0)), wasm_f32x4_splat(du)),
                                                wasm_f32x4_splat(rCu)),
                                 wasm_f32x4_splat(1 / rRu));
      v128_t gv = wasm_f32x4_mul(wasm_f32x4_sub(wasm_f32x4_mul(wasm_f32x4_add(qy, wasm_f32x4_splat(w)), wasm_f32x4_splat(dv)),
                                                wasm_f32x4_splat(rCv)),
                                 wasm_f32x4_splat(1 / rRv));
      v128_t g = wasm_f32x4_sqrt(wasm_f32x4_add(wasm_f32x4_mul(gu, gu), wasm_f32x4_mul(gv, gv)));
      v128_t f01 = wasm_f32x4_min(one, wasm_f32x4_max(zero, wasm_f32x4_mul(wasm_f32x4_sub(g, wasm_f32x4_splat(rStopAt[0])), s01)));
      v128_t f12 = wasm_f32x4_min(one, wasm_f32x4_max(zero, wasm_f32x4_mul(wasm_f32x4_sub(g, wasm_f32x4_splat(rStopAt[1])), s12)));
      v128_t f23 = wasm_f32x4_min(one, wasm_f32x4_max(zero, wasm_f32x4_mul(wasm_f32x4_sub(g, wasm_f32x4_splat(rStopAt[2])), s23)));
      float *plane[3] = {R + x, G + x, B + x};
      for (int c = 0; c < 3; c++) {
        v128_t col = wasm_f32x4_add(
            wasm_f32x4_add(wasm_f32x4_splat(st[c]), wasm_f32x4_mul(f01, wasm_f32x4_splat(st[3 + c] - st[c]))),
            wasm_f32x4_add(wasm_f32x4_mul(f12, wasm_f32x4_splat(st[6 + c] - st[3 + c])),
                           wasm_f32x4_mul(f23, wasm_f32x4_splat(st[9 + c] - st[6 + c]))));
        v128_t acc = wasm_v128_load(plane[c]);
        wasm_v128_store(plane[c], wasm_f32x4_add(acc, wasm_f32x4_mul(wasm_f32x4_sub(col, acc), cov)));
      }
    }
  }
}

/* The frame into the planes: params hold the petals, rim first, each its anchor radius this frame (px), its turn's
   cosine and sine and its key; laid band by band over the ground, the heart's glow over them. */
EXPORT(rosette_frame)
void rosette_frame(int petals) {
  double cx = W / 2.0, cy = H / 2.0, r1 = rHeartOut * rS;
  int hy0 = (int)dmax(0, __builtin_floor(cy - r1 - 1)), hy1 = (int)dmin(H - 1, __builtin_ceil(cy + r1 + 1));
  int hx0 = (int)dmax(0, __builtin_floor(cx - r1 - 1)), hx1 = (int)dmin(W - 1, __builtin_ceil(cx + r1 + 1));
  for (int b0 = 0; b0 < H; b0 += ROSETTE_BAND) {
    int b1 = b0 + ROSETTE_BAND < H ? b0 + ROSETTE_BAND : H;
    float *R = rAcc, *G = R + ROSETTE_BAND * rStride, *B = G + ROSETTE_BAND * rStride;
    for (int i = 0; i < (b1 - b0) * rStride; i++) {
      R[i] = rGround[0];
      G[i] = rGround[1];
      B[i] = rGround[2];
    }
    for (int k = 0; k < petals; k++) {
      const double *p = params + 4 * k;
      rosettePetal(b0, b1, p[0], p[1], p[2], (int)p[3]);
    }
    /* the heart's glow */
    for (int y = hy0 > b0 ? hy0 : b0; y <= hy1 && y < b1; y++) {
      double dy = y + 0.5 - cy;
      for (int x = hx0; x <= hx1; x++) {
        double dx = x + 0.5 - cx;
        double hr = __builtin_sqrt(dx * dx + dy * dy) / rS;
        if (hr >= rHeartOut) continue;
        float a = hr <= rHeartIn ? 1 : rosetteStopValue(rHeartStops, (float)((hr - rHeartIn) / (rHeartOut - rHeartIn)));
        int at = (y - b0) * rStride + x;
        R[at] += (rHeart[0] - R[at]) * a;
        G[at] += (rHeart[1] - G[at]) * a;
        B[at] += (rHeart[2] - B[at]) * a;
      }
    }
    /* the band's rows, two at a time, as pixels */
    const v128_t byte = wasm_f32x4_splat(255), zero = wasm_f32x4_splat(0);
    for (int y = b0; y < b1; y += 2) {
      const float *r0 = R + (y - b0) * rStride, *g0 = G + (y - b0) * rStride, *bl0 = B + (y - b0) * rStride;
      for (int x = 0; x < W; x += 4) {
        v128_t q[8];
        for (int row = 0; row < 2; row++) {
          int o = row * rStride + x;
          v128_t rv = wasm_f32x4_nearest(wasm_f32x4_mul(wasm_v128_load(r0 + o), byte));
          v128_t gv = wasm_f32x4_nearest(wasm_f32x4_mul(wasm_v128_load(g0 + o), byte));
          v128_t bv = wasm_f32x4_nearest(wasm_f32x4_mul(wasm_v128_load(bl0 + o), byte));
          v128_t t0 = wasm_i32x4_shuffle(rv, gv, 0, 4, 1, 5), t1 = wasm_i32x4_shuffle(bv, zero, 0, 4, 1, 5);
          v128_t t2 = wasm_i32x4_shuffle(rv, gv, 2, 6, 3, 7), t3 = wasm_i32x4_shuffle(bv, zero, 2, 6, 3, 7);
          q[4 * row] = wasm_i32x4_shuffle(t0, t1, 0, 1, 4, 5);
          q[4 * row + 1] = wasm_i32x4_shuffle(t0, t1, 2, 3, 6, 7);
          q[4 * row + 2] = wasm_i32x4_shuffle(t2, t3, 0, 1, 4, 5);
          q[4 * row + 3] = wasm_i32x4_shuffle(t2, t3, 2, 3, 6, 7);
        }
        if (x + 4 <= W)
          emitOpaque(x, y, 4, q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7]);
        else
          emitOpaque(x, y, 2, q[0], q[1], q[0], q[1], q[4], q[5], q[4], q[5]);
      }
    }
  }
  if (fSoft) finishFrame();
}

/* ---------------------------------------------------------------- the papercut (papercut-render.ts's papercutRows) */

/* papercut.ts's sheets and hills at most, its shadows' reach in sigmas and its round model's in drop-shadow offsets;
   papercut-render.ts's pixels a sample of the field each way */
#define PC_SHEETS 24
#define PC_BUMPS 6
#define PC_REACH 2.54
#define PC_NEAR 16
#define PC_Q 4
/* how far a value mixed between a cell's corners can stray past theirs, the field's (which runs within a few units)
   absolutely, its slope's and its curvature's as shares: far more than the mixing's rounding */
#define PC_HAIR 1e-9

/* sin and cos from fdlibm's kernels, in the later form FreeBSD's msun gives them: the angle less the nearest whole
   number of quarter turns, taken off in two parts so the rest keeps its precision (the waves' phases are a few turns at
   most), then the kernels' polynomials over [-pi/4, pi/4], the rest's own rounding carried in. Within an ulp of V8's
   Math.sin and Math.cos, which keep fdlibm's older kernels: the last bit differs at about 1% of the waves' phases, by
   at most 1.1e-16, which moves a byte only where a value lies that near a rounding's half */
static inline double kernelSin(double x, double y) {
  const double S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
               S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
  double z = x * x, w = z * z, r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6), v = z * x;
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}
static inline double kernelCos(double x, double y) {
  const double C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
               C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
  double z = x * x, w = z * z, r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  double hz = 0.5 * z, a = 1 - hz;
  return a + (((1 - a) - hz) + (z * r - x * y));
}
static void sinCos(double x, double *s, double *c) {
  double n = __builtin_floor(x * 6.36619772367581382433e-01 + 0.5);
  double r = x - n * 1.57079632673412561417e+00, w = n * 6.07710050650619224932e-11;
  double y0 = r - w, y1 = (r - y0) - w;
  double sr = kernelSin(y0, y1), cr = kernelCos(y0, y1);
  switch ((int)n & 3) {
  case 0:
    *s = sr;
    *c = cr;
    break;
  case 1:
    *s = cr;
    *c = -sr;
    break;
  case 2:
    *s = -sr;
    *c = -cr;
    break;
  default:
    *s = -cr;
    *c = sr;
  }
}

/* exp(x) for x at most 0, from fdlibm's: x less the nearest whole number k of ln 2's, in two parts, the rest's exp
   from its rational approximation, times 2^k; 0 past -40, where 1 less it is 1. Within an ulp of V8's Math.exp, which
   fdlibm's own reductions give (the last bit differs at 0.05% of x, by at most 1.1e-16 of it) */
static double expNeg(double x) {
  if (x < -40) return 0;
  const double ln2hi = 6.93147180369123816490e-01, ln2lo = 1.90821492927058770002e-10,
               invln2 = 1.44269504088896338700e+00;
  const double P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
               P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;
  int k = (int)(invln2 * x - 0.5);
  double hi = x - k * ln2hi, lo = k * ln2lo, r = hi - lo, t = r * r;
  double c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k == 0) return 1 - ((r * c) / (c - 2.0) - r);
  union {
    unsigned long long bits;
    double value;
  } scale = {(unsigned long long)(1023 + k) << 52};
  return (1 - ((lo - (r * c) / (2.0 - c)) - hi)) * scale.value;
}

static int pcN, pcNb, pcFw, pcFh;
/* the scene (papercut.ts's PapercutScene): its unit D in pixels, the ramp, the waves' reaches and frequencies (and
   their products, the bends' slopes), the contact shadow's 1 / sigma and opacity, the lit cut's width */
static double pcD, pcRx, pcRy, pcWa, pcWf, pcWa2, pcWf2, pcWaf, pcWa2f2, pcIcsigma, pcCalpha, pcWall;
/* each sheet's level (where sheet k + 1 begins), its face's, its lit cut's and its shadow's colors (0 to 1), its drop
   shadow's 1 / sigma, offset and opacity, and how far from its cut the sheet above it is visited */
static double pcLevel[PC_SHEETS], pcFace[3 * PC_SHEETS], pcWallC[3 * PC_SHEETS], pcShadow[3 * PC_SHEETS];
static double pcIsigma[PC_SHEETS], pcOffset[PC_SHEETS], pcAlpha[PC_SHEETS], pcReach[PC_SHEETS];
/* how far a sheet's cut lies from a pixel where nothing of the sheet shows there: past its drop shadow, its contact
   shadow and its lit cut and face (pcCell) */
static double pcClear[PC_SHEETS];
/* the field's samples, four numbers each (the field, its slope across and down, its curvature), the slope's length at
   each, each column's and row's place in D units, and the waves there this frame (pcSample) */
static double *pcField, *pcSlope, *pcQx, *pcQy, *pcCol, *pcRow;
/* the dither's products across and down (papercut.ts's papercutDither) */
static double *pcDx, *pcDy;
/* a row of cells' kinds and sheets (pcCell), worked out with its first pair of rows for its second */
static int *pcKinds;
/* each sheet's face as a pixel for `put`: its bytes, which a face's pixels are (pcCell) */
static v128_t pcFaceBytes[PC_SHEETS];

/* The papercut's scene for the box (papercut.ts's papercutScene): `n` sheets, `nb` hills, its unit D (pixels), the
   ramp (rx, ry), the waves (wa, wf, wa2, wf2), the contact shadow's 1 / sigma and opacity and the lit cut's width;
   params hold the n - 1 levels, then the faces', the lit cuts' and the shadows' colors (three each, 0 to 1), then
   each sheet's drop shadow's 1 / sigma, its offset, its opacity and its reach. 1, or 0 where the memory is short. */
EXPORT(papercut_setup)
int papercut_setup(int n, int nb, double D, double rx, double ry, double wa, double wf, double wa2, double wf2,
                   double icsigma, double calpha, double wall) {
  if (n < 2 || n > PC_SHEETS || nb < 0 || nb > PC_BUMPS) return 0;
  pcN = n;
  pcNb = nb;
  pcD = D;
  pcRx = rx;
  pcRy = ry;
  pcWa = wa;
  pcWf = wf;
  pcWa2 = wa2;
  pcWf2 = wf2;
  pcWaf = wa * wf;
  pcWa2f2 = wa2 * wf2;
  pcIcsigma = icsigma;
  pcCalpha = calpha;
  pcWall = wall;
  const double *p = params;
  for (int k = 0; k < n - 1; k++) pcLevel[k] = *p++;
  for (int k = 0; k < 3 * n; k++) pcFace[k] = *p++;
  for (int k = 0; k < 3 * n; k++) pcWallC[k] = *p++;
  for (int k = 0; k < 3 * n; k++) pcShadow[k] = *p++;
  for (int k = 0; k < n; k++) pcIsigma[k] = *p++;
  for (int k = 0; k < n; k++) pcOffset[k] = *p++;
  for (int k = 0; k < n; k++) pcAlpha[k] = *p++;
  for (int k = 0; k < n; k++) pcReach[k] = *p++;
  for (int k = 0; k < n; k++)
    pcFaceBytes[k] = wasm_f32x4_make((float)jsRound(pcFace[3 * k] * 255), (float)jsRound(pcFace[3 * k + 1] * 255),
                                     (float)jsRound(pcFace[3 * k + 2] * 255), 255.0f);
  for (int k = 0; k < n; k++)
    pcClear[k] = dmax(dmax(pcOffset[k] + PC_REACH / pcIsigma[k], PC_REACH / icsigma), 0.5 + wall) + 1e-6;
  pcFw = (W + PC_Q - 2) / PC_Q + 3;
  pcFh = (H + PC_Q - 2) / PC_Q + 3;
  pcField = take(pcFw * pcFh * 32);
  pcSlope = take(pcFw * pcFh * 8);
  pcQx = take(pcFw * 8);
  pcQy = take(pcFh * 8);
  pcCol = take(pcFw * 32);
  pcRow = take(pcFh * 48);
  pcDx = take(W * 8);
  pcDy = take(H * 8);
  pcKinds = take(pcFw * 8);
  if (!pcField || !pcSlope || !pcQx || !pcQy || !pcCol || !pcRow || !pcDx || !pcDy || !pcKinds) return 0;
  /* the dither's products, as papercutDither takes them */
  for (int x = 0; x < W; x++) pcDx[x] = 0.06711056 * x;
  for (int y = 0; y < H; y++) pcDy[y] = 0.00583715 * y;
  /* sample (i, j) at the pixel-space point ((i - 1) Q + 0.5, (j - 1) Q + 0.5), in D units from the box's middle; the
     third and fourth waves' terms across hold still */
  for (int i = 0; i < pcFw; i++) {
    pcQx[i] = ((double)(i - 1) * PC_Q + 0.5 - W / 2.0) / D;
    sinCos(wf2 * pcQx[i], pcCol + 4 * i + 2, pcCol + 4 * i + 3);
  }
  for (int j = 0; j < pcFh; j++) pcQy[j] = ((double)(j - 1) * PC_Q + 0.5 - H / 2.0) / D;
  return 1;
}

/* The field at sample s, its slope and its curvature (papercut.ts's papercutField) at (qx, qy), the frame's hills at
   `at`: the waves' sines and cosines from the column's and the row's, the third and fourth as sums of their terms
   across and down. */
static void pcSample(int s, double qx, double qy, const double *col, const double *row, const double *at) {
  double su = col[2] * row[3] + col[3] * row[2], cuw = col[3] * row[3] - col[2] * row[2];
  double sv = col[2] * row[5] + col[3] * row[4], cvw = col[3] * row[5] - col[2] * row[4];
  double wx = qx + pcWa * row[0] + pcWa2 * sv;
  double wy = qy + pcWa * col[0] + pcWa2 * su;
  double c1 = pcWaf * row[1], c2 = pcWaf * col[1], cu = pcWa2f2 * cuw, cv = pcWa2f2 * cvw;
  double j11 = 1 + cv, j12 = c1 - cv, j21 = c2 + cu, j22 = 1 + cu;
  double f = wx * pcRx + wy * pcRy, gx = pcRx, gy = pcRy, hxx = 0, hxy = 0, hyy = 0;
  for (int i = 0; i < pcNb; i++) {
    const double *b = at + 4 * i;
    double ex = wx - b[0], ey = wy - b[1], ir2 = b[2], q2 = (ex * ex + ey * ey) * ir2;
    if (q2 < 1) {
      double k = 1 - q2, a = b[3], k2 = k * k;
      f += a * k2 * k;
      double c = -6 * a * k2 * ir2;
      gx += c * ex;
      gy += c * ey;
      double q = 24 * a * ir2 * ir2 * k;
      hxx += c + q * ex * ex;
      hyy += c + q * ey * ey;
      hxy += q * ex * ey;
    }
  }
  double Gx = gx * j11 + gy * j21, Gy = gx * j12 + gy * j22;
  double a11 = hxx * j11 + hxy * j21, a12 = hxx * j12 + hxy * j22;
  double a21 = hxy * j11 + hyy * j21, a22 = hxy * j12 + hyy * j22;
  double q11 = j11 * a11 + j21 * a21, q12 = j11 * a12 + j21 * a22, q22 = j12 * a12 + j22 * a22;
  double g2 = Gx * Gx + Gy * Gy;
  double kn = g2 > 0 ? (Gx * Gx * q11 + 2 * Gx * Gy * q12 + Gy * Gy * q22) / g2 : 0.5 * (q11 + q22);
  double tr = q11 + q22;
  double round = tr * tr > 0 ? clampd((8 * (q11 * q22 - q12 * q12)) / (tr * tr), 0, 1) : 0;
  double *out = pcField + 4 * s;
  out[0] = f;
  out[1] = Gx;
  out[2] = Gy;
  out[3] = kn * round;
  pcSlope[s] = __builtin_sqrt(g2);
}

/* Two pixels' bytes, (x, y) and (x + 1, y), from their colors (0 to 1 a channel, a pixel a lane), with the half-level
   dither at each (papercut.ts's papercutDither: the products' tables are its own products), rounded and clamped as the
   CPU drawing's bytes are; as two pixels for `put`. */
static inline v128_t pcRound(v128_t c, v128_t n) {
  /* Math.round as floor(v + 0.5), which differs from it only within 2^-54 of a half below 1 */
  v128_t v = wasm_f64x2_add(wasm_f64x2_mul(wasm_f64x2_add(c, n), wasm_f64x2_splat(255)), wasm_f64x2_splat(0.5));
  v128_t r = wasm_f64x2_floor(v);
  return wasm_f32x4_demote_f64x2_zero(wasm_f64x2_pmin(wasm_f64x2_pmax(r, wasm_f64x2_splat(0)), wasm_f64x2_splat(255)));
}
static inline void pcBytes(v128_t R, v128_t G, v128_t B, int x, int y, v128_t *p0, v128_t *p1) {
  v128_t a = wasm_f64x2_add(wasm_v128_load(pcDx + x), wasm_f64x2_splat(pcDy[y]));
  v128_t b = wasm_f64x2_mul(wasm_f64x2_splat(52.9829189), wasm_f64x2_sub(a, wasm_f64x2_floor(a)));
  v128_t n = wasm_f64x2_div(wasm_f64x2_sub(wasm_f64x2_sub(b, wasm_f64x2_floor(b)), wasm_f64x2_splat(0.5)),
                            wasm_f64x2_splat(255));
  v128_t t = wasm_i32x4_shuffle(pcRound(R, n), pcRound(G, n), 0, 4, 1, 5);
  v128_t u = wasm_i32x4_shuffle(pcRound(B, n), wasm_f32x4_splat(255), 0, 4, 1, 5);
  *p0 = wasm_i32x4_shuffle(t, u, 0, 1, 4, 5);
  *p1 = wasm_i32x4_shuffle(t, u, 2, 3, 6, 7);
}

/* the field at a pixel pair of a row in one cell, (ax0, ax1) across it and ay down: each of its four numbers mixed
   bilinearly from the cell's corners at s00 and s01, as papercut-render.ts mixes them, a pixel a lane */
static inline void pcMix(const double *s00, const double *s01, v128_t ax, double ay, v128_t *m) {
  v128_t down = wasm_f64x2_splat(ay);
  for (int k = 0; k < 4; k++) {
    v128_t top = wasm_f64x2_add(wasm_f64x2_splat(s00[k]), wasm_f64x2_mul(wasm_f64x2_splat(s00[4 + k] - s00[k]), ax));
    v128_t bottom = wasm_f64x2_add(wasm_f64x2_splat(s01[k]), wasm_f64x2_mul(wasm_f64x2_splat(s01[4 + k] - s01[k]), ax));
    m[k] = wasm_f64x2_add(top, wasm_f64x2_mul(wasm_f64x2_sub(bottom, top), down));
  }
}

#define F2(v) wasm_f64x2_splat(v)
static inline v128_t pcPhi2(v128_t x) {
  v128_t t = wasm_f64x2_pmin(wasm_f64x2_pmax(wasm_f64x2_div(wasm_f64x2_add(x, F2(PC_REACH)), F2(2 * PC_REACH)), F2(0)), F2(1));
  return wasm_f64x2_mul(wasm_f64x2_mul(wasm_f64x2_mul(t, t), t),
                        wasm_f64x2_add(wasm_f64x2_mul(t, wasm_f64x2_sub(wasm_f64x2_mul(t, F2(6)), F2(15))), F2(10)));
}
/* c toward `to` by `share`, lane by lane */
static inline v128_t pcToward(v128_t c, double to, v128_t share) {
  return wasm_f64x2_add(c, wasm_f64x2_mul(wasm_f64x2_sub(F2(to), c), share));
}

/* Sheet k painted over two pixels' colors (pcSheet, lane by lane), each lane on the sheet below k or the one below
   that (`above`: rise above 0, so outside the cut) or on sheet k itself (its own sheet, under its face where that does
   not cover it whole). Its shadows and its lit cut and face lay nothing where they reach no lane (a shadow past its
   tail and a cover of 0 change nothing), and the round model is worked out only where a lane takes it. */
static void pcSheet2(int k, int above, v128_t f, v128_t g, v128_t kap, v128_t nl, v128_t wn, v128_t toPx, v128_t *c) {
  const double o = pcOffset[k];
  v128_t rise = wasm_f64x2_sub(F2(pcLevel[k - 1]), f);
  v128_t d = wasm_f64x2_mul(wasm_f64x2_neg(rise), toPx);
  v128_t ds = wasm_f64x2_add(d, wasm_f64x2_mul(F2(o), nl));
  v128_t size = F2(1), csize = F2(1);
  if (above) {
    v128_t disc = wasm_f64x2_add(wasm_f64x2_mul(g, g), wasm_f64x2_mul(wasm_f64x2_mul(F2(2), kap), rise));
    v128_t ak = wasm_f64x2_abs(kap);
    v128_t sq = wasm_f64x2_sqrt(wasm_f64x2_abs(disc));
    v128_t pos = wasm_f64x2_ge(disc, F2(0));
    v128_t gsq = wasm_f64x2_add(g, sq);
    v128_t num = wasm_v128_bitselect(wasm_f64x2_mul(F2(2), rise), gsq, pos);
    v128_t den = wasm_v128_bitselect(gsq, wasm_f64x2_neg(kap), pos);
    d = wasm_f64x2_mul(F2(-pcD), wasm_f64x2_div(num, den));
    ds = wasm_f64x2_add(d, wasm_f64x2_mul(F2(o), nl));
    v128_t round = wasm_f64x2_gt(wasm_f64x2_mul(wasm_f64x2_mul(ak, F2(PC_NEAR)), F2(o)), wasm_f64x2_mul(g, F2(pcD)));
    if (wasm_v128_any_true(round)) {
      v128_t top = wasm_f64x2_mul(wasm_f64x2_div(g, ak), F2(pcD));
      v128_t R = wasm_f64x2_mul(wasm_f64x2_div(wasm_v128_bitselect(sq, wasm_f64x2_neg(sq), pos), ak), F2(pcD));
      v128_t hill = wasm_f64x2_lt(kap, F2(0));
      v128_t e = wasm_v128_bitselect(F2(1), F2(-1), hill);
      v128_t dr = wasm_f64x2_mul(wasm_f64x2_neg(e), wasm_f64x2_sub(top, R));
      v128_t lean = wasm_f64x2_mul(wasm_f64x2_mul(wasm_f64x2_mul(wasm_f64x2_mul(F2(2), e), top), F2(o)), nl);
      v128_t far = wasm_f64x2_sqrt(wasm_f64x2_add(wasm_f64x2_sub(wasm_f64x2_mul(top, top), lean), F2(o * o)));
      v128_t dsr = wasm_f64x2_mul(wasm_f64x2_neg(e), wasm_f64x2_sub(far, R));
      d = wasm_v128_bitselect(dr, d, round);
      ds = wasm_v128_bitselect(dsr, ds, round);
      v128_t island = wasm_v128_and(round, hill);
      if (wasm_v128_any_true(island)) {
        /* a small island's shadows as deep as a blur of a disc that size is at its middle, lane by lane */
        double r2[2], s[2] = {1, 1}, cs[2] = {1, 1};
        wasm_v128_store(r2, wasm_f64x2_mul(wasm_f64x2_pmax(F2(0), R), R));
        for (int l = 0; l < 2; l++) {
          if (!(l ? wasm_i64x2_extract_lane(island, 1) : wasm_i64x2_extract_lane(island, 0))) continue;
          s[l] = 1 - expNeg(-0.5 * r2[l] * pcIsigma[k] * pcIsigma[k]);
          cs[l] = 1 - expNeg(-0.5 * r2[l] * pcIcsigma * pcIcsigma);
        }
        size = wasm_f64x2_make(s[0], s[1]);
        csize = wasm_f64x2_make(cs[0], cs[1]);
      }
    }
  }
  const double *shadow = pcShadow + 3 * k;
  v128_t x = wasm_f64x2_mul(ds, F2(pcIsigma[k]));
  if (wasm_v128_any_true(wasm_f64x2_gt(x, F2(-PC_REACH)))) {
    v128_t sh = wasm_f64x2_mul(wasm_f64x2_mul(F2(pcAlpha[k]), pcPhi2(x)), size);
    for (int i = 0; i < 3; i++) c[i] = pcToward(c[i], shadow[i], sh);
  }
  v128_t xc = wasm_f64x2_mul(d, F2(pcIcsigma));
  if (wasm_v128_any_true(wasm_f64x2_gt(xc, F2(-PC_REACH)))) {
    v128_t ch = wasm_f64x2_mul(wasm_f64x2_mul(F2(pcCalpha), pcPhi2(xc)), csize);
    for (int i = 0; i < 3; i++) c[i] = pcToward(c[i], shadow[i], ch);
  }
  if (wasm_v128_any_true(wasm_f64x2_gt(wasm_f64x2_add(d, wasm_f64x2_pmax(F2(0), wn)), F2(-0.5)))) {
    const double *wallC = pcWallC + 3 * k, *face = pcFace + 3 * k;
    v128_t cw = wasm_f64x2_pmin(wasm_f64x2_pmax(wasm_f64x2_add(d, F2(0.5)), F2(0)), F2(1));
    for (int i = 0; i < 3; i++) c[i] = pcToward(c[i], wallC[i], cw);
    v128_t cf = wasm_f64x2_pmin(wasm_f64x2_pmax(wasm_f64x2_add(wasm_f64x2_add(d, wn), F2(0.5)), F2(0)), F2(1));
    for (int i = 0; i < 3; i++) c[i] = pcToward(c[i], face[i], cf);
  }
}

/* Two pixels' colors on one sheet b, a pixel a lane (pcShade, lane by lane): each its own sheet's face, or the one
   below under its own where that face does not cover it whole, then the sheet above, then the one above that where
   the terraces crowd. */
static void pcShade2(v128_t *m, int b, double lx, double ly, v128_t *c) {
  const int top = pcN - 1;
  v128_t f = m[0], gx = m[1], gy = m[2], kap = m[3];
  v128_t g = wasm_f64x2_pmax(F2(1e-9), wasm_f64x2_sqrt(wasm_f64x2_add(wasm_f64x2_mul(gx, gx), wasm_f64x2_mul(gy, gy))));
  v128_t toPx = wasm_f64x2_div(F2(pcD), g);
  v128_t nl = wasm_f64x2_div(wasm_f64x2_add(wasm_f64x2_mul(gx, F2(lx)), wasm_f64x2_mul(gy, F2(ly))), g);
  v128_t wn = wasm_f64x2_mul(F2(pcWall), nl);
  for (int i = 0; i < 3; i++) c[i] = F2(pcFace[3 * b + i]);
  if (b > 0) {
    v128_t own = wasm_f64x2_lt(wasm_f64x2_add(wasm_f64x2_mul(wasm_f64x2_sub(f, F2(pcLevel[b - 1])), toPx), wn), F2(0.5));
    if (wasm_v128_any_true(own)) {
      v128_t under[3];
      for (int i = 0; i < 3; i++) under[i] = F2(pcFace[3 * (b - 1) + i]);
      pcSheet2(b, 0, f, g, kap, nl, wn, toPx, under);
      for (int i = 0; i < 3; i++) c[i] = wasm_v128_bitselect(under[i], c[i], own);
    }
  }
  if (b < top) pcSheet2(b + 1, 1, f, g, kap, nl, wn, toPx, c);
  if (b + 1 < top) {
    v128_t visit = wasm_f64x2_lt(wasm_f64x2_mul(wasm_f64x2_sub(F2(pcLevel[b + 1]), f), toPx), F2(pcReach[b + 2]));
    if (wasm_v128_any_true(visit)) {
      v128_t over[3] = {c[0], c[1], c[2]};
      pcSheet2(b + 2, 1, f, g, kap, nl, wn, toPx, over);
      for (int i = 0; i < 3; i++) c[i] = wasm_v128_bitselect(over[i], c[i], visit);
    }
  }
}

/* The least distance in pixels from a pixel to the cut its field must rise at least `rise` to, for a slope of at most
   gmax and a curvature between kmin and kmax (papercut.ts's sheet, whose round model puts the cut where its
   second-order step does): 2 rise D / (g + sqrt(g^2 + 2 kap rise)), least at the steepest slope and the most
   curvature, and where the field curves down too fast to reach the level along its slope, D (g + sqrt(-disc)) / -kap,
   at least D sqrt(2 rise / -kap). */
static inline double pcNear(double rise, double gmax, double kmin, double kmax) {
  double near = 2 * rise * pcD / (gmax + __builtin_sqrt(gmax * gmax + 2 * dmax(0, kmax) * rise));
  if (kmin < 0) near = dmin(near, pcD * __builtin_sqrt(2 * rise / -kmin));
  return near * (1 - PC_HAIR);
}

/* What every pixel of the cell from sample s00 shows: its field lies between its corners', so where those lie on one
   sheet b, every pixel does (PC_SHADED, b), and where they lie far enough within it that the sheet's face covers them
   whole and neither the sheet above's cut nor its shadows (nor the one above that's, where it is visited) can reach
   them, every pixel shows that face alone (PC_PLAIN): each cut's drop shadow reaches at most its offset past where its
   distance does (pcClear). Such a pixel's bytes are the face's: a face is a palette color, its channels bytes over
   255, which the dither moves less than half a level, but at the picture's corner, where it moves it half a level
   down exactly, a tie the rounding settles. Else the pixels lie on different sheets (PC_MIXED). */
#define PC_PLAIN 0
#define PC_SHADED 1
#define PC_MIXED 2
/* the levels at or below f, as papercutShade counts them: from `near`, a count nearby, stepping up and down the
   levels, which ascend (papercut.ts's levelSteps keeps them so) */
static inline int pcLevels(double f, int near) {
  const int top = pcN - 1;
  int b = near < 0 ? 0 : near > top ? top : near;
  while (b < top && f >= pcLevel[b]) b++;
  while (b > 0 && !(f >= pcLevel[b - 1])) b--;
  return b;
}
static int pcCell(int s00, int *sheet) {
  const int s[4] = {s00, s00 + 1, s00 + pcFw, s00 + pcFw + 1};
  double fmin = pcField[4 * s00], fmax = fmin, kmin = pcField[4 * s00 + 3], kmax = kmin, gmax = pcSlope[s00];
  for (int k = 1; k < 4; k++) {
    const double *F = pcField + 4 * s[k];
    fmin = dmin(fmin, F[0]);
    fmax = dmax(fmax, F[0]);
    kmin = dmin(kmin, F[3]);
    kmax = dmax(kmax, F[3]);
    gmax = dmax(gmax, pcSlope[s[k]]);
  }
  fmin -= PC_HAIR;
  fmax += PC_HAIR;
  const int top = pcN - 1;
  int b = pcLevels(fmax, *sheet);
  *sheet = b;
  if (pcLevels(fmin, b) != b) return PC_MIXED;
  kmin -= PC_HAIR * (1 + __builtin_fabs(kmin));
  kmax += PC_HAIR * (1 + __builtin_fabs(kmax));
  gmax = dmax(1e-9, gmax) * (1 + PC_HAIR);
  double toPx = pcD / gmax;
  if (b > 0 && !((fmin - pcLevel[b - 1]) * toPx - pcWall * (1 + PC_HAIR) >= 0.5 + 1e-6)) return PC_SHADED;
  if (b < top) {
    if (!(pcNear(pcLevel[b] - fmax, gmax, kmin, kmax) >= pcClear[b + 1])) return PC_SHADED;
    if (b + 1 < top) {
      double rise = pcLevel[b + 1] - fmax;
      if (!(rise * toPx >= pcReach[b + 2] * (1 + PC_HAIR)) && !(pcNear(rise, gmax, kmin, kmax) >= pcClear[b + 2]))
        return PC_SHADED;
    }
  }
  return PC_PLAIN;
}

/* The frame into the planes: params hold its hills (each its middle in D units, 1 / r^2 and its height), the waves'
   four phases and toward the light, x and y (papercut.ts's papercutFrameAt). The waves at each column and row, the
   field at each sample, then each pixel: a cell its corners show plainly as its sheet's face, any other shaded. */
EXPORT(papercut_frame)
void papercut_frame(void) {
  const double *at = params;
  const int o = 4 * pcNb;
  const double lx = at[o + 4], ly = at[o + 5];
  for (int i = 0; i < pcFw; i++) sinCos(pcWf * pcQx[i] + at[o + 1], pcCol + 4 * i, pcCol + 4 * i + 1);
  for (int j = 0; j < pcFh; j++) {
    double *row = pcRow + 6 * j, down = pcWf2 * pcQy[j];
    sinCos(pcWf * pcQy[j] + at[o], row, row + 1);
    sinCos(down + at[o + 2], row + 2, row + 3);
    sinCos(at[o + 3] - down, row + 4, row + 5);
  }
  for (int j = 0, s = 0; j < pcFh; j++)
    for (int i = 0; i < pcFw; i++, s++) pcSample(s, pcQx[i], pcQy[j], pcCol + 4 * i, pcRow + 6 * j, at);
  for (int y = 0; y < H; y += 2) {
    for (int x = 0; x < W; x += 4) {
      int n = W - x < 4 ? 2 : 4, cell = x / PC_Q, s00 = (y / PC_Q + 1) * pcFw + cell + 1;
      int *kept = pcKinds + 2 * cell;
      if (!(y & 2)) {
        /* counted from the sheet of the cell before, or for a row's first, of the first cell a row above */
        if (cell) kept[1] = kept[-1];
        kept[0] = pcCell(s00, kept + 1);
      }
      int kind = kept[0], b = kept[1];
      const double *c00 = pcField + 4 * s00, *c01 = c00 + 4 * pcFw;
      v128_t q[8];
      if (kind == PC_PLAIN && (x | y)) {
        for (int k = 0; k < 8; k++) q[k] = pcFaceBytes[b];
        emitOpaque(x, y, n, q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7]);
        continue;
      }
      for (int k = 0; k < 8; k += 2) {
        int px = x + (k & 3), py = y + (k >> 2);
        if ((k & 3) >= n) {
          q[k] = q[k - 2];
          q[k + 1] = q[k - 1];
          continue;
        }
        v128_t c[3];
        if (kind == PC_PLAIN)
          for (int i = 0; i < 3; i++) c[i] = F2(pcFace[3 * b + i]);
        else {
          /* the pixels' places in the cell: x is even, so the pair's quarters are 0 and 1/4 or 1/2 and 3/4 */
          v128_t ax = wasm_f64x2_make((px & 3) / (double)PC_Q, ((px & 3) + 1) / (double)PC_Q);
          v128_t m[4];
          pcMix(c00, c01, ax, (py & 3) / (double)PC_Q, m);
          if (kind == PC_SHADED)
            pcShade2(m, b, lx, ly, c);
          else {
            /* each pixel's own sheet, as the CPU drawing counts its levels: the pair shaded once where both lie on one
               (a lane's colors are its own arithmetic alone), else each by its own and the lanes taken apart */
            double f[2];
            wasm_v128_store(f, m[0]);
            int s0 = pcLevels(f[0], b), s1 = pcLevels(f[1], s0);
            pcShade2(m, s0, lx, ly, c);
            if (s1 != s0) {
              v128_t one[3];
              pcShade2(m, s1, lx, ly, one);
              for (int i = 0; i < 3; i++) c[i] = wasm_i64x2_shuffle(c[i], one[i], 0, 3);
            }
          }
        }
        pcBytes(c[0], c[1], c[2], px, py, q + k, q + k + 1);
      }
      emitOpaque(x, y, n, q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7]);
    }
  }
  if (fSoft) finishFrame();
}
