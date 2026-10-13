import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import type { Env } from "./env.ts";
import { everyTenMinutes, JOBS, runSteps } from "./jobs.ts";

test("every schedule in cloudflare.config.ts has its job, to the character", () => {
  const config = readFileSync(new URL("../../cloudflare.config.ts", import.meta.url), "utf8");
  const schedules = [...config.matchAll(/schedule: "([^"]+)"/g)].map(match => match[1]);
  expect(schedules.sort()).toEqual(Object.keys(JOBS).sort());
});

test("a job with no steps yet runs and returns", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await expect(everyTenMinutes({} as Env, {} as ExecutionContext)).resolves.toBeUndefined();
});

test("a failing step lets the rest run, and the job fails at the end", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const ran: string[] = [];
  const steps = {
    queue: async () => {
      ran.push("queue");
      throw new Error("D1 is down");
    },
    indexnow: async () => {
      ran.push("indexnow");
      return { sent: 3 };
    }
  };
  await expect(
    runSteps("every ten minutes", steps, {} as Env, {} as ExecutionContext)
  ).rejects.toThrow("every ten minutes: 1 of its steps failed");
  expect(ran).toEqual(["queue", "indexnow"]);
  expect(error).toHaveBeenCalledWith("queue: the step failed", "D1 is down");
  expect(log).toHaveBeenCalledWith("indexnow", '{"sent":3}');
});
