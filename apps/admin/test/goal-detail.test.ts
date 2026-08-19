import { describe, expect, it } from "vitest";
import { isRangeAware, RANGE_AWARE, href, parseState } from "../src/url-state";
import { goalCard, goalDetail } from "../src/insight-pages";
import { PAGES } from "../src/html";
import type { GoalWithProgress } from "../src/goals";

const at = (url: string) => parseState(new URL(url, "https://admin.grabient.com"));

const goal = (over: Partial<GoalWithProgress> = {}): GoalWithProgress => ({
  slug: "gsc-ctr-7d",
  title: "Lift search CTR",
  metric_key: "gsc.ctr",
  direction: "up",
  aggregate: "avg",
  window_days: 7,
  baseline_value: 3.55,
  baseline_day: "2026-08-17",
  target_value: 4.5,
  target_day: "2026-11-15",
  status: "active",
  notes: "W1 adds CSS to the homepage title.",
  created_at: 0,
  updated_at: 0,
  current: 3.53,
  as_of: "2026-08-17",
  progress_pct: null,
  on_track: null,
  metric_caveat: "Never average across days.",
  ...over,
});

describe("isRangeAware", () => {
  it("keeps every existing range-aware page range-aware", () => {
    for (const path of RANGE_AWARE) expect(isRangeAware(path)).toBe(true);
  });

  it("treats a goal detail route as range-aware but not the list", () => {
    // The list is a set of cards with no series on it; the detail page charts
    // its metric over the window and must draw the control.
    expect(isRangeAware("/goals")).toBe(false);
    expect(isRangeAware("/goals/gsc-ctr-7d")).toBe(true);
  });

  it("does not make the detail route a nav destination", () => {
    // PAGES drives the nav. A prefix rule that leaked into it would put every
    // goal in the header.
    expect(PAGES.some((p) => p.href.startsWith("/goals/"))).toBe(false);
  });
});

describe("href to a goal detail route", () => {
  it("carries the range forward so the window survives the click", () => {
    // range is PASS_THROUGH, so it rides along even though /goals/<slug> is
    // not a PARAMS key — this is what stops a drill-down resetting to 28d.
    expect(href("/goals/gsc-ctr-7d", at("/goals?range=90d"))).toBe(
      "/goals/gsc-ctr-7d?range=90d",
    );
  });

  it("omits the default range", () => {
    expect(href("/goals/gsc-ctr-7d", at("/goals"))).toBe("/goals/gsc-ctr-7d");
  });

  it("does not leak page-scoped drill-down subjects from /search", () => {
    expect(href("/goals/gsc-ctr-7d", at("/search?query=gradient"))).toBe(
      "/goals/gsc-ctr-7d",
    );
  });
});

describe("goalCard", () => {
  it("stays at a glance — no notes in the list view", () => {
    const html = goalCard(goal(), "/goals/gsc-ctr-7d");
    expect(html).not.toContain("W1 adds CSS");
    expect(html).toContain("Breakdown");
    expect(html).toContain("/goals/gsc-ctr-7d");
  });

  it("escapes a hostile title and href", () => {
    const html = goalCard(
      goal({ title: '<script>alert(1)</script>' }),
      '/goals/x"><script>alert(1)</script>',
    );
    expect(html).not.toContain("<script>");
  });

  it("says the window is filling rather than showing false progress", () => {
    const html = goalCard(
      goal({ incomplete_window: "4 of 7 days collected" }),
      "/goals/gsc-ctr-7d",
    );
    expect(html).toContain("window still filling");
    expect(html).toContain("4 of 7 days collected");
  });
});

describe("goalDetail", () => {
  it("carries the hypothesis and the metric caveat the card drops", () => {
    const html = goalDetail(goal(), "<svg>chart</svg>", "/goals");
    expect(html).toContain("W1 adds CSS");
    expect(html).toContain("Never average across days.");
    expect(html).toContain("<svg>chart</svg>");
  });

  it("explains an absent series instead of drawing an empty frame", () => {
    // A goal can legitimately precede its metric: index.* started collecting
    // after the goals that measure it were written.
    const html = goalDetail(goal({ metric_key: "index.indexed" }), null, "/goals");
    expect(html).toContain("No history stored");
    expect(html).toContain("index.indexed");
  });

  it("never claims on_track when it is unknown", () => {
    const html = goalDetail(goal({ on_track: null }), null, "/goals");
    expect(html).not.toContain(">Yes<");
    expect(html).toContain("not measurable yet");
  });

  it("escapes hostile notes", () => {
    const html = goalDetail(
      goal({ notes: "<img src=x onerror=alert(1)>" }),
      null,
      "/goals",
    );
    expect(html).not.toContain("<img");
  });
});
