/* The aurora's hash, apart from its model (aurora.ts): the noise's lattice is made from it, and so are the paths made
   from a number (aurora-path-kinds.ts), which the Appearance menu's fields and the examples page load without the
   model. */

/** An integer hash to 0..1, in 32-bit unsigned arithmetic. */
export function auroraHash(n: number, seed: number): number {
  let h = (Math.imul(n | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
