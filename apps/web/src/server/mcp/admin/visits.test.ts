import { afterEach, describe, expect, test, vi } from "vitest";
import { behind, tooOld } from "../../visits/rules.ts";
import { readVisits } from "./visits.ts";

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
  // a beta's few lead nothing, and a scraper's thousands on one old version do not hold the line back; a Firefox far
  // behind Chrome's line is old as well
  expect(behind(rows)).toEqual({
    leading: { Chrome: 155, Edge: 155 },
    old: ["Chrome 145", "Chrome 99", "Firefox 120"]
  });
  // a long window leaves room for the lead to have moved within it
  expect(behind(rows, 2).old).toEqual(["Chrome 145", "Chrome 99", "Firefox 120"]);
  expect(behind(rows, 10).old).toEqual(["Chrome 99", "Firefox 120"]);
  expect(behind([])).toEqual({ leading: {}, old: [] });
  // Chrome's stable version, where it is known, leads every Chromium
  expect(behind(rows, 0, 156)).toEqual({
    leading: { Chrome: 156, Edge: 156 },
    old: ["Chrome 149", "Chrome 145", "Chrome 99", "Firefox 120"]
  });
});

test("a browser is too old for a person's against Chrome's stable version, each by its own line", () => {
  // Chromiums six versions behind at most
  expect(tooOld("Chrome 150", 156)).toBe(false);
  expect(tooOld("Chrome 149", 156)).toBe(true);
  expect(tooOld("Edge 145", 156)).toBe(true);
  expect(tooOld("WebView 149", 156)).toBe(true);
  // Firefox a year's extended support release behind at most
  expect(tooOld("Firefox 157", 156)).toBe(false);
  expect(tooOld("Firefox 140", 156)).toBe(false);
  expect(tooOld("Firefox 126", 156)).toBe(true);
  expect(tooOld("Firefox 120", 156)).toBe(true);
  // Safari from 17
  expect(tooOld("Safari 26", 156)).toBe(false);
  expect(tooOld("Safari 17", 156)).toBe(false);
  expect(tooOld("Safari 16", 156)).toBe(true);
  // no line for the rest, nor without Chrome's version
  expect(tooOld("Samsung Internet 12", 156)).toBe(false);
  expect(tooOld("other", 156)).toBe(false);
  expect(tooOld("Safari 16", null)).toBe(false);
});

test("a program that outnumbers people leads by share, and is old against Chrome's stable version", () => {
  // grabient.com's first quarter hour of codes, 21 Oct 2026: a scraper on Chrome 142 to 145, and a few people
  const rows = [
    { browser: "Chrome 145", visitors: 1848 },
    { browser: "Chrome 144", visitors: 1815 },
    { browser: "Chrome 143", visitors: 937 },
    { browser: "Edge 145", visitors: 903 },
    { browser: "Chrome 156", visitors: 6 },
    { browser: "Chrome 155", visitors: 4 }
  ];
  expect(behind(rows)).toEqual({ leading: { Chrome: 145, Edge: 145 }, old: [] });
  expect(behind(rows, 0, 156).old).toEqual(["Chrome 145", "Chrome 144", "Chrome 143", "Edge 145"]);
});

/** An ANALYTICS binding that answers each query by the first pattern it matches, and keeps what it was asked. */
function binding(answers: [RegExp, Record<string, unknown>[]][], refuse?: RegExp) {
  const queries: string[] = [];
  return {
    queries,
    async query({ query }: { query: string }) {
      queries.push(query);
      if (refuse?.test(query)) throw new Error("Input was invalid");
      return { data: answers.find(([pattern]) => pattern.test(query))?.[1] ?? [] };
    }
  };
}

