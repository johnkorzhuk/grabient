import { expect, test } from "vitest";
import { ownStack, pageOf } from "./error-report.ts";

test("a page is named by its kind, or by a palette's or a collection's public address", () => {
  expect(pageOf("/")).toBe("home");
  expect(pageOf("/ja/palettes/rising")).toBe("palettes");
  expect(pageOf("/kS7Q8Yy5S_SChv0")).toBe("/kS7Q8Yy5S_SChv0");
  expect(pageOf("/ja/ocean-gradients")).toBe("/ocean-gradients");
  expect(pageOf("/@ada/warm-sunsets")).toBe("/@ada/warm-sunsets");
  expect(pageOf("/settings")).toBe("/settings");
});

test("a stack keeps the site's own frames, as paths without their queries", () => {
  const stack = [
    "TypeError: x is undefined",
    "    at f (https://grabient.com/assets/main-abc.js?v=1:12:4)",
    "    at g (chrome-extension://abc/inject.js:1:1)",
    "    at h (https://grabient.com/assets/page.js:3:9)"
  ].join("\n");
  expect(ownStack(stack, "https://grabient.com")).toBe(
    "at f (/assets/main-abc.js:12:4)\nat h (/assets/page.js:3:9)"
  );
  expect(ownStack(undefined, "https://grabient.com")).toBe("");
});
