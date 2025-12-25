import { useEffect, useRef, useState } from "react";
import {
    consentStore,
    initializeWithGeo,
    syncToZaraz,
} from "@/stores/consent-store";
import { getGeoData } from "@/server-functions/geo";

export interface ZarazConsentStatus {
    isReady: boolean;
    isGdprRegion: boolean;
}

export function useZarazConsent(): ZarazConsentStatus {
    const [status, setStatus] = useState<ZarazConsentStatus>({
        isReady: false,
        isGdprRegion: false,
    });
    const hasInitialized = useRef(false);

    useEffect(() => {
        if (typeof window === "undefined") {
            setStatus({ isReady: true, isGdprRegion: false });
            return;
        }

        let isMounted = true;

        const initialize = async () => {
            if (hasInitialized.current) return;
            hasInitialized.current = true;

            // Fetch geo data from server
            try {
                const geoData = await getGeoData();

                if (!isMounted) return;

                // Initialize consent store with geo-aware defaults
                initializeWithGeo(geoData.isGdprRegion);

                setStatus((prev) => ({
                    ...prev,
                    isGdprRegion: geoData.isGdprRegion,
                }));
            } catch (error) {
                console.error("Failed to fetch geo data:", error);
                // Default to non-GDPR if we can't determine
                if (isMounted) {
                    initializeWithGeo(false);
                }
            }
        };

        const handleAPIReady = () => {
            setStatus((prev) => ({ ...prev, isReady: true }));
            // Sync our local state to Zaraz
            syncToZaraz(consentStore.state);
        };

        // Initialize geo data
        initialize();

        // If Zaraz is already ready, sync immediately
        if (typeof zaraz !== "undefined" && zaraz.consent?.APIReady) {
            handleAPIReady();
        }

        // Listen for Zaraz API ready
        document.addEventListener("zarazConsentAPIReady", handleAPIReady);

        return () => {
            isMounted = false;
            document.removeEventListener("zarazConsentAPIReady", handleAPIReady);
        };
    }, []);

    return status;
}
