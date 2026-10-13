/* A zip with every file stored as it is: PNG and JPEG are compressed already. It writes only what a folder of images
   needs: UTF-8 names (flag bit 11), no ZIP64 (a selection's images stay far below 4 GB), every entry dated `when` in
   local DOS fields, the year floored at 1980. */

/* every runtime the engine runs in has it; the engine's types leave out the web platform */
declare const TextEncoder: new () => { encode(text: string): Uint8Array };

const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** The files, in order, as one zip. A name is a path inside it and must not repeat. */
export function zipFiles(
  files: readonly { name: string; data: Uint8Array }[],
  when = new Date()
): Uint8Array<ArrayBuffer> {
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const date =
    ((Math.max(1980, when.getFullYear()) - 1980) << 9) |
    ((when.getMonth() + 1) << 5) |
    when.getDate();
  const entries = files.map(f => ({
    name: new TextEncoder().encode(f.name),
    data: f.data,
    crc: crc32(f.data)
  }));
  const local = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0);
  const directory = entries.reduce((n, e) => n + 46 + e.name.length, 0);
  const out = new Uint8Array(local + directory + 22);
  const view = new DataView(out.buffer);
  let at = 0;
  const u16 = (v: number) => {
    view.setUint16(at, v, true);
    at += 2;
  };
  const u32 = (v: number) => {
    view.setUint32(at, v, true);
    at += 4;
  };
  const bytes = (b: Uint8Array) => {
    out.set(b, at);
    at += b.length;
  };
  /* version 20, UTF-8 names, stored, the time and date, the CRC and both sizes, the name's length, no extra field */
  const common = (e: (typeof entries)[number]) => {
    u16(20);
    u16(0x0800);
    u16(0);
    u16(time);
    u16(date);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.name.length);
    u16(0);
  };
  const offsets: number[] = [];
  for (const e of entries) {
    offsets.push(at);
    u32(0x04034b50);
    common(e);
    bytes(e.name);
    bytes(e.data);
  }
  entries.forEach((e, i) => {
    u32(0x02014b50);
    u16(20);
    common(e);
    /* no comment, disk 0, no attributes, then where its local header stands */
    u16(0);
    u16(0);
    u16(0);
    u32(0);
    u32(offsets[i]);
    bytes(e.name);
  });
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(files.length);
  u16(files.length);
  u32(directory);
  u32(local);
  u16(0);
  return out;
}
