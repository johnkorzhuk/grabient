import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createRest } from "./rest.ts";

const [first, second] = readFileSync(new URL("fixtures/palette-rest.txt", import.meta.url), "utf8")
  .split(/\n(?=\{)/)
  .map(text => JSON.parse(text));

test("waits as recorded: at once when opened, half a second after a change, doubling, twelve a minute", () => {
  const rest = createRest();
  const t = 1_000_000;
  rest.opened("kA");
  const out: Record<string, unknown> = { constants: { REST_MS: 500 }, openedLeft: rest.left(t) };
  rest.is("kB", undefined, t);
  out.changedLeft = rest.left(t);
  out.changedLeftAfter300 = rest.left(t + 300);
  const waits: number[] = [];
  for (let i = 0; i < 6; i++) {
    rest.asked(`k${i}`, t + i * 100);
    waits.push(rest.wait(t + i * 100 + 1));
  }
  out.doubling = waits;
  const before = rest.wait(t + 700);
  rest.asked("k5", t + 650);
  out.sameKeyDeduped = rest.wait(t + 700) === before;
  const u = 5_000_000;
  for (let i = 0; i < 12; i++) rest.asked(`m${i}`, u + i * 10_001);
  out.minuteRoom = rest.wait(u + 12 * 10_001);
  out.minuteRoomLater = rest.wait(u + 60_000 + 1);
  expect(out).toEqual(first);
});

test("twelve asks in under a minute hold the thirteenth back", () => {
  const rest = createRest();
  const u = 5_000_000;
  for (let i = 0; i < 12; i++) rest.asked(`m${i}`, u + i * 5000);
  expect({
    afterTwelveIn55s: rest.wait(u + 56_000),
    afterTwelveAt60s: rest.wait(u + 60_001),
    quiet10sLater: rest.wait(u + 55_000 + 10_000),
    quietMinuteLater: rest.wait(u + 55_000 + 60_000)
  }).toEqual(second);
});

test("a change of view starts the rest, and so does another palette", () => {
  const rest = createRest();
  const t = 1_000_000;
  rest.opened("kA");
  rest.is("kA", "linearGradient 7 90", t);
  expect(rest.left(t)).toBe(0);
  rest.is("kA", "radialGradient 7 90", t + 1000);
  expect(rest.left(t + 1000)).toBe(500);
  rest.is("kB", "radialGradient 7 90", t + 5000);
  expect(rest.left(t + 5000)).toBe(500);
  expect(rest.openedOn("kA")).toBe(true);
  expect(rest.openedOn("kB")).toBe(false);
});
