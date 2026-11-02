import { EFFECT_PACE } from "@grabient/engine/effect-page.ts";
import { expect, test } from "vitest";
import { createPace } from "../src/pace.ts";

/* The effects' shader pages keep the players' frame rate in their own JavaScript (engine/effect-page.ts): the page's
   due() says yes and no where pace.ts does, at any rate and refresh. */
const pageDue = (fps: number) =>
  new Function("FPS", `${EFFECT_PACE}\nreturn due;`)(fps) as (now: number) => boolean;

test("a shader page's pace draws the frames the players' pace draws", () => {
  let seed = 3;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (const fps of [1, 7, 24, 30, 33, 59, 60, 90, 120, 0])
    for (const hz of [30, 60, 75, 120, 144, 240]) {
      const site = createPace();
      const page = pageDue(fps);
      let now = 1000 * rand();
      for (let frame = 0; frame < 2000; frame++) {
        /* a refresh, now and then a late one, or a pause */
        now +=
          (1000 / hz) * (rand() < 0.02 ? 1 + Math.floor(rand() * 40) : 1) + (rand() - 0.5) * 0.4;
        expect(page(now), `${fps} fps at ${hz} Hz, frame ${frame}`).toBe(site.due(now, fps));
      }
    }
});
