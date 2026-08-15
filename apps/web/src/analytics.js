// First-party analytics bridge. GA4 is managed by Cloudflare Zaraz; PostHog
// uses the same-origin /e proxy so browsers do not need to contact a third
// party directly. The project token is intentionally public (PostHog client
// tokens are write-only ingestion identifiers).
const POSTHOG_KEY = "phc_YtRERLNG3jXUoOisN6NXQS9sI5Iz0gAUkiY7nX7puTK";
const ENABLED_HOSTS = new Set(["grabient.com", "www.grabient.com"]);
const IDLE_TIMEOUT = 5000;
const MAX_PENDING_EVENTS = 100;

/**
 * @typedef {{ id?: string, email?: string, username?: string, role?: string, tier?: string }} AnalyticsUser
 * @typedef {Record<string, unknown>} EventProperties
 * @typedef {[string, EventProperties]} QueuedEvent
 */

// The posthog-js instance is deliberately `any`: this file drives it through
// its snippet-era surface (__loaded, get_property, reset) rather than the
// typed module export, and it is loaded lazily.
/** @type {any} */
let posthog = null;
/** @type {Promise<any> | null} */
let initPromise = null;
let analyticsConsent = false;
let analyticsConsentResolved = false;
let sessionReplayConsent = false;
/** @type {AnalyticsUser | null | undefined} */
let pendingUser;
/** @type {string | null} */
let identifiedPosthogUserId = null;
let pendingPageView = location.href;
let lastPosthogPageView = "";
// Zaraz owns the initial document pageview. Manual Pageview events are only
// needed after the app swaps routes without a full document navigation.
let lastZarazPageView = location.href;
/** @type {QueuedEvent[]} */
let pendingEvents = [];
/** @type {QueuedEvent[]} */
let pendingZarazEvents = [];
const lastEvents = new Map();

function enabled() {
  return ENABLED_HOSTS.has(location.hostname);
}

function currentSearchQuery(pathname = location.pathname) {
  const match = pathname.match(/^\/palettes\/(.+)$/);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]).replace(/-/g, " ");
  } catch {
    return match[1].replace(/-/g, " ");
  }
}

// Zaraz custom-event properties must be flat. Keep the shared event payload
// deliberately small and primitive so the same object is valid for GA4 and
// PostHog.
/**
 * @param {Record<string, unknown>} properties
 * @returns {EventProperties}
 */
function flatProperties(properties) {
  return Object.fromEntries(
    Object.entries(properties).filter(
      ([, value]) =>
        value !== undefined &&
        value !== null &&
        ["string", "number", "boolean"].includes(typeof value),
    ),
  );
}

/**
 * @param {Record<string, any>} [properties]
 * @returns {EventProperties}
 */
function contextProperties(properties = {}) {
  const searchQuery = currentSearchQuery();
  return flatProperties({
    ...properties,
    route: properties.route || location.pathname,
    ...(searchQuery && !properties.searchQuery ? { searchQuery } : {}),
    ...(pendingUser?.role ? { role: pendingUser.role } : {}),
    tier: properties.tier || pendingUser?.tier || "free",
  });
}

/**
 * @param {string} eventName
 * @param {EventProperties} properties
 */
function sendZaraz(eventName, properties) {
  try {
    if (typeof window.zaraz?.track === "function") {
      window.zaraz.track(eventName, properties);
      return;
    }
  } catch {
    return;
  }
  pendingZarazEvents.push([eventName, properties]);
  if (pendingZarazEvents.length > MAX_PENDING_EVENTS) pendingZarazEvents.shift();
}

function flushZaraz() {
  if (typeof window.zaraz?.track !== "function" || !pendingZarazEvents.length) return;
  const events = pendingZarazEvents;
  pendingZarazEvents = [];
  for (const [eventName, properties] of events) sendZaraz(eventName, properties);
}

