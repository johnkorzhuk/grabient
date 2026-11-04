/* What a clip's VideoDrawer does (video-drawer.ts), loaded with the first call an isolate makes on one. The clip is
   drawn in the object's alarm by its container (apps/web container/), put in R2 under its name, and the container
   destroyed at once, which ends its billing: a stopped one held its place among the account's running containers
   for half a minute, and one that ignored its stop billed until destroyed (3 Nov 2026). A drawing that fails is tried
   again by the alarm's own retries, up to TRIES drawings; one that finds every container the account may run
   running waits its turn without counting a try. */
import type { Env } from "@grabient/server/env.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import type { WholeClip, WholeState } from "./video-drawer.ts";

interface Record extends WholeClip {
  since: number;
  tries: number;
  failed?: string;
}

const PORT = 8080;
/** How long a container may take to answer: past the account's started pool one took up to 29 s to be provisioned. */
const START_MS = 3 * 60_000;
/** The drawings a clip is given before its object gives up and says so to its askers. */
const TRIES = 3;
/** When every container the account may run is running, the drawing waits its turn this long between looks. */
const BUSY_MS = 30_000;

/* the account's containers all running, or none to be had yet: the clip waits rather than failing */
const busy = (error: unknown) =>
  /maximum number of running container instances|no container instance that can be provided/i.test(
    String(error)
  );

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function begin(ctx: DurableObjectState, clip: WholeClip): Promise<WholeState> {
  const record = await ctx.storage.get<Record>("clip");
  if (record && !record.failed) return drawing(ctx, record);
  await ctx.storage.put("clip", { ...clip, since: Date.now(), tries: 0 } satisfies Record);
  await ctx.storage.setAlarm(Date.now());
  return { state: "drawing", since: Date.now(), coded: 0, frames: clip.job.plan.frames };
}

export async function status(ctx: DurableObjectState): Promise<WholeState> {
  const record = await ctx.storage.get<Record>("clip");
  if (!record) return { state: "idle" };
  return record.failed ? { state: "failed", error: record.failed } : drawing(ctx, record);
}

async function drawing(ctx: DurableObjectState, record: Record): Promise<WholeState> {
  const container = ctx.container;
  const progress = container?.running
    ? await container
        .getTcpPort(PORT)
        .fetch("http://container/progress")
        .then(answer => answer.json<{ name?: string; coded?: number }>())
        .catch(() => null)
    : null;
  return {
    state: "drawing",
    since: record.since,
    coded: progress?.name === record.name ? (progress.coded ?? 0) : 0,
    frames: record.job.plan.frames
  };
}

export async function alarm(ctx: DurableObjectState, env: Env): Promise<void> {
  const record = await ctx.storage.get<Record>("clip");
  const store = env.UPLOADS;
  if (!record || record.failed || !store) return;
  if (await store.head(record.name)) return done(ctx);
  record.tries++;
  await ctx.storage.put("clip", record);
  try {
    const port = await started(ctx);
    const answer = await port.fetch("http://container/draw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: record.name, job: record.job })
    });
    if (!answer.ok) {
      throw new Error(`the container answered ${answer.status}: ${await answer.text()}`);
    }
    // read whole: workerd hangs piping a container's body into the FixedLengthStream an R2 put of a stream needs
    const bytes = await answer.arrayBuffer();
    await store.put(record.name, bytes, { httpMetadata: { contentType: "video/mp4" } });
    countUsage(env, "image", "video", "drawn");
    await done(ctx);
  } catch (error) {
    await stop(ctx);
    if (busy(error)) {
      record.tries--;
      await ctx.storage.put("clip", record);
      await ctx.storage.setAlarm(Date.now() + BUSY_MS);
      return;
    }
    console.error("videos: a clip drawn whole failed", String(error));
    if (record.tries < TRIES) throw error;
    countUsage(env, "image", "video", "failed");
    await ctx.storage.put("clip", { ...record, failed: String(error) });
  }
}

/** The container, started where it is not, once it answers. */
async function started(ctx: DurableObjectState): Promise<Fetcher> {
  const container = ctx.container;
  if (!container) throw new Error("videos: no container for this object");
  if (!container.running) container.start({ enableInternet: false });
  const port = container.getTcpPort(PORT);
  for (const until = Date.now() + START_MS; ; await sleep(1000)) {
    try {
      if ((await port.fetch("http://container/ping")).ok) return port;
    } catch (error) {
      if (busy(error) || Date.now() > until) throw error;
    }
    if (Date.now() > until) throw new Error("videos: the container did not start");
  }
}

async function done(ctx: DurableObjectState): Promise<void> {
  await ctx.storage.delete("clip");
  await stop(ctx);
}

async function stop(ctx: DurableObjectState): Promise<void> {
  if (ctx.container?.running) await ctx.container.destroy().catch(() => undefined);
}
