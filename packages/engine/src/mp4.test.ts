import { describe, expect, it } from "vitest";
import { avcCodec, mp4, nalUnits, packFrames, unpackFrames } from "./mp4.ts";

/** An MP4's boxes, nested where a box holds others, each with its offset and its bytes after the header. */
interface Box {
  type: string;
  at: number;
  body: Uint8Array;
  children: Box[];
}
const PARENTS = new Set(["moov", "trak", "mdia", "minf", "dinf", "stbl"]);
function boxes(bytes: Uint8Array, from = 0, to = bytes.length): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Box[] = [];
  for (let at = from; at < to; ) {
    const size = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + size);
    out.push({
      type,
      at,
      body,
      children: PARENTS.has(type) ? boxes(bytes, at + 8, at + size) : []
    });
    at += size;
  }
  return out;
}
const find = (list: Box[], path: string): Box => {
  const [head, ...rest] = path.split("/");
  const box = list.find(b => b.type === head);
  if (!box) throw new Error(`no ${head}`);
  return rest.length ? find(box.children, rest.join("/")) : box;
};
const u32 = (bytes: Uint8Array, at: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at);

/* Annex B the way an encoder writes it: a key frame's SPS, PPS and slice, then slices alone */
const SPS = Uint8Array.of(0x67, 0x42, 0xc0, 0x2a, 0xab, 0x40);
const PPS = Uint8Array.of(0x68, 0xce, 0x3c, 0x80);
const start4 = (unit: Uint8Array) => [0, 0, 0, 1, ...unit];
const start3 = (unit: Uint8Array) => [0, 0, 1, ...unit];
const keyFrame = Uint8Array.from([
  ...start4(SPS),
  ...start4(PPS),
  ...start4(Uint8Array.of(0x65, 1, 2, 3))
]);
const frame = (n: number) => Uint8Array.from(start3(Uint8Array.of(0x41, n, n, 0, 0, 0, 7)));

describe("nalUnits", () => {
  it("cuts Annex B at three- and four-byte start codes, a unit's own zeros before the next start code its own", () => {
    const units = nalUnits(
      Uint8Array.from([...start4(SPS), ...start3(PPS), ...start4(Uint8Array.of(0x65, 0, 9))])
    );
    expect(units.map(u => [...u])).toEqual([[...SPS], [...PPS], [0x65, 0, 9]]);
  });
});

describe("mp4", () => {
  const file = mp4({ width: 1080, height: 1080, fps: 60 }, [
    { data: keyFrame, key: true },
    { data: frame(1), key: false },
    { data: frame(2), key: false }
  ]);
  const top = boxes(file);

  it("puts the index before the frames, so a player starts before the file is in", () => {
    expect(top.map(b => b.type)).toEqual(["ftyp", "moov", "mdat"]);
  });

  it("points the chunk at the frames, each length-prefixed, without the parameter sets", () => {
    const stbl = find(top, "moov/trak/mdia/minf/stbl");
    const mdat = find(top, "mdat");
    expect(u32(find(stbl.children, "stco").body, 8)).toBe(mdat.at + 8);
    const sizes = find(stbl.children, "stsz").body;
    expect([u32(sizes, 8), u32(sizes, 12), u32(sizes, 16), u32(sizes, 20)]).toEqual([3, 8, 11, 11]);
    expect([...mdat.body.subarray(0, 8)]).toEqual([0, 0, 0, 4, 0x65, 1, 2, 3]);
  });

  it("times each frame at 1/fps exactly and marks the key frames", () => {
    const stbl = find(top, "moov/trak/mdia/minf/stbl");
    const stts = find(stbl.children, "stts").body;
    expect([u32(stts, 4), u32(stts, 8), u32(stts, 12)]).toEqual([1, 3, 1000]);
    const mdhd = find(top, "moov/trak/mdia/mdhd").body;
    expect([u32(mdhd, 12), u32(mdhd, 16)]).toEqual([60000, 3000]);
    const stss = find(stbl.children, "stss").body;
    expect([u32(stss, 4), u32(stss, 8)]).toEqual([1, 1]);
  });

  it("names the codec from the SPS and tags the colors BT.709, limited range", () => {
    const stsd = find(top, "moov/trak/mdia/minf/stbl/stsd");
    const entry = stsd.body.subarray(8);
    expect(String.fromCharCode(...entry.subarray(4, 8))).toBe("avc1");
    const text = String.fromCharCode(...entry);
    const colr = entry.subarray(text.indexOf("colr") + 4);
    expect(String.fromCharCode(...colr.subarray(0, 4))).toBe("nclx");
    expect([...colr.subarray(4, 11)]).toEqual([0, 1, 0, 1, 0, 1, 0]);
    expect(avcCodec(SPS)).toBe("avc1.42c02a");
  });

  it("refuses frames with no parameter sets", () => {
    expect(() => mp4({ width: 2, height: 2, fps: 1 }, [{ data: frame(1), key: true }])).toThrow();
  });
});

describe("packFrames", () => {
  it("keeps frames and their key marks through a part's bytes", () => {
    const frames = [
      { data: keyFrame, key: true },
      { data: frame(1), key: false },
      { data: new Uint8Array(0), key: false }
    ];
    expect(unpackFrames(packFrames(frames))).toEqual(frames);
  });
});
