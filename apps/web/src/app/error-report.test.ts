import { expect, onTestFinished, test, vi } from "vitest";
import { installErrorReports, ownStack, pageOf, reportCaught } from "./error-report.ts";

// the browser's paths: Node resolves Solid's server build, where isServer is true
vi.mock("@solidjs/web", async original => ({
  ...(await original<typeof import("@solidjs/web")>()),
  isServer: false
}));

/* The browser's error event, as far as a report reads it: Node 24, which the build runs on, has none, and Node 25's
   would make the tests pass on one machine alone. */
class BrowserErrorEvent extends Event {
  readonly error: unknown;
  readonly message: string;
  readonly filename: string;
  readonly lineno: number;
  readonly colno: number;
  constructor(type: string, init: ErrorEventInit = {}) {
    super(type, init);
    this.error = init.error;
    this.message = init.message ?? "";
    this.filename = init.filename ?? "";
    this.lineno = init.lineno ?? 0;
    this.colno = init.colno ?? 0;
  }
}

/** A window that takes the page's listeners, and the error event it dispatches. */
function stubWindow() {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("ErrorEvent", BrowserErrorEvent);
}

test("a page is named by its kind, or by a palette's or a public collection's address", () => {
  expect(pageOf("/")).toBe("home");
  expect(pageOf("/ja/palettes/rising")).toBe("palettes");
  expect(pageOf("/kS7Q8Yy5S_SChv0")).toBe("/kS7Q8Yy5S_SChv0");
  expect(pageOf("/ja/ocean-gradients")).toBe("/ocean-gradients");
  // an account's collection can be private: its handle and title stay in the browser
  expect(pageOf("/@ada/warm-sunsets")).toBe("collection");
  expect(pageOf("/de/@ada/warm-sunsets/rising")).toBe("collection");
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

test("an error met with no connection is neither sent nor counted, and is sent once the connection is back", () => {
  onTestFinished(() => void vi.unstubAllGlobals());
  const sent: string[] = [];
  vi.stubGlobal("location", new URL("https://grabient.com/palettes/saved?q=blue"));
  vi.stubGlobal("fetch", (_path: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)).message);
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  vi.stubGlobal("navigator", { onLine: false });
  reportCaught(new TypeError("Failed to fetch"));
  expect(sent).toEqual([]);
  vi.stubGlobal("navigator", { onLine: true });
  reportCaught(new TypeError("Failed to fetch"));
  expect(sent).toEqual(["Failed to fetch"]);
});

test("a report names the error's type in its own words, however the page met it", () => {
  onTestFinished(() => void vi.unstubAllGlobals());
  const sent: { name?: string; message: string; source: string | null }[] = [];
  vi.stubGlobal("location", new URL("https://grabient.com/palettes"));
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("fetch", (_path: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  stubWindow();
  installErrorReports();
  reportCaught(new RangeError("Invalid array length"));
  // the window's words lead with the type, and Chrome's with "Uncaught": the error's own are sent
  window.dispatchEvent(
    new ErrorEvent("error", {
      error: new SyntaxError("Unexpected token"),
      message: "Uncaught SyntaxError: Unexpected token",
      filename: "https://grabient.com/assets/index-DMi2wf-V.js",
      lineno: 1,
      colno: 9
    })
  );
  // what the browser says of a loop it stopped is no error of a script's
  window.dispatchEvent(
    new ErrorEvent("error", {
      message: "ResizeObserver loop completed with undelivered notifications.",
      filename: "https://grabient.com/palettes"
    })
  );
  expect(sent).toMatchObject([
    { name: "RangeError", message: "Invalid array length", source: null },
    { name: "SyntaxError", message: "Unexpected token", source: "/assets/index-DMi2wf-V.js" },
    { message: "ResizeObserver loop completed with undelivered notifications.", source: null }
  ]);
  expect(sent[2]).not.toHaveProperty("name");
});

/** The reporter as a page load starts it, at `address`: nothing sent yet, and what it sends from now on. */
async function pageLoad(address: string) {
  onTestFinished(() => void vi.unstubAllGlobals());
  vi.resetModules();
  const reporter = await import("./error-report.ts");
  const sent: Record<string, unknown>[] = [];
  vi.stubGlobal("location", new URL(address));
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("fetch", (_path: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  stubWindow();
  reporter.installErrorReports();
  return { ...reporter, sent };
}

test("a report names where in a script, and never the page's own address, which can be an account's collection", async () => {
  const page = await pageLoad("https://grabient.com/@ada/warm-sunsets");
  const thrown = new TypeError("x is not a function");
  thrown.stack = [
    "TypeError: x is not a function",
    "    at HTMLButtonElement.onclick (https://grabient.com/@ada/warm-sunsets:1:5)",
    "    at f (https://grabient.com/assets/index-DMi2wf-V.js:3:9)"
  ].join("\n");
  // thrown from the page's own markup, and what the browser says of a loop it stopped there
  window.dispatchEvent(
    new ErrorEvent("error", {
      error: thrown,
      message: "Uncaught TypeError: x is not a function",
      filename: "https://grabient.com/@ada/warm-sunsets",
      lineno: 1,
      colno: 5
    })
  );
  window.dispatchEvent(
    new ErrorEvent("error", {
      message: "ResizeObserver loop completed with undelivered notifications.",
      filename: "https://grabient.com/@ada/warm-sunsets"
    })
  );
  expect(page.sent).toMatchObject([
    {
      name: "TypeError",
      message: "x is not a function",
      source: null,
      stack: "at f (/assets/index-DMi2wf-V.js:3:9)",
      page: "collection"
    },
    { message: "ResizeObserver loop completed with undelivered notifications.", source: null }
  ]);
  expect(JSON.stringify(page.sent)).not.toContain("warm-sunsets");
});

test("an error is told in its own words, and a value with none in the window's, else as it reads", async () => {
  const page = await pageLoad("https://grabient.com/palettes");
  // its own words, though it cannot be read as text
  class Unreadable extends Error {
    override toString(): string {
      throw new Error("No text");
    }
  }
  page.reportCaught(new Unreadable("Kept in its own words"));
  page.reportCaught("A thrown string");
  // a string thrown from a script: the window's words for it
  window.dispatchEvent(
    new ErrorEvent("error", {
      error: "Busy",
      message: "Uncaught Busy",
      filename: "https://grabient.com/assets/index-DMi2wf-V.js"
    })
  );
  expect(page.sent).toMatchObject([
    { name: "Error", message: "Kept in its own words" },
    { message: "A thrown string" },
    { message: "Uncaught Busy", source: "/assets/index-DMi2wf-V.js" }
  ]);
});
