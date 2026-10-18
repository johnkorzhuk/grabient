import { expect, test } from "vitest";
import { browserOf, clientErrorOf, issueOf, usageEventOf } from "./client-errors.ts";

const CHROME =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";

/** What Workers Issues groups a logged error by: its name and its message. */
function issue(report: Record<string, unknown>, agent: string | null = CHROME) {
  const read = clientErrorOf(report, agent);
  if (!read) throw new Error("the report was refused");
  const { name, message } = issueOf(read);
  return `${name}: ${message}`;
}

test("the browser is its name and major version alone", () => {
  expect(
    browserOf(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15"
    )
  ).toBe("Safari 18");
  expect(browserOf(CHROME)).toBe("Chrome 131 mobile");
  expect(browserOf("Mozilla/5.0 (Windows NT 10.0) Chrome/131.0 Safari/537.36 Edg/131.0")).toBe(
    "Edge 131"
  );
  expect(browserOf(null)).toBe("other");
});

test("a report keeps the error's type, its words and its place in the site's own scripts", () => {
  expect(
    clientErrorOf(
      {
        name: "TypeError",
        message: "x is undefined\u0007",
        source: "/assets/main-B9ach0AE.js",
        line: 12,
        column: 4,
        stack: "at f (/assets/main-B9ach0AE.js:12:4)\nat g (/assets/vendor-Cgxu01Sa.js:3:9)",
        page: "/kS7Q8Yy5S_SChv0",
        email: "someone@example.com"
      },
      "Firefox/140.0"
    )
  ).toEqual({
    name: "TypeError",
    message: "x is undefined",
    script: "main.js",
    frames: ["at f (/assets/main-B9ach0AE.js:12:4)", "at g (/assets/vendor-Cgxu01Sa.js:3:9)"],
    page: "/kS7Q8Yy5S_SChv0",
    browser: "Firefox 140"
  });
  // a report from an older page names no type; one with a source alone keeps that place as its frame
  expect(clientErrorOf({ message: "a", source: "/assets/a.js", line: 3 }, null)).toMatchObject({
    name: "Error",
    script: "a.js",
    frames: ["at /assets/a.js:3:?"]
  });
  expect(clientErrorOf({ message: "a", name: "not a type" }, null)?.name).toBe("Error");
  expect(clientErrorOf({ message: "" }, null)).toBeNull();
  expect(clientErrorOf({ message: "a", source: "/x?token=1" }, null)).toBeNull();
  expect(clientErrorOf({ message: "a", page: "https://evil.example/" }, null)).toBeNull();
  expect(clientErrorOf({ message: "a", page: "/@ada/warm-sunsets" }, null)).toBeNull();
  expect(clientErrorOf({ message: "a", page: "/de/@ada/warm-sunsets" }, null)).toBeNull();
  expect(clientErrorOf({ message: "a".repeat(400) }, null)?.message).toHaveLength(300);
});

test("a script the browser could not load is counted apart from the errors, in every browser's words", () => {
  for (const message of [
    "Failed to fetch dynamically imported module: https://grabient.com/assets/Made-zGxmvvxT.js",
    "error loading dynamically imported module: https://grabient.com/assets/Made-zGxmvvxT.js",
    "Importing a module script failed.",
    "Unable to preload CSS for /assets/Sheet-Cq3x8a1b.css"
  ])
    expect(usageEventOf({ message }), message).toBe("script-load");
  for (const message of [
    "structuredClone is not defined",
    "Cannot read properties of undefined (reading 'seed')",
    "Hydration Mismatch. Unable to find DOM nodes for hydration key: 10002"
  ])
    expect(usageEventOf({ message }), message).toBe("client-error");
});

test("one error is one issue on every page, browser and deploy", () => {
  const met = {
    name: "TypeError",
    message: "Cannot read properties of undefined (reading 'x')",
    stack: "at e (/assets/index-DMi2wf-V.js:1:2345)\nat /assets/vendor-BnI1QEQG.js:1:99",
    page: "palettes"
  };
  expect(issue(met)).toBe(
    "Browser TypeError in index.js: Cannot read properties of undefined (reading 'x')"
  );
  // another page, another browser, and the next deploy's build, where the same line has moved
  const again = {
    ...met,
    stack: "e@/assets/index-Xk3_9aQ1.js:1:2410\n@/assets/vendor-a1B2c3D4.js:1:120",
    page: "/kS7Q8Yy5S_SChv0"
  };
  expect(issue(again, FIREFOX)).toBe(issue(met));
  // where the browser named only the script, as a window's error from an older page does
  expect(
    issue({ name: "TypeError", message: met.message, source: "/assets/index-DMi2wf-V.js" })
  ).toBe(issue(met));
  // a chunk a deploy took away is one issue whichever build's file the page asked for
  const missing = (file: string) => ({
    name: "TypeError",
    message: `Failed to fetch dynamically imported module: https://grabient.com/assets/${file}`,
    stack: `at /assets/index-DMi2wf-V.js:1:50`
  });
  expect(issue(missing("Editor-DExLs8v3.js"))).toBe(issue(missing("Editor-B3dMZOku.js")));
});

test("an error's type, its words and the script it was thrown in each make an issue of its own", () => {
  const met = {
    name: "TypeError",
    message: "x is undefined",
    stack: "at e (/assets/index-DMi2wf-V.js:1:2345)"
  };
  const issues = new Set([
    issue(met),
    issue({ ...met, name: "RangeError" }),
    issue({ ...met, message: "y is undefined" }),
    issue({ ...met, stack: "at e (/assets/Editor-DExLs8v3.js:1:2345)" }),
    // a value thrown that is no error, and an error met outside every script of the site's
    issue({ message: "x is undefined" })
  ]);
  expect(issues.size).toBe(5);
});

test("an error logs no document's address, which can be an account's collection", () => {
  const read = clientErrorOf(
    {
      name: "Error",
      message: "ResizeObserver loop completed with undelivered notifications.",
      source: "/@ada/warm-sunsets",
      line: 3,
      stack: "at /@ada/warm-sunsets:3:9\nat f (/assets/index-DMi2wf-V.js:12:4)",
      page: "collection"
    },
    CHROME
  );
  if (!read) throw new Error("the report was refused");
  const logged = issueOf(read);
  expect(logged.name).toBe("Browser Error in index.js");
  expect(logged.stack).toBe(
    [
      "Browser Error in index.js: ResizeObserver loop completed with undelivered notifications.",
      "    on collection in Chrome 131 mobile",
      "    at f (/assets/index-DMi2wf-V.js:12:4)"
    ].join("\n")
  );
  // met in the document alone, the error names no script and no place
  const inDocument = clientErrorOf({ message: "a", source: "/@ada/warm-sunsets", line: 3 }, null);
  expect(inDocument).toMatchObject({ script: null, frames: [] });
  expect(JSON.stringify(inDocument)).not.toContain("@ada");
});
