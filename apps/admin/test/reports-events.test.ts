import { describe, expect, it } from "vitest";
import { dedupeKey, deriveSource } from "../src/events";
import { periodBounds, periodSlug, periodsClosing } from "../src/reports";
import { bucketOf } from "../src/sweep";
import { resolveWindow, isoDay } from "../src/range";
import { renderMarkdown } from "../src/markdown";

describe("event dedupe", () => {
  it("is stable for the same event, so a retried tool call updates rather than duplicates", () => {
    const a = dedupeKey({ source: "agent", kind: "decision", occurredOn: "2026-08-18", label: "Changed robots.txt" });
    const b = dedupeKey({ source: "agent", kind: "decision", occurredOn: "2026-08-18", label: "Changed robots.txt" });
    expect(a).toBe(b);
  });

  it("separates different days, kinds and sources", () => {
    const base = { source: "agent", kind: "decision", occurredOn: "2026-08-18", label: "x" };
    expect(dedupeKey(base)).not.toBe(dedupeKey({ ...base, occurredOn: "2026-08-19" }));
    expect(dedupeKey(base)).not.toBe(dedupeKey({ ...base, kind: "deploy" }));
    expect(dedupeKey(base)).not.toBe(dedupeKey({ ...base, source: "manual" }));
  });

  it("prefers an external id, so re-ingesting a deploy list is exactly idempotent", () => {
    const key = dedupeKey({
      source: "cron-deploys",
      kind: "deploy",
      occurredOn: "2026-08-18",
      label: "anything at all",
      externalId: "deployment-uuid",
    });
    expect(key).toBe("cron-deploys:deployment-uuid");
    expect(
      dedupeKey({
        source: "cron-deploys",
        kind: "deploy",
        occurredOn: "2026-08-19",
        label: "a different label",
        externalId: "deployment-uuid",
      }),
    ).toBe(key);
  });

  it("allows a deliberate same-day twin", () => {
    const base = { source: "manual", kind: "decision", occurredOn: "2026-08-18", label: "x" };
    expect(dedupeKey({ ...base, allowDuplicate: true })).not.toBe(dedupeKey(base));
  });
});

describe("event provenance", () => {
  it("is derived, never caller-supplied — a caller must not forge it", () => {
    expect(deriveSource("jkorzhuk@gmail.com")).toBe("manual");
    expect(deriveSource("service:claude-code")).toBe("agent");
    expect(deriveSource("anyone", true)).toBe("cron-deploys");
  });
});

