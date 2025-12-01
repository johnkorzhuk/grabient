/**
 * CookieYes Sync Hook
 *
 * Provides bidirectional sync between CookieYes (for regulated regions) and
 * our local consent store (for non-regulated regions).
 *
 * For EU/UK/California: CookieYes is source of truth, syncs to local store
 * For US/other: Local store is source of truth (no CookieYes banner)
 */

import { useEffect, useRef } from "react";
import {
    consentStore,
    setConsentState,
    type ConsentState,
} from "@/stores/consent-store";
import { isCookieYesConfigured } from "./consent";

const CONSENT_VERSION = 2;

const CONSENT_REQUIRED_LAWS = ["gdpr", "ccpa", "lgpd", "popia", "pipeda"];

function isConsentRequiredRegion(activeLaw: string): boolean {
    return CONSENT_REQUIRED_LAWS.includes(activeLaw.toLowerCase());
}

export interface ConsentStatus {
    isRegulated: boolean;
    isReady: boolean;
    activeLaw: string;
}

export function useCookieYesSync(): ConsentStatus {
    const hasInitialized = useRef(false);
    const statusRef = useRef<ConsentStatus>({
        isRegulated: false,
        isReady: false,
        activeLaw: "",
    });

    useEffect(() => {
        if (typeof window === "undefined" || !isCookieYesConfigured()) {
            statusRef.current = {
                isRegulated: false,
                isReady: true,
                activeLaw: "",
            };
            return;
        }

        const syncFromCookieYes = () => {
            if (typeof getCkyConsent !== "function") {
                return;
            }

            try {
                const ckyConsent = getCkyConsent();
                const isRegulated = isConsentRequiredRegion(ckyConsent.activeLaw);

                statusRef.current = {
                    isRegulated,
                    isReady: true,
                    activeLaw: ckyConsent.activeLaw,
                };

                if (isRegulated) {
                    const newState: ConsentState = {
                        version: CONSENT_VERSION,
                        timestamp: Date.now(),
                        categories: {
                            necessary: true,
                            analytics: ckyConsent.categories.analytics,
                            sessionReplay: ckyConsent.categories.analytics,
                            advertising: ckyConsent.categories.advertisement,
                        },
                        hasInteracted: ckyConsent.isUserActionCompleted,
                    };
                    setConsentState(newState);
                }

                hasInitialized.current = true;
            } catch {
                // CookieYes not ready yet
            }
        };

        const handleBannerLoad = () => {
            syncFromCookieYes();
        };

        const handleConsentUpdate = () => {
            syncFromCookieYes();
        };

        // Check immediately
        syncFromCookieYes();

        // Listen for CookieYes events
        document.addEventListener("cookieyes_banner_load", handleBannerLoad);
        document.addEventListener("cookieyes_consent_update", handleConsentUpdate);

        return () => {
            document.removeEventListener("cookieyes_banner_load", handleBannerLoad);
            document.removeEventListener("cookieyes_consent_update", handleConsentUpdate);
        };
    }, []);

    return statusRef.current;
}

/**
 * Get the current consent state.
 * This is the unified way to check consent - works for both regulated and non-regulated regions.
 */
export function getUnifiedConsent(): {
    analytics: boolean;
    sessionReplay: boolean;
    advertising: boolean;
} {
    const state = consentStore.state;
    return {
        analytics: state.categories.analytics,
        sessionReplay: state.categories.sessionReplay,
        advertising: state.categories.advertising,
    };
}
