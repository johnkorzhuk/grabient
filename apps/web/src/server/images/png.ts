/* The PNG every picture is: 8-bit RGB with no alpha and an sRGB chunk, each row filtered by Sub and the rows deflated
   by the platform's CompressionStream, so the Worker needs no image library (https://www.w3.org/TR/png-3/). */

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < data.length + 8; i++) crc = CRC_TABLE[(crc ^ out[i]) & 255] ^ (crc >>> 8);
  view.setUint32(data.length + 8, ~crc >>> 0);
  return out;
}

async function deflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

/** Pixels, three bytes each, row after row, as a PNG file. */
export async function encodePng(
  width: number,
  height: number,
  rgb: Uint8Array
): Promise<Uint8Array<ArrayBuffer>> {
  if (rgb.length !== width * height * 3 || width < 1 || height < 1) {
    throw new Error(`${rgb.length} bytes are no ${width} by ${height} picture`);
  }
  const stride = width * 3;
  // Sub turns a smooth ramp or a flat band into a run of near-equal bytes, which deflates to little.
  const rows = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const to = y * (stride + 1);
    const from = y * stride;
    rows[to] = 1;
    for (let x = 0; x < stride; x++) {
      rows[to + 1 + x] = rgb[from + x] - (x < 3 ? 0 : rgb[from + x - 3]);
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 2;
  const parts = [
    SIGNATURE,
    chunk("IHDR", header),
    chunk("sRGB", Uint8Array.of(0)),
    chunk("IDAT", await deflate(rows)),
    chunk("IEND", new Uint8Array(0))
  ];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
}
