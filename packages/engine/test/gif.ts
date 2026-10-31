/* A GIF reader for the tests: what gif.ts writes, read back by the format's rules alone. */

/** A GIF read back as a browser shows it: each frame composed over the one before by its disposal. */
export function readGif(bytes: Uint8Array) {
  let at = 0;
  const byte = () => bytes[at++];
  const short = () => byte() | (byte() << 8);
  const take = (n: number) => {
    at += n;
    return bytes.subarray(at - n, at);
  };
  const text = (n: number) => String.fromCharCode(...take(n));
  if (text(6) !== "GIF89a") throw new Error("not a GIF89a");
  const width = short();
  const height = short();
  const packed = byte();
  const background = byte();
  byte();
  const table: number[][] = [];
  if (packed & 0x80) {
    for (let i = 0; i < 1 << ((packed & 7) + 1); i++) table.push([byte(), byte(), byte()]);
  }
  const screen = new Uint8Array(4 * width * height);
  const frames: { pixels: Uint8Array; delay: number; box: number[]; disposal: number }[] = [];
  let loops: number | null = null;
  let control = { disposal: 0, delay: 0, transparent: -1 };
  let undo: (() => void) | null = null;
  for (;;) {
    const kind = byte();
    if (kind === 0x3b) break;
    if (kind === 0x21) {
      const label = byte();
      const blocks: Uint8Array[] = [];
      for (let n = byte(); n; n = byte()) blocks.push(take(n));
      if (label === 0xf9) {
        const [b] = blocks;
        control = {
          disposal: (b[0] >> 2) & 7,
          delay: b[1] | (b[2] << 8),
          transparent: b[0] & 1 ? b[3] : -1
        };
      } else if (label === 0xff && String.fromCharCode(...blocks[0]) === "NETSCAPE2.0") {
        loops = blocks[1][1] | (blocks[1][2] << 8);
      }
      continue;
    }
    if (kind !== 0x2c) throw new Error(`a block of kind ${kind}`);
    const [left, top, w, h] = [short(), short(), short(), short()];
    if (byte() & 0x80) throw new Error("a frame with a table of its own");
    const least = byte();
    const data: number[] = [];
    for (let n = byte(); n; n = byte()) for (let i = 0; i < n; i++) data.push(byte());
    const indices = lzwDecode(data, least, w * h);
    undo?.();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const index = indices[y * w + x];
        if (index === control.transparent) continue;
        const o = 4 * ((top + y) * width + left + x);
        screen.set([...table[index], 255], o);
      }
    }
    frames.push({
      pixels: screen.slice(),
      delay: control.delay,
      box: [left, top, w, h],
      disposal: control.disposal
    });
    /* disposal 2 clears the frame's box before the next is drawn */
    undo =
      control.disposal === 2
        ? () => {
            for (let y = top; y < top + h; y++)
              screen.fill(0, 4 * (y * width + left), 4 * (y * width + left + w));
          }
        : null;
    control = { disposal: 0, delay: 0, transparent: -1 };
  }
  return { width, height, background, table, frames, loops };
}

function lzwDecode(data: number[], least: number, count: number): number[] {
  const clear = 1 << least;
  const end = clear + 1;
  let size = least + 1;
  let dict: number[][] = [];
  const reset = () => {
    dict = Array.from({ length: clear + 2 }, (_, i) => (i < clear ? [i] : []));
    size = least + 1;
  };
  reset();
  const out: number[] = [];
  let bits = 0;
  let held = 0;
  let at = 0;
  let prior: number[] | null = null;
  for (;;) {
    while (held < size && at < data.length) {
      bits |= data[at++] << held;
      held += 8;
    }
    if (held < size) throw new Error("the data ended before its end code");
    const code = bits & ((1 << size) - 1);
    bits >>>= size;
    held -= size;
    if (code === clear) {
      reset();
      prior = null;
      continue;
    }
    if (code === end) break;
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (code === dict.length && prior) entry = [...prior, prior[0]];
    else throw new Error(`a code past the table: ${code}`);
    out.push(...entry);
    if (prior && dict.length < 4096) dict.push([...prior, entry[0]]);
    if (dict.length === 1 << size && size < 12) size++;
    prior = entry;
  }
  if (out.length !== count) throw new Error(`${out.length} indices for ${count} pixels`);
  return out;
}
