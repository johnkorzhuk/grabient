import { JOIN_WAIT_MS } from "@grabient/server/shared-work.ts";
import { afterEach, describe, expect, test, vi } from "vitest";
import { montagePalettes } from "./montages.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("a montage's palettes", () => {
  test("are read once for the requests that come while they are read, and an empty read is not kept", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const read = vi.fn(async () => [{ seed: "kA" }]);
    const both = await Promise.all([montagePalettes(key, read), montagePalettes(key, read)]);
    expect(both).toEqual([[{ seed: "kA" }], [{ seed: "kA" }]]);
    expect(await montagePalettes(key, read)).toEqual([{ seed: "kA" }]);
    expect(read).toHaveBeenCalledTimes(1);

    const empty = `test:${crypto.randomUUID()}`;
    const none = vi.fn(async () => []);
    await montagePalettes(empty, none);
    await montagePalettes(empty, none);
    expect(none).toHaveBeenCalledTimes(2);
  });

  test("are read by a waiting request itself when the read it waited for never comes back", async () => {
    vi.useFakeTimers();
    const key = `test:${crypto.randomUUID()}`;
    void montagePalettes(key, () => new Promise(() => {}));
    const waiting = montagePalettes(key, async () => [{ seed: "kB" }]);
    await vi.advanceTimersByTimeAsync(JOIN_WAIT_MS);
    expect(await waiting).toEqual([{ seed: "kB" }]);
  });
});
