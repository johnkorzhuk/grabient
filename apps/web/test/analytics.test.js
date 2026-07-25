import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const instance = {
    __loaded: false,
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    has_opted_in_capturing: vi.fn(() => false),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    sessionRecordingStarted: vi.fn(() => false),
    startSessionRecording: vi.fn(),
    stopSessionRecording: vi.fn(),
  };
  return { instance, config: null };
});

vi.mock("posthog-js", () => ({
  default: state.instance,
}));

beforeEach(() => {
  vi.resetModules();
  window.happyDOM.setURL("https://grabient.com/palettes/warm-sunset");
  document.title = "Warm sunset palettes";
  state.config = null;
  state.instance.__loaded = false;
  for (const value of Object.values(state.instance))
    if (typeof value?.mockClear === "function") value.mockClear();
  state.instance.has_opted_in_capturing.mockReturnValue(false);
  state.instance.sessionRecordingStarted.mockReturnValue(false);
  state.instance.init.mockImplementation((_key, config) => {
    state.config = config;
  });
  globalThis.zaraz = {
    track: vi.fn(),
    set: vi.fn(),
  };
});

describe("first-party analytics bridge", () => {
  it("queues through PostHog's documented loaded callback and sends the same event to Zaraz", async () => {
    const analytics = await import("../src/analytics");
    analytics.syncAnalyticsConsent(true, false);
    analytics.trackPageView();
    analytics.trackEvent("search_feedback", {
      query: "warm sunset",
      seed: "seed-a",
      feedback: "good",
    });

    await vi.waitFor(() => expect(state.config).not.toBeNull());
    expect(zaraz.track).toHaveBeenCalledWith(
      "search_feedback",
      expect.objectContaining({
        query: "warm sunset",
        feedback: "good",
        route: "/palettes/warm-sunset",
        tier: "free",
      }),
    );
    expect(state.instance.capture).not.toHaveBeenCalled();

    state.instance.__loaded = true;
    state.config.loaded(state.instance);
    await analytics.initializeAnalytics();

    expect(state.instance.opt_in_capturing).toHaveBeenCalledWith({
      captureEventName: null,
    });
    expect(state.instance.capture).toHaveBeenCalledWith(
      "$pageview",
      expect.objectContaining({
        $current_url: "https://grabient.com/palettes/warm-sunset",
      }),
    );
    expect(state.instance.capture).toHaveBeenCalledWith(
      "search_feedback",
      expect.objectContaining({
        query: "warm sunset",
        feedback: "good",
        searchQuery: "warm sunset",
      }),
    );
  });

  it("leaves the initial pageview to Zaraz and tracks in-app route changes once", async () => {
    const analytics = await import("../src/analytics");
    analytics.syncAnalyticsConsent(true, false);
    analytics.trackPageView();
    expect(
      zaraz.track.mock.calls.filter(([eventName]) => eventName === "Pageview"),
    ).toHaveLength(0);

    window.happyDOM.setURL("https://grabient.com/palettes/cool-ocean?page=2");
    document.title = "Cool ocean palettes";
    analytics.trackPageView();
    analytics.trackPageView();

    expect(
      zaraz.track.mock.calls.filter(([eventName]) => eventName === "Pageview"),
    ).toHaveLength(1);
    expect(zaraz.track).toHaveBeenCalledWith(
      "Pageview",
      expect.objectContaining({
        page_path: "/palettes/cool-ocean?page=2",
        searchQuery: "cool ocean",
      }),
    );
  });
});
