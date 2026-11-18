/* Deflate in zlib's format, written here so that a picture can be made in one go wherever the engine runs: the
   platform's own CompressionStream answers later, and a still is written while its page is (aurora-svg.ts). LZ77 by
   chains of three-byte hashes, a match passed over where the next byte starts a longer one or where its bytes cost
   less written as they are; then blocks of dynamic Huffman codes, each its own, so that a picture's sky, its shafts
   and the flat under its range are each written by how often their own bytes come. Measured 18 Nov 2026 on the
   aurora's stills, rows of small numbers and runs of zeros: within 2 to 3 percent of zlib's best (11.5 KiB where
   zlib writes 11.3, 26.0 where 25.3), in 6 and 20 ms; with every match taken that is found, as a plain greedy
   search takes them, 8 percent over. Whole numbers throughout, so its bytes are the same on every machine. */

/** How far back a match may lie, and how long it may be. */
const WINDOW = 32768;
const LONGEST = 258;
/** How many earlier places with the same three bytes a match is looked for at (48 write the stills 0.7 percent
    smaller in twice the time). */
const CHAIN = 16;
/** A match this long is taken without asking whether the next byte starts a longer one. */
const GOOD = 128;
/** What a match is taken to cost, in eighths of a bit, before the bits its distance carries beside its code: it is
    written only where its bytes as they are would cost more (15 bits; 12 and 18 each wrote the stills a percent
    larger). */
const MATCH_COST = 120;
/** How much is written under one pair of codes. */
const BLOCK = 8192;

/* a length's code (257 on) and a distance's (0 on), with the bits each carries beside it */
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258
];
const LENGTH_BITS = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
];
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577
];
const DISTANCE_BITS = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
];
const LENGTH_CODE = new Uint8Array(LONGEST + 1);
for (let code = 0; code < 29; code++)
  for (let n = LENGTH_BASE[code]; n < (code < 28 ? LENGTH_BASE[code + 1] : LONGEST + 1); n++)
    LENGTH_CODE[n] = code;
const distanceCode = (distance: number): number => {
  let code = 0;
  while (code < 29 && DISTANCE_BASE[code + 1] <= distance) code++;
  return code;
};
/* the order a block names the lengths of its code-length codes in */
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/* Code lengths for a set of counts, none longer than `limit`: Huffman's, and where its longest pass the limit they
   are cut to it and as many shorter ones made a bit longer as keeps the code whole (the commonest keep the
   shortest). */
function codeLengths(counts: Uint32Array, limit: number): Uint8Array {
  const lengths = new Uint8Array(counts.length);
  const used: number[] = [];
  for (let s = 0; s < counts.length; s++) if (counts[s] > 0) used.push(s);
  if (used.length === 0) return lengths;
  if (used.length === 1) {
    lengths[used[0]] = 1;
    return lengths;
  }
  /* rarest first, ties by the symbol, so the answer never hangs on a sort's own order */
  used.sort((a, b) => counts[a] - counts[b] || a - b);
  const n = used.length;
  /* the tree: its leaves in that order, then its joins as they are made, each of the two lightest left */
  const weight = new Float64Array(2 * n - 1);
  const parent = new Int32Array(2 * n - 1);
  for (let i = 0; i < n; i++) weight[i] = counts[used[i]];
  let leaf = 0;
  let join = n;
  for (let made = n; made < 2 * n - 1; made++) {
    let sum = 0;
    for (let k = 0; k < 2; k++) {
      const pick = leaf < n && (join >= made || weight[leaf] <= weight[join]) ? leaf++ : join++;
      sum += weight[pick];
      parent[pick] = made;
    }
    weight[made] = sum;
  }
  const depth = new Uint8Array(2 * n - 1);
  const many = new Uint32Array(limit + 1);
  for (let i = 2 * n - 3; i >= 0; i--) {
    depth[i] = Math.min(255, depth[parent[i]] + 1);
    if (i < n) many[Math.min(limit, depth[i])]++;
  }
  /* a code cut to the limit leaves the set overfull: others are lengthened until it is whole again */
  let total = 0;
  for (let len = 1; len <= limit; len++) total += many[len] << (limit - len);
  while (total > 1 << limit) {
    many[limit]--;
    for (let len = limit - 1; len > 0; len--)
      if (many[len]) {
        many[len]--;
        many[len + 1] += 2;
        break;
      }
    total--;
  }
  /* the rarest take the longest */
  let at = 0;
  for (let len = limit; len > 0; len--)
    for (let k = many[len]; k > 0; k--) lengths[used[at++]] = len;
  return lengths;
}

