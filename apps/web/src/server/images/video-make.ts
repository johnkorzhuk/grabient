/* Who a palette's clip no one has had drawn is drawn for, its drawing, and the page an app that previews a posted link
   reads: loaded with the first of them an isolate is asked for, so a kept clip is answered to a player without it
   (video.ts).

   Clips are a preview, kept for premium accounts once Grabient has them. Until then production draws a clip for an
   admin alone, while every kept clip plays for anyone; staging, which only the people its owner links to use, draws
   one for anyone, within allowances sized for those few (limits/config.ts), as development and Previews do. An admin
   is held to none of them but the one drawing of a clip at a time that every asker shares: an asker who finds the clip
   being drawn waits for it to be kept and is answered from there. Nothing is drawn while the `videos` flag is off;
   then, and for an asker a clip is not drawn for, the address goes to its first frame as a PNG. */

import { effectFileAddress, effectStillParts } from "@grabient/engine/effect.ts";
import type { Mp4Frame } from "@grabient/engine/mp4.ts";
import { readingName, readPalette } from "@grabient/engine/name.ts";
import type { VideoKind } from "@grabient/engine/video.ts";
import type { Size } from "@grabient/engine/view.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff, pausedBy } from "@grabient/server/flags/flags.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { checkLimits, type LimitCheck } from "@grabient/server/limits/check.ts";
import { LIMITS } from "@grabient/server/limits/config.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import { NO_STORE } from "../../lib/cache.ts";
/* This imports nothing the answer (video.ts) reads the address with from the router's chunk (files/address.ts,
   resolve.ts, size.ts), nor serve.ts, which reads the cards' sizes: a module that loads apart and imports one takes
   it out of the chunks the Worker starts with, splitting those. effect.ts stands in a chunk of its own. */
import type { Keep } from "./serve.ts";
import type { Clip, VideoAdmin, VideoPartRunner } from "./video.ts";
import { bytesAnswer, keptAnswer } from "./video-bytes.ts";
import type { VideoPartDrawn } from "./video-draw.ts";

/** The clip's first frame as a PNG at its size, soft and grained as the clip is: its poster, and what stands in for it
    while it is not drawn. */
const stillAddress = ({ address: at, size }: Clip) =>
  `${at.origin}/${at.seed}.png?${[
    ...effectStillParts(at.effect, at.angle, at.finish),
    `w=${size.width}`,
    `h=${size.height}`
  ].join("&")}`;

/** The address a clip is named by: its effect's (effectFileAddress: its style, angle, soft and grain, how it plays and
    its look), its size and the duration asked, which answer the same clip as the address asked for. */
const clipAddress = ({ address: at, size }: Clip) =>
  `${effectFileAddress(at.origin, at.seed, at.effect, at.angle, "mp4", undefined, at.finish)}&${[
    `w=${size.width}`,
    `h=${size.height}`,
    ...(at.duration === null ? [] : [`duration=${at.duration}`])
  ].join("&")}`;

/** An answer that is no clip, as serve.ts's `failure` writes it: plain words, kept by no cache, readable anywhere. */
const failure = (status: number, message: string, headers: Record<string, string> = {}) =>
  new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...NO_STORE,
      "Access-Control-Allow-Origin": "*",
      ...headers
    }
  });

/** Who a clip no one has had drawn is drawn for: an admin, held to no allowance, or anyone within them. */
type Maker = "admin" | "anyone";

/* an admin's anywhere; anyone's but on production, until premium accounts have them there */
async function makerOf(env: Env, request: Request, admin: VideoAdmin): Promise<Maker | null> {
  if (await admin(request)) return "admin";
  return env.DEPLOYMENT === "production" ? null : "anyone";
}

/** The longest an asker waits on another asker's drawing of the same clip before it draws on from where that one
    stopped: the drawing's slot (videoClip), about as long as the longest drawing runs. */
const SLOT_MS = LIMITS.videoClip.window * 1000;

/* Whether this asker may draw the clip now: null when it may; a refusal past its allowances, or when they cannot be
   counted; or, while another asker's drawing holds the clip's slot, when that slot ends. The address comes first and
   the site's day last, so an address past its own allowance takes neither the slot nor the day; an admin takes the
   slot alone. */
