import { describe, expect, test } from "vitest";
import { behind, readVisits } from "./visits.ts";

test("a Chromium more than six versions behind the one its people lead with is a program's", () => {
  const rows = [
    { browser: "Chrome 158", visitors: 1 },
    { browser: "Chrome 155", visitors: 50 },
    { browser: "Chrome 154", visitors: 20 },
    { browser: "Chrome 149", visitors: 2 },
    { browser: "Chrome 145", visitors: 300 },
    { browser: "Chrome 99", visitors: 40 },
    { browser: "Edge 155", visitors: 10 },
    { browser: "Safari 19", visitors: 30 },
    { browser: "Firefox 120", visitors: 9 }
  ];
  // a canary's few lead nothing, and a scraper's thousands on one old version do not hold the line back
  expect(behind(rows)).toEqual({
    leading: { Chrome: 155, Edge: 155 },
    old: ["Chrome 145", "Chrome 99"]
  });
  expect(behind([])).toEqual({ leading: {}, old: [] });
});

/** An ANALYTICS binding that answers each query by the first pattern it matches, and keeps what it was asked. */
function binding(answers: [RegExp, Record<string, unknown>[]][]) {
  const queries: string[] = [];
  return {
    queries,
    async query({ query }: { query: string }) {
      queries.push(query);
      return { data: answers.find(([pattern]) => pattern.test(query))?.[1] ?? [] };
    }
  };
}

describe("the visits read back", () => {
  test("are a person's days, lists and checks, with what was left out as programs", async () => {
    const day = "2026-10-19 00:00:00";
    const ANALYTICS = binding([
      [
        /^SELECT blob7 AS browser/,
        [
          { browser: "Chrome 155", visitors: 50 },
          { browser: "Chrome 145", visitors: 300 }
        ]
      ],
      [
        /blob2 AS what/,
        [
          { day, what: "landing", n: 100 },
          { day, what: "load", n: 40 },
          { day, what: "framed", n: 5 },
          { day, what: "use", n: 30 }
        ]
      ],
      [/^SELECT toStartOfDay.*blob2 IN \('landing', 'load'\).*blob15 = ''/, [{ day, n: 7 }]],
      [/^SELECT toStartOfDay.*blob10 = 'held'/, [{ day, n: 3 }]],
      [/^SELECT toStartOfDay.*blob2 IN \('landing', 'load'\)/, [{ day, visitors: 60 }]],
      [/^SELECT toStartOfDay.*blob2 IN \('use', 'search'\)/, [{ day, visitors: 20 }]],
      [/^SELECT blob5 AS value.*blob2 IN \('use', 'search'\)/, [{ value: "US", visitors: 19 }]],
      [
        /^SELECT blob5 AS value.*LIMIT 200/,
        [
          { value: "US", visitors: 30 },
          { value: "SG", visitors: 25 }
        ]
      ],
      [/^SELECT blob5 AS value/, [{ value: "CN", visitors: 1, n: 12 }]],
      [
        /^SELECT blob12 AS source/,
        [{ source: "newsletter", medium: "", campaign: "october", visitors: 4, n: 5 }]
      ],
      [
        /^SELECT COUNT\(DISTINCT blob15\) AS visitors, SUM\(double1\) AS n .*blob7 IN/,
        [{ visitors: 300, n: 9000 }]
      ],
      [
        /^SELECT COUNT\(DISTINCT blob15\) AS visitors, SUM\(double1\) AS n .*blob9 IN/,
        [{ visitors: 2, n: 8 }]
      ]
    ]);
    const report = await readVisits({ ANALYTICS, DEPLOYMENT: "staging" }, 7, 10);
    if (typeof report === "string") throw new Error(report);
    expect(report.dataset).toBe("grabient_staging_usage");
    expect(report.daily).toEqual([
      {
        day: "2026-10-19",
        visitors: 60,
        landings: 100,
        loads: 40,
        framed: 5,
        acting: 20,
        share: 0.333,
        uncoded: 7,
        held: 3
      }
    ]);
    expect(report.totals).toMatchObject({ visitorDays: 60, averageVisitors: 60, share: 0.333 });
    expect(report.programs).toMatchObject({
      leading: { Chrome: 155 },
      old: { visitors: 300, count: 9000 },
      hosting: { visitors: 2, count: 8 }
    });
    // Singapore's 25 visitors used nothing: a program passing for browsers
    expect(report.check).toMatchObject({ share: 0.333, usual: [0.2, 0.5], outside: false });
    expect(report.check.countries).toEqual([{ value: "SG", visitors: 25, count: 0 }]);
    // China's pages carry no code
    expect(report.by.country).toEqual([{ value: "CN", visitors: 0, count: 12 }]);
    expect(report.landings.campaign).toEqual([
      { value: "newsletter /  / october", visitors: 4, count: 5 }
    ]);
    /* a person's every query leaves out what the signals, the old versions and the hosting networks mark, and reads one
       dataset under events.analyticsEngine bounded below in time, its sums weighed by the binding itself */
    const people = ANALYTICS.queries.filter(query => query.includes("blob9 NOT IN"));
    expect(people.length).toBeGreaterThan(10);
    for (const query of people) expect(query).toContain("AND blob7 NOT IN ('Chrome 145')");
    for (const query of ANALYTICS.queries) {
      expect(query).toContain(
        "FROM events.analyticsEngine.grabient_staging_usage WHERE timestamp >= NOW() - INTERVAL '7' DAY AND blob1 = 'visit'"
      );
      expect(query).not.toMatch(/sample_?interval/i);
    }
  });

  test("say why a deploy cannot read them", async () => {
    expect(await readVisits({ ANALYTICS: undefined, DEPLOYMENT: "staging" }, 7)).toBe(
      "This deploy has no ANALYTICS binding to read its counts with."
    );
    const none = await readVisits({ ANALYTICS: binding([]), DEPLOYMENT: "production" }, 7);
    expect(none).toMatchObject({ dataset: "grabient_usage", empty: true, daily: [] });
  });
});
