import type { Env } from "@grabient/server/env.ts";
import { describe, expect, test, vi } from "vitest";
import type { VideoWholeJob, WholeClip } from "./video-drawer.ts";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  }
}));
const { VideoDrawer } = await import("./video-drawer.ts");

const CLIP: WholeClip = {
  name: "videos/abc.mp4",
  job: { width: 1080, height: 1080, plan: { frames: 3600 } } as unknown as VideoWholeJob
};

/** A clip's object with its storage, its alarm and its container, here: the container answers /draw with `drawn`,
    or as `answer` says, and its start throws `startError` while one is set. */
function object(options: { answer?: () => Response; startError?: () => string | null } = {}) {
  const storage = new Map<string, unknown>();
  const alarms: number[] = [];
  const objects = new Map<string, Uint8Array>();
  const calls: string[] = [];
  let running = false;
  const container = {
    get running() {
      return running;
    },
    start() {
      const error = options.startError?.();
      if (error) throw new Error(error);
      calls.push("start");
      running = true;
    },
    async destroy() {
      calls.push("destroy");
      running = false;
    },
    getTcpPort: () => ({
      async fetch(input: string, init?: RequestInit) {
        const path = new URL(input).pathname;
        calls.push(path);
        if (path === "/ping") return new Response("ok");
        if (path === "/progress") return Response.json({ name: CLIP.name, coded: 120 });
        expect(JSON.parse(String(init?.body))).toEqual({ name: CLIP.name, job: CLIP.job });
        return options.answer?.() ?? new Response(new Uint8Array([0, 0, 0, 8]));
      }
    })
  };
  const ctx = {
    container,
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: unknown) => void storage.set(key, structuredClone(value)),
      delete: async (key: string) => storage.delete(key),
      setAlarm: async (at: number) => void alarms.push(at)
    }
  };
  const env = {
    UPLOADS: {
      head: async (name: string) =>
        objects.has(name) ? { size: objects.get(name)?.length } : null,
      put: async (name: string, bytes: ArrayBuffer) => void objects.set(name, new Uint8Array(bytes))
    },
    USAGE: { writeDataPoint: () => undefined }
  } as unknown as Env;
  const drawer = new VideoDrawer(ctx as never, env);
  return { drawer, storage, alarms, objects, calls };
}

describe("a clip's VideoDrawer", () => {
  test("begins a drawing in its alarm, puts the clip in R2 and destroys its container", async () => {
    const { drawer, alarms, objects, calls, storage } = object();
    expect((await drawer.begin(CLIP)).state).toBe("drawing");
    expect(alarms.length).toBe(1);
    // joined, not begun again
    expect((await drawer.begin(CLIP)).state).toBe("drawing");
    expect(alarms.length).toBe(1);
    await drawer.alarm();
    expect([...objects.keys()]).toEqual([CLIP.name]);
    expect(calls).toEqual(["start", "/ping", "/draw", "destroy"]);
    expect(storage.has("clip")).toBe(false);
    expect(await drawer.status()).toEqual({ state: "idle" });
  });

  test("says how far its container has drawn", async () => {
    const { drawer } = object();
    await drawer.begin(CLIP);
    expect(await drawer.status()).toMatchObject({ state: "drawing", coded: 0, frames: 3600 });
  });

  test("draws nothing for a clip R2 already keeps", async () => {
    const { drawer, objects, calls } = object();
    await drawer.begin(CLIP);
    objects.set(CLIP.name, new Uint8Array(4));
    await drawer.alarm();
    expect(calls).toEqual([]);
    expect(await drawer.status()).toEqual({ state: "idle" });
  });

  test("throws so its alarm is tried again, then gives up after three drawings and says so", async () => {
    const { drawer, calls } = object({ answer: () => new Response("broken", { status: 500 }) });
    await drawer.begin(CLIP);
    await expect(drawer.alarm()).rejects.toThrow("500");
    await expect(drawer.alarm()).rejects.toThrow("500");
    await drawer.alarm();
    expect(await drawer.status()).toMatchObject({ state: "failed" });
    expect(calls.filter(call => call === "destroy").length).toBe(3);
    // asked again, it begins again
    expect((await drawer.begin(CLIP)).state).toBe("drawing");
  });

  test("waits its turn while every container the account may run is running, counting no try", async () => {
    let busy = true;
    const { drawer, alarms, objects } = object({
      startError: () => (busy ? "Maximum number of running container instances exceeded" : null)
    });
    await drawer.begin(CLIP);
    const now = Date.now();
    await drawer.alarm();
    expect(alarms.at(-1)).toBeGreaterThanOrEqual(now + 30_000);
    busy = false;
    await drawer.alarm();
    expect([...objects.keys()]).toEqual([CLIP.name]);
  });
});