async function drawingRefused(
  env: Env,
  request: Request,
  hash: string,
  maker: Maker
): Promise<Response | { until: number } | null> {
  const slot: LimitCheck = [`video-clip:${hash}`, "videoClip"];
  const who = clientAddress(request);
  const checks: LimitCheck[] =
    maker === "admin"
      ? [slot]
      : [
          ...(who ? [[`video:${who}`, "videoRender"] as const] : []),
          slot,
          ["video-day", "videoRenderDaily"]
        ];
  const result = await checkLimits(env, checks);
  if (!result) return failure(503, "Video temporarily unavailable");
  if (result.success) return null;
  if (result.type === "videoClip") {
    return { until: Math.min(result.reset * 1000, Date.now() + SLOT_MS) };
  }
  const wait = Math.max(1, result.reset - Math.floor(Date.now() / 1000));
  return failure(429, "Too many new videos. Try again later.", { "Retry-After": String(wait) });
}

/* The clip's first frame for an asker it is not drawn for now, kept a few minutes by the browser and never by the
   edge, so the clip itself is answered once it is drawn */
const toStill = (still: string, paused: boolean) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: still,
      "Cache-Control": "public, max-age=300",
      "CDN-Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      ...(paused ? pausedBy("videos") : {})
    }
  });

/* Where a clip in the making keeps its parts in R2: each part's frames, and the encoder's state after the last part
   kept, which names that part and the module that kept it. All of it goes once the clip is kept. */
const partName = (hash: string, i: number) => `videos/${hash}/part-${i}`;
/** How often the state is kept: writing its few megabytes after every part made a clip of 27 parts 6 seconds slower
    here; every fourth, a drawing cut short loses at most three parts. */
const STATE_EVERY = 4;
const stateName = (hash: string) => `videos/${hash}/state`;

/** A clip's MP4: its parts drawn one after another, each going on from the state the one before left (the Worker's own
    entrypoint runs on this thread, so parts at once would take as long), from the last part kept where a drawing
    before this one stopped, each handed the finish worked out once. Each part and the state after it are kept as the
    next is drawn. */
async function drawClip(
  store: R2Bucket | undefined,
  clip: Clip,
  parts: VideoPartRunner
): Promise<Uint8Array<ArrayBuffer>> {
  const { soft, grain } = clip.address.finish;
  const [{ packFrames, unpackFrames }, { VIDEO_MODULE, videoFile }, finish] = await Promise.all([
    import("@grabient/engine/mp4.ts"),
    import("@grabient/engine/video.ts"),
    /* worked out once for every part, from fx-finish.ts, which the parts' drawing does not load (video-finish.ts) */
    soft || grain
      ? import("@grabient/engine/video-finish.ts").then(({ videoFinish }) =>
          videoFinish(clip.job.palette, clip.job, clip.job.angle, clip.address.finish, clip.size)
        )
      : {}
  ]);
  const { hash, runs } = clip;
  const frames: Mp4Frame[][] = [];
  let state: Uint8Array | null = null;
  let start = 0;
  const saved =
    store && runs.length > 1 ? await store.get(stateName(hash)).catch(() => null) : null;
  /* a state another module kept holds pointers into that module's memory: this one draws from the first part */
  if (saved && store && saved.customMetadata?.module === VIDEO_MODULE) {
    const last = Number(saved.customMetadata?.part);
    const kept = new Uint8Array(await saved.arrayBuffer());
    if (Number.isInteger(last) && last >= 0 && last < runs.length - 1) {
      const earlier = await Promise.all(
        runs
          .slice(0, last + 1)
          .map((_, i) => store.get(partName(hash, i)).then(object => object?.arrayBuffer() ?? null))
      ).catch(() => []);
      if (earlier.length === last + 1 && earlier.every(Boolean)) {
        earlier.forEach((part, i) => {
          frames[i] = unpackFrames(new Uint8Array(part as ArrayBuffer));
        });
        state = kept;
        start = last + 1;
      }
    }
  }
  let keeping: Promise<unknown> = Promise.resolve();
  /* a part that fails leaves the parts before it kept */
  try {
    for (let i = start; i < runs.length; i++) {
      const [from, to] = runs[i];
      const part: VideoPartDrawn = await parts({ ...clip.job, finish, from, to, state });
      frames[i] = part.frames;
      state = part.state;
      if (store && i < runs.length - 1) {
        /* kept while the next part is drawn, the part before its state, so a state never names a part not kept; the
           state, a few megabytes, only every STATE_EVERY parts */
        const bytes = packFrames(part.frames);
        const after = (i + 1) % STATE_EVERY === 0 ? part.state : null;
        keeping = keeping
          .then(() => store.put(partName(hash, i), bytes))
          .then(() =>
            after
              ? store.put(stateName(hash), after, {
                  customMetadata: { part: String(i), module: VIDEO_MODULE }
                })
              : null
          )
          .catch(error => console.warn("videos: R2 kept no part", String(error)));
      }
    }
  } finally {
    await keeping;
  }
  return videoFile({ size: clip.size, fps: clip.fps }, frames.flat());
}

