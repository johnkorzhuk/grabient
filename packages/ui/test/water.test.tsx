import { renderToString } from "@solidjs/web";
import { describe, expect, test } from "vitest";
import { glowing, glowOff, glowOn } from "../src/glow.ts";
import { Shader } from "../src/Shader.tsx";
import { BRAND_SUPPLY, brandSupply } from "../src/supply.ts";

describe("the water", () => {
  test("the server draws the layer clear, with nothing for a reader and no fallback chosen", () => {
    const html = renderToString(() => (
      <Shader bar={() => undefined} onReady={() => {}} onStops={() => {}} />
    ));
    expect(html).toBe(
      '<div class="layer" aria-hidden="true"><canvas class="canvas"></canvas></div>'
    );
  });

  test("the supply draws a popular palette a quarter of the time, never the same twice running", () => {
    let i = 0;
    const rolls = [0.1, 0.0, 0.1, 0.0, 0.9];
    const next = brandSupply(BRAND_SUPPLY, 0.25, () => rolls[i++ % rolls.length]);
    const first = next();
    const second = next();
    expect(first).not.toBe(second);
    expect(next().anchors.length).toBeGreaterThanOrEqual(2);
  });

  test("one card glows at a time, the last lit, and only while it is on the page", () => {
    const el = { isConnected: true } as unknown as Element;
    const other = { isConnected: true } as unknown as Element;
    glowOn(el, [{ stops: ["#000000"] }]);
    glowOn(other, [{ stops: ["#ffffff"] }]);
    expect(glowing()?.el).toBe(other);
    glowOff(el);
    expect(glowing()?.el).toBe(other);
    (other as { isConnected: boolean }).isConnected = false;
    expect(glowing()).toBeNull();
  });
});
