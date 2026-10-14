import { expect, test } from "vitest";
import { weekIconAnswer } from "./answers.ts";
import golden from "./fixtures/tab-icons.json" with { type: "json" };

test("each ISO week has its own tab icon files, from the first week to next week", async () => {
  const now = Date.parse(golden.now);
  for (const [path, want] of Object.entries(golden.weekFiles)) {
    if (!want) continue;
    const answer = weekIconAnswer(new Request(`https://grabient.test${path}`), now);
    expect([path, answer.status, answer.headers.get("Cache-Control")]).toEqual([
      path,
      want.status,
      want.cache
    ]);
    if (want.status === 200) expect(answer.headers.get("Content-Type")).toBe(want.type);
  }
  const file = (path: string) =>
    weekIconAnswer(new Request(`https://grabient.test${path}`), now).text();
  expect(await file("/favicon/2026-w42.svg")).toBe(golden.weekSvgW42.light);
  expect(await file("/favicon/2026-w42-dark.svg")).toBe(golden.weekSvgW42.dark);
  expect(weekIconAnswer(new Request("https://grabient.test/favicon/x.svg"), now).status).toBe(404);
});
