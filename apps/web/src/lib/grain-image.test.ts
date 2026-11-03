import { expect, test } from "vitest";
import { grainImageUri } from "./grain-image.ts";

test("the grain over a picture as one PNG's data URI, its size the picture's", async () => {
  const uri = await grainImageUri(40, { width: 300, height: 200 });
  expect(uri).toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
  const png = Uint8Array.from(atob(uri.slice(uri.indexOf(",") + 1)), c => c.charCodeAt(0));
  const view = new DataView(png.buffer);
  expect([view.getUint32(16), view.getUint32(20)]).toEqual([300, 200]);
});
