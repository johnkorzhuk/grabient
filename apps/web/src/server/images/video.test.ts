import { readFileSync } from "node:fs";
import { decodePalette } from "@grabient/engine/codec.ts";
import { EFFECTS, isVectorKind } from "@grabient/engine/effect.ts";
import { KIT_DRAWINGS } from "@grabient/engine/kit/gen/drawings.ts";
import { KIT_KINDS } from "@grabient/engine/kit/kinds.ts";
import { kitEffect } from "@grabient/engine/kit/registry.ts";
import { VIDEO_MODULE, VIDEO_QUALITY, videoFit, videoFrames } from "@grabient/engine/video.ts";
import { videoFinish } from "@grabient/engine/video-finish.ts";
import { hasVideo } from "@grabient/engine/video-kinds.ts";
import type { Env } from "@grabient/server/env.ts";
import { LIMITS, type LimitName } from "@grabient/server/limits/config.ts";
import { afterEach, describe, expect, test, vi } from "vitest";
import { clipAt, drawClip } from "../../features/editor/video-clip.ts";
import type { Keep } from "./serve.ts";
import { seedMp4Answer, VIDEO_DRAWING, type VideoPartRunner } from "./video.ts";
import { spanOf } from "./video-bytes.ts";
import type { VideoPartJob } from "./video-draw.ts";
import type { WholeClip, WholeState } from "./video-drawer.ts";

const ORIGIN = "https://grabient.test";
const SEED = "kWnCIwwC47igfOklkTlShq44";
const wasm = new WebAssembly.Module(
  readFileSync(new URL("../../../../../packages/engine/src/video/video.wasm", import.meta.url))
);

/** The Worker's own entrypoint, here: each part drawn as video-draw.ts draws it, the jobs it was handed kept; with
    `failAfter`, every part past that many fails, as a drawing cut short does. */
function runner(failAfter = Number.POSITIVE_INFINITY) {
  const jobs: VideoPartJob[] = [];
  const run: VideoPartRunner = async job => {
    jobs.push(job);
    if (jobs.length > failAfter) throw new Error("cut short");
    const size = { width: job.width, height: job.height };
    const ask = {
      kind: job.kind,
      palette: job.palette,
      look: job.look,
      finish: job.finish,
      angle: job.angle,
      size,
      fps: job.fps
    };
    return videoFrames(wasm, ask, job.plan, job.from, job.to, job.state);
  };
  return { jobs, run };
}

/** An R2 bucket in memory that reads a Range and keeps custom metadata as R2 does, saying what it was asked. */
function bucket() {
  const objects = new Map<string, { bytes: Uint8Array; meta?: Record<string, string> }>();
  const asked: string[] = [];
  const stream = (bytes: Uint8Array) => new Blob([bytes as Uint8Array<ArrayBuffer>]).stream();
  const object = (
    whole: Uint8Array,
    part: Uint8Array,
    meta?: Record<string, string>,
    range?: object
  ) => ({
    size: whole.length,
    range,
    customMetadata: meta,
    body: stream(part),
    arrayBuffer: async () => part.slice().buffer
  });
  return {
    objects,
    asked,
    async head(name: string) {
      asked.push(`head ${name}`);
      const kept = objects.get(name);
      return kept ? { size: kept.bytes.length } : null;
    },
    async get(name: string, options?: { range?: Headers | { offset: number; length: number } }) {
      asked.push(`get ${name}`);
      const kept = objects.get(name);
      if (!kept) return null;
      const { bytes, meta } = kept;
      const range = options?.range;
      if (!range) return object(bytes, bytes, meta);
      if (!(range instanceof Headers)) {
        return object(bytes, bytes.slice(range.offset, range.offset + range.length), meta, range);
      }
      const [, first, last] = /^bytes=(\d*)-(\d*)$/.exec(range.get("Range") ?? "") ?? [];
      if (first === "") {
        const suffix = Number(last);
        return object(bytes, bytes.slice(bytes.length - suffix), meta, { suffix });
      }
      if (Number(first) >= bytes.length) throw new Error("range not satisfiable");
      const end = last === "" ? bytes.length : Math.min(Number(last) + 1, bytes.length);
      const offset = Number(first);
      return object(bytes, bytes.slice(offset, end), meta, { offset, length: end - offset });
    },
    async put(
      name: string,
      bytes: Uint8Array,
      options?: { customMetadata?: Record<string, string> }
    ) {
      asked.push(`put ${name}`);
      objects.set(name, { bytes: bytes.slice(), meta: options?.customMetadata });
    },
    async delete(names: string | string[]) {
      for (const name of [names].flat()) {
        asked.push(`delete ${name}`);
        objects.delete(name);
      }
    }
  };
}

/** A database whose k_flags holds these flags off. */
const flagsOff = (...names: string[]) => ({
  prepare: () => ({
    bind: () => ({ all: async () => ({ results: names.map(name => ({ name, enabled: 0 })) }) })
  })
});

/** The limiter's Durable Objects, each counting its limits through their windows as limits/config.ts sets them, or
    through `windows` (seconds) in place of a limit's own; it refuses the limits in `refuse` outright. */
