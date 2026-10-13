import { describe, expect, it } from "vitest";
import { type LimitName, limitOf } from "../limits/config.ts";
import instructionsGolden from "./fixtures/instructions.json" with { type: "json" };
import limitGolden from "./fixtures/limit-words.json" with { type: "json" };
import serverGolden from "./fixtures/server-info.json" with { type: "json" };
import { instructions, serverInfo, type Tier } from "./info.ts";
import { LIMITER_DOWN, limitWords, waitWords } from "./tool.ts";

describe("limits in words", () => {
  it("name whose limit it is, what it allows, and when to try again", () => {
    const inAnHour = Math.floor(Date.now() / 1000) + 3600;
    const { limiterDown, waitWords: waits, ...limits } = limitGolden;
    for (const [type, words] of Object.entries(limits)) {
      const name = type as LimitName;
      expect(
        limitWords({
          success: false,
          type: name,
          limit: limitOf(name).requests,
          remaining: 0,
          reset: inAnHour
        })
      ).toBe(words);
    }
    expect(LIMITER_DOWN).toBe(limiterDown);
    for (const [seconds, words] of waits as [number, string][])
      expect(waitWords(seconds)).toBe(words);
  });
});

describe("what the server says it is", () => {
  it("is the same for every tier, and the instructions are the tier's", () => {
    expect(serverInfo("https://grabient.com")).toEqual(serverGolden.serverInfo);
    for (const [key, golden] of Object.entries(instructionsGolden)) {
      const [tier, origin] = key.split(" ") as [Tier, string];
      expect(instructions(origin, tier)).toBe(golden.text);
    }
  });

  it("keeps the first two lines within ChatGPT's 512 characters and the admins' within Claude Code's 2,048", () => {
    for (const origin of ["https://grabient.com", "https://staging.grabient.com"]) {
      expect(
        instructions(origin, "account").split("\n").slice(0, 2).join("\n").length
      ).toBeLessThanOrEqual(512);
      expect(instructions(origin, "admin").length).toBeLessThan(2048);
    }
  });
});
