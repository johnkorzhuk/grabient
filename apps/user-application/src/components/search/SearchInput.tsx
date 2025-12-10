import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useSearch } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidSeed, serializeCoeffs } from "@repo/data-ops/serialization";
import {
    DEFAULT_GLOBALS,
    type coeffsSchema,
} from "@repo/data-ops/valibot-schema/grabient";
import type * as v from "valibot";

type StyleType =
    | "auto"
    | "linearGradient"
    | "angularGradient"
    | "angularSwatches"
    | "linearSwatches"
    | "deepFlow";
type SizeType = "auto" | [number, number];

type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;

function parseVectorToSeed(input: string): string | null {
    const vectorRegex =
        /^\s*\[\s*\[[\d.,\s\-]+\](?:\s*,\s*\[[\d.,\s\-]+\])*\s*\]\s*$/;
    if (!vectorRegex.test(input)) return null;

    try {
        const parsed = JSON.parse(input);
        if (!Array.isArray(parsed) || parsed.length !== 4) return null;

        // Validate each vector has 3 or 4 numbers
        for (const vec of parsed) {
            if (!Array.isArray(vec) || vec.length < 3 || vec.length > 4)
                return null;
            if (
                !vec.every((n: unknown) => typeof n === "number" && isFinite(n))
            )
                return null;
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

type SortOrder = "popular" | "newest" | "oldest";

function getSortFromPathname(pathname: string): SortOrder | undefined {
    if (pathname === "/newest") return "newest";
    if (pathname === "/oldest") return "oldest";
    if (pathname === "/" || pathname === "/saved") return undefined; // default to popular
    return undefined;
}

function buildPreservedSearch(
    currentSearch: {
        style?: StyleType;
        angle?: "auto" | number;
        steps?: "auto" | number;
        size?: SizeType;
        sort?: SortOrder;
    },
    pathname: string,
) {
    const sortFromPath = getSortFromPathname(pathname);
    const sort = currentSearch.sort ?? sortFromPath;

    return {
        style:
            currentSearch.style && currentSearch.style !== "auto"
                ? currentSearch.style
                : undefined,
        angle:
            currentSearch.angle && currentSearch.angle !== "auto"
                ? currentSearch.angle
                : undefined,
        steps:
            currentSearch.steps && currentSearch.steps !== "auto"
                ? currentSearch.steps
                : undefined,
        size:
            currentSearch.size && currentSearch.size !== "auto"
                ? currentSearch.size
                : undefined,
        sort: sort && sort !== "popular" ? sort : undefined,
    };
}

const placeholderKeywords = [
    "modern",
    "minimalist",
    "vintage",
    "bohemian",
    "nature",
    "ocean",
    "sunset",
    "forest",
    "luxury",
    "tropical",
];

interface SearchInputProps {
    className?: string;
    variant?: "default" | "expanded";
}

export function SearchInput({
    className,
    variant = "default",
}: SearchInputProps) {
    const isExpanded = variant === "expanded";
    const [randomPlaceholder] = useState(
        () =>
            placeholderKeywords[
                Math.floor(Math.random() * placeholderKeywords.length)
            ],
    );
    const navigate = useNavigate();
    const location = useLocation();
    const currentSearch = useSearch({ strict: false }) as {
        style?: StyleType;
        angle?: "auto" | number;
        steps?: "auto" | number;
        size?: SizeType;
    };

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

        const preservedSearch = buildPreservedSearch(
            currentSearch,
            location.pathname,
        );

        // Check if input is a vector format and convert to seed
        const seedFromVector = parseVectorToSeed(trimmed);
        if (seedFromVector) {
            navigate({
                to: "/palettes/$query",
                params: { query: seedFromVector },
                search: preservedSearch,
            });
            return;
        }

        // Check if input is a grabient URL - URL params override current params
        const urlResult = parseGrabientUrl(trimmed);
        if (urlResult) {
            navigate({
                to: "/palettes/$query",
                params: { query: urlResult.seed },
                search: { ...preservedSearch, ...urlResult.searchParams },
            });
            return;
        }

        // Check if input is a raw seed
        if (isValidSeed(trimmed)) {
            navigate({
                to: "/palettes/$query",
                params: { query: trimmed },
                search: preservedSearch,
            });
            return;
        }

        // Default: treat as search query
        // Only encode URL-unsafe characters, preserve unicode for SEO readability
        const urlSafe = trimmed
            .replace(/[/?#%\\]/g, (char) => encodeURIComponent(char))
            .replace(/\s+/g, "-");
        navigate({
            to: "/palettes/$query",
            params: { query: urlSafe },
            search: preservedSearch,
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
            <div
                className={cn(
                    "absolute top-1/2 -translate-y-1/2 text-muted-foreground",
                    isExpanded ? "left-4" : "left-3",
                )}
            >
                <Search className={cn(isExpanded ? "h-5 w-5" : "h-4 w-4")} />
            </div>
            <input
                ref={inputRef}
                type="text"
                value={localValue}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={
                    isExpanded ? randomPlaceholder : "Search palettes..."
                }
                style={{ backgroundColor: "var(--background)" }}
                className={cn(
                    "disable-animation-on-theme-change w-full border border-solid",
                    "text-foreground placeholder:text-muted-foreground",
                    isExpanded ? "placeholder:opacity-[0.55] focus:placeholder:opacity-0" : "placeholder:opacity-100",
                    "hover:border-muted-foreground/30",
                    "focus:border-muted-foreground/50 focus:outline-none",
                    "transition-colors duration-200",
                    isExpanded
                        ? "h-11 rounded-full pl-11 pr-10 text-sm md:text-base border-input"
                        : "h-9 rounded-md pl-9 pr-8 text-sm border-input",
                )}
            />
            {localValue && (
                <button
                    type="button"
                    onClick={handleClear}
                    className={cn(
                        "absolute top-1/2 -translate-y-1/2",
                        "text-muted-foreground hover:text-foreground",
                        "transition-colors duration-200",
                        "cursor-pointer p-0.5 rounded",
                        "focus:outline-none focus:ring-2 focus:ring-ring/70",
                        isExpanded ? "right-4" : "right-2",
                    )}
                    aria-label="Clear search"
                >
                    <X className={cn(isExpanded ? "h-5 w-5" : "h-4 w-4")} />
                </button>
            )}
        </form>
    );
}
