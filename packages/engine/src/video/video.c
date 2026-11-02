/* A palette's effect as H.264, in one module with no C library and no imports, for the Worker and the browser alike:
   the fluted glass's and the blob's pixels (engine/glass-render.ts's glassRenderer and engine/blob.ts's blobRenderer,
   their arithmetic in single precision and wasm SIMD, within a level of theirs), BT.709 YUV 4:2:0 written as they are
   drawn, and minih264 (CC0, lieff/minih264, patched for the level, the Constrained Baseline flags and the colors' VUI;
   its SSE2 code through emscripten's SSE headers) to code them.

   JS says where an effect stands in each frame (the glass's discs, the blob's balls: engine code, which moves them) and
   this draws it. One encoder an instance: create(), a setup, then per frame a draw and frame(). */
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
/* a frame's pixels, RGB, where a test reads a drawing (and the glass's map, four bytes a pixel, while it is set up) */
static unsigned char *pixels;
/* whether a drawing keeps its RGB at pixels too, which only a test asks */
static int keepRgb;
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
  pixels = take(N * 4);
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

/* Whether drawings keep their RGB at pixels as well as in the planes. */
EXPORT(keep_rgb)
void keep_rgb(int on) { keepRgb = on; }

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

/* Four pixels of two rows from (x, y): their R, G, B as whole numbers 0 to 255 in lanes 0 to 2, `a` above `b`; `n`
   of them written (4, or 2 at a row's end, the last two the first's again), into the planes and pixels where kept. */
static inline void put(int x, int y, int n, v128_t a0, v128_t a1, v128_t a2, v128_t a3, v128_t b0, v128_t b1, v128_t b2,
                       v128_t b3) {
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
      unsigned char *at = pixels + 3 * ((y + (k >> 2)) * W + x + (k & 3));
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
      put(x, y, 4, glassPixel(a + x), glassPixel(a + x + 1), glassPixel(a + x + 2), glassPixel(a + x + 3),
          glassPixel(b + x), glassPixel(b + x + 1), glassPixel(b + x + 2), glassPixel(b + x + 3));
    if (x < W) {
      v128_t a0 = glassPixel(a + x), a1 = glassPixel(a + x + 1), b0 = glassPixel(b + x), b1 = glassPixel(b + x + 1);
      put(x, y, 2, a0, a1, a0, a1, b0, b1, b0, b1);
    }
  }
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
