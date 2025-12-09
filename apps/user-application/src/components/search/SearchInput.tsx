import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { cn, compressQuery } from "@/lib/utils";

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
        if (trimmed) {
            const compressed = compressQuery(trimmed);
            navigate({
                to: "/palettes/$query",
                params: { query: compressed },
            });
        }
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
