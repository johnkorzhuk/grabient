import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearch, useLocation } from "@tanstack/react-router";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { searchPalettesQueryOptions } from "@/queries/palettes";

const DEBOUNCE_MS = 500;

function getSearchablePath(pathname: string): "/" | "/newest" | "/oldest" {
    if (pathname === "/newest") return "/newest";
    if (pathname === "/oldest") return "/oldest";
    return "/";
}

export function SearchInput({ className }: { className?: string }) {
    const navigate = useNavigate();
    const location = useLocation();
    const search = useSearch({ strict: false }) as { q?: string };
    const urlQuery = search.q || "";

    const [localValue, setLocalValue] = useState(urlQuery);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();
    const inputRef = useRef<HTMLInputElement>(null);

    const { isFetching } = useQuery(searchPalettesQueryOptions(urlQuery));

    useEffect(() => {
        setLocalValue(urlQuery);
    }, [urlQuery]);

    const isSearchableRoute = ["/", "/newest", "/oldest"].includes(location.pathname);

    const updateUrl = (value: string) => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            const trimmed = value.trim();
            const targetPath = getSearchablePath(location.pathname);

            if (trimmed) {
                navigate({
                    to: targetPath,
                    search: { q: trimmed },
                    replace: isSearchableRoute && !!urlQuery,
                });
            } else if (urlQuery) {
                // Clear search - stay on current route without q param
                navigate({ to: targetPath });
            }
        }, DEBOUNCE_MS);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setLocalValue(value);
        updateUrl(value);
    };

    const handleClear = () => {
        setLocalValue("");
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        const targetPath = getSearchablePath(location.pathname);
        navigate({ to: targetPath });
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            handleClear();
        }
    };

    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, []);

    return (
        <div className={cn("relative", className)}>
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {isFetching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Search className="h-4 w-4" />
                )}
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
        </div>
    );
}