function limiter(refuse: string[] = [], windows: Record<string, number> = {}) {
  const counts = new Map<string, { count: number; until: number }>();
  return {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      fetch: async (input: string | URL) => {
        const url = new URL(input);
        const n = Number(url.searchParams.get("n") ?? 1);
        const now = Date.now();
        const asked = url.searchParams.getAll("type").map(type => {
          const limit = LIMITS[type as LimitName];
          let count = counts.get(`${id}:${type}`);
          if (!count || count.until <= now) {
            count = { count: 0, until: now + 1000 * (windows[type] ?? limit.window) };
            counts.set(`${id}:${type}`, count);
          }
          const success = !refuse.includes(type) && count.count + n <= limit.requests;
          return { type, success, limit: limit.requests, count };
        });
        const success = asked.every(each => each.success);
        if (success) for (const each of asked) each.count.count += n;
        const results = asked.map(({ type, success, limit, count }) => ({
          type,
          success,
          limit,
          remaining: Math.max(0, limit - count.count),
          reset: Math.floor(count.until / 1000)
        }));
        const { type: _, ...first } = results.find(result => !result.success) ?? results[0];
        return Response.json({ ...first, success, results }, { status: success ? 200 : 429 });
      }
    })
  } as unknown as DurableObjectNamespace;
}

/** The objects that draw clips whole in a container (video-drawer.ts), here: a clip begun is drawn a moment later, a
    few bytes naming its size put in R2 under its name, or its drawing fails where `fail`; what each was handed is
    kept. A clip being drawn is joined, not begun again. */
function drawers(store: ReturnType<typeof bucket>, fail = false) {
  const begun: WholeClip[] = [];
  const states = new Map<string, WholeState>();
  const namespace = {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      async begin(clip: WholeClip): Promise<WholeState> {
        const now = states.get(id);
        if (now?.state === "drawing") return now;
        begun.push(clip);
        const drawing = {
          state: "drawing",
          since: Date.now(),
          coded: 0,
          frames: clip.job.plan.frames
        } as const;
        states.set(id, drawing);
        setTimeout(async () => {
          if (fail) return void states.set(id, { state: "failed", error: "broken" });
          await store.put(
            clip.name,
            new TextEncoder().encode(`${clip.job.width}x${clip.job.height}`)
          );
          states.delete(id);
        }, 30);
        return drawing;
      },
      status: async (): Promise<WholeState> => states.get(id) ?? { state: "idle" }
    })
  };
  return { begun, namespace: namespace as unknown as DurableObjectNamespace };
}

function world(
  options: {
    off?: string[];
    refuse?: string[];
    windows?: Record<string, number>;
    deployment?: Env["DEPLOYMENT"];
    /** a container draws clips past the Worker's work whole, or fails to where "fail" */
    whole?: boolean | "fail";
  } = {}
) {
  const store = bucket();
  const points: string[] = [];
  const kept: Promise<unknown>[] = [];
  const whole = options.whole ? drawers(store, options.whole === "fail") : null;
  const env = {
    DEPLOYMENT: options.deployment ?? "staging",
    DB: flagsOff(...(options.off ?? [])) as unknown as D1Database,
    UPLOADS: store as unknown as R2Bucket,
    RATE_LIMITER: limiter(options.refuse, options.windows),
    VIDEO_DRAWER: whole?.namespace,
    USAGE: { writeDataPoint: (point: { blobs: string[] }) => points.push(point.blobs.join(" ")) }
  } as unknown as Env;
  const keep: Keep = work => kept.push(work);
  return {
    env,
    keep,
    store,
    points,
    begun: whole?.begun ?? [],
    settled: () => Promise.all(kept)
  };
}

const get = (path: string, init: RequestInit = {}) =>
  new Request(`${ORIGIN}${path}`, {
    ...init,
    headers: { "CF-Connecting-IP": "198.51.100.7", ...init.headers }
  });
const bytes = async (response: Response) => new Uint8Array(await response.arrayBuffer());
const boxTypes = (file: Uint8Array) => {
  const types: string[] = [];
  for (let at = 0; at < file.length; ) {
    types.push(String.fromCharCode(...file.subarray(at + 4, at + 8)));
    at += new DataView(file.buffer, file.byteOffset).getUint32(at);
  }
  return types;
};
const CLIP = `/${SEED}.mp4?style=glass&angle=135&size=64x48&fps=10&duration=2`;
/** As an app that previews a posted link asks. */
const preview = (
  path: string,
  agent = "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"
) => get(path, { headers: { "User-Agent": agent } });
const anAdmin = { admin: async () => true };
/** A clip's ETag, as a HEAD asks for it. */
const etagOf = async (env: Env, keep: Keep, path: string) =>
  (
    await seedMp4Answer(get(path, { method: "HEAD" }), env, keep, async () => {
      throw new Error("a HEAD draws nothing");
    })
  ).headers.get("ETag");

afterEach(() => vi.restoreAllMocks());

describe("spanOf", () => {
  test("reads one span of bytes, an open or a last one, and nothing past the end", () => {
    expect(spanOf("bytes=0-1", 100)).toEqual([0, 1]);
    expect(spanOf("bytes=90-", 100)).toEqual([90, 99]);
    expect(spanOf("bytes=-10", 100)).toEqual([90, 99]);
    expect(spanOf("bytes=50-500", 100)).toEqual([50, 99]);
    expect(spanOf("bytes=100-", 100)).toBe("past");
    expect(spanOf("bytes=-0", 100)).toBe("past");
    expect([spanOf(null, 100), spanOf("bytes=0-1,4-5", 100), spanOf("items=0-1", 100)]).toEqual([
      null,
      null,
      null
    ]);
  });
});

