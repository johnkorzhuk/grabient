import { flush } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createPicture, type Picture } from "./picture.ts";

/* The picture a search by image was made from, beside the search that asks for its colors. */

const at = (hex: string, x: number) => ({ hex, x, y: 0.5 });
const first = [at("#112233", 0.1), at("#445566", 0.5), at("#778899", 0.9)];
const kept: Picture = {
  src: "blob:picture",
  width: 4,
  height: 3,
  points: first,
  first,
  asks: "#112233 #445566 #778899"
};

beforeEach(() => {
  const store = new Map([["grabient-picture", JSON.stringify(kept)]]);
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value)
  });
  // the points' pixels are read in the browser alone
  vi.stubGlobal(
    "Image",
    class {
      decode = () => new Promise(() => {});
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

test("a picture stays beside its search until the address reaches the colors its points now ask for", () => {
  const picture = createPicture();
  picture.restore(kept.asks);
  flush();
  expect(picture.pictureFor(kept.asks)?.points).toHaveLength(3);
  // an undo puts two points back, and the page goes on to search their colors
  const asks = picture.show(first.slice(0, 2));
  flush();
  expect(asks).toBe("#112233 #445566");
  expect(picture.pictureFor(kept.asks)?.points).toHaveLength(2);
  expect(picture.pictureFor(asks ?? "")?.points).toHaveLength(2);
  // the address has reached them: the colors before are another search
  expect(picture.pictureFor(kept.asks)).toBeNull();
  expect(picture.pictureFor("#000000 #ffffff")).toBeNull();
});
