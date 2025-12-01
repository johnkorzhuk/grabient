// See: https://posthog.com/docs/libraries/js

const POSTHOG_API_KEY = import.meta.env.VITE_POSTHOG_API_KEY as string;
const POSTHOG_API_HOST = import.meta.env.VITE_POSTHOG_API_HOST as string;

let posthogInitialized = false;
let posthogInstance: typeof import("posthog-js").default | null = null;
let initPromise: Promise<void> | null = null;

export async function initializePostHog(): Promise<void> {
    if (posthogInitialized) {
        return;
    }

    if (initPromise) {
        return initPromise;
    }

    if (typeof window === "undefined") {
        return;
    }

    if (import.meta.env.DEV) {
        console.info("PostHog disabled in development mode");
        return;
    }

    if (!POSTHOG_API_KEY) {
        console.warn("PostHog API key not found, skipping initialization");
        return;
    }

    initPromise = (async () => {
        try {
            // Dynamic import - only loads posthog-js when this function is called
            const { default: posthog } = await import("posthog-js");

            posthog.init(POSTHOG_API_KEY, {
                api_host: POSTHOG_API_HOST || "https://us.i.posthog.com",
                cookieless_mode: "on_reject",
                person_profiles: "identified_only",
                capture_pageview: false,
                capture_pageleave: true,
                session_recording: {
                    maskAllInputs: true,
                    maskTextSelector: "*",
                    blockClass: "ph-no-capture",
                },
                autocapture: {
                    dom_event_allowlist: ["click"],
                    element_allowlist: ["button", "a"],
                },
                respect_dnt: true,
                disable_session_recording: true,
                advanced_disable_decide: false,
            });

            posthogInstance = posthog;
            posthogInitialized = true;
        } catch (error) {
            console.error("Failed to load PostHog:", error);
        }
    })();

    return initPromise;
}

export function getPostHogInstance() {
    return posthogInstance;
}

export function isPostHogInitialized() {
    return posthogInitialized;
}
