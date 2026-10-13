import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { motionScript } from "../src/motion.ts";
import { scrollbarScript } from "../src/scrollbar.ts";
import { themeScript } from "../src/theme.ts";

/* Runs a head script against a page with this storage and these device settings, and returns html's data. */
function stamp(
  script: string,
  page: {
    stored?: Record<string, string>;
    light?: boolean;
    reduce?: boolean;
    blocked?: boolean;
  } = {}
) {
  const dataset: Record<string, string> = {};
  const localStorage = {
    getItem(key: string) {
      if (page.blocked) throw new Error("blocked");
      return page.stored?.[key] ?? null;
    }
  };
  const matchMedia = (query: string) => ({
    matches: query.includes("color-scheme: light")
      ? !!page.light
      : query.includes("reduced-motion") && !!page.reduce
  });
  runInNewContext(script, { document: { documentElement: { dataset } }, localStorage, matchMedia });
  return dataset;
}

describe("the head's stamps", () => {
  test("the theme is the stored choice, else the device's, and dark when nothing can be read", () => {
    expect(stamp(themeScript).theme).toBe("dark");
    expect(stamp(themeScript, { light: true }).theme).toBe("light");
    expect(stamp(themeScript, { light: true, stored: { "grabient-theme": "dark" } }).theme).toBe(
      "dark"
    );
    expect(stamp(themeScript, { stored: { theme: "light" } }).theme).toBe("light");
    expect(stamp(themeScript, { blocked: true, light: true }).theme).toBe("light");
    expect(stamp(themeScript, { stored: { "grabient-theme": "sepia" } }).theme).toBe("dark");
  });

  test("motion follows the device on System, and On and Off win over it", () => {
    expect(stamp(motionScript).motion).toBe("full");
    expect(stamp(motionScript, { reduce: true }).motion).toBe("reduce");
    expect(
      stamp(motionScript, { reduce: true, stored: { "grabient-motion": "full" } }).motion
    ).toBe("full");
    expect(stamp(motionScript, { stored: { "grabient-motion": "reduce" } }).motion).toBe("reduce");
    expect(stamp(motionScript, { blocked: true }).motion).toBeUndefined();
  });

  test("scrollbars that take room are marked, and overlay scrollbars are not", () => {
    const run = (clientWidth: number, innerWidth: number, left = 0) => {
      const style = { overflowY: "" };
      const html = {
        style,
        dataset: {} as Record<string, string>,
        dir: "ltr",
        get clientWidth() {
          return style.overflowY === "scroll" ? clientWidth : innerWidth;
        },
        getBoundingClientRect: () => ({ left }),
        getAttribute: () => null,
        removeAttribute: () => {}
      };
      const page = {
        document: { documentElement: html },
        innerWidth,
        top: null as unknown,
        self: null as unknown
      };
      page.top = page.self = page;
      runInNewContext(scrollbarScript, page);
      return html.dataset.scrollbar;
    };
    expect(run(1265, 1280)).toBe("classic");
    expect(run(1280, 1280)).toBeUndefined();
    expect(run(1265, 1280, 15)).toBeUndefined();
  });
});
