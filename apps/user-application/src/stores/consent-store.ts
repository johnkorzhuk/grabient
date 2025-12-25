import { Store } from "@tanstack/react-store";
import * as v from "valibot";

const CONSENT_STORAGE_KEY = "consent-preferences";
const CONSENT_VERSION = 3;

// Zaraz purpose IDs from Cloudflare dashboard
export const ZARAZ_PURPOSE_IDS = {
    analytics: "HdWd",
    sessionReplay: "mxdH",
    advertising: "daJQ",
} as const;

const consentCategoriesSchema = v.object({
    necessary: v.literal(true),
    analytics: v.boolean(),
    sessionReplay: v.boolean(),
    advertising: v.boolean(),
});

const consentStateSchema = v.object({
    version: v.number(),
    timestamp: v.number(),
    categories: consentCategoriesSchema,
    hasInteracted: v.boolean(),
    isGdprRegion: v.optional(v.boolean()),
});

export type ConsentCategories = v.InferOutput<typeof consentCategoriesSchema>;
export type ConsentState = v.InferOutput<typeof consentStateSchema>;

function getDefaultConsentState(isGdprRegion = false): ConsentState {
    return {
        version: CONSENT_VERSION,
        timestamp: Date.now(),
        categories: {
            necessary: true,
            // GDPR: default to false (opt-in required)
            // Non-GDPR: default to true (legitimate interest)
            analytics: !isGdprRegion,
            sessionReplay: false,
            advertising: !isGdprRegion,
        },
        hasInteracted: false,
        isGdprRegion,
    };
}

const defaultConsentState: ConsentState = getDefaultConsentState(false);

function loadConsentFromStorage(): ConsentState {
    if (typeof window === "undefined") {
        return defaultConsentState;
    }

    try {
        const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
        if (!stored) {
            return defaultConsentState;
        }

        const parsed = JSON.parse(stored);
        const result = v.safeParse(consentStateSchema, parsed);

        if (!result.success) {
            console.warn(
                "Invalid consent data in localStorage, resetting:",
                result.issues,
            );
            localStorage.removeItem(CONSENT_STORAGE_KEY);
            return defaultConsentState;
        }

        if (result.output.version !== CONSENT_VERSION) {
            console.info("Consent version mismatch, resetting preferences");
            localStorage.removeItem(CONSENT_STORAGE_KEY);
            return defaultConsentState;
        }

        return result.output;
    } catch (error) {
        console.error("Failed to load consent preferences:", error);
        return defaultConsentState;
    }
}

function saveConsentToStorage(state: ConsentState): void {
    if (typeof window === "undefined") {
        return;
    }

    try {
        localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.error("Failed to save consent preferences:", error);
    }
}

export function syncToZaraz(state: ConsentState): void {
    if (typeof window === "undefined" || typeof zaraz === "undefined") {
        return;
    }

    if (!zaraz.consent?.APIReady) {
        return;
    }

    const { categories, hasInteracted, isGdprRegion } = state;

    // For GDPR users who haven't interacted, don't enable anything
    // For non-GDPR users who haven't interacted, use the defaults (already set in state)
    if (isGdprRegion && !hasInteracted) {
        zaraz.consent.set({
            [ZARAZ_PURPOSE_IDS.analytics]: false,
            [ZARAZ_PURPOSE_IDS.sessionReplay]: false,
            [ZARAZ_PURPOSE_IDS.advertising]: false,
        });
        return;
    }

    zaraz.consent.set({
        [ZARAZ_PURPOSE_IDS.analytics]: categories.analytics,
        [ZARAZ_PURPOSE_IDS.sessionReplay]: categories.sessionReplay,
        [ZARAZ_PURPOSE_IDS.advertising]: categories.advertising,
    });

    if (hasInteracted) {
        zaraz.consent.sendQueuedEvents();
    }
}

export const consentStore = new Store<ConsentState>(loadConsentFromStorage());

export function initializeWithGeo(isGdprRegion: boolean): void {
    const currentState = consentStore.state;

    // If user has already interacted, preserve their choices
    if (currentState.hasInteracted) {
        // Just update the geo region and sync to Zaraz
        const updatedState = { ...currentState, isGdprRegion };
        consentStore.setState(() => updatedState);
        saveConsentToStorage(updatedState);
        syncToZaraz(updatedState);
        return;
    }

    // User hasn't interacted yet - apply geo-based defaults
    const newState = getDefaultConsentState(isGdprRegion);
    consentStore.setState(() => newState);
    saveConsentToStorage(newState);
    syncToZaraz(newState);
}

export function updateConsent(
    categories: Partial<Omit<ConsentCategories, "necessary">>,
) {
    const currentState = consentStore.state;
    const newState: ConsentState = {
        version: CONSENT_VERSION,
        timestamp: Date.now(),
        categories: {
            necessary: true,
            analytics:
                categories.analytics ?? currentState.categories.analytics,
            sessionReplay:
                categories.sessionReplay ??
                currentState.categories.sessionReplay,
            advertising:
                categories.advertising ?? currentState.categories.advertising,
        },
        hasInteracted: true,
        isGdprRegion: currentState.isGdprRegion,
    };

    consentStore.setState(() => newState);
    saveConsentToStorage(newState);
    syncToZaraz(newState);
}

export function setConsentState(state: ConsentState) {
    consentStore.setState(() => state);
    saveConsentToStorage(state);
    syncToZaraz(state);
}

export function acceptAllConsent() {
    updateConsent({
        analytics: true,
        sessionReplay: true,
        advertising: true,
    });
}

export function rejectAllConsent() {
    updateConsent({
        analytics: false,
        sessionReplay: false,
        advertising: false,
    });
}

export function resetConsent(isGdprRegion?: boolean) {
    if (typeof window !== "undefined") {
        localStorage.removeItem(CONSENT_STORAGE_KEY);
    }
    const newState = getDefaultConsentState(isGdprRegion ?? consentStore.state.isGdprRegion ?? false);
    consentStore.setState(() => newState);
    syncToZaraz(newState);
}
