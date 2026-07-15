// See: https://docs.sentry.io/platforms/javascript/install/lazy-load-sentry/
// Replay is loaded via lazyLoadIntegration so its code is tree-shaken out of
// the bundled Sentry chunk and only fetched when the user consents.

import { consentStore } from "@/stores/consent-store";

const IDLE_TIMEOUT = 5000;

type SentryModule = typeof import("./sentry-client");
type ReplayInstance = ReturnType<
    typeof import("@sentry/react").replayIntegration
>;

let sentryInitialized = false;
let sentryModule: SentryModule | null = null;
let replayInstance: ReplayInstance | null = null;
let replayLoadPromise: Promise<void> | null = null;
let currentAnalyticsConsent = false;
let initPromise: Promise<void> | null = null;

async function loadReplayIntegration(Sentry: SentryModule): Promise<void> {
    if (replayInstance) {
        return;
    }
    if (replayLoadPromise) {
        return replayLoadPromise;
    }

    replayLoadPromise = (async () => {
        try {
            const replayFactory =
                await Sentry.lazyLoadIntegration("replayIntegration");
            const instance = replayFactory({
                maskAllText: true,
                maskAllInputs: true,
                blockAllMedia: true,
            }) as ReplayInstance;
            replayInstance = instance;
            Sentry.addIntegration(instance);
        } catch {
            // CDN blocked (ad-blocker) or offline - skip replay
            replayLoadPromise = null;
        }
    })();

    return replayLoadPromise;
}

export async function initializeSentry(): Promise<void> {
    if (sentryInitialized) {
        return;
    }

    if (initPromise) {
        return initPromise;
    }

    if (typeof window === "undefined") {
        return;
    }

    const dsn = import.meta.env.VITE_SENTRY_DSN;
    if (!dsn) {
        console.warn("Sentry DSN not found, skipping initialization");
        return;
    }

    initPromise = (async () => {
        try {
            const Sentry = await import("./sentry-client");
            sentryModule = Sentry;

            const state = consentStore.state;
            currentAnalyticsConsent = state.categories.analytics;
            const sessionReplayConsent = state.categories.sessionReplay;

            Sentry.init({
                dsn,
                integrations: [Sentry.browserTracingIntegration()],
                sendDefaultPii: currentAnalyticsConsent,
                tracesSampleRate: 0.1,
                replaysSessionSampleRate: sessionReplayConsent ? (import.meta.env.DEV ? 0.01 : 0.1) : 0,
                replaysOnErrorSampleRate: sessionReplayConsent ? 1.0 : 0,
                debug: false,
            });

            sentryInitialized = true;

            if (sessionReplayConsent) {
                loadReplayIntegration(Sentry);
            }
        } catch (error) {
            console.error("Failed to load Sentry:", error);
        }
    })();

    return initPromise;
}

export function setupLazySentryLoading(): void {
    if (typeof window === "undefined") {
        return;
    }

    const dsn = import.meta.env.VITE_SENTRY_DSN;
    if (!dsn) {
        return;
    }

    let idleCallbackId: number | null = null;
    let cleanedUp = false;

    const cancelIdleCallback = () => {
        if (idleCallbackId !== null) {
            if ("cancelIdleCallback" in window) {
                window.cancelIdleCallback(idleCallbackId);
            }
            idleCallbackId = null;
        }
    };

    const doInit = async () => {
        if (sentryInitialized || cleanedUp) return;
        await initializeSentry();
    };

    const handleInteraction = () => {
        cancelIdleCallback();
        doInit();
        removeListeners();
    };

    const handleError = (event: ErrorEvent) => {
        cancelIdleCallback();
        removeListeners();
        doInit().then(() => {
            sentryModule?.captureException(event.error ?? event.message);
        });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        cancelIdleCallback();
        removeListeners();
        doInit().then(() => {
            sentryModule?.captureException(event.reason);
        });
    };

    const removeListeners = () => {
        document.removeEventListener("click", handleInteraction);
        document.removeEventListener("keydown", handleInteraction);
        window.removeEventListener("error", handleError);
        window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };

    document.addEventListener("click", handleInteraction, { once: true });
    document.addEventListener("keydown", handleInteraction, { once: true });

    window.addEventListener("error", handleError, { once: true });
    window.addEventListener("unhandledrejection", handleUnhandledRejection, { once: true });

    const scheduleIdleInit = () => {
        doInit();
        removeListeners();
    };

    if ("requestIdleCallback" in window) {
        idleCallbackId = window.requestIdleCallback(scheduleIdleInit, { timeout: IDLE_TIMEOUT });
    } else {
        const win = window as Window;
        win.addEventListener("load", () => {
            setTimeout(scheduleIdleInit, 0);
        }, { once: true });
    }
}

export function updateSentryConsent(): void {
    if (!sentryInitialized || !sentryModule) {
        return;
    }

    const state = consentStore.state;

    if (state.categories.analytics !== currentAnalyticsConsent) {
        console.warn(
            "Analytics consent changed. Cookie settings (sendDefaultPii) cannot be updated at runtime. " +
            "Sentry was initialized with sendDefaultPii=" + currentAnalyticsConsent + ". " +
            "A page refresh is required to apply the new cookie consent setting."
        );
    }

    if (state.categories.sessionReplay) {
        if (replayInstance) {
            replayInstance.start();
        } else {
            loadReplayIntegration(sentryModule).then(() => {
                replayInstance?.start();
            });
        }
    } else {
        replayInstance?.stop();
    }
}

export function isSentryInitialized(): boolean {
    return sentryInitialized;
}
