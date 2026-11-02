/* An MP4 of one H.264 track, as a browser, a phone and a chat app's player read it: the frames as H.264 gives them
   (Annex B, start codes), the index first so a player starts before the whole file is in ("faststart"), each frame
   1/fps long exactly, so a loop's length is its frames over its rate, and the colors tagged as they were coded
   (BT.709, limited range) in the track's sample entry as well as the stream. No sound. */

/** One coded frame: its bytes as the encoder wrote them, Annex B (start codes before each NAL unit). */
export interface Mp4Frame {
  data: Uint8Array;
  /** a key frame, where a player may start */
  key: boolean;
}

export interface Mp4Track {
  width: number;
  height: number;
  /** frames a second, whole */
  fps: number;
  /** H.273's color tags, BT.709's (1, 1, 1) unless said */
  colors?: { primaries: number; transfer: number; matrix: number };
}

/** The NAL units of Annex B bytes, start codes taken off. */
export function nalUnits(data: Uint8Array): Uint8Array[] {
  const units: Uint8Array[] = [];
  let start = -1;
  let i = 0;
  const n = data.length;
  while (i + 2 < n) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
      if (start >= 0) units.push(data.subarray(start, trimZeros(data, start, i)));
      i += 3;
      start = i;
    } else i++;
  }
  if (start >= 0 && start < n) units.push(data.subarray(start, n));
  return units;
}
/* a unit ends before the zeros of the next start code (00 00 00 01 has one more than 00 00 01) */
const trimZeros = (data: Uint8Array, start: number, end: number) => {
  while (end > start && data[end - 1] === 0) end--;
  return end;
};

const SPS = 7;
const PPS = 8;
const AUD = 9;
const SEI = 6;

/** The file. Its parameter sets are the first key frame's; a stream whose sets change is not one this writes. */
export function mp4(track: Mp4Track, frames: readonly Mp4Frame[]): Uint8Array<ArrayBuffer> {
  if (!frames.length) throw new Error("mp4: no frames");
  let sps: Uint8Array | null = null;
  let pps: Uint8Array | null = null;
  /* each frame's units but its parameter sets, length-prefixed: the sample as MP4 holds it */
  const samples: Uint8Array[][] = [];
  const sizes: number[] = [];
  for (const frame of frames) {
    const units: Uint8Array[] = [];
    let size = 0;
    for (const unit of nalUnits(frame.data)) {
      const type = unit[0] & 31;
      if (type === SPS) sps ??= unit;
      else if (type === PPS) pps ??= unit;
      else if (type !== AUD && type !== SEI) {
        units.push(unit);
        size += 4 + unit.length;
      }
    }
    samples.push(units);
    sizes.push(size);
  }
  if (!sps || !pps) throw new Error("mp4: no parameter sets");
  const colors = track.colors ?? { primaries: 1, transfer: 1, matrix: 1 };
  const timescale = track.fps * 1000;
  const delta = 1000;
  const duration = frames.length * delta;
  const movieScale = 1000;
  const movieDuration = Math.round((duration / timescale) * movieScale);
  const keys = frames.flatMap((f, i) => (f.key ? [i + 1] : []));
  const mdatSize = 8 + sizes.reduce((a, b) => a + b, 0);

  const ftyp = box("ftyp", ascii("isom"), u32(512), ascii("isomiso2avc1mp41"));
  /* the index, written twice: once to learn its length, then with the frames' place after it */
  const moovAt = (dataOffset: number) =>
    box(
      "moov",
      mvhd(movieScale, movieDuration),
      box(
        "trak",
        tkhd(movieDuration, track.width, track.height),
        box(
          "mdia",
          mdhd(timescale, duration),
          hdlr(),
          box(
            "minf",
            full("vmhd", 0, 1, u16(0), u16(0), u16(0), u16(0)),
            box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1))),
            box(
              "stbl",
              full("stsd", 0, 0, u32(1), avc1(track, sps, pps, colors)),
              full("stts", 0, 0, u32(1), u32(frames.length), u32(delta)),
              keys.length === frames.length
                ? new Uint8Array(0)
                : full("stss", 0, 0, u32(keys.length), ...keys.map(u32)),
              full("stsc", 0, 0, u32(1), u32(1), u32(frames.length), u32(1)),
              full("stsz", 0, 0, u32(0), u32(frames.length), ...sizes.map(u32)),
              full("stco", 0, 0, u32(1), u32(dataOffset))
            )
          )
        )
      )
    );
  const moovLength = moovAt(0).length;
  const moov = moovAt(ftyp.length + moovLength + 8);
  const out = new Uint8Array(ftyp.length + moov.length + mdatSize);
  const view = new DataView(out.buffer);
  let at = 0;
  out.set(ftyp, at);
  at += ftyp.length;
  out.set(moov, at);
  at += moov.length;
  view.setUint32(at, mdatSize);
  out.set(ascii("mdat"), at + 4);
  at += 8;
  for (const units of samples) {
    for (const unit of units) {
      view.setUint32(at, unit.length);
      out.set(unit, at + 4);
      at += 4 + unit.length;
    }
  }
  return out;
}

