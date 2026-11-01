/* A PNG read back for the tests, by a reader of its own: every chunk's CRC checked, the rows inflated and unfiltered
   (all five filters), 8-bit RGB or RGBA. Runs in Node and in workerd. */

export interface Decoded {
  width: number;
  height: number;
  chunks: string[];
  /** 3 for RGB, 4 for RGBA */
  channels: number;
  pixels: Uint8Array<ArrayBuffer>;
}

const CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

async function inflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

export async function decodePng(png: Uint8Array | ArrayBuffer): Promise<Decoded> {
  const bytes = new Uint8Array(png);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if ([...bytes.subarray(0, 8)].join() !== "137,80,78,71,13,10,26,10") throw new Error("No PNG");
  const chunks: string[] = [];
  const idat: Uint8Array[] = [];
  let width = 0;
  let height = 0;
  let channels = 3;
  for (let at = 8; at < bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    let crc = 0xffffffff;
    for (let i = at + 4; i < at + 8 + length; i++) crc = CRC[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    if (~crc >>> 0 !== view.getUint32(at + 8 + length)) throw new Error(`${type} fails its CRC`);
    chunks.push(type);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      if (bytes[at + 16] !== 8 || (bytes[at + 17] !== 2 && bytes[at + 17] !== 6))
        throw new Error("Not 8-bit RGB or RGBA");
      channels = bytes[at + 17] === 6 ? 4 : 3;
    }
    if (type === "IDAT") idat.push(bytes.slice(at + 8, at + 8 + length));
    at += length + 12;
  }
  const joined = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of idat) {
    joined.set(part, offset);
    offset += part.length;
  }
  const rows = await inflate(joined);
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const raw = rows[y * (stride + 1) + 1 + x];
      const left = x < channels ? 0 : pixels[y * stride + x - channels];
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const corner = x < channels || !y ? 0 : pixels[(y - 1) * stride + x - channels];
      const predicted = [0, left, up, (left + up) >> 1, paeth(left, up, corner)][filter];
      if (predicted === undefined) throw new Error(`Filter ${filter}`);
      pixels[y * stride + x] = raw + predicted;
    }
  }
  return { width, height, chunks, channels, pixels };
}

/** The pixels' SHA-256 in hex, as the golden fixtures name a picture. */
export async function pixelHash(pixels: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", pixels));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

/** The color at a pixel, its alpha too in an RGBA picture. */
export const at = (
  picture: Pick<Decoded, "width" | "pixels"> & { channels?: number },
  x: number,
  y: number
) => {
  const n = picture.channels ?? 3;
  return [...picture.pixels.subarray((y * picture.width + x) * n, (y * picture.width + x) * n + n)];
};
