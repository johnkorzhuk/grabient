import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { createContext, useContext } from "react";
import {
    compressToEncodedURIComponent,
    decompressFromEncodedURIComponent,
} from "lz-string";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function createContextFactory<ContextData>(options?: {
    defaultValue?: ContextData | null;
    errorMessage?: string;
}) {
    const opts = {
        defaultValue: null,
        errorMessage: "useContext must be used within a Provider",
        ...options,
    };

    const context = createContext<ContextData | null>(opts.defaultValue);

    function useContextFactory(): ContextData {
        const contextValue = useContext(context);
        if (contextValue === null) {
            throw new Error(opts.errorMessage);
        }
        return contextValue;
    }

    return [context.Provider, useContextFactory] as const;
}

export function compressQuery(query: string): string {
    return compressToEncodedURIComponent(query);
}

export function decompressQuery(compressed: string): string | null {
    return decompressFromEncodedURIComponent(compressed);
}
