import type { ConsentRule } from "@grabient/server/consent.ts";
import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";
import { framed } from "../../app/framed.ts";

/* What the reader allows: Analytics (GA4 through Cloudflare Zaraz), Session replay (PostHog) and Marketing (GA4 counting
   a signed-in reader's visits on every device as one person's, and a new account keeping how its reader first came).
   The record is this browser's (`consent-preferences`), written once the reader chooses. Until then the region's rule
   decides, as /api/geo answers it (@grabient/server/consent.ts): where it asks, everything starts off and the banner
   asks; where it tells, Analytics starts on and the banner says so; elsewhere Analytics and Marketing start on. For a
   browser that sends Do Not Track or Global Privacy Control everything starts off, and Replay always does. A choice
   the reader made stands; one never made is decided again on each visit. The choices are told to Zaraz, as its
   purposes where the zone has them and as Google's consent mode, and to the page's analytics as an event. Browser
   only. */

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
/** A choice is asked again after 13 months, the most the EU's regulators allow one to stand. */
const KEPT_MS = 395 * 86_400_000;
/** Zaraz's purpose for each category, as the zone names them. */
const PURPOSES: Record<ConsentCategory, string> = {
  analytics: "HdWd",
  sessionReplay: "mxdH",
  marketing: "daJQ"
};

const isRule = (value: unknown): value is ConsentRule =>
  value === "ask" || value === "tell" || value === "none";

/** Do Not Track or Global Privacy Control: the browser has said no. */
export const browserOptedOut = (): boolean =>
  !isServer &&
  (navigator.doNotTrack === "1" ||
    !!(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl);

/** The choices a reader who has not chosen starts with under a region's rule. */
export function defaults(rule: ConsentRule): Consent {
  const refused = browserOptedOut();
  return {
    version: VERSION,
    timestamp: Date.now(),
    hasInteracted: false,
    isGdprRegion: rule === "ask",
    categories: {
      necessary: true,
      analytics: rule !== "ask" && !refused,
      sessionReplay: false,
      marketing: rule === "none" && !refused
    }
  };
}

const [consent, setConsent] = createSignal<Consent>(defaults("ask"));
/* the region's rule for a reader who has not chosen, which the banner reads: null until /api/geo answers, and for a
   reader whose choice this browser keeps */
const [regionRule, setRegionRule] = createSignal<ConsentRule | null>(null);

/** What the reader allows now. */
export { consent, regionRule };

/** Whether the banner is due: the region's rule says to ask or to tell, this browser holds no choice, and the browser
    has not said no itself. */
export const consentDue = (): boolean => {
  const rule = regionRule();
  return (rule === "ask" || rule === "tell") && !consent().hasInteracted && !browserOptedOut();
};

/** Zaraz is told what the reader allows: its purposes, where the zone has them, and Google's consent mode, which the
    zone starts with everything refused. The ads' signals stay refused whatever Marketing says: the site shows no ads,
    and Marketing is GA4's user id alone. Zaraz's loader keeps the update until its script arrives, and every event
    after it carries the state. */
export function tellZaraz(value: Consent = consent()): void {
  const zaraz = window.zaraz;
  const purposes = zaraz?.consent;
  if (purposes?.APIReady) {
    /* Marketing rides on Analytics, as it does on the page (analytics.ts) */
    const allowed = {
      ...value.categories,
      marketing: value.categories.marketing && value.categories.analytics
    };
    /* one purpose at a time: Zaraz can list a purpose and still refuse it ("Unknown purpose id"), and a refusal must
       not keep the others, the queued events or Google's consent mode from being told */
    let told = false;
    for (const category of Object.keys(PURPOSES) as ConsentCategory[]) {
      const id = PURPOSES[category];
      if (!(id in (purposes.purposes ?? {}))) continue;
      try {
        purposes.set({ [id]: allowed[category] });
        told = true;
      } catch {
        /* refused: the others stand */
      }
    }
    if (told && (value.hasInteracted || !value.isGdprRegion)) purposes.sendQueuedEvents();
  }
  zaraz?.set?.("google_consent_update", {
    analytics_storage: value.categories.analytics ? "granted" : "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });
}
function keep(value: Consent) {
  setConsent(value);
  /* only a choice is kept: defaults are decided again on the next visit */
  if (value.hasInteracted) {
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      /* a browser that keeps no site data: the choice lasts as long as the page */
    }
  }
  tellZaraz(value);
  dispatchEvent(new CustomEvent("grabient:consent", { detail: value }));
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

/** The reader's answer to the banner: every category on (Accept all) or every one off (Reject all). */
export function setAllConsent(on: boolean): void {
  keep({
    ...consent(),
    timestamp: Date.now(),
    hasInteracted: true,
    categories: { necessary: true, analytics: on, sessionReplay: on, marketing: on }
  });
}

/** A record the reader made, or null for one to decide again, as one older than 13 months is. A record made before
    Marketing had a switch takes the old site's advertising switch for it, or else the reader's analytics choice where
    analytics starts on. */
export function readConsent(raw: string | null): Consent | null {
  try {
    const value = JSON.parse(raw ?? "null");
    const held = value?.categories;
    if (
      value?.version !== VERSION ||
      value.hasInteracted !== true ||
      !(typeof value.timestamp === "number" && Date.now() - value.timestamp < KEPT_MS) ||
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
/** Reads the reader's record, or decides the defaults: strict until this visit's region is known, and strict with no
    banner when it cannot be. Once. */
export function initConsent(): Promise<void> {
  if (isServer) return Promise.resolve();
  started ??= (async () => {
    document.addEventListener("zarazConsentAPIReady", () => tellZaraz());
    let kept: Consent | null = null;
    try {
      kept = readConsent(localStorage.getItem(KEY));
    } catch {
      /* storage refused: decided below */
    }
    if (kept) return keep(kept);
    keep(defaults("ask"));
    try {
      const answer = await fetch("/api/geo", { cache: "no-store" });
      if (!answer.ok) return;
      const { rule }: { rule?: unknown } = await answer.json();
      if (isRule(rule) && !consent().hasInteracted) {
        /* another site's frame shows no banner (Shell.tsx), so where the rule tells, nothing runs there until the
           reader chooses */
        keep(defaults(rule === "tell" && framed() ? "ask" : rule));
        setRegionRule(rule);
      }
    } catch {
      /* an unknown region keeps the strict defaults */
    }
  })();
  return started;
}
