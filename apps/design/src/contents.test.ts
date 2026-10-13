import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGES, pageAt, sectionOf } from "./contents.ts";

/* The pages draw in a browser, so their sections are read from the source: every Section a page draws is one the
   outline names, and the outline names no section nothing draws. The side list and the cover then lead nowhere
   missing. */
function drawn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return drawn(path);
    if (!entry.name.endsWith(".tsx")) return [];
    return [...readFileSync(path, "utf8").matchAll(/<Section\s+id="([\w-]+)"/g)].map(m => m[1]);
  });
}

describe("the outline", () => {
  it("names each section a page draws, once", () => {
    const named = PAGES.flatMap(p => p.groups.flatMap(g => g.entries.map(e => e.id)));
    expect(new Set(named).size).toBe(named.length);
    expect(drawn(new URL("./pages", import.meta.url).pathname).sort()).toEqual([...named].sort());
  });

  it("finds a page by its address, a trailing slash aside", () => {
    expect(pageAt("/")?.id).toBe("cover");
    expect(pageAt("/foundations/")?.id).toBe("foundations");
    expect(pageAt("/components")?.id).toBe("components");
    expect(pageAt("/screens")).toBeUndefined();
  });

  it("gives a section its group and title", () => {
    expect(sectionOf("elevation")).toEqual({ group: "Variables", title: "Elevation and surfaces" });
    expect(() => sectionOf("screens")).toThrow();
  });
});
