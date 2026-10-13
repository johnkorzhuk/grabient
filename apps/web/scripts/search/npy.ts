/* The least of .npy (version 1.0, little-endian float32, C order): how the Node steps hand matrices to the Python ones. */
import { writeFileSync } from "node:fs";

const MAGIC = Buffer.from([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0]);

export function writeNpy(file: string, rows: number, cols: number, data: Float32Array): void {
  const shape = `{'descr': '<f4', 'fortran_order': False, 'shape': (${rows}, ${cols}), }`;
  // the header ends in a newline at a multiple of 64 bytes, counting the magic and its own length
  const header = `${shape}${" ".repeat((64 - ((10 + shape.length + 1) % 64)) % 64)}\n`;
  const head = Buffer.alloc(10 + header.length);
  MAGIC.copy(head, 0);
  head.writeUInt16LE(header.length, 8);
  head.write(header, 10, "latin1");
  writeFileSync(
    file,
    Buffer.concat([head, Buffer.from(data.buffer, data.byteOffset, data.byteLength)])
  );
}