function identifyPosthogUser() {
  if (
    !posthog?.__loaded ||
    !analyticsConsent ||
    pendingUser === undefined
  )
    return;
  if (pendingUser?.id) {
    if (identifiedPosthogUserId !== pendingUser.id)
      posthog.identify(pendingUser.id, {
        email: pendingUser.email,
        username: pendingUser.username,
        role: pendingUser.role,
        tier: pendingUser.tier || "free",
      });
    identifiedPosthogUserId = pendingUser.id;
  } else if (
    identifiedPosthogUserId ||
    posthog.get_property?.("$user_id")
  ) {
    // reset() is a logout operation in PostHog and also clears its consent
    // record. Do not run it for an ordinary anonymous page load; when a real
    // identified session ends, restore the still-valid app consent afterward.
    posthog.reset();
    identifiedPosthogUserId = null;
    applyConsent();
  }
}

function applyConsent() {
  if (!posthog?.__loaded) return;
  if (analyticsConsentResolved && analyticsConsent) {
    if (!posthog.has_opted_in_capturing())
      posthog.opt_in_capturing({ captureEventName: null });
    if (sessionReplayConsent && !posthog.sessionRecordingStarted())
      posthog.startSessionRecording();
    else if (!sessionReplayConsent && posthog.sessionRecordingStarted())
      posthog.stopSessionRecording();
  } else {
    posthog.opt_out_capturing();
    if (posthog.sessionRecordingStarted()) posthog.stopSessionRecording();
  }
}

/**
 * PostHog pageviews are deliberately NOT sent.
 *
 * Zaraz already delivers every pageview to GA4, so PostHog's copy was a second
 * ingestion of the same fact — at ~166k pageviews a day that is roughly 5M
 * events a month against a 1M free tier, i.e. essentially the entire quota
 * spent duplicating a number GA4 already had. Route changes still reach GA4
 * through sendZaraz in trackPageView.
 *
 * The interaction events in trackEvent are the ones PostHog is actually useful
 * for, and they are a rounding error next to pageviews. Kept as a no-op rather
 * than deleted so the call sites keep documenting where a pageview happens.
 */
function capturePosthogPageView() {
  lastPosthogPageView = pendingPageView;
}

function flushPosthogEvents() {
  if (!posthog?.__loaded || !analyticsConsent || !pendingEvents.length) return;
  const events = pendingEvents;
  pendingEvents = [];
  for (const [eventName, properties] of events)
    posthog.capture(eventName, properties);
}


// ---------------------------------------------------------------------------
// First-touch attribution.
//
// Written to a first-party cookie rather than localStorage because Google
// sign-in is a redirect flow: the account row is created inside a server-side
// OAuth callback, where no client storage exists. A cookie is the only thing
// that survives the round trip. SameSite=Lax is required — Strict is not sent on
// the return leg from Google, so every social signup would record as direct.
//
// FIRST touch, never overwritten. Someone who arrives from a campaign, leaves,
// and returns a week later via search still credits the campaign. Last-touch
// would credit the search and make the campaign look like it converted nobody.
//
// The server reads and clears nothing here; it copies the values onto the user
// row once, at creation (see readAttribution in @repo/data-ops auth/setup.ts).
// ---------------------------------------------------------------------------
const ATTRIBUTION_COOKIE = "gb_attr";
const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 90;

/** @type {Record<string, string | number> | null} */
let pendingAttribution = null;

function hasAttributionCookie() {
  return new RegExp(`(?:^|;\\s*)${ATTRIBUTION_COOKIE}=`).test(document.cookie);
}

/**
 * Snapshot the campaign tags, referrer and landing path for THIS page load.
 * Called at module load so document.referrer is still the real one — by the
 * time consent resolves the visitor may already have navigated.
 */
