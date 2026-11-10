import { blobShapeOf } from "@grabient/engine/effect.ts";
import { expect, test } from "vitest";
import { LOOK_MAX } from "./address.ts";
import { keptLook, lookKind, readLook, savedLook } from "./look.ts";

const SEED = "kS7Q8Yy5S_SChv0";

test("a look a save kept of an effect the site plays no more is read as no effect, as any style that names none", () => {
  /* the zen garden (style=zen) was a field effect on staging from 8 to 10 Nov 2026, and a like or a collection's
     palette saved while it played kept "style=zen" and its settings in its look */
  const view = { style: "linearGradient", steps: 7, angle: 30 } as const;
  for (const style of ["zen", "wobble"]) {
    expect(lookKind(`style=${style}&angle=30&shape=7`), style).toBeNull();
    expect(readLook(SEED, `style=${style}&angle=30&shape=7`), style).toEqual({
      view: { ...view },
      effect: null
    });
    /* it says no more than its row's view, so the row reads as a plain palette in that view */
    expect(keptLook(SEED, `style=${style}&angle=30&speed=2&shape=7`, view), style).toBeNull();
    /* but for a soft or a grain saved with it, which stay the gradient's */
    expect(keptLook(SEED, `style=${style}&angle=30&grain=20&shape=7`, view), style).toBe(
      "angle=30&grain=20"
    );
  }
});

test("a save keeps a look written canonically, beside its view, and only where it says more than the view", () => {
  const view = { style: "linearGradient", steps: 7, angle: 30 } as const;
  // an effect, read as the address reads it and written again in its order, the size and anything unread left out
  expect(keptLook(SEED, "speed=2&shape=7&style=glass&size=1200x630&junk=1&angle=30", view)).toBe(
    "style=glass&angle=30&speed=2&shape=7"
  );
  expect(keptLook(SEED, "style=blob&bg=%23101014&frost=0.5&shape=12", view)).toBe(
    "style=blob&frost=0.5&shape=12&bg=%23101014"
  );
  // the strings' ground, and a clear one, which is no none of theirs
  expect(keptLook(SEED, "style=strings&bg=%23f4efe6&shape=12", view)).toBe(
    "style=strings&angle=30&shape=12&bg=%23f4efe6"
  );
  expect(keptLook(SEED, "style=strings&bg=transparent", view)).toBe("style=strings&angle=30");
  expect(keptLook(SEED, "style=strings&bg=%2300000000", view)).toBe(
    "style=strings&angle=30&bg=%2300000000"
  );
  // a blob with no shape keeps the palette's own, which its address names
  expect(keptLook(SEED, "style=blob", view)).toBe(`style=blob&shape=${blobShapeOf(SEED)}`);
  // a leading ? and a whole address read as the query after the seed
  expect(keptLook(SEED, "?style=glass&angle=30", view)).toBe("style=glass&angle=30");
  expect(keptLook(SEED, `https://grabient.com/${SEED}?style=glass&angle=30`, view)).toBe(
    "style=glass&angle=30"
  );
  // the view kept beside the look is the save's own: the glass turns at its angle, whatever the look said
  expect(keptLook(SEED, "style=glass&angle=200", view)).toBe("style=glass&angle=30");
  expect(keptLook(SEED, "style=glass", { ...view, angle: 90 })).toBe("style=glass");
  // a gradient's look says no more than the view: none is kept, in its own view or another
  for (const plain of ["", "?", "style=linearGradient&angle=30", "style=radialSwatches&steps=9"])
    expect(keptLook(SEED, plain, view)).toBeNull();
  // anything that is no look keeps none
  for (const junk of [undefined, null, 7, {}, "style=wobble", "speed=2", "x".repeat(LOOK_MAX + 1)])
    expect(keptLook(SEED, junk, view)).toBeNull();
  expect(keptLook(SEED, `style=glass&angle=30&${"x".repeat(LOOK_MAX)}`, view)).toBeNull();
  expect(keptLook("nothing", "style=glass", view)).toBeNull();
  // a row whose view is none keeps none
  expect(keptLook(SEED, "style=glass", { ...view, style: "sparkle" })).toBeNull();
  // what a save of a palette drawn so sends: its look while an effect plays, and none for its gradient
  const glass = readLook(SEED, "style=glass&speed=0&shape=3")!.effect;
  expect(savedLook(SEED, view, glass)).toBe("style=glass&angle=30&speed=0&shape=3");
  expect(savedLook(SEED, view, null)).toBeUndefined();
  /* the soft and the grain the view is drawn with go along, beside an effect and on a gradient alone, and the server
     keeps them as sent */
  const finished = { ...view, soft: 30, grain: 20 };
  expect(savedLook(SEED, finished, glass)).toBe(
    "style=glass&angle=30&soft=30&grain=20&speed=0&shape=3"
  );
  expect(keptLook(SEED, savedLook(SEED, finished, glass), view)).toBe(
    "style=glass&angle=30&soft=30&grain=20&speed=0&shape=3"
  );
  expect(savedLook(SEED, { ...view, grain: 40 }, null)).toMatch(/grain=40/);
});
