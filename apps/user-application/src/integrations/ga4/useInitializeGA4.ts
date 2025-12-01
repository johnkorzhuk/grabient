import { useEffect, useRef, useState } from "react";
import {
    initializeGA4Consent,
    isGA4Initialized,
    setupLazyGTMLoading,
} from "./ga4Config";

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
        }
    }, [isClient]);
}