function captureAttribution() {
  if (!enabled() || hasAttributionCookie()) return;
  const params = new URLSearchParams(location.search);
  /** @type {Record<string, string | number>} */
  const attribution = { t: Date.now(), l: location.pathname.slice(0, 200) };

  const source = params.get("utm_source");
  const medium = params.get("utm_medium");
  const campaign = params.get("utm_campaign");
  if (source) attribution.s = source.slice(0, 200);
  if (medium) attribution.m = medium.slice(0, 200);
  if (campaign) attribution.c = campaign.slice(0, 200);

  // Only an external referrer is interesting; an internal one just means they
  // clicked a link on the site, which is not how they found us.
  if (document.referrer) {
    try {
      const host = new URL(document.referrer).hostname;
      if (host && host !== location.hostname) attribution.r = host.slice(0, 200);
    } catch {
      /* unparseable referrer — ignore */
    }
  }

  // Nothing worth attributing: no campaign, no external referrer. Direct
  // traffic is recorded as landing path + timestamp only, which still answers
  // "which page did signups come in on".
  pendingAttribution = attribution;
}

/**
 * Persist the snapshot. Gated on analytics consent to match the site's existing
 * model — in GDPR regions that means after opt-in, elsewhere it is on by
 * default under legitimate interest, exactly like every other analytics cookie
 * described in the privacy policy.
 */
function persistAttribution() {
  if (!pendingAttribution || !analyticsConsent || hasAttributionCookie()) return;
  try {
    const value = encodeURIComponent(JSON.stringify(pendingAttribution));
    document.cookie = `${ATTRIBUTION_COOKIE}=${value}; path=/; max-age=${ATTRIBUTION_MAX_AGE}; samesite=lax; secure`;
    pendingAttribution = null;
  } catch {
    /* cookies unavailable — attribution is best-effort, never a blocker */
  }
}

/** The campaign tags flattened onto conversion events, for GA4 and PostHog. */
function attributionProperties() {
  const source = pendingAttribution || readAttributionCookie();
  if (!source) return {};
  return flatProperties({
    attributionSource: source.s,
    attributionMedium: source.m,
    attributionCampaign: source.c,
    attributionReferrer: source.r,
    attributionLanding: source.l,
  });
}