/* the codes of a set of lengths, each turned end for end, as bits written from the low end carry them */
function codesOf(lengths: Uint8Array): Uint16Array {
  const count = new Uint16Array(16);
  for (const len of lengths) count[len]++;
  count[0] = 0;
  const next = new Uint16Array(16);
  for (let len = 1, code = 0; len < 16; len++) {
    code = (code + count[len - 1]) << 1;
    next[len] = code;
  }
  const codes = new Uint16Array(lengths.length);
  for (let s = 0; s < lengths.length; s++) {
    const len = lengths[s];
    if (!len) continue;
    let code = next[len]++;
    let turned = 0;
    for (let k = 0; k < len; k++) {
      turned = (turned << 1) | (code & 1);
      code >>= 1;
    }
    codes[s] = turned;
  }
  return codes;
}

/** Bytes deflated in zlib's format, a stretch of them a step. */
export function* deflateSteps(data: Uint8Array): Generator<void, Uint8Array> {
  const n = data.length;
  /* what a byte costs written as it is, in eighths of a bit, by how often it comes: the whole bits by halving, the
     rest from the next three bits */
  const costOf = new Uint16Array(256);
  const seen = new Uint32Array(256);
  for (let i = 0; i < n; i++) seen[data[i]]++;
  for (let b = 0; b < 256; b++) {
    let ratio = Math.floor((n * 256) / Math.max(1, seen[b]));
    let whole = 0;
    while (ratio >= 512) {
      ratio = Math.floor(ratio / 2);
      whole++;
    }
    costOf[b] = Math.max(4, whole * 8 + ((ratio - 256) >> 5));
  }
  /* what is written: a byte (a length of 0), or a match's length and how far back it lies */
  const tokenLength = new Uint16Array(n);
  const tokenValue = new Uint16Array(n);
  let tokens = 0;
  const head = new Int32Array(WINDOW).fill(-1);
  const prev = new Int32Array(n);
  const hash = (i: number) => ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & (WINDOW - 1);
  const enter = (i: number) => {
    if (i + 2 >= n) return;
    const h = hash(i);
    prev[i] = head[h];
    head[h] = i;
  };
  /* the longest match for the bytes at i among the places entered, 0 where none is worth writing, and how far back
     it lies */
  let far = 0;
  const longest = (i: number): number => {
    if (i + 2 >= n) return 0;
    let best = 2;
    const most = Math.min(LONGEST, n - i);
    let at = head[hash(i)];
    for (let tries = CHAIN; at >= 0 && i - at <= WINDOW && tries > 0; tries--, at = prev[at]) {
      if (data[at + best] !== data[i + best] || data[at] !== data[i]) continue;
      let len = 0;
      while (len < most && data[at + len] === data[i + len]) len++;
      if (len > best) {
        best = len;
        far = i - at;
        if (len >= most) break;
      }
    }
    if (best < 3) return 0;
    let asBytes = 0;
    for (let k = 0; k < best && asBytes <= 4096; k++) asBytes += costOf[data[i + k]];
    return asBytes > MATCH_COST + 8 * DISTANCE_BITS[distanceCode(far)] ? best : 0;
  };
  for (let i = 0; i < n; ) {
    let len = longest(i);
    const distance = far;
    enter(i);
    /* a longer match one byte on: this byte goes as it is */
    if (len && len < GOOD && longest(i + 1) > len) len = 0;
    if (len) {
      tokenLength[tokens] = len;
      tokenValue[tokens++] = distance;
      for (let k = 1; k < len; k++) enter(i + k);
      i += len;
    } else {
      tokenLength[tokens] = 0;
      tokenValue[tokens++] = data[i];
      i++;
    }
    if ((tokens & 2047) === 0) yield;
  }

  /* the bits, low end first */
  let out = new Uint8Array(Math.max(64, (n >> 1) + 1024));
  let size = 0;
  let held = 0;
  let bits = 0;
  const put = (value: number, count: number) => {
    held |= value << bits;
    bits += count;
    while (bits >= 8) {
      if (size >= out.length) {
        const more = new Uint8Array(out.length * 2);
        more.set(out);
        out = more;
      }
      out[size++] = held & 255;
      held >>>= 8;
      bits -= 8;
    }
  };
  /* zlib's two bytes: deflate, the whole window, its check */
  put(0x78, 8);
  put(0xda, 8);
  for (let from = 0; from < tokens || from === 0; from += BLOCK) {
    const to = Math.min(tokens, from + BLOCK);
    /* the block's two codes, from how often it writes each symbol */
    const literals = new Uint32Array(286);
    const distances = new Uint32Array(30);
    literals[256] = 1;
    for (let t = from; t < to; t++) {
      if (tokenLength[t]) {
        literals[257 + LENGTH_CODE[tokenLength[t]]]++;
        distances[distanceCode(tokenValue[t])]++;
      } else literals[tokenValue[t]]++;
    }
    const literalLengths = codeLengths(literals, 15);
    const distanceLengths = codeLengths(distances, 15);
    /* a block names at least one distance code, used or not */
    if (!distanceLengths.some(len => len > 0)) distanceLengths[0] = 1;
    let literalCount = 286;
    while (literalCount > 257 && !literalLengths[literalCount - 1]) literalCount--;
    let distanceCount = 30;
    while (distanceCount > 1 && !distanceLengths[distanceCount - 1]) distanceCount--;
    /* the lengths of both codes in one row, a run of one length written as a repeat */
    const row = new Uint8Array(literalCount + distanceCount);
    row.set(literalLengths.subarray(0, literalCount));
    row.set(distanceLengths.subarray(0, distanceCount), literalCount);
    const written: number[] = [];
    const beside: number[] = [];
    for (let i = 0; i < row.length; ) {
      let run = 1;
      while (i + run < row.length && row[i + run] === row[i]) run++;
      const len = row[i];
      i += run;
      if (len === 0) {
        for (; run >= 11; run -= Math.min(run, 138)) {
          written.push(18);
          beside.push(Math.min(run, 138) - 11);
        }
        if (run >= 3) {
          written.push(17);
          beside.push(run - 3);
          run = 0;
        }
      } else {
        written.push(len);
        beside.push(0);
        run--;
        for (; run >= 3; run -= Math.min(run, 6)) {
          written.push(16);
          beside.push(Math.min(run, 6) - 3);
        }
      }
      for (; run > 0; run--) {
        written.push(len);
        beside.push(0);
      }
    }
    const lengthCounts = new Uint32Array(19);
    for (const s of written) lengthCounts[s]++;
    const lengthLengths = codeLengths(lengthCounts, 7);
    let named = 19;
    while (named > 4 && !lengthLengths[ORDER[named - 1]]) named--;
    const literalCodes = codesOf(literalLengths);
    const distanceCodes = codesOf(distanceLengths);
    const lengthCodes = codesOf(lengthLengths);
    /* whether it is the last, that its codes are its own, how many of each it names, then the codes' lengths */
    put(to >= tokens ? 1 : 0, 1);
    put(2, 2);
    put(literalCount - 257, 5);
    put(distanceCount - 1, 5);
    put(named - 4, 4);
    for (let k = 0; k < named; k++) put(lengthLengths[ORDER[k]], 3);
    for (let k = 0; k < written.length; k++) {
      const s = written[k];
      put(lengthCodes[s], lengthLengths[s]);
      if (s === 16) put(beside[k], 2);
      else if (s === 17) put(beside[k], 3);
      else if (s === 18) put(beside[k], 7);
    }
    for (let t = from; t < to; t++) {
      const len = tokenLength[t];
      if (!len) {
        put(literalCodes[tokenValue[t]], literalLengths[tokenValue[t]]);
        continue;
      }
      const code = LENGTH_CODE[len];
      put(literalCodes[257 + code], literalLengths[257 + code]);
      if (LENGTH_BITS[code]) put(len - LENGTH_BASE[code], LENGTH_BITS[code]);
      const distance = tokenValue[t];
      const away = distanceCode(distance);
      put(distanceCodes[away], distanceLengths[away]);
      /* up to 13 bits beside a code of up to 15: in two parts, so the bits held never pass 32 */
      if (DISTANCE_BITS[away] > 8) {
        put((distance - DISTANCE_BASE[away]) & 255, 8);
        put((distance - DISTANCE_BASE[away]) >> 8, DISTANCE_BITS[away] - 8);
      } else if (DISTANCE_BITS[away]) put(distance - DISTANCE_BASE[away], DISTANCE_BITS[away]);
    }
    put(literalCodes[256], literalLengths[256]);
    yield;
  }
  if (bits) put(0, 8 - bits);
  /* Adler-32 of the bytes as they were */
  let a = 1;
  let b = 0;
  for (let i = 0; i < n; ) {
    const end = Math.min(n, i + 3800);
    for (; i < end; i++) {
      a += data[i];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  for (const byte of [b >> 8, b & 255, a >> 8, a & 255]) put(byte, 8);
  return out.slice(0, size);
}

/** Bytes deflated in zlib's format: deflateSteps, at once. */
export function deflate(data: Uint8Array): Uint8Array {
  const steps = deflateSteps(data);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
