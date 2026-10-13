import { crc32 as zlibCrc32 } from "node:zlib";
import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { crc32, zipFiles } from "./zip.ts";

const { zip } = golden<{
  zip: { files: { name: string; data: string; crc32: number }[]; zip: string };
}>("colors");
const bytes = (base64: string) => new Uint8Array(Buffer.from(base64, "base64"));

test("stored entries with UTF-8 names, dated in local fields, byte for byte as before", () => {
  const files = zip.files.map(f => ({ name: f.name, data: bytes(f.data) }));
  files.forEach((f, i) => {
    expect(crc32(f.data)).toBe(zip.files[i].crc32);
    expect(crc32(f.data)).toBe(zlibCrc32(f.data));
  });
  /* local fields, so the same in every time zone */
  expect(Buffer.from(zipFiles(files, new Date(2026, 8, 23, 14, 30, 10))).toString("base64")).toBe(
    zip.zip
  );
});

test("the central directory says where each entry is", () => {
  const out = zipFiles([{ name: "ü.png", data: new Uint8Array([1, 2, 3]) }], new Date(1975, 0, 1));
  const view = new DataView(out.buffer);
  const end = out.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const directory = view.getUint32(end + 16, true);
  expect(view.getUint32(directory, true)).toBe(0x02014b50);
  expect(view.getUint16(directory + 8, true)).toBe(0x0800);
  /* the year is floored at 1980 */
  expect(view.getUint16(directory + 14, true) >> 9).toBe(0);
  expect(
    new TextDecoder().decode(
      out.slice(directory + 46, directory + 46 + view.getUint16(directory + 28, true))
    )
  ).toBe("ü.png");
});