describe("the visits read back", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  test("are a person's whole days, lists and checks, with what was left out as programs", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-20T15:00:00Z"), toFake: ["Date"] });
    const ANALYTICS = binding([
      [
        /^SELECT blob7 AS browser/,
        [
          { browser: "Chrome 155", visitors: 50 },
          { browser: "Chrome 145", visitors: 300 }
        ]
      ],
      [
        /landings,/,
        [
          { day: "2026-10-19 00:00:00", landings: 100, loads: 40, framed: 5, uncoded: 7, held: 3 },
          { day: "2026-10-20 00:00:00", landings: 30, loads: 10, framed: 0, uncoded: 1, held: 1 }
        ]
      ],
      [
        /^SELECT toStartOfDay\(timestamp\) AS day, COUNT\(DISTINCT blob15\) AS visitors .*blob2 IN \('landing', 'load', 'framed'\)/s,
        [
          { day: "2026-10-19 00:00:00", visitors: 60 },
          { day: "2026-10-20 00:00:00", visitors: 20 }
        ]
      ],
      // the visitors whose day showed a person, out of all the visit's kinds
      [
        /^SELECT toStartOfDay\(timestamp\) AS day, COUNT\(DISTINCT blob15\) AS visitors FROM .*AND NOT \(blob2 = 'landing' AND blob11 = ''.*GROUP BY day/s,
        [
          { day: "2026-10-19 00:00:00", visitors: 40 },
          { day: "2026-10-20 00:00:00", visitors: 12 }
        ]
      ],
      [/^SELECT SUM\(double1\) AS n FROM .*blob2 = 'landing' AND blob11 = ''/s, [{ n: 700 }]],
      [
        /^SELECT toStartOfDay\(timestamp\) AS day, COUNT\(DISTINCT blob15\) AS visitors .*blob2 IN \('use', 'search'\)/s,
        [
          { day: "2026-10-19 00:00:00", visitors: 20 },
          { day: "2026-10-20 00:00:00", visitors: 6 }
        ]
      ],
      [
        /^SELECT blob5 AS value, COUNT\(DISTINCT blob15\) AS visitors .*blob2 IN \('use', 'search'\)/s,
        [{ value: "US", visitors: 19 }]
      ],
      [
        /^SELECT blob5 AS value, COUNT\(DISTINCT blob15\) AS visitors FROM.*LIMIT 200/s,
        [
          { value: "US", visitors: 30 },
          { value: "SG", visitors: 25 }
        ]
      ],
      // a code-less point counts as a visitor in COUNT(DISTINCT): one less where any was
      [
        /^SELECT blob5 AS value, COUNT\(DISTINCT blob15\) AS visitors, sumIf/s,
        [
          { value: "CN", visitors: 4, uncoded: 0, n: 12 },
          { value: "US", visitors: 31, uncoded: 2, n: 90 }
        ]
      ],
      [/^SELECT blob4 AS value/, [{ value: "en", visitors: 40, uncoded: 0, n: 80 }]],
      [
        /^SELECT blob12 AS source/,
        [{ source: "newsletter", medium: "", campaign: "october", visitors: 4, uncoded: 0, n: 5 }]
      ],
      [/blob7 IN \('Chrome 145'\)/, [{ visitors: 300, uncoded: 0, n: 9000 }]],
      [/blob9 IN \(/, [{ visitors: 3, uncoded: 1, n: 8 }]]
    ]);
    const report = await readVisits({ ANALYTICS, DEPLOYMENT: "staging" }, 7, 10);
    if (typeof report === "string") throw new Error(report);
    expect(report.dataset).toBe("grabient_staging_usage");
    expect(report.daily).toEqual([
      {
        day: "2026-10-19",
        visitors: 60,
        people: 40,
        unconfirmed: 20,
        landings: 100,
        loads: 40,
        framed: 5,
        acting: 20,
        share: 0.333,
        uncoded: 7,
        held: 3
      },
      {
        day: "2026-10-20",
        partial: true,
        visitors: 20,
        people: 12,
        unconfirmed: 8,
        landings: 30,
        loads: 10,
        framed: 0,
        acting: 6,
        share: 0.3,
        uncoded: 1,
        held: 1
      }
    ]);
    // the average is of whole days: today's so far is not one
    expect(report.totals).toMatchObject({
      visitorDays: 80,
      averageVisitors: 60,
      peopleDays: 52,
      averagePeople: 40,
      unconfirmed: 28,
      share: 0.325
    });
    expect(report.programs).toMatchObject({
      leading: { Chrome: 155 },
      old: { visitors: 300, count: 9000 },
      hosting: { visitors: 2, count: 8 },
      unconfirmed: { visitors: 28, count: 700 }
    });
    // the lists are people's: a landing from nowhere stays out of them
    for (const list of ["blob3", "blob4", "blob5", "blob6", "blob7", "blob8", "blob11"])
      expect(
        ANALYTICS.queries.find(query => query.startsWith(`SELECT ${list} AS value`))
      ).toContain(
        "AND NOT (blob2 = 'landing' AND blob11 = '' AND blob12 = '' AND blob13 = '' AND blob14 = '')"
      );
    expect(report.check).toMatchObject({ share: 0.325, usual: [0.2, 0.5], outside: false });
    // Singapore's 25 visitors used nothing: a program passing for browsers
    expect(report.check.countries).toEqual([{ value: "SG", visitors: 25, count: 0 }]);
    // China counts its visitors as any country does; the US's code-less points add no visitor
    expect(report.by.country).toEqual([
      { value: "CN", visitors: 4, count: 12 },
      { value: "US", visitors: 30, count: 90 }
    ]);
    expect(report.landings.campaign).toEqual([
      { value: "newsletter /  / october", visitors: 4, count: 5 }
    ]);
    expect(report.failed).toBeUndefined();
    /* a person's every query leaves out what the signals, the old versions and the large clouds mark, and reads one
       dataset under events.analyticsEngine from the window's first midnight, its sums weighed by the binding itself */
    const people = ANALYTICS.queries.filter(query => query.includes("blob9 NOT IN"));
    expect(people.length).toBeGreaterThan(10);
    for (const query of people) expect(query).toContain("AND blob7 NOT IN ('Chrome 145')");
    for (const query of ANALYTICS.queries) {
      expect(query).toContain(
        "FROM events.analyticsEngine.grabient_staging_usage WHERE timestamp >= '2026-10-13T00:00:00Z' AND blob1 = 'visit'"
      );
      expect(query).not.toMatch(/sample_?interval/i);
    }
  });

  test("weigh a Chromium against Chrome's stable version as KV keeps it, where one is kept", async () => {
    const versions: [RegExp, Record<string, unknown>[]] = [
      /^SELECT blob7 AS browser/,
      [
        { browser: "Chrome 145", visitors: 1848 },
        { browser: "Chrome 144", visitors: 1815 },
        { browser: "Chrome 156", visitors: 6 }
      ]
    ];
    const CACHE = {
      async get(name: string) {
        return name === "visit-lead" ? { day: "2026-10-21", lead: 156 } : null;
      }
    };
    const kept = binding([versions]);
    const report = await readVisits(
      { ANALYTICS: kept, DEPLOYMENT: "production", CACHE } as never,
      7
    );
    if (typeof report === "string") throw new Error(report);
    expect(report.programs.leading).toEqual({ Chrome: 156 });
    const people = kept.queries.filter(query => query.includes("blob9 NOT IN"));
    expect(people.length).toBeGreaterThan(10);
    for (const query of people)
      expect(query).toContain("AND blob7 NOT IN ('Chrome 145', 'Chrome 144')");
    // without it the scraper's own version leads, and nothing is old
    const none = binding([versions]);
    const fallen = await readVisits({ ANALYTICS: none, DEPLOYMENT: "production" }, 7);
    if (typeof fallen === "string") throw new Error(fallen);
    expect(fallen.programs.leading).toEqual({ Chrome: 145 });
    expect(none.queries.join("\n")).not.toContain("blob7 NOT IN");
  });

  test("leave a part a query was refused for empty, and name it", async () => {
    const ANALYTICS = binding(
      [[/^SELECT blob7 AS browser/, [{ browser: "Chrome 155", visitors: 5 }]]],
      /blob11 AS value/
    );
    const report = await readVisits({ ANALYTICS, DEPLOYMENT: "staging" }, 3);
    if (typeof report === "string") throw new Error(report);
    expect(report.landings.referrer).toEqual([]);
    expect(report.failed).toEqual(["referrers: Input was invalid"]);
  });

  test("say why a deploy cannot read them", async () => {
    expect(await readVisits({ ANALYTICS: undefined, DEPLOYMENT: "staging" }, 7)).toBe(
      "This deploy has no ANALYTICS binding to read its counts with."
    );
    const none = await readVisits({ ANALYTICS: binding([]), DEPLOYMENT: "production" }, 7);
    expect(none).toMatchObject({ dataset: "grabient_usage", empty: true, daily: [] });
  });
});
