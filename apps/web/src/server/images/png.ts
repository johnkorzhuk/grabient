/* The PNG every picture is: 8-bit RGB, or RGBA where a picture lets what is behind it through, with an sRGB chunk,
   each row filtered by Sub and the rows deflated by the platform's CompressionStream, so the Worker needs no image
   library (https://www.w3.org/TR/png-3/). The rows go to the stream a band at a time and the file is written once, so
   a picture's encoding holds its pixels and its deflated bytes, not two more copies of each: at the largest picture
   an address asks for, 2400 by 1260, that was some 40 MB of an isolate's 128. */

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

/** The CRC of `data` carried on from `crc` (start with 0xffffffff, finish with its complement). */
function crcOn(crc: number, data: Uint8Array): number {
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 255] ^ (crc >>> 8);
  return crc;
}

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
/** Rows filtered and deflated at a time: a few hundred kilobytes, where the whole picture's rows were up to 12 MB. */
const BAND_BYTES = 1 << 18;

/** Pixels, row after row, three bytes each, or four with a straight alpha, as a PNG file. */
export async function encodePng(
  width: number,
  height: number,
  pixels: Uint8Array
): Promise<Uint8Array<ArrayBuffer>> {
  const channels = pixels.length / (width * height);
  if ((channels !== 3 && channels !== 4) || width < 1 || height < 1) {
    throw new Error(`${pixels.length} bytes are no ${width} by ${height} picture`);
  }
  const stride = width * channels;
  const deflate = new CompressionStream("deflate");
  const writer = deflate.writable.getWriter();
  const read = (async () => {
    const parts: Uint8Array[] = [];
    const reader = deflate.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return parts;
      parts.push(value);
    }
  })();
  // Sub turns a smooth ramp or a flat band into a run of near-equal bytes, which deflates to little. The rows go to
  // the stream a band at a time, so no copy of the whole picture's rows is held.
  const band = Math.max(1, Math.floor(BAND_BYTES / (stride + 1)));
  for (let first = 0; first < height; first += band) {
    const last = Math.min(height, first + band);
    const rows = new Uint8Array((stride + 1) * (last - first));
    for (let y = first; y < last; y++) {
      const to = (y - first) * (stride + 1);
      const from = y * stride;
      rows[to] = 1;
      for (let x = 0; x < stride; x++) {
        rows[to + 1 + x] = pixels[from + x] - (x < channels ? 0 : pixels[from + x - channels]);
      }
    }
    await writer.write(rows);
  }
  await writer.close();
  const parts = await read;
  const deflated = parts.reduce((sum, part) => sum + part.length, 0);
  // the file written once: signature, IHDR, sRGB, IDAT around the deflated parts, IEND
  const png = new Uint8Array(SIGNATURE.length + 25 + 13 + (12 + deflated) + 12);
  const view = new DataView(png.buffer);
  let at = 0;
  png.set(SIGNATURE, at);
  at += SIGNATURE.length;
  const chunk = (type: string, length: number, data: (into: number) => void) => {
    view.setUint32(at, length);
    for (let i = 0; i < 4; i++) png[at + 4 + i] = type.charCodeAt(i);
    data(at + 8);
    const crc = crcOn(0xffffffff, png.subarray(at + 4, at + 8 + length));
    view.setUint32(at + 8 + length, ~crc >>> 0);
    at += 12 + length;
  };
  chunk("IHDR", 13, into => {
    view.setUint32(into, width);
    view.setUint32(into + 4, height);
    png[into + 8] = 8;
    png[into + 9] = channels === 4 ? 6 : 2;
  });
  chunk("sRGB", 1, into => {
    png[into] = 0;
  });
  chunk("IDAT", deflated, into => {
    for (const part of parts) {
      png.set(part, into);
      into += part.length;
    }
  });
  chunk("IEND", 0, () => {});
  return png;
}