/** @returns {Record<string, any> | null} */
function readAttributionCookie() {
  const match = new RegExp(`(?:^|;\\s*)${ATTRIBUTION_COOKIE}=([^;]+)`).exec(document.cookie);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

/**
 * Auth conversions. Liking was already tracked (as save_gradient/unsave_gradient
 * in app.client.js), but signing in and signing up were not — so the single most
 * important funnel step was invisible to GA4 and PostHog, observable only by
 * querying D1 directly. The attribution tags ride along so a conversion can be
 * grouped by campaign in GA4 as well as in the admin dashboard.
 *
 * @param {"sign_up" | "login"} eventName
 * @param {string} method — "google", "magic_link", or "session" for the
 *   post-hoc sign-up detection in app.client.js
 */
export function trackAuthConversion(eventName, method) {
  trackEvent(eventName, { method, ...attributionProperties() });
}

export async function initializeAnalytics() {
  if (!enabled()) return null;
  if (initPromise) return initPromise;
  if (posthog?.__loaded) return posthog;
  initPromise = import("posthog-js")
    .then(
      ({ default: instance }) =>
        new Promise((resolve) => {
          let ready = false;
          /** @param {any} loadedInstance */
          const onLoaded = (loadedInstance) => {
            if (ready) return;
            ready = true;
            posthog = loadedInstance || instance;
            // Match PostHog's standard snippet behavior. This also gives
            // consent/debug tooling one canonical initialized instance.
            window.posthog = posthog;
            // Let PostHog finish its own loaded-callback lifecycle before
            // changing opt-in state. Calling opt_in_capturing synchronously
            // inside that callback can be overwritten by the remainder of
            // initialization, leaving consented production users opted out.
            setTimeout(() => {
              applyConsent();
              identifyPosthogUser();
              capturePosthogPageView();
              flushPosthogEvents();
              resolve(posthog);
            }, 0);
          };
          posthog = instance;
          instance.init(POSTHOG_KEY, {
            api_host: `${location.origin}/e`,
            ui_host: "https://us.posthog.com",
            person_profiles: "identified_only",
            capture_pageview: false,
            capture_pageleave: false,
            capture_performance: { web_vitals: false },
            session_recording: {
              maskAllInputs: true,
              maskTextSelector: "*",
              blockClass: "ph-no-capture",
            },
            autocapture: false,
            respect_dnt: true,
            opt_out_capturing_by_default: true,
            opt_out_persistence_by_default: true,
            disable_session_recording: true,
            // No feature flags or experiments are used on this site, and the
            // decide/flags endpoint was being hit ~41k times a day — on the
            // order of 1.2M requests a month against a 1M free tier, for a
            // response nothing reads. Turning it off is pure savings.
            advanced_disable_decide: true,
            loaded: onLoaded,
          });
        }),
    )
    .catch((error) => {
      console.warn("PostHog failed to initialize", error);
      posthog = null;
      initPromise = null;
      return null;
    });
  return initPromise;
}

/**
 * @param {boolean | undefined} analytics
 * @param {boolean | undefined} sessionReplay
 */
export function syncAnalyticsConsent(analytics, sessionReplay) {
  analyticsConsentResolved = true;
  analyticsConsent = !!analytics;
  persistAttribution();
  sessionReplayConsent = !!sessionReplay;
  if (!analyticsConsent) pendingEvents = [];
  applyConsent();
  identifyPosthogUser();
  capturePosthogPageView();
  flushPosthogEvents();
  try {
    window.zaraz?.set?.(
      "user_id",
      analyticsConsent ? pendingUser?.id ?? null : null,
    );
  } catch {}
}

/** @param {AnalyticsUser | null | undefined} user */
export function setAnalyticsUser(user) {
  pendingUser = user;
  identifyPosthogUser();
  try {
    window.zaraz?.set?.("user_id", analyticsConsent ? user?.id ?? null : null);
  } catch {}
}

export function trackPageView() {
  if (!enabled()) return;
  pendingPageView = location.href;
  if (pendingPageView !== lastZarazPageView) {
    lastZarazPageView = pendingPageView;
    const url = new URL(pendingPageView);
    sendZaraz(
      "Pageview",
      flatProperties({
        page_location: pendingPageView,
        page_path: url.pathname + url.search,
        page_title: document.title,
        route: url.pathname,
        searchQuery: currentSearchQuery(url.pathname),
      }),
    );
  }
  capturePosthogPageView();
  void initializeAnalytics();
}

/**
 * @param {string} eventName
 * @param {Record<string, any>} [properties]
 */
export function trackEvent(eventName, properties = {}) {
  if (!enabled()) return;
  const seed = properties.seed || "";
  const throttleKey = `${eventName}:${seed}`;
  const time = Date.now();
  if (time - (lastEvents.get(throttleKey) || 0) < 1000) return;
  lastEvents.set(throttleKey, time);
  if (lastEvents.size > MAX_PENDING_EVENTS)
    for (const [key, at] of lastEvents)
      if (time - at > 10000) lastEvents.delete(key);
  const enriched = contextProperties(properties);
  sendZaraz(eventName, enriched);
  if (posthog?.__loaded && analyticsConsent) posthog.capture(eventName, enriched);
  else if (!analyticsConsentResolved || analyticsConsent) {
    pendingEvents.push([eventName, enriched]);
    if (pendingEvents.length > MAX_PENDING_EVENTS) pendingEvents.shift();
  }
  void initializeAnalytics();
}

function scheduleInit() {
  if (!enabled()) return;
  const early = () => void initializeAnalytics();
  document.addEventListener("click", early, { once: true });
  document.addEventListener("keydown", early, { once: true });
  if ("requestIdleCallback" in window)
    window.requestIdleCallback(early, { timeout: IDLE_TIMEOUT });
  else
    addEventListener("load", () => setTimeout(early, 0), { once: true });
}

captureAttribution();
document.addEventListener("zarazConsentAPIReady", flushZaraz);
addEventListener("load", flushZaraz, { once: true });
scheduleInit();
