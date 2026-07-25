// First-party analytics bridge. GA4 is managed by Cloudflare Zaraz; PostHog
// uses the same-origin /e proxy so browsers do not need to contact a third
// party directly. The project token is intentionally public (PostHog client
// tokens are write-only ingestion identifiers).
const POSTHOG_KEY = "phc_YtRERLNG3jXUoOisN6NXQS9sI5Iz0gAUkiY7nX7puTK";
const ENABLED_HOSTS = new Set(["grabient.com", "www.grabient.com"]);
const IDLE_TIMEOUT = 5000;
const MAX_PENDING_EVENTS = 100;

let posthog = null;
let initPromise = null;
let analyticsConsent = false;
let analyticsConsentResolved = false;
let sessionReplayConsent = false;
let pendingUser;
let pendingPageView = location.href;
let lastPosthogPageView = "";
// Zaraz owns the initial document pageview. Manual Pageview events are only
// needed after the app swaps routes without a full document navigation.
let lastZarazPageView = location.href;
let pendingEvents = [];
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
    posthog.identify(pendingUser.id, {
      email: pendingUser.email,
      username: pendingUser.username,
      role: pendingUser.role,
      tier: pendingUser.tier || "free",
    });
  } else {
    posthog.reset();
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

function capturePosthogPageView() {
  if (
    !posthog?.__loaded ||
    !analyticsConsent ||
    pendingPageView === lastPosthogPageView
  )
    return;
  lastPosthogPageView = pendingPageView;
  posthog.capture("$pageview", {
    $current_url: pendingPageView,
    route: new URL(pendingPageView).pathname,
  });
}

function flushPosthogEvents() {
  if (!posthog?.__loaded || !analyticsConsent || !pendingEvents.length) return;
  const events = pendingEvents;
  pendingEvents = [];
  for (const [eventName, properties] of events)
    posthog.capture(eventName, properties);
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
            advanced_disable_decide: false,
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

export function syncAnalyticsConsent(analytics, sessionReplay) {
  analyticsConsentResolved = true;
  analyticsConsent = !!analytics;
  sessionReplayConsent = !!sessionReplay;
  if (!analyticsConsent) pendingEvents = [];
  applyConsent();
  identifyPosthogUser();
  capturePosthogPageView();
  flushPosthogEvents();
  try {
    window.zaraz?.set(
      "user_id",
      analyticsConsent ? pendingUser?.id ?? null : null,
    );
  } catch {}
}

export function setAnalyticsUser(user) {
  pendingUser = user;
  identifyPosthogUser();
  try {
    window.zaraz?.set("user_id", analyticsConsent ? user?.id ?? null : null);
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

document.addEventListener("zarazConsentAPIReady", flushZaraz);
addEventListener("load", flushZaraz, { once: true });
scheduleInit();
