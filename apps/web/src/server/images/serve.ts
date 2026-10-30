/* A picture's answer. Drawing is the one thing here that costs real CPU (a share card about 40 ms, the largest picture
   half a second), and any palette can be asked for at any size, so a picture no cache holds is drawn only within
   allowances and only while the `share-images` flag is on, and either refusal fails closed.

   In front of the drawing: the edge cache (the pipeline's), then, for a share card or a collection's sheet, R2. A card
   is kept in the UPLOADS bucket under cards/{version}/{key}.png the first time it is drawn, so each card is drawn once
   for every data center and every deploy until its version changes. A palette's picture, or several palettes' at a size the asker chose,
   lives at the edge alone: kept for good, the few asked twice would cost more to store than to draw. A Preview keeps
   nothing: it may draw differently from staging under the same version, and shares staging's bucket. */

import type { Env } from "@grabient/server/env.ts";
import { flagOff, pausedBy } from "@grabient/server/flags/flags.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { checkLimits, type LimitCheck } from "@grabient/server/limits/check.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import { FILE, NO_STORE } from "../../lib/cache.ts";
import { CARD_VERSION } from "../../lib/page-meta.ts";
import { isLinkPreview } from "../crawlers.ts";
import { CARD } from "./size.ts";

export type PictureEnv = Pick<Env, "DB" | "DEPLOYMENT"> &
  Partial<Pick<Env, "UPLOADS" | "RATE_LIMITER" | "USAGE">>;

/** Work that may finish after the answer is sent: the Worker's `waitUntil`. */
export type Keep = (work: Promise<unknown>) => void;

export interface Picture {
  /** What was asked for, as the usage counts say it. */
  kind: "card" | "png" | "gif" | "montage" | "sheet";
  /** PNG unless said. */
  type?: "image/png" | "image/gif";
  /** A share card: kept in R2, and the site's card stands in when it cannot be drawn. */
  branded: boolean;
  /** Kept in R2 as a card is, with nothing standing in: a collection's sheet, which crawlers ask for at its page's
      address, so a deploy or a cold data center reads it rather than drawing it again. */
  kept?: boolean;
  /** A palette's own picture: the address of its SVG in the same view and size, which stands in while drawing is off. */
  svg?: string;
  /** Everything the pixels depend on, in order: the key is their hash, so one picture has one key. */
  parts: readonly unknown[];
  width: number;
  height: number;
  draw: () => Promise<Uint8Array<ArrayBuffer>>;
}

/** A palette's own picture changes with nothing but its address. */
const own = (picture: Picture) => picture.kind === "png" || picture.kind === "gif";

/** A card or a picture of several changes with what it shows: a day in the browser, a week at the edge. A palette's
    own picture changes with nothing but its address, and is kept as its other files are. */
const CARD_CACHE = {
  "Cache-Control": "public, max-age=86400",
  "CDN-Cache-Control": "max-age=604800"
};
const ANY_SITE = { "Access-Control-Allow-Origin": "*" };

/** A picture that cannot be answered: plain text no cache keeps. */
export const failure = (status: number, message: string, headers: Record<string, string> = {}) =>
  new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_STORE, ...ANY_SITE, ...headers }
  });
const unavailable = (headers?: Record<string, string>) =>
  failure(503, "Image temporarily unavailable", headers);

/* What stands in for a picture that is not drawn now, kept a few minutes by the browser and never by the edge, so the
   picture itself is drawn once drawing is back. For a card it is the site's card (public/grabient.png), a static file:
   a shared link still unfurls as Grabient. */
const standIn = (request: Request, address: string) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: new URL(address, request.url).toString(),
      "Cache-Control": "public, max-age=300",
      "CDN-Cache-Control": "no-store",
      ...ANY_SITE
    }
  });
/** The site's card, standing in for a share card that is not drawn now. */
export const siteCard = (request: Request) => standIn(request, "/grabient.png");

/** While an admin has drawing turned off: the site's card for a share card, the palette's SVG for its own picture, a
    refusal for a picture of several palettes; null while it is on. A picture a cache holds is still served, so this
    stands after the caches, or before reads that only a drawing needs. */
export async function drawingPaused(
  request: Request,
  env: Pick<Env, "DB">,
  picture: Pick<Picture, "branded" | "svg">
): Promise<Response | null> {
  if (!(await flagOff(env, "share-images"))) return null;
  if (picture.branded) return siteCard(request);
  return picture.svg ? standIn(request, picture.svg) : unavailable(pausedBy("share-images"));
}

