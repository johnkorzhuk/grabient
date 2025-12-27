import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    hexToColorName,
    colorNameToHex,
    simplifyHex,
    isExactColorMatch,
    HEX_CODE_REGEX,
} from "@repo/data-ops/color-utils";
import { getSeedColorData } from "@/lib/seed-color-data";
import { isValidSeed } from "@repo/data-ops/serialization";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ReactNode } from "react";

// --- Helper Functions ---

function cleanTextPart(text: string): string {
    return text.replace(/[,#]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseQueryForDisplay(
    query: string,
): Array<{ type: "text" | "hex" | "colorName"; value: string; hex?: string }> {
    const sanitized = query
        .replace(/[\[\]"{}]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);

    const parts: Array<{
        type: "text" | "hex" | "colorName";
        value: string;
        hex?: string;
    }> = [];
    const seenColors = new Set<string>();

    let lastIndex = 0;
    const segments: Array<{
        type: "text" | "hex";
        value: string;
        start: number;
        end: number;
    }> = [];

    for (const match of sanitized.matchAll(HEX_CODE_REGEX)) {
        if (match.index! > lastIndex) {
            segments.push({
                type: "text",
                value: sanitized.slice(lastIndex, match.index),
                start: lastIndex,
                end: match.index!,
            });
        }
        segments.push({
            type: "hex",
            value: match[0]!,
            start: match.index!,
            end: match.index! + match[0]!.length,
        });
        lastIndex = match.index! + match[0]!.length;
    }

    if (lastIndex < sanitized.length) {
        segments.push({
            type: "text",
            value: sanitized.slice(lastIndex),
            start: lastIndex,
            end: sanitized.length,
        });
    }

    for (const segment of segments) {
        if (segment.type === "hex") {
            const colorName = hexToColorName(segment.value);
            if (!seenColors.has(colorName)) {
                seenColors.add(colorName);
                parts.push({ type: "hex", value: segment.value });
            }
        } else {
            let textBuffer = "";
            const words = segment.value.split(/\s+/);

            for (const word of words) {
                const cleanWord = word.replace(/[,#]+/g, "").trim();
                if (!cleanWord) continue;

                const hex = colorNameToHex(cleanWord);
                if (hex) {
                    const normalized = hexToColorName(hex);
                    if (!seenColors.has(normalized)) {
                        if (textBuffer.trim()) {
                            const cleaned = cleanTextPart(textBuffer);
                            if (cleaned) parts.push({ type: "text", value: cleaned });
                            textBuffer = "";
                        }
                        seenColors.add(normalized);
                        parts.push({ type: "colorName", value: cleanWord, hex });
                    }
                } else {
                    textBuffer += (textBuffer ? " " : "") + cleanWord;
                }
            }

            if (textBuffer.trim()) {
                const cleaned = cleanTextPart(textBuffer);
                if (cleaned) parts.push({ type: "text", value: cleaned });
            }
        }
    }

    return parts;
}

type QueryType = "seed" | "hex" | "text";

function getQueryType(query: string): QueryType {
    if (isValidSeed(query)) return "seed";
    if (HEX_CODE_REGEX.test(query)) {
        HEX_CODE_REGEX.lastIndex = 0;
        return "hex";
    }
    return "text";
}

function getActualSearchTerms(
    query: string,
): { colorNames: string[]; hexCodes: string[] } | null {
    const seedData = getSeedColorData(query);
    if (seedData) {
        const hexCodes = seedData.colorNames.map(
            (name) => colorNameToHex(name) ?? "#808080"
        );
        return { colorNames: seedData.colorNames, hexCodes };
    }

    const hexMatches = query.match(HEX_CODE_REGEX);
    if (hexMatches && hexMatches.length > 0) {
        const colorNames: string[] = [];
        const hexCodes: string[] = [];
        const seen = new Set<string>();
        for (const hex of hexMatches) {
            const name = hexToColorName(hex);
            if (!seen.has(name)) {
                seen.add(name);
                colorNames.push(name);
                hexCodes.push(colorNameToHex(name) || hex);
            }
        }
        return { colorNames, hexCodes };
    }

    return null;
}

// --- Swatch Components ---

function ColorSwatch({ hex }: { hex: string }) {
    const colorName = hexToColorName(hex);
    const displayHex = simplifyHex(hex);
    const isExact = isExactColorMatch(hex);

    const swatch = (
        <span
            className="inline-block w-4 h-4 rounded-full border border-input cursor-default"
            style={{ backgroundColor: hex }}
        />
    );

    return (
        <span className="inline-flex items-center gap-1.5">
            {isExact ? (
                <Tooltip>
                    <TooltipTrigger asChild>{swatch}</TooltipTrigger>
                    <TooltipContent>
                        <span className="capitalize">{colorName}</span>
                    </TooltipContent>
                </Tooltip>
            ) : (
                swatch
            )}
            <span className="text-foreground">{displayHex}</span>
        </span>
    );
}

function ColorNameSwatch({ name, hex }: { name: string; hex: string }) {
    const displayHex = simplifyHex(hex);
    const isExact = isExactColorMatch(hex);

    const swatch = (
        <span
            className="inline-block w-4 h-4 rounded-full border border-input cursor-default"
            style={{ backgroundColor: hex }}
        />
    );

    return (
        <span className="inline-flex items-center gap-1.5">
            {isExact ? (
                <Tooltip>
                    <TooltipTrigger asChild>{swatch}</TooltipTrigger>
                    <TooltipContent>
                        <span>{displayHex}</span>
                    </TooltipContent>
                </Tooltip>
            ) : (
                swatch
            )}
            <span className="text-foreground capitalize">{name}</span>
        </span>
    );
}

// --- Query Display Component ---

export function QueryDisplay({ query }: { query: string }) {
    const seedData = getSeedColorData(query);
    if (seedData) {
        return (
            <>
                {seedData.colorNames.map((name, i) => {
                    const basicColorHex = colorNameToHex(name);
                    return (
                        <span key={i} className="inline-flex items-center">
                            <ColorNameSwatch
                                name={name}
                                hex={basicColorHex ?? seedData.hexCodes[i]!}
                            />
                        </span>
                    );
                })}
            </>
        );
    }

    const parts = parseQueryForDisplay(query);

    if (parts.length === 0) {
        return <span>Search</span>;
    }

    return (
        <>
            {parts.map((part, i) => {
                if (part.type === "hex") {
                    return (
                        <span key={i} className="inline-flex items-center">
                            <ColorSwatch hex={part.value} />
                        </span>
                    );
                }
                if (part.type === "colorName" && part.hex) {
                    return (
                        <span key={i} className="inline-flex items-center">
                            <ColorNameSwatch name={part.value} hex={part.hex} />
                        </span>
                    );
                }
                return <span key={i}>{part.value}</span>;
            })}
        </>
    );
}

// --- Subtitle Component ---

export function PalettePageSubtitle({
    query,
    searchParams,
}: {
    query: string;
    searchParams?: Record<string, unknown>;
}) {
    const queryType = getQueryType(query);

    if (queryType === "seed") {
        return (
            <p
                className="absolute top-full mt-1.5 text-sm text-muted-foreground font-medium flex items-center gap-1.5"
                style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
                Showing results for seed:{" "}
                <Link
                    to="/$seed"
                    params={{ seed: query }}
                    search={searchParams ?? {}}
                    className="text-foreground/80 hover:text-foreground underline underline-offset-2 decoration-muted-foreground/40 hover:decoration-foreground/50 transition-colors"
                >
                    {query.slice(0, 12)}...
                </Link>
            </p>
        );
    }

    if (queryType === "hex") {
        const searchTerms = getActualSearchTerms(query);
        if (!searchTerms) return null;

        return (
            <p
                className="absolute top-full mt-1.5 text-sm text-muted-foreground font-medium flex items-center gap-1.5"
                style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
                Showing results for:
                {searchTerms.colorNames.map((name, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                        <span
                            className="inline-block w-3 h-3 rounded-sm border border-input"
                            style={{ backgroundColor: searchTerms.hexCodes[i] }}
                        />
                        <span className="text-foreground/80 capitalize">
                            {name}
                        </span>
                    </span>
                ))}
            </p>
        );
    }

    return null;
}

// --- Main Header Component ---

interface PalettePageHeaderProps {
    query: string;
    showSparkles?: boolean;
    searchParams?: Record<string, unknown>;
    actions?: ReactNode;
    className?: string;
}

export function PalettePageHeader({
    query,
    showSparkles = false,
    searchParams,
    actions,
    className,
}: PalettePageHeaderProps) {
    const queryType = getQueryType(query);
    const hasSubtitle = queryType === "seed" || queryType === "hex";

    return (
        <div
            className={cn(
                "px-5 lg:px-14 relative",
                hasSubtitle ? "mb-14 md:mb-16" : "mb-10 md:mb-12.5",
                className
            )}
        >
            <div className="flex items-start justify-between gap-4">
                <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-foreground flex items-center flex-wrap gap-x-2 gap-y-1 min-w-0">
                    {showSparkles && (
                        <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-muted-foreground" />
                    )}
                    <QueryDisplay query={query} />
                    <span className={showSparkles ? "" : "ml-1"}>palettes</span>
                </h1>
                {actions && (
                    <div className="flex items-center gap-2 shrink-0">
                        {actions}
                    </div>
                )}
            </div>
            <PalettePageSubtitle query={query} searchParams={searchParams} />
        </div>
    );
}

// Export helper for checking if query has subtitle
export function queryHasSubtitle(query: string): boolean {
    const queryType = getQueryType(query);
    return queryType === "seed" || queryType === "hex";
}