describe("period arithmetic", () => {
  it("closes the week on Monday, covering the previous Mon–Sun", () => {
    // 2026-08-17 is a Monday.
    expect(periodsClosing(new Date("2026-08-17T06:10:00Z"))).toContain("week");
    const bounds = periodBounds("week", new Date("2026-08-17T06:10:00Z"));
    expect(bounds).toEqual({ start: "2026-08-10", end: "2026-08-16" });
    expect(new Date(`${bounds.start}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(new Date(`${bounds.end}T00:00:00Z`).getUTCDay()).toBe(0);
  });

  it("closes nothing on an ordinary Tuesday", () => {
    expect(periodsClosing(new Date("2026-08-18T06:10:00Z"))).toEqual([]);
  });

  it("closes the month on the 1st, covering the previous calendar month", () => {
    const closing = periodsClosing(new Date("2026-09-01T06:10:00Z"));
    expect(closing).toContain("month");
    expect(periodBounds("month", new Date("2026-09-01T06:10:00Z"))).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });

  it("closes the quarter only on a quarter boundary", () => {
    expect(periodsClosing(new Date("2026-10-01T06:10:00Z"))).toContain("quarter");
    expect(periodsClosing(new Date("2026-09-01T06:10:00Z"))).not.toContain("quarter");
    expect(periodBounds("quarter", new Date("2026-10-01T06:10:00Z"))).toEqual({
      start: "2026-07-01",
      end: "2026-09-30",
    });
  });

  it("handles the year boundary", () => {
    expect(periodBounds("month", new Date("2026-01-01T06:10:00Z"))).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    });
  });

  it("mints a deterministic slug per period, so a re-run addresses the same digest", () => {
    expect(periodSlug("week", "2026-08-10")).toBe("2026-W33-weekly");
    expect(periodSlug("month", "2026-07-01")).toBe("2026-07-monthly");
    expect(periodSlug("quarter", "2026-07-01")).toBe("2026-Q3-quarterly");
    expect(periodSlug("day", "2026-08-17")).toBe("2026-08-17-daily");
  });
});

describe("indexation bucketing", () => {
  it("treats Google's PASS verdict as indexed", () => {
    expect(bucketOf("PASS", "Submitted and indexed")).toBe("indexed");
  });

  it("splits the not-indexed states that need different fixes", () => {
    expect(bucketOf("NEUTRAL", "Crawled - currently not indexed")).toBe("crawled_not_indexed");
    expect(bucketOf("NEUTRAL", "Discovered - currently not indexed")).toBe("discovered_not_indexed");
    expect(bucketOf("NEUTRAL", "Duplicate without user-selected canonical")).toBe("duplicate_canonical");
    expect(bucketOf("NEUTRAL", "Page with redirect")).toBe("excluded_other");
  });

  it("never loses a URL — an unknown wording still lands in a bucket", () => {
    expect(bucketOf(null, null)).toBe("excluded_other");
    expect(bucketOf("FAIL", "Some wording Google invents next year")).toBe("excluded_other");
  });
});

describe("resolveWindow", () => {
  const now = new Date("2026-08-18T12:00:00Z");

  it("makes `days` mean exactly that many dates, inclusive", () => {
    const w = resolveWindow(now, { days: 28 }, { days: 28, lagDays: 1, maxDays: 480 });
    expect(w.days).toBe(28);
    expect(w.until).toBe("2026-08-17");
    expect(w.since).toBe("2026-07-21");
  });

  it("abuts the previous window without overlapping — the old off-by-one", () => {
    const w = resolveWindow(now, { days: 7 }, { days: 28, lagDays: 1, maxDays: 480 });
    expect(w.since).toBe("2026-08-11");
    expect(w.prevUntil).toBe("2026-08-10");
    expect(w.prevSince).toBe("2026-08-04");
    const gap =
      Date.parse(`${w.since}T00:00:00Z`) - Date.parse(`${w.prevUntil}T00:00:00Z`);
    expect(gap).toBe(86_400_000);
  });

  it("honours explicit dates over days", () => {
    const w = resolveWindow(now, { start: "2026-08-01", end: "2026-08-10", days: 90 }, { days: 28, lagDays: 1, maxDays: 480 });
    expect(w.since).toBe("2026-08-01");
    expect(w.until).toBe("2026-08-10");
    expect(w.days).toBe(10);
  });

  it("understands today/yesterday, which is how the hourly view reaches fresh data", () => {
    expect(resolveWindow(now, { end: "today" }, { days: 2, lagDays: 0, maxDays: 10 }).until).toBe("2026-08-18");
    expect(resolveWindow(now, { end: "yesterday" }, { days: 2, lagDays: 0, maxDays: 10 }).until).toBe("2026-08-17");
  });

  it("clamps a hostile day count instead of trusting it", () => {
    expect(resolveWindow(now, { days: 99999 }, { days: 28, lagDays: 1, maxDays: 480 }).days).toBe(480);
    expect(resolveWindow(now, { days: -5 }, { days: 28, lagDays: 1, maxDays: 480 }).days).toBe(1);
  });

  it("never returns an inverted window", () => {
    const w = resolveWindow(now, { start: "2026-08-20", end: "2026-08-01" }, { days: 28, lagDays: 1, maxDays: 480 });
    expect(w.since <= w.until).toBe(true);
  });
});

describe("markdown rendering of agent-authored text", () => {
  it("escapes raw HTML rather than executing it", () => {
    const { html } = renderMarkdown('Hello <script>alert("x")</script> world');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("refuses javascript: and data: links", () => {
    const { html } = renderMarkdown("[click](javascript:alert(1)) and [x](data:text/html;base64,PHN2Zz4=)");
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).not.toMatch(/href="data:text\/html/i);
  });

  it("neutralises protocol-relative links", () => {
    const { html } = renderMarkdown("[y](//evil.example.com)");
    expect(html).not.toContain('href="//evil.example.com"');
  });

  it("marks external links noopener nofollow", () => {
    const { html } = renderMarkdown("[docs](https://developers.cloudflare.com/)");
    expect(html).toContain('rel="noopener nofollow"');
  });

  it("collects headings with unique anchors for the table of contents", () => {
    const { headings } = renderMarkdown("## Findings\n\n## Findings\n\n### Detail");
    expect(headings.map((h) => h.id)).toEqual(["findings", "findings-2", "detail"]);
    expect(headings[2]!.level).toBe(3);
  });

  it("renders tables inside a scroll container so a wide one cannot widen the page", () => {
    const { html } = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain('<div class="md-scroll"><table>');
  });
});

describe("isoDay", () => {
  it("is UTC, always", () => {
    expect(isoDay(new Date("2026-08-18T23:59:59Z"))).toBe("2026-08-18");
    expect(isoDay(new Date("2026-08-19T00:00:01Z"))).toBe("2026-08-19");
  });
});