describe("a palette's MP4", () => {
  test("is drawn once, kept in R2 under its key, and answered from there after", async () => {
    const { env, keep, store, points, settled } = world();
    const parts = runner();
    const first = await seedMp4Answer(get(CLIP), env, keep, parts.run);
    expect([first.status, first.headers.get("X-Cache"), first.headers.get("Content-Type")]).toEqual(
      [200, "MISS", "video/mp4"]
    );
    expect(first.headers.get("Accept-Ranges")).toBe("bytes");
    expect(first.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const name = `videos/${first.headers.get("ETag")?.slice(7, -1)}.mp4`;
    // kept before the answer went out, so the range a player asks for next finds it
    expect(store.objects.has(name)).toBe(true);
    const drawn = await bytes(first);
    expect(boxTypes(drawn)).toEqual(["ftyp", "moov", "mdat"]);
    await settled();
    expect([...store.objects.keys()]).toEqual([name]);
    const again = await seedMp4Answer(get(CLIP), env, keep, parts.run);
    expect([again.status, again.headers.get("X-Cache")]).toEqual([200, "HIT"]);
    expect(await bytes(again)).toEqual(drawn);
    expect(parts.jobs.length).toBe(1);
    expect(points).toEqual(["image video drawn", "image video cache"]);
  });

  test("answers a player's ranges, drawn or kept, and refuses one past the end", async () => {
    const { env, keep, settled } = world();
    const parts = runner();
    const ranged = (range: string) => get(CLIP, { headers: { Range: range } });
    const drawn = await seedMp4Answer(ranged("bytes=0-1"), env, keep, parts.run);
    expect(drawn.status).toBe(206);
    const size = Number(drawn.headers.get("Content-Range")?.split("/")[1]);
    expect(drawn.headers.get("Content-Range")).toBe(`bytes 0-1/${size}`);
    expect((await bytes(drawn)).length).toBe(2);
    await settled();
    const whole = await bytes(await seedMp4Answer(get(CLIP), env, keep, parts.run));
    const tail = await seedMp4Answer(ranged("bytes=-10"), env, keep, parts.run);
    expect([tail.status, tail.headers.get("Content-Range")]).toEqual([
      206,
      `bytes ${size - 10}-${size - 1}/${size}`
    ]);
    expect(await bytes(tail)).toEqual(whole.slice(size - 10));
    const past = await seedMp4Answer(ranged(`bytes=${size}-`), env, keep, parts.run);
    expect([past.status, past.headers.get("Content-Range")]).toEqual([416, `bytes */${size}`]);
    expect(parts.jobs.length).toBe(1);
  });

  test("is drawn in parts, each going on from the state of the one before, as the same file", async () => {
    const one = world();
    const whole = await bytes(await seedMp4Answer(get(CLIP), one.env, one.keep, runner().run));
    const many = world();
    const parts = runner();
    const parted = await bytes(
      await seedMp4Answer(get(CLIP), many.env, many.keep, parts.run, { partWork: 64 * 48 * 6 })
    );
    expect(parts.jobs.length).toBe(4);
    expect(parts.jobs[0].state).toBeNull();
    expect(parts.jobs.slice(1).every(job => job.state instanceof Uint8Array)).toBe(true);
    expect(parted).toEqual(whole);
  });

  test("plays the glass where the address names no style, and nothing for a gradient's style or no palette", async () => {
    const { env, keep } = world();
    const parts = runner();
    const tag = async (path: string) =>
      (await seedMp4Answer(get(path, { method: "HEAD" }), env, keep, parts.run)).headers.get(
        "ETag"
      );
    expect(await tag(`/${SEED}.mp4?angle=135&size=64x48&fps=10&duration=2`)).toBe(await tag(CLIP));
    const gradient = await seedMp4Answer(
      get(`/${SEED}.mp4?style=linearGradient`),
      env,
      keep,
      parts.run
    );
    expect(gradient.status).toBe(404);
    /* every effect engine/video-kinds.ts lists, the papercut's and the strings' among them, then each field effect
       (kit/kinds.ts), the last after "or" */
    const styles = ["glass", "blob", "silk", "rosette", "papercut", "strings", ...KIT_KINDS].map(
      kind => `style=${kind}`
    );
    expect(await gradient.text()).toBe(
      `An MP4 plays an effect: ${styles.slice(0, -1).join(", ")} or ${styles.at(-1)}.`
    );
    expect((await seedMp4Answer(get("/nothing.mp4"), env, keep, parts.run)).status).toBe(404);
    expect(parts.jobs.length).toBe(0);
  });

  test("draws every vector effect, the field effects among them, each its own clip", async () => {
    /* more clips than an address draws an hour (limits/config.ts videoRender): its window gone */
    const { env, keep } = world({ windows: { videoRender: 0 } });
    const parts = runner();
    const tags = [];
    /* those with a loop of their own: one the pointer alone moves has no clip (engine/effect.ts EFFECT_KINDS) */
    const styles = EFFECTS.filter(isVectorKind).filter(hasVideo);
    expect(EFFECTS.filter(kind => !hasVideo(kind))).toEqual(["dimple"]);
    for (const style of styles) {
      const answer = await seedMp4Answer(
        get(`/${SEED}.mp4?style=${style}&angle=135&size=64x48&fps=10&duration=2`),
        env,
        keep,
        parts.run
      );
      expect([answer.status, answer.headers.get("Content-Type")]).toEqual([200, "video/mp4"]);
      expect(boxTypes(await bytes(answer))).toEqual(["ftyp", "moov", "mdat"]);
      tags.push(answer.headers.get("ETag"));
    }
    expect(parts.jobs.map(job => job.kind)).toEqual(styles);
    expect(new Set([...tags, (await etagOf(env, keep, CLIP)) ?? ""]).size).toBe(styles.length + 1);
    const about = async (style: string) =>
      (
        await (
          await seedMp4Answer(
            preview(`/${SEED}.mp4?style=${style}&size=64x48&duration=2`),
            env,
            keep,
            parts.run
          )
        ).text()
      ).match(/<meta name="description" content="([^"]*)">/)?.[1];
    expect(await about("silk")).toContain("silk dyed in its colors");
    expect(await about("rosette")).toContain("a rosette of petals in its colors");
    expect(await about("papercut")).toContain("sheets of paper in its colors");
    expect(await about("strings")).toContain("threads in its colors");
    for (const kind of KIT_KINDS) expect(await about(kind)).toBe(kitEffect(kind).about.video);
  });

  test("has no clip of an effect with no loop: the dimple's address names the effects that have one", async () => {
    const { env, keep } = world({ off: ["videos"] });
    const parts = runner();
    const answer = await seedMp4Answer(
      get(`/${SEED}.mp4?style=dimple&size=64x48&duration=2`),
      env,
      keep,
      parts.run
    );
    expect(answer.status).toBe(404);
    const said = await answer.text();
    expect(said).toContain("style=glass");
    expect(said).not.toContain("style=dimple");
    expect(parts.jobs).toHaveLength(0);
  });

  test("names its soft and grain in its key, its drawing and its first frame, a clip with neither keeping its key", async () => {
    const { env, keep } = world({ off: ["videos"] });
    const parts = runner();
    const finished = `${CLIP}&soft=40&grain=30`;
    expect(await etagOf(env, keep, finished)).not.toBe(await etagOf(env, keep, CLIP));
    expect(await etagOf(env, keep, `${CLIP}&grain=30`)).not.toBe(await etagOf(env, keep, finished));
    /* the key a plain clip had before clips took a soft and a grain */
    const keyOf = async (parts: unknown[]) => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify([VIDEO_DRAWING, ...parts]))
      );
      return `"video:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")}"`;
    };
    const fit = videoFit(
      { kind: "glass", look: { shape: 0, frost: 1, bg: null, steps: null, zoom: null } },
      1,
      10,
      2,
      {
        width: 64,
        height: 48
      }
    );
    /* a look keyed as it was before an effect took steps: steps only where the look names them */
    const plain = [
      SEED,
      "glass",
      135,
      { shape: 0, frost: 1, bg: null },
      fit.size,
      fit.fps,
      fit.plan
    ];
    expect(await etagOf(env, keep, CLIP)).toBe(await keyOf([VIDEO_QUALITY.glass, ...plain]));
    /* a blob takes no soft: its clip with one is the clip with none, keyed and coded as it was */
    const blobLook = { shape: null, frost: 1, bg: null, steps: null, zoom: null };
    const blobFit = videoFit({ kind: "blob", look: blobLook }, 1, 10, 2, { width: 64, height: 48 });
    const blobKey = (quality: unknown, finish: unknown[]) =>
      keyOf([
        quality,
        SEED,
        "blob",
        90,
        { shape: null, frost: 1, bg: null },
        blobFit.size,
        blobFit.fps,
        blobFit.plan,
        ...finish
      ]);
    const blobClip = `/${SEED}.mp4?style=blob&size=64x48&fps=10&duration=2`;
    expect(await etagOf(env, keep, blobClip)).toBe(await blobKey(VIDEO_QUALITY.blob, []));
    expect(await etagOf(env, keep, `${blobClip}&soft=40`)).toBe(
      await blobKey(VIDEO_QUALITY.blob, [])
    );
    /* a field effect's clip is kept under the kit's drawing too, as its cards and pictures are: a new pick or a change
       to the kit's shading is a new clip. The sandstone's at other than its designed steps is keyed by them as well,
       and at its designed steps by its look as every other effect's */
    const strataAt = (steps: string) =>
      etagOf(env, keep, `/${SEED}.mp4?style=strata&size=64x48&fps=10&duration=2${steps}`);
    const strataKey = (look: Record<string, unknown>) => {
      const strataFit = videoFit(
        { kind: "strata", look: { shape: null, frost: 1, bg: null, steps: null, zoom: null } },
        1,
        10,
        2,
        { width: 64, height: 48 }
      );
      return keyOf([
        VIDEO_QUALITY.strata,
        SEED,
        "strata",
        90,
        look,
        strataFit.size,
        strataFit.fps,
        strataFit.plan,
        KIT_DRAWINGS.strata
      ]);
    };
    expect(await strataAt("")).toBe(await strataKey({ shape: null, frost: 1, bg: null }));
    expect(await strataAt("&steps=28")).toBe(await strataAt(""));
    expect(await strataAt("&steps=12")).toBe(
      await strataKey({ shape: null, frost: 1, bg: null, steps: 12 })
    );
    expect(await strataAt("&steps=12")).not.toBe(await strataAt("&steps=13"));
    /* an effect asked steps it takes none of draws the clip it draws with none: the papercut's, keyed as it was
       before an effect took steps, and under no drawing of the kit's */
    const cutLook = { shape: null, frost: 1, bg: null, steps: null, zoom: null };
    const cutFit = videoFit({ kind: "papercut", look: cutLook }, 1, 10, 2, {
      width: 64,
      height: 48
    });
    const cutClip = `/${SEED}.mp4?style=papercut&size=64x48&fps=10&duration=2`;
    const cutKey = await keyOf([
      VIDEO_QUALITY.papercut,
      SEED,
      "papercut",
      90,
      { shape: null, frost: 1, bg: null },
      cutFit.size,
      cutFit.fps,
      cutFit.plan
    ]);
    expect(await etagOf(env, keep, cutClip)).toBe(cutKey);
    expect(await etagOf(env, keep, `${cutClip}&steps=12`)).toBe(cutKey);
    const still = new URL(
      (await seedMp4Answer(get(finished), env, keep, parts.run)).headers.get("Location") ?? ""
    );
    expect([...still.searchParams]).toEqual([
      ["style", "glass"],
      ["angle", "135"],
      ["soft", "40"],
      ["grain", "30"],
      ["w", "64"],
      ["h", "48"]
    ]);
    const drawing = world();
    await seedMp4Answer(get(finished), drawing.env, drawing.keep, parts.run);
    const palette = decodePalette(SEED);
    if (!palette) throw new Error("the test's palette");
    expect(parts.jobs.map(job => job.finish)).toEqual([
      videoFinish(
        palette,
        { kind: "glass", look: { shape: null, frost: 1, bg: null, steps: null, zoom: null } },
        135,
        { soft: 40, grain: 30 },
        {
          width: 64,
          height: 48
        }
      )
    ]);
    expect(parts.jobs[0].finish.soft?.under?.angle).toBe(135);
  });

  test("goes to its first frame while drawing is off, and a kept clip is still answered", async () => {
    const { env, keep } = world({ off: ["videos"] });
    const parts = runner();
    const off = await seedMp4Answer(get(CLIP), env, keep, parts.run);
    expect(off.status).toBe(302);
    const still = new URL(off.headers.get("Location") ?? "");
    expect(still.pathname).toBe(`/${SEED}.png`);
    expect([
      still.searchParams.get("style"),
      still.searchParams.get("w"),
      still.searchParams.get("h")
    ]).toEqual(["glass", "64", "48"]);
    expect(off.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(parts.jobs.length).toBe(0);
  });

  test("past its allowances answers 429 and draws nothing", async () => {
    const { env, keep } = world({ refuse: ["videoRenderDaily"] });
    const parts = runner();
    const refused = await seedMp4Answer(get(CLIP), env, keep, parts.run);
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).not.toBeNull();
    expect(parts.jobs.length).toBe(0);
  });

  test("holds an address to five new clips an hour", async () => {
    const { env, keep } = world();
    const parts = runner();
    const statuses = [];
    for (const angle of [10, 20, 30, 40, 50, 60]) {
      const asked = CLIP.replace("angle=135", `angle=${angle}`);
      statuses.push((await seedMp4Answer(get(asked), env, keep, parts.run)).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    const elsewhere = get(CLIP, { headers: { "CF-Connecting-IP": "203.0.113.9" } });
    expect((await seedMp4Answer(elsewhere, env, keep, parts.run)).status).toBe(200);
  });

  test("holds an admin to none of its allowances", async () => {
    const { env, keep } = world({ refuse: ["videoRender", "videoRenderDaily"] });
    const parts = runner();
    expect((await seedMp4Answer(get(CLIP), env, keep, parts.run)).status).toBe(429);
    const admin = await seedMp4Answer(get(CLIP), env, keep, parts.run, anAdmin);
    expect([admin.status, admin.headers.get("X-Cache")]).toEqual([200, "MISS"]);
  });

  test("draws a clip once for two askers at once, the second answered from R2 once the first has kept it", async () => {
    const { env, keep } = world();
    const parts = runner();
    const other = get(CLIP, { headers: { "CF-Connecting-IP": "203.0.113.9" } });
    const answers = await Promise.all([
      seedMp4Answer(get(CLIP), env, keep, parts.run, { lookEvery: 5 }),
      seedMp4Answer(other, env, keep, parts.run, { lookEvery: 5 })
    ]);
    expect(answers.map(answer => answer.headers.get("X-Cache")).sort()).toEqual(["HIT", "MISS"]);
    const [one, two] = await Promise.all(answers.map(bytes));
    expect(two).toEqual(one);
    expect(parts.jobs.length).toBe(1);
  });

  test("on production is drawn for an admin alone, and once kept plays for anyone", async () => {
    const { env, keep, settled } = world({ deployment: "production" });
    const parts = runner();
    const refused = await seedMp4Answer(get(CLIP), env, keep, parts.run);
    expect(refused.status).toBe(302);
    expect(new URL(refused.headers.get("Location") ?? "").pathname).toBe(`/${SEED}.png`);
    expect(refused.headers.get("X-Grabient-Paused")).toBeNull();
    const page = await (await seedMp4Answer(preview(CLIP), env, keep, parts.run)).text();
    expect(page).not.toContain("og:video");
    await settled();
    expect(parts.jobs.length).toBe(0);
    const admin = await seedMp4Answer(get(CLIP), env, keep, parts.run, anAdmin);
    expect([admin.status, admin.headers.get("X-Cache")]).toEqual([200, "MISS"]);
    await settled();
    const anyone = await seedMp4Answer(get(CLIP), env, keep, parts.run);
    expect([anyone.status, anyone.headers.get("X-Cache")]).toEqual([200, "HIT"]);
    const kept = await (await seedMp4Answer(preview(CLIP), env, keep, parts.run)).text();
    expect(kept).toContain('<meta property="og:video:type" content="video/mp4">');
    expect(parts.jobs.length).toBe(1);
  });

  test("answers HEAD and a matching If-None-Match without drawing", async () => {
    const { env, keep } = world();
    const parts = runner();
    const head = await seedMp4Answer(get(CLIP, { method: "HEAD" }), env, keep, parts.run);
    expect([head.status, head.headers.get("Content-Type")]).toEqual([200, "video/mp4"]);
    const tag = head.headers.get("ETag") ?? "";
    const unchanged = await seedMp4Answer(
      get(CLIP, { headers: { "If-None-Match": tag } }),
      env,
      keep,
      parts.run
    );
    expect(unchanged.status).toBe(304);
    expect(parts.jobs.length).toBe(0);
  });

  test("keeps nothing on a Preview", async () => {
    const { env, keep, store, settled } = world({ deployment: "preview" });
    await seedMp4Answer(get(CLIP), env, keep, runner().run);
    await settled();
    expect(store.asked).toEqual([]);
  });
});

