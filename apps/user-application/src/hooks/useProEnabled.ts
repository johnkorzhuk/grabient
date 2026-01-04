import { createContext, useContext } from "react";

export const ProEnabledContext = createContext<boolean>(false);

/**
 * Hook to check if Pro features are enabled.
 * Returns false if Pro features are disabled (default).
 */
export function useProEnabled(): boolean {
    return useContext(ProEnabledContext);
}
