// See: https://docs.sentry.io/platforms/javascript/install/lazy-load-sentry/

import { consentStore } from "@/stores/consent-store";

const IDLE_TIMEOUT = 5000;

let sentryInitialized = false;
let sentryModule: typeof import("@sentry/react") | null = null;
let replayIntegration: ReturnType<typeof import("@sentry/react").replayIntegration> | null = null;
let currentAnalyticsConsent = false;
let initPromise: Promise<void> | null = null;

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
            const Sentry = await import("@sentry/react");
            sentryModule = Sentry;

            const state = consentStore.state;
            currentAnalyticsConsent = state.categories.analytics;
            const sessionReplayConsent = state.categories.sessionReplay;

            if (sessionReplayConsent) {
                replayIntegration = Sentry.replayIntegration({
                    maskAllText: true,
                    maskAllInputs: true,
                    blockAllMedia: true,
                });
            }

            Sentry.init({
                dsn,
                integrations: [
                    Sentry.browserTracingIntegration(),
                    ...(replayIntegration ? [replayIntegration] : []),
                ],
                sendDefaultPii: currentAnalyticsConsent,
                tracesSampleRate: import.meta.env.DEV ? 0.1 : 1.0,
                replaysSessionSampleRate: sessionReplayConsent ? (import.meta.env.DEV ? 0.01 : 0.1) : 0,
                replaysOnErrorSampleRate: sessionReplayConsent ? 1.0 : 0,
                debug: false,
            });

            sentryInitialized = true;
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

    const handleError = () => {
        cancelIdleCallback();
        doInit();
        removeListeners();
    };

    const handleUnhandledRejection = () => {
        cancelIdleCallback();
        doInit();
        removeListeners();
    };

    const removeListeners = () => {
        document.removeEventListener("scroll", handleInteraction);
        document.removeEventListener("mousemove", handleInteraction);
        document.removeEventListener("touchstart", handleInteraction);
        document.removeEventListener("click", handleInteraction);
        document.removeEventListener("keydown", handleInteraction);
        window.removeEventListener("error", handleError);
        window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };

    document.addEventListener("scroll", handleInteraction, { once: true, passive: true });
    document.addEventListener("mousemove", handleInteraction, { once: true, passive: true });
    document.addEventListener("touchstart", handleInteraction, { once: true, passive: true });
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
    if (!sentryInitialized || !replayIntegration || !sentryModule) {
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
        replayIntegration.start();
    } else {
        replayIntegration.stop();
    }
}

export function isSentryInitialized(): boolean {
    return sentryInitialized;
}
