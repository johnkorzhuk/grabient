import { useEffect, useRef, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { consentStore } from "@/stores/consent-store";
import {
    getPostHogInstance,
    initializePostHog,
    isPostHogInitialized,
} from "./posthogConfig";

// Timeout for requestIdleCallback fallback (ms)
const IDLE_TIMEOUT = 5000;

export function useInitializePostHog() {
    const [isClient, setIsClient] = useState(false);
    const hasInitialized = useRef(false);
    const consent = useStore(consentStore);

    useEffect(() => {
        setIsClient(true);
    }, []);

    // Lazy load PostHog - either after delay or on first user interaction
    useEffect(() => {
        if (!isClient || hasInitialized.current) {
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
            if (hasInitialized.current || cleanedUp) return;
            hasInitialized.current = true;

            await initializePostHog();

            // Apply consent settings after initialization
            applyConsentSettings(consent.categories.analytics, consent.categories.sessionReplay);
        };

        const handleInteraction = () => {
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
        };

        // Initialize on user interaction
        document.addEventListener("scroll", handleInteraction, { once: true, passive: true });
        document.addEventListener("mousemove", handleInteraction, { once: true, passive: true });
        document.addEventListener("touchstart", handleInteraction, { once: true, passive: true });
        document.addEventListener("click", handleInteraction, { once: true });
        document.addEventListener("keydown", handleInteraction, { once: true });

        // Or when browser is idle (lowest priority)
        const scheduleIdleInit = () => {
            doInit();
            removeListeners();
        };

        if ("requestIdleCallback" in window) {
            idleCallbackId = window.requestIdleCallback(scheduleIdleInit, { timeout: IDLE_TIMEOUT });
        } else {
            // Fallback for Safari - use setTimeout with 0 delay after load
            window.addEventListener("load", () => {
                setTimeout(scheduleIdleInit, 0);
            }, { once: true });
        }

        return () => {
            cleanedUp = true;
            cancelIdleCallback();
            removeListeners();
        };
    }, [isClient]);

    // Update consent settings when they change (after initialization)
    useEffect(() => {
        if (!isClient || !isPostHogInitialized()) {
            return;
        }

        applyConsentSettings(consent.categories.analytics, consent.categories.sessionReplay);
    }, [isClient, consent.categories.analytics, consent.categories.sessionReplay]);
}

function applyConsentSettings(analytics: boolean, sessionReplay: boolean) {
    const posthog = getPostHogInstance();
    if (!posthog || !posthog.__loaded) {
        return;
    }

    if (analytics) {
        posthog.opt_in_capturing();

        if (sessionReplay) {
            if (!posthog.sessionRecordingStarted()) {
                posthog.startSessionRecording();
            }
        } else {
            if (posthog.sessionRecordingStarted()) {
                posthog.stopSessionRecording();
            }
        }
    } else {
        posthog.opt_out_capturing();

        if (posthog.sessionRecordingStarted()) {
            posthog.stopSessionRecording();
        }
    }
}
