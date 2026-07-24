// First-party analytics bridge. GA4 is managed by Cloudflare Zaraz; PostHog
// uses the same-origin /e proxy so browsers do not need to contact a third
// party directly. The project token is intentionally public (PostHog client
// tokens are write-only ingestion identifiers).
const POSTHOG_KEY = "phc_YtRERLNG3jXUoOisN6NXQS9sI5Iz0gAUkiY7nX7puTK";
const ENABLED_HOSTS = new Set(["grabient.com", "www.grabient.com"]);
const IDLE_TIMEOUT = 5000;

let posthog = null;
let initPromise = null;
let analyticsConsent = false;
let sessionReplayConsent = false;
let pendingUser = null;
let pendingPageView = location.href;
let lastPageView = "";
const lastEvents = new Map();

function enabled() {
  return ENABLED_HOSTS.has(location.hostname);
}

function applyConsent() {
  if (!posthog?.__loaded) return;
  if (analyticsConsent) {
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

function capturePageView() {
  if (!posthog?.__loaded || !analyticsConsent || pendingPageView === lastPageView)
    return;
  lastPageView = pendingPageView;
  posthog.capture("$pageview", {
    $current_url: pendingPageView,
    route: new URL(pendingPageView).pathname,
  });
}

export async function initializeAnalytics() {
  if (!enabled()) return null;
  if (posthog) return posthog;
  if (initPromise) return initPromise;
  initPromise = import("posthog-js")
    .then(({ default: instance }) => {
      instance.init(POSTHOG_KEY, {
        api_host: `${location.origin}/e`,
        ui_host: "https://us.posthog.com",
        cookieless_mode: "on_reject",
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
        disable_session_recording: true,
        advanced_disable_decide: false,
      });
      posthog = instance;
      applyConsent();
      if (pendingUser?.id) {
        posthog.identify(pendingUser.id, {
          email: pendingUser.email,
          username: pendingUser.username,
        });
      }
      capturePageView();
      return posthog;
    })
    .catch((error) => {
      console.warn("PostHog failed to initialize", error);
      initPromise = null;
      return null;
    });
  return initPromise;
}

export function syncAnalyticsConsent(analytics, sessionReplay) {
  analyticsConsent = !!analytics;
  sessionReplayConsent = !!sessionReplay;
  applyConsent();
  capturePageView();
}

export function setAnalyticsUser(user) {
  pendingUser = user;
  if (!posthog?.__loaded) return;
  if (user?.id)
    posthog.identify(user.id, { email: user.email, username: user.username });
  else posthog.reset();
  try {
    window.zaraz?.set("user_id", user?.id ?? null);
  } catch {}
}

export function trackPageView() {
  pendingPageView = location.href;
  capturePageView();
}

export function trackEvent(eventName, properties = {}) {
  if (!enabled()) return;
  const seed = properties.seed || "";
  const throttleKey = `${eventName}:${seed}`;
  const time = Date.now();
  if (time - (lastEvents.get(throttleKey) || 0) < 1000) return;
  lastEvents.set(throttleKey, time);
  const enriched = {
    ...properties,
    route: properties.route || location.pathname,
    tier: properties.tier || "free",
  };
  try {
    window.zaraz?.track(eventName, enriched);
  } catch {}
  void initializeAnalytics().then((instance) => {
    if (instance?.__loaded && analyticsConsent)
      instance.capture(eventName, enriched);
  });
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

scheduleInit();