/** The track's codec as a page names it to a player (RFC 6381): avc1, then the profile, its flags and the level. */
export const avcCodec = (sps: Uint8Array): string =>
  `avc1.${[sps[1], sps[2], sps[3]].map(v => v.toString(16).padStart(2, "0")).join("")}`;

function avc1(
  track: Mp4Track,
  sps: Uint8Array,
  pps: Uint8Array,
  colors: { primaries: number; transfer: number; matrix: number }
): Uint8Array {
  const avcC = box(
    "avcC",
    u8(1),
    u8(sps[1]),
    u8(sps[2]),
    u8(sps[3]),
    u8(0xff), // 4-byte lengths
    u8(0xe1), // one SPS
    u16(sps.length),
    sps,
    u8(1), // one PPS
    u16(pps.length),
    pps
  );
  const colr = box(
    "colr",
    ascii("nclx"),
    u16(colors.primaries),
    u16(colors.transfer),
    u16(colors.matrix),
    u8(0) // limited range
  );
  const pasp = box("pasp", u32(1), u32(1));
  return box(
    "avc1",
    new Uint8Array(6), // reserved
    u16(1), // data reference index
    new Uint8Array(16), // pre-defined, reserved
    u16(track.width),
    u16(track.height),
    u32(0x00480000), // 72 dpi
    u32(0x00480000),
    u32(0),
    u16(1), // one frame a sample
    new Uint8Array(32), // compressor name
    u16(0x18), // depth
    u16(0xffff), // pre-defined
    avcC,
    colr,
    pasp
  );
}

const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

const mvhd = (timescale: number, duration: number) =>
  full(
    "mvhd",
    0,
    0,
    u32(0),
    u32(0),
    u32(timescale),
    u32(duration),
    u32(0x00010000), // rate 1
    u16(0x0100), // volume 1
    new Uint8Array(10),
    ...MATRIX.map(u32),
    new Uint8Array(24),
    u32(2) // next track id
  );

const tkhd = (duration: number, width: number, height: number) =>
  full(
    "tkhd",
    0,
    3, // enabled, in the movie
    u32(0),
    u32(0),
    u32(1), // track id
    u32(0),
    u32(duration),
    new Uint8Array(8),
    u16(0), // layer
    u16(0), // alternate group
    u16(0), // volume: none, a picture
    u16(0),
    ...MATRIX.map(u32),
    u32(width * 65536),
    u32(height * 65536)
  );

const mdhd = (timescale: number, duration: number) =>
  full("mdhd", 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0x55c4), u16(0)); // "und"

const hdlr = () =>
  full("hdlr", 0, 0, u32(0), ascii("vide"), new Uint8Array(12), ascii("Grabient\0"));

const u8 = (v: number) => Uint8Array.of(v);
const u16 = (v: number) => Uint8Array.of((v >>> 8) & 255, v & 255);
const u32 = (v: number) =>
  Uint8Array.of((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
const ascii = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0));

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const size = 8 + parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  out.set(ascii(type), 4);
  let at = 8;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const full = (type: string, version: number, flags: number, ...parts: Uint8Array[]) =>
  box(
    type,
    u8(version),
    u8((flags >>> 16) & 255),
    u8((flags >>> 8) & 255),
    u8(flags & 255),
    ...parts
  );

/** Coded frames as one run of bytes, kept while a clip is made in parts: how many, then each one's length (its top bit
    a key frame's), then their bytes. */
export function packFrames(frames: readonly Mp4Frame[]): Uint8Array<ArrayBuffer> {
  const head = 4 + 4 * frames.length;
  const out = new Uint8Array(head + frames.reduce((sum, f) => sum + f.data.length, 0));
  const view = new DataView(out.buffer);
  view.setUint32(0, frames.length);
  let at = head;
  frames.forEach((frame, i) => {
    view.setUint32(4 + 4 * i, (frame.data.length | (frame.key ? 0x80000000 : 0)) >>> 0);
    out.set(frame.data, at);
    at += frame.data.length;
  });
  return out;
}

/** Frames packFrames packed. */
export function unpackFrames(bytes: Uint8Array): Mp4Frame[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(0);
  const frames: Mp4Frame[] = [];
  let at = 4 + 4 * count;
  for (let i = 0; i < count; i++) {
    const word = view.getUint32(4 + 4 * i);
    const length = word & 0x7fffffff;
    frames.push({ data: bytes.slice(at, at + length), key: word >= 0x80000000 });
    at += length;
  }
  return frames;
}
