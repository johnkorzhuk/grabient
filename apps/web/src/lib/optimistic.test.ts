import { describe, expect, it } from "vitest";
import { createOptimisticWrites } from "./optimistic.ts";

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

/* a server that holds one value per key and answers each write when told to */
function harness<V>(live?: () => boolean) {
  const server = new Map<string, V>();
  const shown = new Map<string, V>();
  const sent: [string, V][] = [];
  const answers: { ok: () => void; fail: (message: string) => void }[] = [];
  const writes = createOptimisticWrites<V, V>({
    live,
    valueOf: held => held,
    show: (key, value) => shown.set(key, value),
    send: (key, value) =>
      new Promise((resolve, reject) => {
        sent.push([key, value]);
        answers.push({
          ok: () => {
            server.set(key, value);
            resolve(value);
          },
          fail: message => reject(new Error(message))
        });
      })
  });
  return { writes, server, shown, sent, answers };
}

describe("optimistic writes", () => {
  it("show a press before the server answers, and resolve once the server holds it", async () => {
    const { writes, server, shown, sent, answers } = harness<boolean>();
    let done = false;
    const work = writes.set("a", false, true).then(() => {
      done = true;
    });
    expect([shown.get("a"), writes.pending("a"), sent]).toEqual([true, true, [["a", true]]]);
    await tick();
    expect(done).toBe(false);
    answers[0]!.ok();
    await work;
    expect([server.get("a"), shown.get("a"), writes.pending("a")]).toEqual([true, true, false]);
  });

  it("fold presses made while a write is out into the last, sent once the write returns", async () => {
    const { writes, server, shown, sent, answers } = harness<boolean>();
    const first = writes.set("a", false, true);
    const second = writes.set("a", true, false);
    writes.set("a", false, true);
    const fourth = writes.set("a", true, false);
    expect(shown.get("a")).toBe(false);
    expect(first).toBe(second);
    expect(second).toBe(fourth);
    expect(sent).toEqual([["a", true]]);
    answers[0]!.ok();
    await tick();
    expect(sent).toEqual([
      ["a", true],
      ["a", false]
    ]);
    answers[1]!.ok();
    await fourth;
    expect([server.get("a"), shown.get("a")]).toEqual([false, false]);
  });

  it("send nothing more for presses that end where the first write lands", async () => {
    const { writes, server, sent, answers } = harness<boolean>();
    const work = writes.set("a", false, true);
    writes.set("a", true, false);
    writes.set("a", false, true);
    answers[0]!.ok();
    await work;
    expect([sent, server.get("a")]).toEqual([[["a", true]], true]);
  });

  it("write each key on its own", async () => {
    const { writes, sent, answers } = harness<boolean>();
    const a = writes.set("a", false, true);
    const b = writes.set("b", false, true);
    expect(sent).toEqual([
      ["a", true],
      ["b", true]
    ]);
    answers[1]!.ok();
    await b;
    expect([writes.pending("a"), writes.pending("b")]).toEqual([true, false]);
    answers[0]!.ok();
    await a;
  });

  it("draw what the server holds after a failure, and reject every press it carried", async () => {
    const { writes, shown, answers } = harness<boolean>();
    const presses = [
      writes.set("a", false, true),
      writes.set("a", true, false),
      writes.set("a", false, true)
    ];
    answers[0]!.ok();
    await Promise.all(presses);
    expect(shown.get("a")).toBe(true);
    const next = writes.set("a", true, false);
    expect(shown.get("a")).toBe(false);
    answers[1]!.fail("Too many requests.");
    await expect(next).rejects.toThrow("Too many requests.");
    expect([shown.get("a"), writes.pending("a")]).toEqual([true, false]);
  });

  it("go back to an answered write when the next one fails", async () => {
    const { writes, shown, sent, answers } = harness<string>();
    const work = writes.set("a", "none", "up");
    writes.set("a", "none", "down");
    answers[0]!.ok();
    await tick();
    expect(sent).toEqual([
      ["a", "up"],
      ["a", "down"]
    ]);
    answers[1]!.fail("Couldn't save your vote.");
    await expect(work).rejects.toThrow();
    expect(shown.get("a")).toBe("up");
  });

  it("send nothing for a press that asks for what the server holds", async () => {
    const { writes, shown, sent } = harness<boolean>();
    await writes.set("a", true, true);
    expect([sent, shown.get("a"), writes.pending("a")]).toEqual([[], true, false]);
  });

  it("draw, send and say nothing once they no longer belong to the page", async () => {
    let live = true;
    const { writes, shown, sent, answers } = harness<boolean>(() => live);
    const work = writes.set("a", false, true);
    writes.set("a", true, false);
    live = false;
    shown.clear();
    answers[0]!.ok();
    await work;
    expect([sent, shown.size]).toEqual([[["a", true]], 0]);
    live = true;
    const failing = writes.set("b", false, true);
    live = false;
    shown.clear();
    answers[1]!.fail("Sign in to continue.");
    await failing;
    expect(shown.size).toBe(0);
  });
});
