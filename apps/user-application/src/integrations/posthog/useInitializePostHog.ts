import { useEffect, useRef, useState } from "react";
import {
    getPostHogInstance,
    initializePostHog,
    isPostHogInitialized,
} from "./posthogConfig";
import { consentStore } from "@/stores/consent-store";

const IDLE_TIMEOUT = 5000;

export function useInitializePostHog() {
    const [isClient, setIsClient] = useState(false);
    const hasInitialized = useRef(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

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

            const state = consentStore.state;
            applyConsentSettings(state.categories.analytics, state.categories.sessionReplay);
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

        document.addEventListener("scroll", handleInteraction, { once: true, passive: true });
        document.addEventListener("mousemove", handleInteraction, { once: true, passive: true });
        document.addEventListener("touchstart", handleInteraction, { once: true, passive: true });
        document.addEventListener("click", handleInteraction, { once: true });
        document.addEventListener("keydown", handleInteraction, { once: true });

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

        return () => {
            cleanedUp = true;
            cancelIdleCallback();
            removeListeners();
        };
    }, [isClient]);

    // Listen for consent changes from consent store
    useEffect(() => {
        if (!isClient) return;

        const unsubscribe = consentStore.subscribe(() => {
            if (isPostHogInitialized()) {
                const state = consentStore.state;
                applyConsentSettings(state.categories.analytics, state.categories.sessionReplay);
            }
        });

        return unsubscribe;
    }, [isClient]);
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
