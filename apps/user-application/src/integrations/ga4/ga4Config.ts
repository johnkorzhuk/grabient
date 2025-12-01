// See: https://constantsolutions.dk/2020/06/delay-loading-of-google-analytics-google-tag-manager-script-for-better-pagespeed-score-and-initial-load/

declare global {
    interface Window {
        gtag?: (
            command: string,
            targetId: string | Date | boolean,
            config?: Record<string, unknown> | boolean
        ) => void;
        dataLayer?: unknown[];
        gtmDidInit?: boolean;
    }
}

const GA4_MEASUREMENT_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID;

// Timeout for requestIdleCallback fallback (ms)
const IDLE_TIMEOUT = 5000;

let ga4Initialized = false;
let gtmScriptLoaded = false;

export function initializeGA4Consent(): void {
    if (ga4Initialized) {
        return;
    }

    if (typeof window === "undefined") {
        return;
    }

    if (import.meta.env.DEV) {
        console.info("GA4 disabled in development mode");
        return;
    }

    if (!GA4_MEASUREMENT_ID) {
        console.warn("GA4 Measurement ID not found, skipping initialization");
        return;
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
        window.dataLayer?.push(arguments);
    };

    // CookieYes handles consent defaults via Google Consent Mode v2
    // Only set defaults if CookieYes isn't configured
    const cookieYesConfigured = !!import.meta.env.VITE_COOKIEYES_SITE_KEY;
    if (!cookieYesConfigured) {
        window.gtag("consent", "default", {
            analytics_storage: "denied",
            ad_storage: "denied",
            ad_user_data: "denied",
            ad_personalization: "denied",
            wait_for_update: 500,
        });
    }

    window.gtag("set", "ads_data_redaction", true);
    window.gtag("set", "url_passthrough", true);

    ga4Initialized = true;
}

// Load GTM script lazily - either on user interaction or after delay
export function initializeGTMScript(): void {
    if (gtmScriptLoaded || window.gtmDidInit) {
        return;
    }

    if (typeof window === "undefined") {
        return;
    }

    if (import.meta.env.DEV) {
        return;
    }

    if (!GA4_MEASUREMENT_ID) {
        return;
    }

    window.gtmDidInit = true;
    gtmScriptLoaded = true;

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.onload = () => {
        // Ensure gtag is defined and fire initial config
        if (window.gtag) {
            window.gtag("js", new Date());
            window.gtag("config", GA4_MEASUREMENT_ID, {
                send_page_view: false,
            });
        }
    };
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;

    document.head.appendChild(script);
}

export function setupLazyGTMLoading(): void {
    if (typeof window === "undefined" || import.meta.env.DEV || !GA4_MEASUREMENT_ID) {
        return;
    }

    let idleCallbackId: number | null = null;

    const cancelIdleCallback = () => {
        if (idleCallbackId !== null) {
            if ("cancelIdleCallback" in window) {
                window.cancelIdleCallback(idleCallbackId);
            }
            idleCallbackId = null;
        }
    };

    const handleInteraction = () => {
        cancelIdleCallback();
        initializeGTMScript();
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

    // Or when browser is idle (lowest priority)
    const scheduleIdleInit = () => {
        initializeGTMScript();
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
}

export function updateGA4Consent(analyticsConsent: boolean): void {
    if (!ga4Initialized) {
        return;
    }

    if (typeof window === "undefined" || !window.gtag) {
        return;
    }

    window.gtag("consent", "update", {
        analytics_storage: analyticsConsent ? "granted" : "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
    });

}

export function isGA4Initialized(): boolean {
    return ga4Initialized;
}

export function getGA4MeasurementId(): string | undefined {
    return GA4_MEASUREMENT_ID;
}

export function trackGA4PageView(url: string, title?: string): void {
    if (!ga4Initialized || !window.gtag) {
        return;
    }

    window.gtag("event", "page_view", {
        page_location: url,
        page_title: title || document.title,
    });
}

export function trackGA4Event(
    eventName: string,
    params?: Record<string, unknown>
): void {
    if (!ga4Initialized || !window.gtag) {
        return;
    }

    window.gtag("event", eventName, params);
}
