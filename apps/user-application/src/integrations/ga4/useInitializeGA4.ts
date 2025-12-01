import { useEffect, useRef, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { consentStore } from "@/stores/consent-store";
import {
    initializeGA4Consent,
    updateGA4Consent,
    isGA4Initialized,
    setupLazyGTMLoading,
} from "./ga4Config";

export function useInitializeGA4() {
    const [isClient, setIsClient] = useState(false);
    const hasInitialized = useRef(false);
    const consent = useStore(consentStore);

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
        }

        if (!isGA4Initialized()) {
            return;
        }

        updateGA4Consent(consent.categories.analytics);
    }, [isClient, consent.categories.analytics]);
}
