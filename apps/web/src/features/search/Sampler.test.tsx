import { renderToString } from "@solidjs/web";
import { expect, test } from "vitest";
import { Sampler } from "./Sampler.tsx";

const count = (html: string, needle: string) => html.split(needle).length - 1;

test("the sampler's points are pressed or not, each named by its color, with the colors in a line", () => {
  const points = [
    { x: 0.1, y: 0.2, hex: "#112233" },
    { x: 0.8, y: 0.5, hex: "#ddeeff" }
  ];
  const html = renderToString(() => (
    <Sampler
      src="/a.jpg"
      width={400}
      height={300}
      label="Your image"
      points={points}
      onMove={() => {}}
      onRelease={() => {}}
    />
  ));
  expect(html).toContain('aria-label="Your image"');
  expect(count(html, 'aria-label="Color 1, #112233"')).toBe(2);
  expect(count(html, 'aria-pressed="false"')).toBe(2);
  expect(html).toContain('points="10,20 80,50"');
  expect(html).not.toContain(">Reset<");
  const reset = renderToString(() => (
    <Sampler
      src="/a.jpg"
      width={400}
      height={300}
      label="Your image"
      points={points}
      onMove={() => {}}
      onRelease={() => {}}
      onReset={() => {}}
    />
  ));
  expect(reset).toContain(">Reset<");
});