/** Whose day a picture counts against: a crawler Cloudflare verifies, which no request can pass for; an app that names
    itself as a link's preview; or everyone else. */
function dayOf(request: Request): LimitCheck {
  const verified = (request as { cf?: { verifiedBotCategory?: string } }).cf?.verifiedBotCategory;
  if (verified) return ["image-day-verified", "imageVerifiedDaily"];
  if (isLinkPreview(request)) return ["image-day-preview", "imagePreviewDaily"];
  return ["image-day", "imageRenderDaily"];
}
const DAYS: readonly string[] = ["imageVerifiedDaily", "imagePreviewDaily", "imageRenderDaily"];

/* One call counts the address's minute in this isolate, then a picture larger than a card against the large pictures'
   day, then its asker's day: a large picture its own ceiling refuses never takes a card's place. A GIF, every frame of
   a loop, has a minute and a day of its own in place of the large pictures'. */
async function overLimit(request: Request, env: PictureEnv, picture: Picture) {
  const who = clientAddress(request);
  const gif = picture.kind === "gif";
  const large = picture.width * picture.height > CARD.width * CARD.height;
  const checks: LimitCheck[] = [
    ...(who ? [[`image:${who}`, "imageRender"] as const] : []),
    ...(gif && who ? [[`gif:${who}`, "gifRender"] as const] : []),
    ...(gif
      ? [["gif-day", "gifDaily"] as const]
      : large
        ? [["image-large-day", "largeImageDaily"] as const]
        : []),
    dayOf(request)
  ];
  const result = await checkLimits(env, checks);
  if (!result) return unavailable();
  if (result.success) return null;
  // The asker's day is spent: a share card is the site's card until the day turns, never a blank preview.
  if (picture.branded && DAYS.includes(result.type ?? "")) return siteCard(request);
  const wait = Math.max(1, result.reset - Math.floor(Date.now() / 1000));
  return failure(429, "Too many new images. Try again later.", { "Retry-After": String(wait) });
}

async function hashOf(parts: readonly unknown[]): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(parts))
  );
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

const listed = (header: string | null, tag: string) =>
  !!header?.split(",").some(each => each.trim().replace(/^W\//, "") === tag);

export async function answerPicture(
  request: Request,
  env: PictureEnv,
  picture: Picture,
  keep: Keep
): Promise<Response> {
  const hash = await hashOf(picture.parts);
  const tag = `"image:${CARD_VERSION}:${hash}"`;
  const type = picture.type ?? "image/png";
  const headers = {
    "Content-Type": type,
    ...(own(picture) ? FILE : CARD_CACHE),
    ...ANY_SITE,
    ETag: tag
  };
  if (listed(request.headers.get("If-None-Match"), tag)) {
    return new Response(null, { status: 304, headers });
  }
  // A HEAD names the picture without reading a cache or drawing it.
  if (request.method === "HEAD") return new Response(null, { headers });
  const store =
    (picture.branded || picture.kept) && env.DEPLOYMENT !== "preview" ? env.UPLOADS : undefined;
  const name = `cards/${CARD_VERSION}/${hash}.${type.slice("image/".length)}`;
  const kept = await store?.get(name).catch(() => null);
  if (kept) {
    countUsage(env, "image", picture.kind, "cache");
    return new Response(kept.body, { headers: { ...headers, "X-Cache": "HIT" } });
  }
  const refused =
    (await drawingPaused(request, env, picture)) ?? (await overLimit(request, env, picture));
  if (refused) {
    countUsage(env, "image", picture.kind, "refused");
    return refused;
  }
  let drawn: Uint8Array<ArrayBuffer>;
  try {
    drawn = await picture.draw();
  } catch (error) {
    countUsage(env, "image", picture.kind, "failed");
    console.error(`Picture (${picture.kind}) render failed`, error);
    return unavailable();
  }
  countUsage(env, "image", picture.kind, "drawn");
  if (store) {
    const put = store.put(name, drawn, { httpMetadata: { contentType: type } });
    keep(put.catch(error => console.warn("cards: R2 kept no card", String(error))));
  }
  return new Response(drawn, { headers: { ...headers, "X-Cache": "MISS" } });
}
