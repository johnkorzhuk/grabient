import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CRON } from "../src/scheduled";

/**
 * The divergence both files warn about, finally enforced.
 *
 * scheduled() switches on controller.cron matched CHARACTER FOR CHARACTER
 * against the strings Cloudflare was deployed with. Change wrangler.jsonc
 * without changing CRON and the switch falls through: the job stops running,
 * nothing throws at deploy time, and the only symptom is a series that quietly
 * stops growing. Two comments asked a human to keep these in sync. This does.
 */
// Resolved from cwd rather than import.meta.url: vitest does not hand these
// modules a file: URL, so new URL(...) throws before a single test runs.
const jsonc = (() => {
  for (const candidate of ["wrangler.jsonc", "apps/admin/wrangler.jsonc"]) {
    try {
      return readFileSync(resolve(process.cwd(), candidate), "utf8");
    } catch {
      /* try the next root */
    }
  }
  throw new Error("wrangler.jsonc not found from " + process.cwd());
})();

/** The crons array, read out of JSONC without needing a comment-tolerant parser. */
const declared = (() => {
  const block = /"crons"\s*:\s*\[([\s\S]*?)\]/.exec(jsonc);
  if (!block) throw new Error("wrangler.jsonc has no crons array");
  return [...block[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
})();

describe("cron schedules", () => {
  it("declares exactly the schedules the dispatcher handles", () => {
    expect([...declared].sort()).toEqual([...Object.values(CRON)].sort());
  });

  it("has no duplicate schedule — two jobs on one string is one job", () => {
    expect(new Set(declared).size).toBe(declared.length);
  });

  it("runs the snapshot after midnight in Los Angeles, in both offsets", () => {
    // GSC and GA4 bucket days in LA local time. Firing before LA midnight
    // stores the current day as if it were finished; see CRON's comment.
    const [minute, hour] = CRON.snapshot.split(" ");
    expect(Number(minute)).toBeGreaterThanOrEqual(0);
    // LA midnight is 07:00 UTC on PDT and 08:00 UTC on PST. Anything at or
    // after 08:00 UTC is safe year-round.
    expect(Number(hour)).toBeGreaterThanOrEqual(8);
  });

  it("orders the jobs snapshot -> sweep -> digests, so each reads the last one's work", () => {
    const minutes = (spec: string) => {
      const [minute, hour] = spec.split(" ");
      return Number(hour) * 60 + Number(minute);
    };
    expect(minutes(CRON.snapshot)).toBeLessThan(minutes(CRON.sweep));
    expect(minutes(CRON.sweep)).toBeLessThan(minutes(CRON.digests));
    // The sweep budgets 11 minutes; the digests must not start inside it.
    expect(minutes(CRON.digests) - minutes(CRON.sweep)).toBeGreaterThan(11);
  });

  it("avoids :00, the most contended trigger minute", () => {
    for (const spec of Object.values(CRON)) expect(spec.split(" ")[0]).not.toBe("0");
  });
});
