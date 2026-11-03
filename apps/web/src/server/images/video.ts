/* A palette's effect as an MP4, /{seed}.mp4?style=glass|blob|silk|rosette: whole loops of the fluted glass, the blob,
   the silk or the rosette, so a player that repeats it shows no seam, with the effect's address (its angle, the soft
   and the grain, speed, fps, shape, frost, bg), its size (`w` and `h` or `size`, as its PNG reads them) and
   `duration` in seconds, the speed nudged so whole loops fill it (engine/video.ts). An address that names no style
   plays the glass, as a page does.

   A clip is drawn once and kept in R2 under videos/, its key every part of the address that moves its pixels, and
   answered from there to every player, a part of it to a player that asks for a range (Safari asks for nothing else).
   Drawing costs seconds of CPU, more than one invocation may spend, so a clip is drawn in parts, each in an invocation
   of its own through the Worker's own entrypoint (video-parts.ts), each going on from the encoder's state where the one
   before stopped, so the parts join as one stream from one key frame. Each part and that state are kept in R2 as they
   are drawn, so a drawing cut short, by an asker who stopped waiting and the half minute the Worker grants after,
   goes on from there at the next asking, and even the longest clip gets drawn.

   An app that previews a posted link gets a page instead (video-make.ts): its video is the clip (at the address the
   clip is named by, with `raw`, which always answers the file) and its poster the clip's first frame as a PNG, both
   sized, so the preview needs no video to unfurl, and the clip is begun as the page goes out, to be ready when someone
   presses play. Discord shows it as a player and iMessage plays it; X, WhatsApp, LinkedIn and Slack show the poster.

   Clips are a preview: who a clip no one has kept is drawn for, its drawing and that page are video-make.ts's, which
   loads with the first of them an isolate is asked for. This answers a kept clip to a player without it. */

import {
  type Effect,
  type EffectFinish,
  effectFileAddress,
  effectStillParts,
  parseEffect
} from "@grabient/engine/effect.ts";
import type { VideoPlan } from "@grabient/engine/video.ts";
import type { Size } from "@grabient/engine/view.ts";
import { DEFAULT_ANGLE, finishOf } from "@grabient/engine/view.ts";
import { accountRole } from "@grabient/server/auth/roles.ts";
import { getSession } from "@grabient/server/auth/session.ts";
import type { Env } from "@grabient/server/env.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import { FILE } from "../../lib/cache.ts";
import { isLinkPreview } from "../crawlers.ts";
import { addressParams, fileName, viewAt } from "../files/address.ts";
import { resolvePalette } from "../files/resolve.ts";
import { publicOrigin } from "../seo/site.ts";
import { failure, type Keep } from "./serve.ts";
import { pictureSize } from "./size.ts";
import type { VideoPartDrawn, VideoPartJob } from "./video-draw.ts";

/** Draws a part of a clip in an invocation of its own (video-parts.ts). */
export type VideoPartRunner = (job: VideoPartJob) => Promise<VideoPartDrawn>;

/** The clips' drawing and coding, counted up by a change that moves their pixels or their bytes (engine/glass.ts,
    glass-render.ts, blob.ts, silk.ts, rosette.ts, fx-finish.ts, video.ts, video/video.c), so no clip coded before is
    answered for it; the coding's numbers (VIDEO_QUALITY) are in the key besides. */
export const VIDEO_DRAWING = "video-1";

/** The most one part draws, its pixels across its frames weighed by its effect (engine/video.ts's videoWork): about
    two thirds of a second of one core here, which Cloudflare's machines have taken up to three times as long over,
    within the Worker's three seconds. A clip of the most work is 30 parts, within the 32 invocations of the Worker one
    request may make. */
export const PART_WORK = 55_000_000;

const VIDEO_HEADERS = {
  "Content-Type": "video/mp4",
  "Accept-Ranges": "bytes",
  "Access-Control-Allow-Origin": "*",
  "Cross-Origin-Resource-Policy": "cross-origin",
  ...FILE
};

async function hashOf(parts: readonly unknown[]): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(parts))
  );
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