/** Draws a clip: its bytes; whether it is `stored` in R2 yet; and the work of storing it and letting its parts go
    (`kept`), which the caller hands to `waitUntil` as work that outlasts the answer. An asker who stops waiting, as a
    link's preview does after a few seconds, leaves the clip drawn for the next, or as far as the half minute the
    Worker grants after the asker goes reaches, which the next drawing goes on from. */
function drawAndKeep(
  env: Env,
  store: R2Bucket | undefined,
  clip: Clip,
  parts: VideoPartRunner
): {
  drawn: Promise<Uint8Array<ArrayBuffer>>;
  stored: Promise<boolean>;
  kept: Promise<void>;
} {
  const drawn = drawClip(store, clip, parts);
  const stored = drawn
    .then(
      async bytes => {
        countUsage(env, "image", "video", "drawn");
        if (!store) return false;
        await store.put(clip.name, bytes, { httpMetadata: { contentType: "video/mp4" } });
        return true;
      },
      error => {
        countUsage(env, "image", "video", "failed");
        console.error("Palette video render failed", error);
        return false;
      }
    )
    .catch(error => {
      console.warn("videos: R2 kept no clip", String(error));
      return false;
    });
  const kept = stored
    .then(async put => {
      if (put && store && clip.runs.length > 1) {
        await store.delete([
          stateName(clip.hash),
          ...clip.runs.slice(0, -1).map((_, i) => partName(clip.hash, i))
        ]);
      }
    })
    .catch(error => console.warn("videos: R2 let no parts go", String(error)));
  return { drawn, stored, kept };
}

/** How long an asker whose clip another asker is drawing waits between looks for it in R2, and how many of the
    drawing's slots it waits through before it answers that the clip is not ready. */
const LOOK_EVERY_MS = 1500;
const ROUNDS = 2;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** The answer to an asker of a clip that is not kept: its first frame where it is not drawn for them; else the clip
    drawn for them, or, while another asker's drawing holds its slot, answered from R2 once that drawing has kept it.
    A drawing that stopped short leaves the slot to this asker, who draws on from where it stopped. */
export async function madeAnswer(
  request: Request,
  env: Env,
  store: R2Bucket | undefined,
  clip: Clip,
  parts: VideoPartRunner,
  keep: Keep,
  headers: Record<string, string>,
  options: { admin: VideoAdmin; lookEvery?: number }
): Promise<Response> {
  const paused = await flagOff(env, "videos");
  const maker = paused ? null : await makerOf(env, request, options.admin);
  if (!maker) {
    countUsage(env, "image", "video", "refused");
    return toStill(stillAddress(clip), paused);
  }
  const lookEvery = options.lookEvery ?? LOOK_EVERY_MS;
  for (let round = 0; round < ROUNDS; round++) {
    const refused = await drawingRefused(env, request, clip.hash, maker);
    if (refused instanceof Response) {
      countUsage(env, "image", "video", "refused");
      return refused;
    }
    if (refused === null) {
      const { drawn, stored, kept } = drawAndKeep(env, store, clip, parts);
      keep(kept);
      const bytes = await drawn.catch(() => null);
      if (!bytes) return failure(503, "Video temporarily unavailable");
      // kept before the answer goes out, so the range a player asks for next, at once, finds it
      await stored;
      return bytesAnswer(request, bytes, { ...headers, "X-Cache": "MISS" });
    }
    while (Date.now() < refused.until) {
      await sleep(lookEvery);
      const found = store ? await keptAnswer(request, store, clip.name, headers) : null;
      if (found) {
        countUsage(env, "image", "video", "cache");
        return found;
      }
    }
  }
  return failure(503, "Video temporarily unavailable", { "Retry-After": "30" });
}

