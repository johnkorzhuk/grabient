import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { patchStatus, syncStatus, viewNow } from "./state.ts";
import type { SyncLike, SyncOp, SyncRequest, SyncResponse, SyncResult } from "./wire.ts";

/* The copy's engine against a stand-in server that applies likes as the real one does: it skips a change it applied
   before, answers each with its result, and answers what changed since the browser's cursor. */

const view = { style: "linearGradient", steps: 7, angle: 90 } as const;
const like = (seed: string, liked: boolean): SyncOp => ({ op: "like", seed, liked, ...view });

interface Server {
  likes: Map<string, SyncLike>;
  bodies: SyncRequest[];
  /** an answer of its own for the next request, by status */
  next: Response[];
  refuse: Set<string>;
  applied: Map<string, number>;
  log: number;
  languageKept: boolean;
}
let server: Server;
function serve(body: SyncRequest): Response {
  server.bodies.push(body);
  const scripted = server.next.shift();
  if (scripted) return scripted;
  const last = server.applied.get(body.client) ?? 0;
  const results: SyncResult[] = [];
  let lastMutation = last;
  for (const { id, op } of body.mutations) {
    if (id <= last) continue;
    lastMutation = id;
    if (op.op !== "like") continue;
    if (server.refuse.has(op.seed)) {
      results.push({ id, ok: false, error: "Invalid palette." });
      continue;
    }
    if (op.liked) server.likes.set(op.seed, { seed: op.seed, ...view, at: 1, likes: 5 });
    else server.likes.delete(op.seed);
    server.log++;
    results.push({ id, ok: true, likesCount: op.liked ? 5 : 4 });
  }
  server.applied.set(body.client, lastMutation);
  if (body.locale) server.languageKept = true;
  const answer: SyncResponse = {
    cursor: server.log,
    reset: true,
    likes: [...server.likes.values()],
    unliked: [],
    collections: [],
    removed: [],
    lastMutation,
    results,
    admin: false,
    ...(body.locale ? { language: true } : {})
  };
  return Response.json(answer);
}

let sync: typeof import("./sync.ts");
beforeAll(async () => {
  const kept = new Map<string, string>();
  vi.stubGlobal("location", { origin: "https://g.test" });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => kept.set(key, String(value)),
    removeItem: (key: string) => kept.delete(key)
  });
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) =>
    serve(JSON.parse(String(init.body)) as SyncRequest)
  );
  sync = await import("./sync.ts");
});
let users = 0;
async function open() {
  server = {
    likes: new Map(),
    bodies: [],
    next: [],
    refuse: new Set(),
    applied: new Map(),
    log: 0,
    languageKept: false
  };
  const user = { id: `user-${++users}`, name: "ada", display: "Ada" };
  expect(await sync.openAccount(user)).toBe(true);
  await sync.syncNow();
  return user.id;
}
afterEach(async () => {
  await sync.closeAccount(`user-${users}`, true);
  patchStatus({ signedOut: false });
});

describe("the account's copy, syncing", () => {
  it("shows a like at once and settles it once the server applied it", async () => {
    const user = await open();
    const { done } = sync.makeChange(like("kA", true));
    expect(viewNow().likes.has("kA")).toBe(true);
    await done;
    expect(server.likes.has("kA")).toBe(true);
    expect(sync.currentView(user)?.likes.get("kA")?.likes).toBe(5);
    expect(syncStatus().pending).toBe(0);
  });

  it("folds quick presses on one palette, and sends nothing when they end where the server is", async () => {
    await open();
    const sent = server.bodies.length;
    const presses = [true, false, true, false].map(on => sync.makeChange(like("kB", on)).done);
    await Promise.all(presses);
    await sync.syncNow();
    const ops = server.bodies.slice(sent).flatMap(body => body.mutations.map(m => m.op));
    expect(ops).toEqual([]);
    expect(viewNow().likes.has("kB")).toBe(false);
  });

  it("puts a refused like back and says why, and keeps the refusal for the menu", async () => {
    await open();
    server.refuse.add("kC");
    const { done } = sync.makeChange(like("kC", true));
    expect(viewNow().likes.has("kC")).toBe(true);
    await expect(done).rejects.toThrow("Invalid palette.");
    expect(viewNow().likes.has("kC")).toBe(false);
    expect(syncStatus().refused.map(refusal => refusal.op)).toEqual(["like"]);
  });

  it("keeps a change the server put off, shown and waiting, and sends it again", async () => {
    await open();
    // saving is paused for every account: nothing is applied or refused, and the answer says when to ask again
    server.next.push(
      Response.json({
        cursor: 0,
        reset: false,
        likes: [],
        unliked: [],
        collections: [],
        removed: [],
        lastMutation: 0,
        results: [],
        admin: false,
        retryAfter: 300
      } satisfies SyncResponse)
    );
    const { done } = sync.makeChange(like("kF", true));
    await vi.waitUntil(() => server.bodies.at(-1)?.mutations.length === 1 && !syncStatus().syncing);
    expect(viewNow().likes.has("kF")).toBe(true);
    expect([syncStatus().pending, syncStatus().refused]).toEqual([1, []]);
    expect(server.likes.has("kF")).toBe(false);
    await sync.syncNow();
    await done;
    expect(server.likes.has("kF")).toBe(true);
    expect(syncStatus().pending).toBe(0);
  });

  it("names the page's language until the server keeps one", async () => {
    await open();
    expect(server.bodies[0]?.locale).toBe("en");
    await sync.syncNow();
    expect(server.bodies.at(-1)?.locale).toBeUndefined();
  });

  it("names the account the copy belongs to", async () => {
    const user = await open();
    expect(server.bodies.at(-1)?.account).toBe(user);
  });

  it("waits for a sign-in when the server ended the session, and asks for the session once", async () => {
    await open();
    const ended = vi.fn();
    sync.onSessionEnded(ended);
    server.next.push(
      Response.json({ error: "Sign in to continue." }, { status: 401 }),
      Response.json({ error: "Sign in to continue." }, { status: 401 })
    );
    const { done } = sync.makeChange(like("kD", true));
    await vi.waitUntil(() => syncStatus().signedOut);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(syncStatus().pending).toBe(1);
    void done.catch(() => {});
  });

  it("names itself again when its client id is another account's, and sends the turn anew", async () => {
    await open();
    const before = server.bodies.at(-1)!.client;
    server.next.push(Response.json({ error: "taken", client: "taken" }, { status: 409 }));
    await sync.changeAccount(like("kE", true));
    const after = server.bodies.at(-1)!;
    expect(after.client).not.toBe(before);
    expect(after.mutations.map(m => m.op)).toEqual([like("kE", true)]);
  });
});
