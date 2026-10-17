import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { forgetShared, knowSite, sharedRead } from "../src/server/shared-reads.ts";

/* A read kept by the data center, as production and staging keep it: the tests' Worker is local development's,
   which keeps none, so each test here tells the reads it is the live site, and local development again after. */
const live = { DEPLOYMENT: "production", PUBLIC_ORIGIN: "https://grabient.test" } as const;

const pause = () => new Promise(resolve => setTimeout(resolve, 20));
const unread = () => Promise.reject(new Error("no copy"));

/** The copy a read put, read through a read that always fails. */
async function kept(name: string): Promise<unknown> {
  for (let i = 0; i < 50; i++) {
    try {
      return (await sharedRead(name, 60, unread)).value;
    } catch {
      await pause();
    }
  }
  throw new Error(`no copy of ${name}`);
}

describe("a read kept by the data center", () => {
  beforeEach(() => knowSite(live));
  afterEach(() => knowSite(env));

  it("is read once, kept for every later read, and read again for an isolate that wrote since", async () => {
    let reads = 0;
    const read = async () => ({ n: ++reads });
    const name = `test/${crypto.randomUUID()}`;
    const made = await sharedRead(name, 60, read);
    expect(made.value).toEqual({ n: 1 });
    expect(await kept(name)).toEqual({ n: 1 });
    expect((await sharedRead(name, 60, read)).value).toEqual({ n: 1 });
    expect(reads).toBe(1);
    // a write after the copy was made: the copy is older than what this isolate knows
    expect((await sharedRead(name, 60, read, made.at + 1)).value).toEqual({ n: 2 });
  });

  it("lets go of its copy, and keeps no read that failed", async () => {
    let reads = 0;
    const read = async () => ({ n: ++reads });
    const name = `test/${crypto.randomUUID()}`;
    await sharedRead(name, 60, read);
    expect(await kept(name)).toEqual({ n: 1 });
    await forgetShared(name);
    await expect(sharedRead(name, 60, unread)).rejects.toThrow("no copy");
    expect((await sharedRead(name, 60, read)).value).toEqual({ n: 2 });

    const failing = `test/${crypto.randomUUID()}`;
    await expect(
      sharedRead(failing, 60, () => Promise.reject(new Error("D1 is unavailable")))
    ).rejects.toThrow("D1 is unavailable");
    expect((await sharedRead(failing, 60, async () => ({ n: 7 }))).value).toEqual({ n: 7 });
  });

  it("keeps nothing where the site is not live", async () => {
    knowSite(env);
    let reads = 0;
    const read = async () => ({ n: ++reads });
    const name = `test/${crypto.randomUUID()}`;
    await sharedRead(name, 60, read);
    await sharedRead(name, 60, read);
    expect(reads).toBe(2);
  });
});
