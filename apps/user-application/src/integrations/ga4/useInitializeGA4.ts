import { useEffect, useRef, useState } from "react";
import {
    initializeGA4Consent,
    isGA4Initialized,
    setupLazyGTMLoading,
    updateGA4Consent,
} from "./ga4Config";
import { consentStore } from "@/stores/consent-store";

export function useInitializeGA4() {
    const [isClient, setIsClient] = useState(false);
    const hasInitialized = useRef(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (!isClient) {
            return;
        }

        if (!hasInitialized.current) {
            initializeGA4Consent();
            setupLazyGTMLoading();
            hasInitialized.current = true;

            // Apply initial consent from store for non-EU users
            const state = consentStore.state;
            if (isGA4Initialized()) {
                updateGA4Consent(state.categories.analytics, state.categories.advertising);
            }
        }
    }, [isClient]);

    // Listen for consent store changes
    useEffect(() => {
        if (!isClient) return;

        const unsubscribe = consentStore.subscribe(() => {
            if (isGA4Initialized()) {
                const state = consentStore.state;
                updateGA4Consent(state.categories.analytics, state.categories.advertising);
            }
        });

        return unsubscribe;
    }, [isClient]);
}
