import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { cn, compressQuery } from "@/lib/utils";
import { isValidSeed, serializeCoeffs } from "@repo/data-ops/serialization";
import { DEFAULT_GLOBALS, type coeffsSchema } from "@repo/data-ops/valibot-schema/grabient";
import type * as v from "valibot";

type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;

function parseVectorToSeed(input: string): string | null {
    const vectorRegex = /^\s*\[\s*\[[\d.,\s\-]+\](?:\s*,\s*\[[\d.,\s\-]+\])*\s*\]\s*$/;
    if (!vectorRegex.test(input)) return null;

    try {
        const parsed = JSON.parse(input);
        if (!Array.isArray(parsed) || parsed.length !== 4) return null;

        // Validate each vector has 3 or 4 numbers
        for (const vec of parsed) {
            if (!Array.isArray(vec) || vec.length < 3 || vec.length > 4) return null;
            if (!vec.every((n: unknown) => typeof n === "number" && isFinite(n))) return null;
        }

        // Convert to coeffs format (add alpha=1 if not present)
        const coeffs: CosineCoeffs = parsed.map((vec: number[]) => [
            vec[0],
            vec[1],
            vec[2],
            1,
        ]) as CosineCoeffs;

        return serializeCoeffs(coeffs, DEFAULT_GLOBALS);
    } catch {
        return null;
    }
}

interface UrlParseResult {
    seed: string;
    searchParams: Record<string, string>;
}

function parseGrabientUrl(input: string): UrlParseResult | null {
    try {
        // Try to parse as URL
        let url: URL;
        if (input.startsWith("http")) {
            url = new URL(input);
        } else if (input.includes("grabient.com")) {
            url = new URL("https://" + input);
        } else {
            return null;
        }

        if (!url.hostname.includes("grabient.com")) return null;

        // Extract seed from pathname (first segment after /)
        const pathParts = url.pathname.split("/").filter(Boolean);
        if (pathParts.length === 0) return null;

        const seed = pathParts[0];
        if (!isValidSeed(seed)) return null;

        // Extract search params
        const searchParams: Record<string, string> = {};
        url.searchParams.forEach((value, key) => {
            searchParams[key] = value;
        });

        return { seed, searchParams };
    } catch {
        return null;
    }
}

export function SearchInput({ className }: { className?: string }) {
    const navigate = useNavigate();
    const location = useLocation();

    const [localValue, setLocalValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const isOnSearchPage = location.pathname.startsWith("/palettes/");

    useEffect(() => {
        if (isOnSearchPage) {
            setLocalValue("");
        }
    }, [isOnSearchPage, location.pathname]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = localValue.trim();
        if (!trimmed) return;

        // Check if input is a vector format and convert to seed
        const seedFromVector = parseVectorToSeed(trimmed);
        if (seedFromVector) {
            // Seeds are already compact - use directly without lz-string compression
            navigate({
                to: "/palettes/$query",
                params: { query: seedFromVector },
            });
            return;
        }

        // Check if input is a grabient URL
        const urlResult = parseGrabientUrl(trimmed);
        if (urlResult) {
            // Seeds are already compact - use directly without lz-string compression
            navigate({
                to: "/palettes/$query",
                params: { query: urlResult.seed },
                search: urlResult.searchParams,
            });
            return;
        }

        // Check if input is a raw seed
        if (isValidSeed(trimmed)) {
            navigate({
                to: "/palettes/$query",
                params: { query: trimmed },
            });
            return;
        }

        // Default: treat as search query - compress with lz-string
        const compressed = compressQuery(trimmed);
        navigate({
            to: "/palettes/$query",
            params: { query: compressed },
        });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalValue(e.target.value);
    };

    const handleClear = () => {
        setLocalValue("");
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            handleClear();
        }
    };

    return (
        <form onSubmit={handleSubmit} className={cn("relative", className)}>
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Search className="h-4 w-4" />
            </div>
            <input
                ref={inputRef}
                type="text"
                value={localValue}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Search palettes..."
                style={{ backgroundColor: "var(--background)" }}
                className={cn(
                    "h-9 w-full rounded-md pl-9 pr-8",
                    "border border-solid border-input",
                    "text-sm text-foreground placeholder:text-muted-foreground",
                    "hover:border-muted-foreground/30",
                    "focus:border-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/70",
                    "transition-colors duration-200",
                )}
            />
            {localValue && (
                <button
                    type="button"
                    onClick={handleClear}
                    className={cn(
                        "absolute right-2 top-1/2 -translate-y-1/2",
                        "text-muted-foreground hover:text-foreground",
                        "transition-colors duration-200",
                        "cursor-pointer p-0.5 rounded",
                        "focus:outline-none focus:ring-2 focus:ring-ring/70",
                    )}
                    aria-label="Clear search"
                >
                    <X className="h-4 w-4" />
                </button>
            )}
        </form>
    );
}
