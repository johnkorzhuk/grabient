import { expect, test } from "vitest";
import { browserOf, clientErrorOf } from "./client-errors.ts";

test("the browser is its name and major version alone", () => {
  expect(
    browserOf(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15"
    )
  ).toBe("Safari 18");
  expect(
    browserOf(
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
    )
  ).toBe("Chrome 131 mobile");
  expect(browserOf("Mozilla/5.0 (Windows NT 10.0) Chrome/131.0 Safari/537.36 Edg/131.0")).toBe(
    "Edge 131"
  );
  expect(browserOf(null)).toBe("other");
});

test("a report keeps the site's own place and words, and nothing that names a reader", () => {
  expect(
    clientErrorOf(
      {
        message: "x is undefined\u0007",
        source: "/assets/main.js",
        line: 12,
        column: 4,
        stack: "at f (/assets/main.js:12:4)",
        page: "/kS7Q8Yy5S_SChv0",
        email: "someone@example.com"
      },
      "Firefox/140.0"
    )
  ).toEqual({
    page: "/kS7Q8Yy5S_SChv0",
    message: "x is undefined",
    at: "/assets/main.js:12:4",
    stack: "at f (/assets/main.js:12:4)",
    browser: "Firefox 140"
  });
  expect(clientErrorOf({ message: "" }, null)).toBeNull();
  expect(clientErrorOf({ message: "a", source: "/x?token=1" }, null)).toBeNull();
  expect(clientErrorOf({ message: "a", page: "https://evil.example/" }, null)).toBeNull();
  expect(clientErrorOf({ message: "a".repeat(400) }, null)?.message).toHaveLength(300);
});
