import { describe, expect, it } from "vitest";
import type { Pending } from "./model.ts";
import { accountStore, memoryBackend } from "./store.ts";
import type { SyncOp, SyncResponse } from "./wire.ts";

/* The copy's operations over the memory backend: IndexedDB runs the same code over its own transactions. */
const view = { style: "linearGradient", steps: 7, angle: 90 } as const;
const like = (seed: string, liked: boolean): SyncOp => ({ op: "like", seed, liked, ...view });
let made = 0;
const change = (op: SyncOp): Omit<Pending, "id"> => ({ key: `k${++made}`, op, at: made });
const answer = (extra: Partial<SyncResponse>): SyncResponse => ({
  cursor: 1,
  reset: false,
  likes: [],
  unliked: [],
  collections: [],
  removed: [],
  lastMutation: 0,
  results: [],
  admin: false,
  ...extra
});

describe("the account's copy", () => {
  it("names this browser once, and keeps the name", async () => {
    const store = accountStore(memoryBackend());
    const first = await store.load();
    const again = await store.load();
    expect(first.meta.client).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(again.meta.client).toBe(first.meta.client);
  });

  it("folds a press into the one waiting, and keeps a change written twice once", async () => {
    const store = accountStore(memoryBackend());
    const on = change(like("kA", true));
    expect((await store.add(on)).outbox.map(entry => entry.key)).toEqual([on.key]);
    expect((await store.add(on)).outbox.map(entry => entry.key)).toEqual([on.key]);
    const off = change(like("kA", false));
    expect(await store.add(off)).toEqual({ outbox: [], dropped: [on.key] });
  });

  it("marks what a sync takes, settles its answer, and lets a lost turn fold again", async () => {
    const store = accountStore(memoryBackend());
    await store.add(change(like("kA", true)));
    await store.add(change(like("kB", true)));
    const { batch, meta } = await store.take(1);
    expect([batch.length, meta.sending]).toEqual([1, batch[0]?.id]);
    await store.release();
    expect((await store.outbox()).meta.sending).toBe(0);
    const taken = await store.take(50);
    await store.settle({
      answer: answer({
        cursor: 7,
        admin: true,
        likes: [{ seed: "kA", ...view, at: 1, likes: 4 }],
        lastMutation: taken.batch[0]!.id,
        results: [{ id: taken.batch[0]!.id, ok: true, likesCount: 4 }]
      }),
      sent: taken.batch
    });
    const stored = await store.load();
    expect(stored.outbox.map(entry => entry.op)).toEqual([like("kB", true)]);
    expect([stored.meta.cursor, stored.meta.admin, stored.meta.sending]).toEqual([7, true, 0]);
    expect([...stored.snapshot.likes.keys()]).toEqual(["kA"]);
  });

  it("keeps refusals and removal tokens by the change they answer", async () => {
    const store = accountStore(memoryBackend());
    await store.add(change({ op: "collection.remove", slug: "@ada/blue", seed: "kA" }));
    await store.add(change({ op: "collection.update", slug: "@ada/blue", visibility: "public" }));
    const { batch } = await store.take(50);
    await store.settle({
      answer: answer({
        lastMutation: batch.at(-1)!.id,
        results: [
          { id: batch[0]!.id, ok: true, restore: "token" },
          { id: batch[1]!.id, ok: false, error: "Only admins can change who sees a collection." }
        ]
      }),
      sent: batch
    });
    const { meta } = await store.outbox();
    expect(meta.tokens[batch[0]!.key]?.token).toBe("token");
    expect(meta.refused).toMatchObject([
      {
        key: batch[1]!.key,
        op: "collection.update",
        slug: "@ada/blue",
        error: "Only admins can change who sees a collection."
      }
    ]);
  });

  it("forgets the server's data and keeps the changes not yet sent", async () => {
    const store = accountStore(memoryBackend());
    const taken = await store.take(50);
    await store.settle({
      answer: answer({ likes: [{ seed: "kA", ...view, at: 1, likes: 1 }] }),
      sent: taken.batch
    });
    await store.add(change(like("kB", true)));
    await store.forget();
    const stored = await store.load();
    expect([stored.snapshot.likes.size, stored.meta.cursor, stored.outbox.length]).toEqual([
      0,
      null,
      1
    ]);
  });

  it("applies a transaction whole or not at all", async () => {
    const backend = memoryBackend();
    const store = accountStore(backend);
    await store.add(change(like("kA", true)));
    await expect(
      backend.run(["outbox"], true, async tx => {
        tx.deletePendingUpTo(Number.MAX_SAFE_INTEGER);
        throw new Error("the tab closed");
      })
    ).rejects.toThrow();
    expect((await store.outbox()).outbox).toHaveLength(1);
  });
});
