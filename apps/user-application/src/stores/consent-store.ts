import { Store } from "@tanstack/react-store";
import * as v from "valibot";

const CONSENT_STORAGE_KEY = "consent-preferences";
const CONSENT_VERSION = 1;

const consentCategoriesSchema = v.object({
    necessary: v.literal(true),
    analytics: v.boolean(),
    sessionReplay: v.boolean(),
});

const consentStateSchema = v.object({
    version: v.number(),
    timestamp: v.number(),
    categories: consentCategoriesSchema,
    hasInteracted: v.boolean(),
});

export type ConsentCategories = v.InferOutput<typeof consentCategoriesSchema>;
export type ConsentState = v.InferOutput<typeof consentStateSchema>;

const defaultConsentState: ConsentState = {
    version: CONSENT_VERSION,
    timestamp: Date.now(),
    categories: {
        necessary: true,
        analytics: false,
        sessionReplay: false,
    },
    hasInteracted: false,
};

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

export const consentStore = new Store<ConsentState>(loadConsentFromStorage());

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
        },
        hasInteracted: true,
    };

    consentStore.setState(() => newState);
    saveConsentToStorage(newState);
}

export function acceptAllConsent() {
    updateConsent({
        analytics: true,
        sessionReplay: true,
    });
}

export function rejectAllConsent() {
    updateConsent({
        analytics: false,
        sessionReplay: false,
    });
}

export function resetConsent() {
    if (typeof window !== "undefined") {
        localStorage.removeItem(CONSENT_STORAGE_KEY);
    }
    consentStore.setState(() => defaultConsentState);
}
