import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useSearch } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidSeed, serializeCoeffs } from "@repo/data-ops/serialization";
import {
    DEFAULT_GLOBALS,
    seedValidator,
    coeffsSchema,
    rawVectorInputSchema,
    styleWithAutoValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import * as v from "valibot";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { verifyTurnstile } from "@/server-functions/turnstile";

type StyleType = v.InferOutput<typeof styleWithAutoValidator>;
type SizeType = "auto" | [number, number];

// Schema for parsing raw vector string input (e.g. "[[0.5, 0.2, 0.8], [0.3, 0.1, 0.9], ...]")
const rawCoeffsInputSchema = v.pipe(
    v.string(),
    v.regex(/^\s*\[\s*\[[\d.,\s\-]+\](?:\s*,\s*\[[\d.,\s\-]+\])*\s*\]\s*$/, "Invalid vector format"),
    v.transform((input) => JSON.parse(input) as unknown),
    v.tuple([rawVectorInputSchema, rawVectorInputSchema, rawVectorInputSchema, rawVectorInputSchema]),
);

function parseVectorToSeed(input: string): string | null {
    const result = v.safeParse(rawCoeffsInputSchema, input);
    if (!result.success) return null;

    // Validate the transformed coeffs match the expected schema
    const coeffsResult = v.safeParse(coeffsSchema, result.output);
    if (!coeffsResult.success) return null;

    return serializeCoeffs(coeffsResult.output, DEFAULT_GLOBALS);
}

interface UrlParseResult {
    seed: string;
    searchParams: Record<string, string | number>;
}

function parseGrabientUrl(input: string): UrlParseResult | null {
    // Parse URL
    let url: URL;
    try {
        if (input.startsWith("http")) {
            url = new URL(input);
        } else if (input.includes("grabient.com")) {
            url = new URL("https://" + input);
        } else {
            return null;
        }
    } catch {
        return null;
    }

    // Validate hostname
    if (!url.hostname.includes("grabient.com")) return null;

    // Extract seed from path
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length === 0) return null;

    const seed = pathParts[0]!;

    // Validate seed format using valibot
    const seedResult = v.safeParse(seedValidator, seed);
    if (!seedResult.success) return null;

    // Extract and convert search params
    const searchParams: Record<string, string | number> = {};
    url.searchParams.forEach((value, key) => {
        // Try to convert numeric values to numbers
        const num = Number(value);
        if (!isNaN(num) && value.trim() !== "") {
            searchParams[key] = num;
        } else {
            searchParams[key] = value;
        }
    });

    return { seed: seedResult.output, searchParams };
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

interface SearchInputProps {
    className?: string;
    variant?: "default" | "expanded";
}

export function SearchInput({
    className,
    variant = "default",
}: SearchInputProps) {
    const isExpanded = variant === "expanded";
    const navigate = useNavigate();
    const location = useLocation();
    const currentSearch = useSearch({ strict: false }) as {
        style?: StyleType;
        angle?: "auto" | number;
        steps?: "auto" | number;
        size?: SizeType;
    };

    const [localValue, setLocalValue] = useState("");
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const [turnstileError, setTurnstileError] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [showChallenge, setShowChallenge] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const turnstileRef = useRef<TurnstileInstance>(null);

    const isOnSearchPage = location.pathname.startsWith("/palettes/");

    useEffect(() => {
        if (isOnSearchPage) {
            setLocalValue("");
        }
    }, [isOnSearchPage, location.pathname]);

    const performNavigation = (trimmed: string) => {
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

    const handleSubmitWithTurnstile = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = localValue.trim();
        if (!trimmed || isVerifying) return;

        setIsVerifying(true);

        // Wait for token if not ready yet (up to 3 seconds)
        let token = turnstileToken;
        if (!token) {
            for (let i = 0; i < 30; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                // Check the ref's response directly as state might not have updated
                const widgetToken = turnstileRef.current?.getResponse();
                if (widgetToken) {
                    token = widgetToken;
                    break;
                }
            }
        }

        if (!token) {
            setTurnstileError(true);
            setIsVerifying(false);
            return;
        }

        try {
            const result = await verifyTurnstile({ data: { token } });
            if (result.success) {
                performNavigation(trimmed);
            } else {
                setTurnstileError(true);
            }
        } catch (error) {
            console.error("Turnstile verification failed:", error);
            setTurnstileError(true);
        } finally {
            setTurnstileToken(null);
            turnstileRef.current?.reset();
            setIsVerifying(false);
        }
    };

    return (
        <div className={cn("flex flex-col", className)}>
            <form onSubmit={handleSubmitWithTurnstile} className="relative">
                <div
                    className={cn(
                        "absolute top-1/2 -translate-y-1/2 text-muted-foreground",
                        isExpanded ? "left-3.5 md:left-4" : "left-3",
                    )}
                >
                    <Search className={cn(isExpanded ? "h-4.5 w-4.5 md:h-5 md:w-5" : "h-4 w-4")} />
                </div>
                <input
                    ref={inputRef}
                    id={isExpanded ? "search-input-expanded" : undefined}
                    type="text"
                    value={localValue}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Search palettes..."
                    suppressHydrationWarning
                    style={{ backgroundColor: "var(--background)" }}
                    className={cn(
                        "disable-animation-on-theme-change w-full border border-solid",
                        "text-foreground placeholder:text-muted-foreground",
                        isExpanded ? "placeholder:opacity-[0.55] focus:placeholder:opacity-0" : "placeholder:opacity-100",
                        "hover:border-muted-foreground/30",
                        "focus:border-muted-foreground/50 focus:outline-none",
                        "transition-colors duration-200",
                        isExpanded
                            ? "h-10 md:h-11 rounded-full pl-10 md:pl-11 pr-9 md:pr-10 text-sm md:text-base border-input"
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
                            isExpanded ? "right-3.5 md:right-4" : "right-2",
                        )}
                        aria-label="Clear search"
                    >
                        <X className={cn(isExpanded ? "h-5 w-5" : "h-4 w-4")} />
                    </button>
                )}
            </form>
            <div className={cn("[&_iframe]:!w-full", showChallenge ? "mt-3" : "sr-only")}>
                <Turnstile
                    ref={turnstileRef}
                    siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                    onSuccess={(token) => {
                        setTurnstileToken(token);
                        setTurnstileError(false);
                    }}
                    onError={() => {
                        setTurnstileToken(null);
                        setTurnstileError(true);
                    }}
                    onExpire={() => {
                        setTurnstileToken(null);
                    }}
                    onBeforeInteractive={() => {
                        setShowChallenge(true);
                    }}
                    onAfterInteractive={() => {
                        setShowChallenge(false);
                    }}
                    options={{
                        size: "flexible",
                        theme: "auto",
                        appearance: "interaction-only",
                    }}
                />
            </div>
            {turnstileError && (
                <p className="mt-2 text-xs text-red-500 text-center">
                    Verification failed. Please refresh.
                </p>
            )}
        </div>
    );
}
