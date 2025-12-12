declare global {
    interface Window {
        zaraz?: Zaraz;
    }

    const zaraz: Zaraz | undefined;

    interface ZarazSetOptions {
        scope?: "page" | "session" | "persist";
    }

    interface Zaraz {
        track: (
            eventName: string,
            eventProperties?: Record<string, unknown>,
        ) => void;
        set: (key: string, value: unknown, options?: ZarazSetOptions) => void;
        consent: ZarazConsent;
    }

    interface ZarazConsent {
        modal: boolean;
        APIReady?: boolean;
        purposes: Record<
            string,
            { name: string; description: string; order: number }
        >;
        get: (purposeId: string) => boolean | undefined;
        getAll: () => Record<string, boolean>;
        set: (preferences: Record<string, boolean>) => void;
        setAll: (value: boolean) => void;
        sendQueuedEvents: () => void;
    }
}

export {};
