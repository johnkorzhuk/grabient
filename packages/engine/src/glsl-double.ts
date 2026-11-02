/* JavaScript's numbers in GLSL ES 3.00: IEEE 754 doubles held as their two 32-bit words (high, low) in a uvec2, each
   operation rounded to nearest even as JavaScript's is, by integer arithmetic alone, which every GPU computes exactly
   and none reorders. A shader that must land on the very doubles a page's script computes (the blob's Shadertoy text,
   blob-shadertoy.ts) computes them here, through a program (double-program.ts) whose interpreter calls each operation
   from one place: a GPU's compiler inlines every call, and these inlined many times over take SwiftShader minutes to
   compile. Nothing here branches either: each choice is a select of two values both computed. Normal numbers and
   zeros only: no infinities, NaNs or subnormals, which the blob never meets. */

/** A double as GLSL: its two words, high first. */
export function dlit(x: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const hex = (n: number) => `0x${n.toString(16).padStart(8, "0")}u`;
  return `uvec2(${hex(view.getUint32(0))}, ${hex(view.getUint32(4))})`;
}

export const GLSL_DOUBLE = `// Doubles as their two words, high first: JavaScript's arithmetic, rounded to nearest even, with no branch.
// c is 1 or 0: x where it is 1, y where 0.
uvec2 sel(uint c, uvec2 x, uvec2 y) {
  uvec2 m = uvec2(0u - c);
  return (x & m) | (y & ~m);
}
int seli(uint c, int x, int y) { return int((uint(x) & (0u - c)) | (uint(y) & ~(0u - c))); }
uvec2 add64(uvec2 a, uvec2 b) {
  uint lo = a.y + b.y;
  return uvec2(a.x + b.x + uint(lo < a.y), lo);
}
uvec2 sub64(uvec2 a, uvec2 b) { return uvec2(a.x - b.x - uint(a.y < b.y), a.y - b.y); }
uint lt64(uvec2 a, uvec2 b) { return uint(a.x < b.x) | (uint(a.x == b.x) & uint(a.y < b.y)); }
// by n bits, 0 from 64 up
uvec2 shl64(uvec2 a, int n) {
  uint s = uint(n) & 31u;
  uvec2 low = uvec2((a.x << s) | ((a.y >> 1) >> (31u - s)), a.y << s);
  return sel(uint(n < 32), low, sel(uint(n < 64), uvec2(a.y << s, 0u), uvec2(0u)));
}
uvec2 shr64(uvec2 a, int n) {
  uint s = uint(n) & 31u;
  uvec2 low = uvec2(a.x >> s, (a.y >> s) | ((a.x << 1) << (31u - s)));
  return sel(uint(n < 32), low, sel(uint(n < 64), uvec2(0u, a.x >> s), uvec2(0u)));
}
// shifted right, any 1 shifted out kept in bit 0
uvec2 shrSticky(uvec2 a, int n) {
  uvec2 r = shr64(a, n);
  return uvec2(r.x, r.y | uint(shl64(r, n) != a));
}
int clz32(uint x) {
  uint n = 0u, c;
  c = uint(x <= 0xffffu); n += c * 16u; x <<= c * 16u;
  c = uint(x <= 0xffffffu); n += c * 8u; x <<= c * 8u;
  c = uint(x <= 0xfffffffu); n += c * 4u; x <<= c * 4u;
  c = uint(x <= 0x3fffffffu); n += c * 2u; x <<= c * 2u;
  c = uint(x <= 0x7fffffffu); n += c; x <<= c;
  return int(n + uint(x == 0u));
}
int clz64(uvec2 a) { return seli(uint(a.x != 0u), clz32(a.x), 32 + clz32(a.y)); }
// a 32 by 32 bit product, 64 bits
uvec2 mul32(uint a, uint b) {
  uint a0 = a & 0xffffu, a1 = a >> 16, b0 = b & 0xffffu, b1 = b >> 16;
  uint p00 = a0 * b0, p01 = a0 * b1, p10 = a1 * b0, p11 = a1 * b1;
  uint mid = (p00 >> 16) + (p01 & 0xffffu) + (p10 & 0xffffu);
  return uvec2(p11 + (p01 >> 16) + (p10 >> 16) + (mid >> 16), (p00 & 0xffffu) | (mid << 16));
}

const uvec2 D_ZERO = uvec2(0u);
const uvec2 D_ONE = uvec2(0x3ff00000u, 0u);
bool dZero(uvec2 a) { return ((a.x << 1) | a.y) == 0u; }
uint dSign(uvec2 a) { return a.x >> 31; }
int dExp(uvec2 a) { return int((a.x >> 20) & 0x7ffu); }
// the significand, its leading 1 at bit 52
uvec2 dMant(uvec2 a) { return uvec2((a.x & 0xfffffu) | 0x100000u, a.y); }
uvec2 dNeg(uvec2 a) { return uvec2(a.x ^ 0x80000000u, a.y); }
uvec2 dAbs(uvec2 a) { return uvec2(a.x & 0x7fffffffu, a.y); }
// a significand whose leading 1 is at bit 62, 10 bits below the 53 kept and a sticky 1 in bit 0, to nearest even
uvec2 dRound(uint sign, int e, uvec2 m) {
  uint rest = m.y & 0x3ffu;
  m = shr64(m, 10);
  m = add64(m, uvec2(0u, uint(rest > 0x200u) | (uint(rest == 0x200u) & m.y & 1u)));
  uint over = (m.x >> 21) & 1u;
  m = shr64(m, int(over));
  return uvec2((sign << 31) | (uint(e + int(over)) << 20) | (m.x & 0xfffffu), m.y);
}
// a significand that is not 0, of any width, its exponent e for a leading 1 at bit 62, to nearest even
uvec2 dNormal(uint sign, int e, uvec2 m) {
  int z = clz64(m);
  uint top = uint(z == 0);
  int up = max(z - 1, 0);
  return dRound(sign, e + int(top) - up, sel(top, shrSticky(m, 1), shl64(m, up)));
}
uvec2 dAdd(uvec2 a, uvec2 b) {
  uint swap = lt64(dAbs(a), dAbs(b));
  uvec2 x = sel(swap, b, a), y = sel(swap, a, b);
  int ex = dExp(x);
  uvec2 mx = shl64(dMant(x), 10);
  uvec2 my = sel(uint(dZero(y)), D_ZERO, shrSticky(shl64(dMant(y), 10), ex - dExp(y)));
  uvec2 m = sel(uint(dSign(x) == dSign(y)), add64(mx, my), sub64(mx, my));
  uint cancel = uint(m == D_ZERO);
  uvec2 r = sel(cancel, D_ZERO, dNormal(dSign(x), ex, sel(cancel, D_ONE, m)));
  return sel(uint(dZero(x)), uvec2(a.x & b.x & 0x80000000u, 0u), r);
}
uvec2 dMul(uvec2 a, uvec2 b) {
  uint sign = dSign(a) ^ dSign(b);
  uvec2 ma = dMant(a), mb = dMant(b);
  // the 106-bit product: the 64 bits from its leading 1 down, the rest kept as a sticky bit
  uvec2 ll = mul32(ma.y, mb.y), mid = add64(mul32(ma.y, mb.x), mul32(ma.x, mb.y));
  uint w1 = ll.x + mid.y;
  uvec2 top = add64(add64(mul32(ma.x, mb.x), uvec2(0u, mid.x)), uvec2(0u, uint(w1 < ll.x)));
  uint high = (top.x >> 9) & 1u;
  int shift = 42 + int(high);
  uvec2 m = shl64(top, 64 - shift);
  m.y |= (w1 >> uint(shift - 32)) | uint(((w1 << uint(64 - shift)) | ll.y) != 0u);
  uvec2 r = dRound(sign, dExp(a) + dExp(b) - 1023 + int(high), m);
  return sel(uint(dZero(a)) | uint(dZero(b)), uvec2(sign << 31, 0u), r);
}
uvec2 dDiv(uvec2 a, uvec2 b) {
  uint sign = dSign(a) ^ dSign(b);
  uvec2 r = dMant(a), d = dMant(b);
  uint less = lt64(r, d);
  r = shl64(r, int(less));
  uvec2 q = D_ZERO;
  for (int i = 0; i < 55; i++) {
    uint fits = 1u - lt64(r, d);
    r = shl64(sel(fits, sub64(r, d), r), 1);
    q = shl64(q, 1) | uvec2(0u, fits);
  }
  q = shl64(q, 8) | uvec2(0u, uint(r != D_ZERO));
  return sel(uint(dZero(a)), uvec2(sign << 31, 0u), dRound(sign, dExp(a) - dExp(b) + 1023 - int(less), q));
}
bool dLt(uvec2 a, uvec2 b) {
  uint both = uint(dZero(a)) & uint(dZero(b));
  uint sa = dSign(a), sb = dSign(b);
  uint same = sel(sa, uvec2(lt64(b, a)), uvec2(lt64(a, b))).x;
  return ((1u - both) & sel(uint(sa != sb), uvec2(sa), uvec2(same)).x) == 1u;
}
// toward zero
uvec2 dTrunc(uvec2 a) {
  int e = dExp(a) - 1023;
  return sel(uint(e < 0), uvec2(a.x & 0x80000000u, 0u), a & ~shr64(uvec2(0xfffffu, 0xffffffffu), max(e, 0)));
}
uvec2 dFromInt(int i) {
  return sel(uint(i == 0), D_ZERO, dNormal(uint(i < 0), 1053, uvec2(max(uint(abs(i)), 1u), 0u)));
}
uvec2 dFromFloat(float f) {
  uint b = floatBitsToUint(f);
  uvec2 d = uvec2((b & 0x80000000u) | ((((b >> 23) & 0xffu) + 896u) << 20) | ((b & 0x7fffffu) >> 3), b << 29);
  return sel(uint((b << 1) == 0u), uvec2(b, 0u), d);
}
// the float nearest, ties to even, as a Float32Array keeps it
float dToFloat(uvec2 a) {
  uvec2 m = shl64(dMant(a), 10);
  uint kept = m.x >> 7, rest = m.x & 0x7fu;
  kept += uint(rest > 0x40u) | (uint(rest == 0x40u) & (uint(m.y != 0u) | (kept & 1u)));
  uint over = kept >> 24;
  uint bits = (dSign(a) << 31) | (uint(dExp(a) - 896 + int(over)) << 23) | ((kept >> over) & 0x7fffffu);
  return uintBitsToFloat(sel(uint(dZero(a)), a, uvec2(bits)).x);
}
// toward zero, for |a| under 2^31
int dToInt(uvec2 a) {
  int e = dExp(a) - 1023;
  int v = int(shr64(dMant(a), clamp(52 - e, 0, 64)).y);
  return seli(uint(e < 0), 0, seli(dSign(a), -v, v));
}
// a positive number times 10^digits, rounded half up exactly as toFixed rounds it: the whole number toFixed writes
uvec2 dDecimal(uvec2 a, int digits) {
  uint m = digits == 3 ? 1000u : digits == 2 ? 100u : 10u;
  uvec2 v = dMant(a);
  uvec2 lo = mul32(v.y, m);
  uvec2 p = uvec2(v.x * m + lo.x, lo.y);
  int shift = 52 - (dExp(a) - 1023);
  uvec2 n = shr64(add64(p, shl64(uvec2(0u, 1u), shift - 1)), shift);
  return sel(uint(dZero(a)), D_ZERO, dFromInt(int(n.y)));
}`;
