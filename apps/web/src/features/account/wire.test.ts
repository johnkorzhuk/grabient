import { expect, it } from "vitest";
import syncOps from "./fixtures/sync-ops.json" with { type: "json" };
import usernames from "./fixtures/username.json" with { type: "json" };
import { readUsername, USERNAME_MAX } from "./username.ts";
import { readOp } from "./wire.ts";

it("reads every change the way grabient4's sync did, and refuses the rest", () => {
  for (const [input, expected] of syncOps)
    expect([input, readOp(input)]).toEqual([input, expected]);
});

it("holds usernames to the rules Settings and the Worker share", () => {
  expect(USERNAME_MAX).toBe(usernames.USERNAME_MAX);
  for (const [input, expected] of usernames.cases) {
    const name = input === "(undefined)" ? undefined : input;
    expect([input, readUsername(name)]).toEqual([input, expected]);
  }
});
