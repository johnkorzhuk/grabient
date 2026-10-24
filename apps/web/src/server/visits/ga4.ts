import type { Env } from "@grabient/server/env.ts";
import type { VisitKind } from "./visits.ts";

/* A person's visit sent on to Google Analytics 4 through its Measurement Protocol, so the site's GA4 property keeps
   counting with no script and no cookie in the reader's browser (visits.ts decides who is a person). Google receives
   the visitor's code as the visit's client id, a day's alone, so GA4's users are visitor-days and each day one session;
   the country and region Cloudflare places the request in, never the address; the kind of device, its system and its
   browser by name and major version, never the user agent; the page's address without its query, an account's
   collection as /@/collection, never its owner's handle; the referring site and the link's campaign tags. Ads are
   never personalized from it. A European visit goes to Google's European endpoint.

   Only production sends to the property. Staging, holding the same secret, sends each visit to the validation
   endpoint instead, which records nothing, and logs what it says is wrong. A send that fails or takes past three
   seconds is dropped: counting never fails a request. */

export interface Ga4Hit {
  visitor: string;
  what: VisitKind;
  /** the page's path as the browser asked for it, its language and all */
  path: string;
  country: string;
  region: string;
  european: boolean;
  device: string;
  /** "Chrome 155" */
  browser: string;
  system: string;
  language: string;
  referrer: string;
  source: string;
  medium: string;
  campaign: string;
  /** the network's number (ASN), for the site's own count of what Google received; never sent to Google */
  network?: string;
}

const ORIGIN = "https://grabient.com";
const EVENT: Record<VisitKind, string> = {
  landing: "page_view",
  load: "page_view",
  framed: "page_view",
  use: "use_palette",
  search: "search"
};
const DAY = 86_400_000;
const WAIT_MS = 3000;

/** A path as GA4 may hold it: an account's collection by its kind, as the old analytics named it, never by its owner's
    handle. */
export function ga4Path(path: string): string {
  return path.replace(/\/@[^/]+(?:\/.*)?$/, "/@/collection");
}

const defined = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== ""));

/** The Measurement Protocol body for one visit. */
export function ga4Body(hit: Ga4Hit, now: number): Record<string, unknown> {
  const session = { session_id: String(Math.floor(now / DAY)), engagement_time_msec: 1 };
  const version = /^(.+) (\d+)$/.exec(hit.browser);
  const campaign =
    hit.what === "landing" && (hit.source || hit.medium || hit.campaign)
      ? [
          {
            name: "campaign_details",
            params: defined({
              source: hit.source,
              medium: hit.medium,
              campaign: hit.campaign,
              ...session
            })
          }
        ]
      : [];
  return {
    client_id: hit.visitor,
    timestamp_micros: now * 1000,
    non_personalized_ads: true,
    user_location: defined({
      country_id: hit.country,
      region_id: hit.region ? `${hit.country}-${hit.region}` : undefined
    }),
    device: defined({
      category: hit.device,
      language: hit.language,
      operating_system: hit.system === "other" ? undefined : hit.system,
      browser: version?.[1],
      browser_version: version?.[2]
    }),
    events: [
      ...campaign,
      {
        name: EVENT[hit.what],
        params: defined({
          page_location: hit.path ? `${ORIGIN}${ga4Path(hit.path)}` : undefined,
          page_referrer: hit.referrer ? `https://${hit.referrer}/` : undefined,
          framed: hit.what === "framed" ? "yes" : undefined,
          ...session
        })
      }
    ]
  };
}

type Ga4Env = Pick<Env, "DEPLOYMENT" | "GA4_API_SECRET" | "GA4_MEASUREMENT_ID">;

/** Whether this deploy sends visits to GA4 at all: production to the property, staging to the validation endpoint. */
export const ga4Ready = (env: Ga4Env): boolean =>
  !!env.GA4_API_SECRET &&
  !!env.GA4_MEASUREMENT_ID &&
  (env.DEPLOYMENT === "production" || env.DEPLOYMENT === "staging");

/** Sends one visit, and never throws: whether Google took it. */
export async function sendToGa4(env: Ga4Env, hit: Ga4Hit, now = Date.now()): Promise<boolean> {
  if (!ga4Ready(env)) return false;
  const live = env.DEPLOYMENT === "production";
  const host = hit.european ? "region1.google-analytics.com" : "www.google-analytics.com";
  const url = `https://${host}/${live ? "mp" : "debug/mp"}/collect?measurement_id=${encodeURIComponent(
    env.GA4_MEASUREMENT_ID ?? ""
  )}&api_secret=${encodeURIComponent(env.GA4_API_SECRET ?? "")}`;
  try {
    const answer = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ga4Body(hit, now)),
      signal: AbortSignal.timeout(WAIT_MS)
    });
    if (live) return answer.ok;
    const checked = (await answer.json().catch(() => null)) as {
      validationMessages?: { description?: string; fieldPath?: string }[];
    } | null;
    const wrong = checked?.validationMessages ?? [];
    if (wrong.length)
      console.warn(
        "ga4: the validation endpoint refused a visit",
        JSON.stringify(wrong.map(m => `${m.fieldPath ?? ""} ${m.description ?? ""}`.trim()))
      );
    return answer.ok && !wrong.length;
  } catch {
    // dropped: counting never fails a request
    return false;
  }
}