describe("a palette's MP4 drawn in parts", () => {
  test("keeps each part, and the state every fourth, so a drawing cut short goes on from there", async () => {
    // 20 frames in ten parts of two
    const partWork = 64 * 48 * 2;
    const clean = world();
    const whole = await bytes(
      await seedMp4Answer(get(CLIP), clean.env, clean.keep, runner().run, { partWork })
    );
    // the slot the cut drawing held has ended by the next asking
    const { env, keep, store, settled } = world({ windows: { videoClip: 0 } });
    const cut = runner(6);
    expect((await seedMp4Answer(get(CLIP), env, keep, cut.run, { partWork })).status).toBe(503);
    await settled();
    const kept = [...store.objects.keys()].sort();
    expect(kept.filter(name => name.endsWith(".mp4"))).toEqual([]);
    expect(kept.filter(name => name.includes("/part-")).length).toBe(6);
    expect(store.objects.get(kept.find(name => name.endsWith("/state")) ?? "")?.meta).toEqual({
      part: "3",
      module: VIDEO_MODULE
    });
    const again = runner();
    const answer = await seedMp4Answer(get(CLIP), env, keep, again.run, { partWork });
    expect(await bytes(answer)).toEqual(whole);
    // the state after the fourth part: the fifth and sixth, kept without one, are drawn again
    expect(again.jobs.map(job => job.from)).toEqual([8, 10, 12, 14, 16, 18]);
    expect(again.jobs[0].state).toBeInstanceOf(Uint8Array);
    await settled();
    expect([...store.objects.keys()].filter(name => !name.endsWith(".mp4"))).toEqual([]);
  });

  test("goes on only from a state its own module kept, else draws from the first part", async () => {
    const partWork = 64 * 48 * 2;
    const clean = world();
    const whole = await bytes(
      await seedMp4Answer(get(CLIP), clean.env, clean.keep, runner().run, { partWork })
    );
    const { env, keep, store, settled } = world({ windows: { videoClip: 0 } });
    expect((await seedMp4Answer(get(CLIP), env, keep, runner(6).run, { partWork })).status).toBe(
      503
    );
    await settled();
    /* as a module before this one kept it: its state holds pointers into that module's memory, and names none */
    const state = store.objects.get(
      [...store.objects.keys()].find(name => name.endsWith("/state")) ?? ""
    );
    if (!state) throw new Error("the cut drawing kept no state");
    state.meta = { part: "3" };
    const again = runner();
    expect(await bytes(await seedMp4Answer(get(CLIP), env, keep, again.run, { partWork }))).toEqual(
      whole
    );
    expect(again.jobs.map(job => job.from)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
    expect(again.jobs[0].state).toBeNull();
  });
});

describe("a palette's MP4 drawn in the reader's browser", () => {
  /* The editor's Download MP4 draws the clip at the address its Copy link copies in one stream, in a worker of the
     reader's browser (features/editor/video-clip.ts), where the Worker draws it in parts: the same file. */
  test("is the clip the Worker answers at its address, byte for byte", async () => {
    const { env, keep } = world();
    for (const address of [
      `/${SEED}.mp4?style=glass&angle=135&soft=40&grain=30&speed=10&fps=10&shape=417&w=64&h=48`,
      `/${SEED}.mp4?style=blob&speed=4&fps=10&frost=0.5&shape=3&bg=%23ffeeddaa&w=48&h=64`,
      /* a soft blob with no ground, over the clip's backdrop */
      `/${SEED}.mp4?style=blob&soft=20&grain=10&speed=4&fps=10&shape=999&w=64&h=48`,
      `/${SEED}.mp4?style=silk&angle=20&grain=50&speed=10&fps=10&w=64&h=48`,
      `/${SEED}.mp4?style=rosette&angle=200&soft=70&speed=10&fps=10&w=64&h=48`,
      /* held: its first frame for a second */
      `/${SEED}.mp4?style=glass&speed=0&fps=10&w=64&h=48`,
      /* no size: the card's */
      `/${SEED}.mp4?style=glass&speed=10&fps=3`
    ]) {
      const clip = clipAt(`${ORIGIN}${address}`);
      if (!clip) throw new Error(`no clip at ${address}`);
      const served = await seedMp4Answer(get(address), env, keep, runner().run, {
        ...anAdmin,
        partWork: 64 * 48 * 3
      });
      expect(served.status, address).toBe(200);
      expect(drawClip(wasm, clip), address).toEqual(await bytes(served));
    }
  });
});

describe("a palette's MP4 posted as a link", () => {
  test("is a page whose video is the clip and whose poster its first frame, the clip begun as it goes out", async () => {
    const { env, keep, store, settled } = world();
    const parts = runner();
    const page = await seedMp4Answer(preview(CLIP), env, keep, parts.run);
    expect(page.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(page.headers.get("Cache-Control")).toContain("no-store");
    const html = await page.text();
    const tag = (property: string) =>
      new RegExp(`<meta property="${property}" content="([^"]*)">`)
        .exec(html)?.[1]
        ?.replaceAll("&amp;", "&");
    expect(tag("og:video:secure_url")).toBe(
      `${ORIGIN}/${SEED}.mp4?style=glass&angle=135&fps=10&w=64&h=48&duration=2&raw`
    );
    expect(tag("og:video:type")).toBe("video/mp4");
    expect([tag("og:video:width"), tag("og:video:height")]).toEqual(["64", "48"]);
    const poster = new URL(tag("og:image") ?? "");
    expect(poster.pathname).toBe(`/${SEED}.png`);
    expect([...poster.searchParams]).toEqual([
      ["style", "glass"],
      ["angle", "135"],
      ["w", "64"],
      ["h", "48"]
    ]);
    expect(html.lastIndexOf('property="og:type" content="video.other"')).toBeGreaterThan(
      html.lastIndexOf("og:video:height")
    );
    await settled();
    expect([...store.objects.keys()].filter(name => name.endsWith(".mp4")).length).toBe(1);
    const file = await seedMp4Answer(preview(`${CLIP}&raw`), env, keep, parts.run);
    expect([file.headers.get("Content-Type"), file.headers.get("X-Cache")]).toEqual([
      "video/mp4",
      "HIT"
    ]);
    expect(parts.jobs.length).toBe(1);
  });

  test("names the clip by its own address, its soft and grain with it, which answers the same clip", async () => {
    const { env, keep } = world();
    const parts = runner();
    const asked = `/${SEED}.mp4?grain=30&size=64x48&style=glass&duration=2&fps=10&soft=40&angle=200`;
    const html = await (await seedMp4Answer(preview(asked), env, keep, parts.run)).text();
    const video = new URL(
      /<meta property="og:video" content="([^"]*)">/.exec(html)?.[1]?.replaceAll("&amp;", "&") ?? ""
    );
    expect(`${video.pathname}${video.search}`).toBe(
      `/${SEED}.mp4?style=glass&angle=200&soft=40&grain=30&fps=10&w=64&h=48&duration=2&raw`
    );
    const named = `${video.pathname}${video.search.replace("&raw", "")}`;
    expect(await etagOf(env, keep, named)).toBe(await etagOf(env, keep, asked));
  });

  test("names the clip by an address that fits to the same clip, where a soft's blur steps as it shrinks too", async () => {
    const { env, keep } = world({ off: ["videos"] });
    const parts = runner();
    for (const asked of [
      `/${SEED}.mp4?style=glass&soft=20&size=540x1600&fps=60&duration=60`,
      `/${SEED}.mp4?style=glass&soft=40&grain=30&size=512x512&fps=60&duration=60`,
      `/${SEED}.mp4?style=silk&soft=40&grain=30&size=1920x1080`
    ]) {
      const html = await (await seedMp4Answer(preview(asked), env, keep, parts.run)).text();
      const named = new URL(
        /<meta property="og:url" content="([^"]*)">/.exec(html)?.[1]?.replaceAll("&amp;", "&") ?? ""
      );
      expect(await etagOf(env, keep, `${named.pathname}${named.search}`), asked).toBe(
        await etagOf(env, keep, asked)
      );
    }
    expect(parts.jobs.length).toBe(0);
  });

  test("names no video while drawing is off, and begins none", async () => {
    const { env, keep, store, settled } = world({ off: ["videos"] });
    const parts = runner();
    const html = await (await seedMp4Answer(preview(CLIP), env, keep, parts.run)).text();
    expect(html).not.toContain("og:video");
    expect(html).toContain('<meta property="og:type" content="website">');
    await settled();
    expect(parts.jobs.length).toBe(0);
    expect(store.asked.filter(asked => asked.startsWith("put"))).toEqual([]);
  });

  test("names no video past the allowances, and begins none", async () => {
    const { env, keep, settled } = world({ refuse: ["videoRenderDaily"] });
    const parts = runner();
    const html = await (await seedMp4Answer(preview(CLIP), env, keep, parts.run)).text();
    expect(html).not.toContain("og:video");
    await settled();
    expect(parts.jobs.length).toBe(0);
  });
});