const listed = (header: string | null, tag: string) =>
  !!header?.split(",").some(each => each.trim().replace(/^W\//, "") === tag);

/** The clip's first frame as a PNG at its size, soft and grained as the clip is: its poster, and what stands in for it
    while it is not drawn. */
const stillAddress = (
  origin: string,
  seed: string,
  effect: Effect,
  angle: number,
  finish: EffectFinish,
  size: Size
) =>
  `${origin}/${seed}.png?${[
    ...effectStillParts(effect, angle, finish),
    `w=${size.width}`,
    `h=${size.height}`
  ].join("&")}`;

/** The address a clip is named by: its effect's (effectFileAddress: its style, angle, soft and grain, how it plays and
    its look), its size and the duration asked, which answer the same clip as the address asked for. */
const clipAddress = (
  origin: string,
  seed: string,
  effect: Effect,
  angle: number,
  finish: EffectFinish,
  size: Size,
  duration: number | null
) =>
  `${effectFileAddress(origin, seed, effect, angle, "mp4", undefined, finish)}&${[
    `w=${size.width}`,
    `h=${size.height}`,
    ...(duration === null ? [] : [`duration=${duration}`])
  ].join("&")}`;

/** A clip as its drawing takes it: its key and its file's name in R2, the job each part is handed, its parts' frames,
    and its size, rate and plan. */
export interface Clip {
  hash: string;
  name: string;
  job: Omit<VideoPartJob, "from" | "to" | "state">;
  runs: [number, number][];
  size: Size;
  fps: number;
  plan: VideoPlan;
}

/** Whether the asker is an admin. */
export type VideoAdmin = (request: Request) => Promise<boolean>;

/** Whether a request is signed in as an admin, its role read from the database: a request with no session asks it
    nothing. */
export async function videoAdmin(env: Env, request: Request): Promise<boolean> {
  if (!env.BETTER_AUTH_SECRET) return false;
  const session = await getSession(env, request.headers);
  return !!session && (await accountRole(env, session.user.id)) === "admin";
}

export interface VideoOptions {
  /** the most one part draws (PART_WORK) */
  partWork?: number;
  /** whether the asker is an admin, where not read from its session (videoAdmin) */
  admin?: VideoAdmin;
  /** how long an asker waits between looks for a clip another asker is drawing (video-make.ts) */
  lookEvery?: number;
}

/** /{seed}.mp4: a palette's effect as a looping MP4. `parts` draws a part in an invocation of its own, so this one
    spends next to nothing; the engine's video code loads with the first clip asked for, and the drawing's with the
    first not kept, never with the Worker. */
export async function seedMp4Answer(
  request: Request,
  env: Env,
  keep: Keep,
  parts: VideoPartRunner,
  options: VideoOptions = {}
): Promise<Response> {
  const url = new URL(request.url);
  const admin = options.admin ?? (asker => videoAdmin(env, asker));
  const found = resolvePalette(fileName(url.pathname, "mp4"));
  if (!found) return failure(404, "Invalid palette seed.");
  const params = addressParams(url.searchParams);
  if (!params.has("style")) params.set("style", "glass");
  const effect = parseEffect(params);
  if (!effect) {
    return failure(
      404,
      "An MP4 plays an effect: style=glass, style=blob, style=silk or style=rosette."
    );
  }
  const kind = effect.kind;
  const view = viewAt(params, found.palette.anchors.length);
  /* the blob has no angle: one clip for every angle its address names */
  const angle = kind === "blob" ? DEFAULT_ANGLE : view.angle;
  const finish = finishOf(view);
  const { VIDEO_QUALITY, videoDuration, videoFit, videoParts } = await import(
    "@grabient/engine/video.ts"
  );
  const duration = videoDuration(params.get("duration"));
  const drawn = { kind, look: effect.look, finish };
  const { size, fps, plan } = videoFit(
    drawn,
    effect.speed,
    effect.fps,
    duration,
    pictureSize(params)
  );
  const look = kind === "glass" ? { ...effect.look, shape: effect.look.shape ?? 0 } : effect.look;
  const hash = await hashOf([
    VIDEO_DRAWING,
    VIDEO_QUALITY[kind],
    found.seed,
    kind,
    angle,
    look,
    size,
    fps,
    plan,
    /* a clip with neither keeps the key it had before clips took them */
    ...(finish.soft || finish.grain ? [finish] : [])
  ]);
  const name = `videos/${hash}.mp4`;
  const store = env.DEPLOYMENT !== "preview" ? env.UPLOADS : undefined;
  const origin = publicOrigin(env, request);
  const still = stillAddress(origin, found.seed, effect, angle, finish, size);
  const clip: Clip = {
    hash,
    name,
    job: {
      palette: found.palette,
      kind,
      look: effect.look,
      finish,
      angle,
      width: size.width,
      height: size.height,
      fps,
      plan
    },
    runs: videoParts(drawn, plan, size, options.partWork ?? PART_WORK),
    size,
    fps,
    plan
  };

  if (isLinkPreview(request) && !params.has("raw")) {
    const named = clipAddress(origin, found.seed, effect, angle, finish, size, duration);
    const { previewAnswer } = await import("./video-make.ts");
    return previewAnswer(request, env, store, clip, parts, keep, admin, {
      address: named,
      file: `${named}&raw`,
      poster: still
    });
  }

  const tag = `"video:${hash}"`;
  const headers: Record<string, string> = { ...VIDEO_HEADERS, ETag: tag };
  if (listed(request.headers.get("If-None-Match"), tag)) {
    return new Response(null, { status: 304, headers });
  }
  if (request.method === "HEAD") {
    const head = await store?.head(name).catch(() => null);
    return new Response(null, {
      headers: head ? { ...headers, "Content-Length": String(head.size) } : headers
    });
  }
  /* the bytes' module loads apart, as the drawing's does, which imports it too: in the router's chunk it would take
     the drawing's chunk into the router's, and split the Worker's start chunks apart */
  const kept = store
    ? await (await import("./video-bytes.ts")).keptAnswer(request, store, name, headers)
    : null;
  if (kept) {
    countUsage(env, "image", "video", "cache");
    return kept;
  }
  const { madeAnswer } = await import("./video-make.ts");
  return madeAnswer(request, env, store, clip, parts, keep, still, headers, {
    admin,
    lookEvery: options.lookEvery
  });
}
