import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { DailyTag } from "@/lib/daily-tags";
import { getTagSearchQuery } from "@/lib/daily-tags";

interface ColorSwatchProps {
    hex: string;
    className?: string;
}

function ColorSwatch({ hex, className }: ColorSwatchProps) {
    return (
        <span
            className={cn("inline-block w-3 h-3 rounded-sm shrink-0", className)}
            style={{ backgroundColor: hex }}
        />
    );
}

interface TagItemProps {
    tag: DailyTag;
    preservedSearch: Record<string, unknown>;
    currentPathname: string;
}

export function TagItem({ tag, preservedSearch, currentPathname }: TagItemProps) {
    const query = getTagSearchQuery(tag);
    const targetPath = `/palettes/${query.replace(/\s+/g, "-")}`;

    // Don't render if we're already on this search page
    if (currentPathname === targetPath) {
        return null;
    }

    const baseClasses = cn(
        "disable-animation-on-theme-change inline-flex items-center justify-center gap-1.5",
        "h-7 px-3.5 rounded-md border border-solid",
        "transition-colors duration-200 outline-none",
        "text-[11px] md:text-xs font-medium whitespace-nowrap",
        "border-input hover:border-muted-foreground/30 hover:bg-background/60 text-muted-foreground hover:text-foreground focus-visible:border-muted-foreground/50",
    );

    switch (tag.type) {
        case "text":
            return (
                <Link
                    to="/palettes/$query"
                    params={{ query: tag.value.replace(/\s+/g, "-") }}
                    search={preservedSearch}
                    style={{ backgroundColor: "var(--background)" }}
                    className={baseClasses}
                >
                    {tag.value}
                </Link>
            );

        case "color":
            return (
                <Link
                    to="/palettes/$query"
                    params={{ query: tag.name }}
                    search={preservedSearch}
                    style={{ backgroundColor: "var(--background)" }}
                    className={baseClasses}
                >
                    <ColorSwatch hex={tag.hex} />
                    {tag.name}
                </Link>
            );

        case "hex":
            return (
                <Link
                    to="/palettes/$query"
                    params={{ query: tag.hex }}
                    search={preservedSearch}
                    style={{ backgroundColor: "var(--background)" }}
                    className={baseClasses}
                >
                    <ColorSwatch hex={tag.hex} />
                    {tag.hex}
                </Link>
            );

        case "pair":
            return (
                <Link
                    to="/palettes/$query"
                    params={{ query: tag.colors.map((c) => c.name).join("-") }}
                    search={preservedSearch}
                    style={{ backgroundColor: "var(--background)" }}
                    className={baseClasses}
                >
                    <span className="inline-flex -space-x-0.5">
                        {tag.colors.map((color, i) => (
                            <ColorSwatch key={i} hex={color.hex} />
                        ))}
                    </span>
                    {tag.colors.map((c) => c.name).join(" & ")}
                </Link>
            );

        case "triad":
            return (
                <Link
                    to="/palettes/$query"
                    params={{ query: tag.colors.map((c) => c.name).join("-") }}
                    search={preservedSearch}
                    style={{ backgroundColor: "var(--background)" }}
                    className={baseClasses}
                >
                    <span className="inline-flex -space-x-0.5">
                        {tag.colors.map((color, i) => (
                            <ColorSwatch key={i} hex={color.hex} />
                        ))}
                    </span>
                    {tag.colors.map((c) => c.name).join(", ")}
                </Link>
            );
    }
}
