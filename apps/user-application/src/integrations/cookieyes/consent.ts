/**
 * CookieYes Consent Helper
 *
 * Single source of truth for consent - reads directly from CookieYes.
 * No custom consent store needed.
 */

const COOKIEYES_SITE_KEY = import.meta.env.VITE_COOKIEYES_SITE_KEY;

/**
 * Laws that require explicit consent (opt-in).
 */
const CONSENT_REQUIRED_LAWS = ["gdpr", "ccpa", "lgpd", "popia", "pipeda"];

function isConsentRequiredRegion(activeLaw: string): boolean {
    return CONSENT_REQUIRED_LAWS.includes(activeLaw.toLowerCase());
}

export interface ConsentState {
    analytics: boolean;
    sessionReplay: boolean;
    advertising: boolean;
    isRegulated: boolean;
}

/**
 * Get current consent state from CookieYes.
 *
 * For regulated regions (EU, UK, etc.): Returns CookieYes consent choices
 * For non-regulated regions: Returns permissive defaults (analytics/advertising ON)
 */
export function getConsent(): ConsentState {
    // Default: permissive for non-regulated regions
    const defaults: ConsentState = {
        analytics: true,
        sessionReplay: false, // Always opt-in only
        advertising: true,
        isRegulated: false,
    };

    // If CookieYes isn't configured or available, use defaults
    if (!COOKIEYES_SITE_KEY || typeof getCkyConsent !== "function") {
        return defaults;
    }

    try {
        const consent = getCkyConsent();
        const isRegulated = isConsentRequiredRegion(consent.activeLaw);

        if (isRegulated) {
            // Regulated region: use CookieYes consent
            return {
                analytics: consent.categories.analytics,
                sessionReplay: consent.categories.analytics, // Follows analytics in regulated regions
                advertising: consent.categories.advertisement,
                isRegulated: true,
            };
        }

        // Non-regulated region: permissive defaults
        // User can still change via CookieYes banner if they want
        return defaults;
    } catch {
        // CookieYes not ready yet
        return defaults;
    }
}

/**
 * Check if CookieYes is configured and loaded.
 */
export function isCookieYesReady(): boolean {
    return !!COOKIEYES_SITE_KEY && typeof getCkyConsent === "function";
}

/**
 * Check if CookieYes is configured (script will load).
 */
export function isCookieYesConfigured(): boolean {
    return !!COOKIEYES_SITE_KEY;
}

/**
 * Subscribe to consent changes from CookieYes.
 * Returns an unsubscribe function.
 */
export function onConsentChange(callback: (consent: ConsentState) => void): () => void {
    if (typeof window === "undefined") {
        return () => {};
    }

    const handleBannerLoad = () => {
        callback(getConsent());
    };

    const handleConsentUpdate = () => {
        callback(getConsent());
    };

    document.addEventListener("cookieyes_banner_load", handleBannerLoad);
    document.addEventListener("cookieyes_consent_update", handleConsentUpdate);

    return () => {
        document.removeEventListener("cookieyes_banner_load", handleBannerLoad);
        document.removeEventListener("cookieyes_consent_update", handleConsentUpdate);
    };
}
