import { expect, onTestFinished, test, vi } from "vitest";
import { installErrorReports, ownStack, pageOf, reportCaught } from "./error-report.ts";

// the browser's paths: Node resolves Solid's server build, where isServer is true
vi.mock("@solidjs/web", async original => ({
  ...(await original<typeof import("@solidjs/web")>()),
  isServer: false
}));

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
  vi.stubGlobal("window", new EventTarget());
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
    {
      message: "ResizeObserver loop completed with undelivered notifications.",
      source: "/palettes"
    }
  ]);
  expect(sent[2]).not.toHaveProperty("name");
});
