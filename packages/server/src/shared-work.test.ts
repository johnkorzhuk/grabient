import { afterEach, describe, expect, it, vi } from "vitest";
import { JOIN_WAIT_MS, joined, madeOnce } from "./shared-work.ts";

/** A promise of work whose request went away: it never settles. */
const gone = () => new Promise<never>(() => {});

afterEach(() => {
  vi.useRealTimers();
});

describe("work another request began", () => {
  it("is waited for while it comes, and done by the waiting request when it does not come in time", async () => {
    vi.useFakeTimers();
    const own = vi.fn(async () => "own");
    expect(await joined(Promise.resolve("theirs"), own)).toBe("theirs");
    expect(own).not.toHaveBeenCalled();

    const waiting = joined(gone(), own);
    await vi.advanceTimersByTimeAsync(JOIN_WAIT_MS - 1);
    expect(own).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await waiting).toBe("own");
    expect(own).toHaveBeenCalledTimes(1);
  });

  it("fails as the work fails", async () => {
    await expect(joined(Promise.reject(new Error("refused")), async () => "own")).rejects.toThrow(
      "refused"
    );
  });
});

describe("work made once in an isolate", () => {
  it("is made once for every request, those that come while it is made waiting for it", async () => {
    let done = (_value: number) => {};
    const make = vi.fn(() => new Promise<number>(resolve => (done = resolve)));
    const read = madeOnce(make);
    const first = read();
    const second = read();
    await Promise.resolve();
    done(7);
    expect(await Promise.all([first, second, read()])).toEqual([7, 7, 7]);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it("is made again after a failure, which is not kept", async () => {
    const make = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce(8);
    const read = madeOnce(make);
    await expect(read()).rejects.toThrow("missing");
    expect(await read()).toBe(8);
    expect(await read()).toBe(8);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it("is made anew by one waiting request when its maker went away, and the others wait for that", async () => {
    vi.useFakeTimers();
    const make = vi.fn<() => Promise<number>>().mockImplementationOnce(gone).mockResolvedValue(9);
    const read = madeOnce(make);
    void read();
    const waiting = [read(), read(), read()];
    await vi.advanceTimersByTimeAsync(JOIN_WAIT_MS);
    expect(await Promise.all(waiting)).toEqual([9, 9, 9]);
    expect(make).toHaveBeenCalledTimes(2);
    expect(await read()).toBe(9);
  });
});
