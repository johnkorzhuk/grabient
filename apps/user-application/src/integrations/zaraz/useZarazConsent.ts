import { useEffect, useRef, useState } from "react";
import { setConsentState, type ConsentState } from "@/stores/consent-store";

const CONSENT_VERSION = 2;

export interface ZarazConsentStatus {
    isReady: boolean;
}

export function useZarazConsent(): ZarazConsentStatus {
    const [status, setStatus] = useState<ZarazConsentStatus>({
        isReady: false,
    });
    const hasInitialized = useRef(false);

    useEffect(() => {
        if (typeof window === "undefined") {
            setStatus({ isReady: true });
            return;
        }

        const syncFromZaraz = () => {
            if (typeof zaraz === "undefined" || !zaraz.consent) {
                return;
            }

            const purposes = zaraz.consent.getAll();
            if (!purposes) return;

            const analyticsConsent =
                purposes.analytics ?? purposes.Analytics ?? purposes.HdW6 ?? false;
            const advertisingConsent =
                purposes.advertising ?? purposes.Advertising ?? false;

            const newState: ConsentState = {
                version: CONSENT_VERSION,
                timestamp: Date.now(),
                categories: {
                    necessary: true,
                    analytics: analyticsConsent,
                    sessionReplay: analyticsConsent,
                    advertising: advertisingConsent,
                },
                hasInteracted: true,
            };

            setConsentState(newState);
            hasInitialized.current = true;
        };

        const handleConsentUpdate = () => {
            syncFromZaraz();
        };

        const handleAPIReady = () => {
            setStatus({ isReady: true });
            if (!hasInitialized.current) {
                syncFromZaraz();
            }
        };

        if (typeof zaraz !== "undefined" && zaraz.consent?.APIReady) {
            handleAPIReady();
        }

        document.addEventListener("zarazConsentAPIReady", handleAPIReady);
        document.addEventListener(
            "zarazConsentChoicesUpdated",
            handleConsentUpdate,
        );

        return () => {
            document.removeEventListener("zarazConsentAPIReady", handleAPIReady);
            document.removeEventListener(
                "zarazConsentChoicesUpdated",
                handleConsentUpdate,
            );
        };
    }, []);

    return status;
}