describe("a palette's MP4 drawn whole in a container", () => {
  /* John's clip of 3 Nov 2026, which the Worker's parts drew 320 by 320 */
  const WIDE = `/kYu01i1DI31C0ulGmctwIi7cqVT2.mp4?style=papercut&angle=0&soft=22&grain=38&speed=0.3&fps=60&shape=235&w=1080&h=1080`;
  const UHD = `/${SEED}.mp4?style=glass&w=3840&h=2160&fps=60`;
  const quick = { lookEvery: 5 };
  const text = async (response: Response) => new TextDecoder().decode(await bytes(response));

  test("draws an ask past the Worker's work at the size asked, once, and answers it from R2 after", async () => {
    const { env, keep, begun } = world({ whole: true });
    const parts = runner();
    const first = await seedMp4Answer(get(WIDE), env, keep, parts.run, quick);
    expect([first.status, first.headers.get("Content-Type")]).toEqual([200, "video/mp4"]);
    expect(await text(first)).toBe("1080x1080");
    expect(begun.length).toBe(1);
    const { job, name } = begun[0];
    expect([job.kind, job.width, job.height, job.fps, job.plan.frames]).toEqual([
      "papercut",
      1080,
      1080,
      60,
      3600
    ]);
    // the address's soft and grain, which the container works out at the clip's size
    expect(job.finish).toEqual({ soft: 22, grain: 38 });
    expect(name).toBe(`videos/${first.headers.get("ETag")?.slice(7, -1)}.mp4`);
    expect(parts.jobs.length).toBe(0);
    const again = await seedMp4Answer(get(WIDE), env, keep, parts.run, quick);
    expect([again.status, again.headers.get("X-Cache")]).toEqual([200, "HIT"]);
    expect(begun.length).toBe(1);
  });

  test("is drawn smaller in parts, under a key of its own, where no container draws clips", async () => {
    const parted = world();
    const whole = world({ whole: true });
    expect(await etagOf(parted.env, parted.keep, WIDE)).not.toBe(
      await etagOf(whole.env, whole.keep, WIDE)
    );
  });

  test("leaves an ask within the Worker's work to its parts, under the key it had", async () => {
    const { env, keep, begun } = world({ whole: true });
    const parted = world();
    expect(await etagOf(env, keep, CLIP)).toBe(await etagOf(parted.env, parted.keep, CLIP));
    const parts = runner();
    expect((await seedMp4Answer(get(CLIP), env, keep, parts.run, quick)).status).toBe(200);
    expect([begun.length, parts.jobs.length]).toEqual([0, 1]);
  });

  test("draws one drawing for two askers at once", async () => {
    const { env, keep, begun } = world({ whole: true });
    const parts = runner();
    const both = await Promise.all([
      seedMp4Answer(get(WIDE), env, keep, parts.run, quick),
      seedMp4Answer(get(WIDE), env, keep, parts.run, quick)
    ]);
    expect(await Promise.all(both.map(text))).toEqual(["1080x1080", "1080x1080"]);
    expect(begun.length).toBe(1);
  });

  test("draws 4K at its size, its first frame drawn within a picture's bounds", async () => {
    const { env, keep, begun } = world({ whole: true });
    const html = await (await seedMp4Answer(preview(UHD), env, keep, runner().run, quick)).text();
    expect([begun[0].job.width, begun[0].job.height]).toEqual([3840, 2160]);
    expect(html).toContain('<meta property="og:video:width" content="3840">');
    const width = Number(/og:image:width" content="(\d+)"/.exec(html)?.[1]);
    const height = Number(/og:image:height" content="(\d+)"/.exec(html)?.[1]);
    expect(width).toBeLessThanOrEqual(2400);
    expect(width * height).toBeLessThanOrEqual(4 * 1200 * 630);
    expect(width / height).toBeCloseTo(16 / 9, 2);
    expect(html).toContain(`w=${width}&amp;h=${height}`);
  });

  test("past its allowances answers 429 and begins nothing", async () => {
    const { env, keep, begun } = world({ whole: true, refuse: ["videoRender"] });
    const answer = await seedMp4Answer(get(WIDE), env, keep, runner().run, quick);
    expect(answer.status).toBe(429);
    expect(begun.length).toBe(0);
  });

  test("answers 503 when its drawing fails", async () => {
    const { env, keep } = world({ whole: "fail" });
    const answer = await seedMp4Answer(get(WIDE), env, keep, runner().run, quick);
    expect([answer.status, answer.headers.get("Retry-After")]).toEqual([503, "60"]);
  });

  test("goes to its first frame while drawing is off, or for anyone but an admin on production", async () => {
    for (const options of [{ off: ["videos"] }, { deployment: "production" as const }]) {
      const { env, keep, begun } = world({ whole: true, ...options });
      const answer = await seedMp4Answer(get(UHD), env, keep, runner().run, quick);
      expect(answer.status).toBe(302);
      const still = new URL(answer.headers.get("Location") ?? "");
      expect(Number(still.searchParams.get("w"))).toBeLessThanOrEqual(2400);
      expect(begun.length).toBe(0);
    }
  });
});
