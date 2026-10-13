import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";

/* What the reader allows: Analytics (GA4 through Cloudflare Zaraz), Session replay (PostHog) and Marketing (GA4 counting
   a signed-in reader's visits on every device as one person's). The record is this browser's (`consent-preferences`).
   In the EEA, the UK and wherever the country is unknown (/api/geo), and for a browser that sends Do Not Track or
   Global Privacy Control, everything starts off; elsewhere Analytics and Marketing start on. Replay always starts off.
   A choice the reader made stands; a record they never touched is decided again on each visit. The choices are told
   to Zaraz as its purposes, when the zone has them, and to the page's analytics as an event. Browser only. */

export type ConsentCategory = "analytics" | "sessionReplay" | "marketing";
export interface Consent {
  version: number;
  timestamp: number;
  hasInteracted: boolean;
  isGdprRegion: boolean;
  categories: { necessary: true; analytics: boolean; sessionReplay: boolean; marketing: boolean };
}

const KEY = "consent-preferences";
const VERSION = 3;
/** Zaraz's purpose for each category, as the zone names them. */
const PURPOSES: Record<ConsentCategory, string> = {
  analytics: "HdWd",
  sessionReplay: "mxdH",
  marketing: "daJQ"
};

/** Do Not Track or Global Privacy Control: the browser has said no. */
export const browserOptedOut = (): boolean =>
  !isServer &&
  (navigator.doNotTrack === "1" ||
    !!(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl);

const defaults = (gdpr: boolean): Consent => {
  const off = gdpr || browserOptedOut();
  return {
    version: VERSION,
    timestamp: Date.now(),
    hasInteracted: false,
    isGdprRegion: gdpr,
    categories: { necessary: true, analytics: !off, sessionReplay: false, marketing: !off }
  };
};

const [consent, setConsent] = createSignal<Consent>(defaults(true));

/** What the reader allows now. */
export { consent };

function tell(value: Consent) {
  const zaraz = window.zaraz?.consent;
  if (zaraz?.APIReady) {
    const choices: Record<string, boolean> = {};
    for (const category of Object.keys(PURPOSES) as ConsentCategory[]) {
      if (PURPOSES[category] in (zaraz.purposes ?? {}))
        choices[PURPOSES[category]] = value.categories[category];
    }
    if (Object.keys(choices).length) {
      zaraz.set(choices);
      if (value.hasInteracted || !value.isGdprRegion) zaraz.sendQueuedEvents();
    }
  }
  dispatchEvent(new CustomEvent("grabient:consent", { detail: value }));
}
function keep(value: Consent) {
  setConsent(value);
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* a browser that keeps no site data: the choice lasts as long as the page */
  }
  tell(value);
}

/** The reader turns one category on or off, in Settings. */
export function setConsentCategory(category: ConsentCategory, on: boolean): void {
  const was = consent();
  keep({
    ...was,
    timestamp: Date.now(),
    hasInteracted: true,
    categories: { ...was.categories, [category]: on }
  });
}

/** A record the reader made, or null for one to decide again. A record made before Marketing had a switch takes the
    old site's advertising switch for it, or else the reader's analytics choice where analytics starts on. */
export function readConsent(raw: string | null): Consent | null {
  try {
    const value = JSON.parse(raw ?? "null");
    const held = value?.categories;
    if (
      value?.version !== VERSION ||
      value.hasInteracted !== true ||
      typeof value.isGdprRegion !== "boolean" ||
      typeof held?.analytics !== "boolean" ||
      typeof held.sessionReplay !== "boolean"
    )
      return null;
    const marketing: boolean =
      typeof held.marketing === "boolean"
        ? held.marketing
        : typeof held.advertising === "boolean"
          ? held.advertising
          : held.analytics && !value.isGdprRegion && !browserOptedOut();
    return {
      ...value,
      categories: {
        necessary: true,
        analytics: held.analytics,
        sessionReplay: held.sessionReplay,
        marketing
      }
    };
  } catch {
    return null;
  }
}

let started: Promise<void> | null = null;
/** Reads the reader's record, or decides the defaults: strict until this visit's region is known. Once. */
export function initConsent(): Promise<void> {
  if (isServer) return Promise.resolve();
  started ??= (async () => {
    document.addEventListener("zarazConsentAPIReady", () => tell(consent()));
    let kept: Consent | null = null;
    try {
      kept = readConsent(localStorage.getItem(KEY));
    } catch {
      /* storage refused: decided below */
    }
    if (kept) return keep(kept);
    keep(defaults(true));
    try {
      const answer = await fetch("/api/geo", { cache: "no-store" });
      if (!answer.ok) return;
      const region: { isGdprRegion?: unknown } = await answer.json();
      if (typeof region.isGdprRegion === "boolean" && !consent().hasInteracted)
        keep(defaults(region.isGdprRegion));
    } catch {
      /* an unknown region keeps the strict defaults */
    }
  })();
  return started;
}