/** Whether a posted link's page names a clip that is not kept: one drawn for this asker, begun as the page goes out
    so it is ready, or further along, when someone presses play, or one another asker is drawing. */
async function previewPlays(
  request: Request,
  env: Env,
  store: R2Bucket | undefined,
  clip: Clip,
  parts: VideoPartRunner,
  keep: Keep,
  admin: VideoAdmin
): Promise<boolean> {
  if (await flagOff(env, "videos")) return false;
  const maker = await makerOf(env, request, admin);
  if (!maker) return false;
  const refused = await drawingRefused(env, request, clip.hash, maker);
  if (refused instanceof Response) return false;
  if (refused === null) keep(drawAndKeep(env, store, clip, parts).kept);
  return true;
}

/** What a posted link's page says its clip shows. */
const ABOUT: Record<VideoKind, string> = {
  glass:
    "A looping video of a Grabient palette: fluted glass with its colors drifting behind the ribs.",
  blob: "A looping video of a Grabient palette: a frosted blob of its colors, drifting.",
  silk: "A looping video of a Grabient palette: silk dyed in its colors, its folds swaying.",
  rosette:
    "A looping video of a Grabient palette: a rosette of petals in its colors, rippling out from the heart.",
  papercut:
    "A looping video of a Grabient palette: sheets of paper in its colors, cut and stacked, their shadows turning with the light."
};

const attribute = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The clip as an app that previews a posted link reads it: a page whose video is the clip (where clips are drawn now)
    and whose poster is its first frame, each with its size, so no app need measure them; the edge keeps no copy, and
    a reader's browser gets the clip itself. Discord's layout tags count the last written, so `og:type` comes last. */
function videoPreview(page: {
  address: string;
  file: string | null;
  poster: string;
  size: Size;
  title: string;
  about: string;
}): Response {
  const [address, poster, title, about] = [page.address, page.poster, page.title, page.about].map(
    attribute
  );
  const { width, height } = page.size;
  const file = page.file === null ? null : attribute(page.file);
  const video = file
    ? `<meta property="og:video" content="${file}"><meta property="og:video:url" content="${file}"><meta property="og:video:secure_url" content="${file}"><meta property="og:video:type" content="video/mp4"><meta property="og:video:width" content="${width}"><meta property="og:video:height" content="${height}"><meta property="og:type" content="video.other">`
    : `<meta property="og:type" content="website">`;
  const body = file
    ? `<video src="${file}" poster="${poster}" width="${width}" height="${height}" autoplay muted loop playsinline></video>`
    : `<img src="${poster}" alt="" width="${width}" height="${height}">`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${about}"><link rel="canonical" href="${address}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${about}"><meta name="twitter:image" content="${poster}"><meta property="og:site_name" content="Grabient"><meta property="og:title" content="${title}"><meta property="og:description" content="${about}"><meta property="og:url" content="${address}"><meta property="og:image" content="${poster}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="${width}"><meta property="og:image:height" content="${height}">${video}</head><body>${body}</body></html>`;
  return new Response(html, {
    headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8", Vary: "User-Agent" }
  });
}

/** A posted link's page (videoPreview): its video the clip where one is kept or drawn now, its poster the clip's first
    frame, its title the palette's. */
export async function previewAnswer(
  request: Request,
  env: Env,
  store: R2Bucket | undefined,
  clip: Clip,
  parts: VideoPartRunner,
  keep: Keep,
  admin: VideoAdmin
): Promise<Response> {
  const plays =
    (store ? !!(await store.head(clip.name).catch(() => null)) : false) ||
    (await previewPlays(request, env, store, clip, parts, keep, admin));
  const address = clipAddress(clip);
  return videoPreview({
    address,
    file: plays ? `${address}&raw` : null,
    poster: stillAddress(clip),
    size: clip.size,
    title: `${readingName(readPalette(clip.job.palette))} · Grabient`,
    about: ABOUT[clip.job.kind]
  });
}
