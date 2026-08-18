import { describe, expect, it } from "vitest";
import { NAV_PATHS, RANGE_AWARE, href, parseState } from "../src/url-state";

const at = (url: string) => parseState(new URL(url, "https://admin.grabient.com"));

describe("parseState", () => {
  it("defaults to a 28-day window and the requests layer", () => {
    const state = at("/");
    expect(state.range.key).toBe("28d");
    expect(state.globe).toBe("requests");
    expect(state.kind).toBeUndefined();
  });

  it("reads every key it owns", () => {
    const state = at("/?range=7d&globe=people&kind=digest&before=123:abc");
    expect(state.range.key).toBe("7d");
    expect(state.globe).toBe("people");
    expect(state.kind).toBe("digest");
    expect(state.before).toBe("123:abc");
  });

  it("falls back rather than trusting a hand-edited URL", () => {
    const state = at("/?range=nonsense&globe=../etc/passwd&kind=<script>");
    expect(state.range.key).toBe("28d");
    expect(state.globe).toBe("requests");
    expect(state.kind).toBeUndefined();
  });
});

describe("href", () => {
  it("carries state to every range-aware page — the bug that started this", () => {
    const state = at("/?range=7d");
    for (const path of RANGE_AWARE) {
      expect(href(path, state)).toContain("range=7d");
    }
  });

  it("does not push a range onto pages that ignore it", () => {
    const state = at("/?range=7d");
    for (const path of ["/goals", "/campaigns", "/brief", "/ops"]) {
      expect(href(path, state)).toBe(path);
    }
  });

  it("omits defaults so one view has exactly one URL", () => {
    const state = at("/?range=28d&globe=requests");
    expect(href("/", state)).toBe("/");
    expect(href("/trends", state)).toBe("/trends");
  });

  it("changes one key and keeps the rest — how every control works", () => {
    const state = at("/?range=90d&globe=threats");
    expect(href("/", state, { globe: "people" })).toBe("/?range=90d&globe=people");
    expect(href("/", state, { range: "7d" })).toBe("/?range=7d&globe=threats");
  });

  it("never leaks the globe layer onto a page that cannot draw it", () => {
    const state = at("/?range=90d&globe=threats");
    expect(href("/trends", state)).toBe("/trends?range=90d");
    expect(href("/trends", state)).not.toContain("globe");
  });

  it("keeps the archive filter on the archive only", () => {
    const state = at("/reports?kind=digest");
    expect(href("/reports", state)).toBe("/reports?kind=digest");
    expect(href("/", state)).not.toContain("kind");
  });

  it("clears the filter when the All chip asks it to", () => {
    const state = at("/reports?kind=digest");
    expect(href("/reports", state, { kind: undefined })).toBe("/reports");
  });

  it("does not inherit a pagination cursor across navigation", () => {
    const state = at("/reports?kind=report&before=999:xyz");
    expect(href("/reports", state)).toBe("/reports?kind=report");
    expect(href("/reports", state, { before: "999:xyz" })).toContain("before=999%3Axyz");
  });

  it("round-trips: whatever href writes, parseState reads back", () => {
    const state = at("/?range=180d&globe=data");
    for (const path of NAV_PATHS) {
      const url = new URL(href(path, state), "https://admin.grabient.com");
      const parsed = parseState(url);
      if (RANGE_AWARE.has(path)) expect(parsed.range.key).toBe("180d");
      if (path === "/") expect(parsed.globe).toBe("data");
    }
  });

  it("percent-encodes rather than trusting a cursor into the query string", () => {
    const state = at("/reports");
    const link = href("/reports", state, { before: "1&2=3 x" });
    expect(link).not.toMatch(/before=1&2=3 x/);
    expect(new URL(link, "https://a.b").searchParams.get("before")).toBe("1&2=3 x");
  });
});
