import { describe, expect, it } from "vitest";
import { relativeAge } from "../src/relative-age";

const NOW = Date.UTC(2026, 6, 21); // 2026-07-21

describe("relativeAge", () => {
  it("uses the previous app's long relative units under a year", () => {
    expect(relativeAge(NOW - 90 * 1000, NOW)).toBe("1 minute");
    expect(relativeAge(NOW - 3 * 3600 * 1000, NOW)).toBe("3 hours");
    expect(relativeAge(NOW - 5 * 86400 * 1000, NOW)).toBe("5 days");
    expect(relativeAge(NOW - 90 * 86400 * 1000, NOW)).toBe("3 months");
    expect(relativeAge(NOW - 210 * 86400 * 1000, NOW)).toBe("7 months");
  });

  it("switches to an absolute month past a year", () => {
    const twoYears = Date.UTC(2024, 3, 9); // Apr 2024
    expect(relativeAge(twoYears, NOW)).toBe("Apr 2024");
    const oldest = Date.UTC(2023, 11, 1); // Dec 2023
    expect(relativeAge(oldest, NOW)).toBe("Dec 2023");
  });

  it("is timezone-independent (UTC) so SSR and client agree", () => {
    const t = Date.UTC(2024, 0, 15);
    expect(relativeAge(t, NOW)).toBe("Jan 2024");
  });
});
