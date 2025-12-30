import fuzzysort from "fuzzysort";
import {
    getColorsWithHex,
    hexToColorName,
    isHexColor,
} from "@repo/data-ops/color-utils";
import { EMOJI_TAGS, STYLE_TAGS } from "@/lib/tags";

export type SearchSuggestion = {
    type: "text" | "emoji" | "color";
    value: string;
    display: string;
    hex?: string;
    highlighted?: string;
};

// Prepared search targets for better performance
type PreparedTarget = {
    type: "text" | "emoji" | "color";
    value: string;
    display: string;
    hex?: string;
    prepared: Fuzzysort.Prepared;
    searchText: string;
};

let preparedTargets: PreparedTarget[] | null = null;

function getPreparedTargets(): PreparedTarget[] {
    if (preparedTargets) return preparedTargets;

    const targets: PreparedTarget[] = [];

    // Add style tags from the shared tags module
    for (const tag of STYLE_TAGS) {
        targets.push({
            type: "text",
            value: tag,
            display: tag,
            prepared: fuzzysort.prepare(tag),
            searchText: tag,
        });
    }

    // Add emoji tags with their keywords
    for (const { emoji, keywords } of EMOJI_TAGS) {
        targets.push({
            type: "emoji",
            value: emoji,
            display: emoji,
            prepared: fuzzysort.prepare(keywords),
            searchText: keywords,
        });
    }

    // Add color names
    const colors = getColorsWithHex();
    for (const color of colors) {
        targets.push({
            type: "color",
            value: color.name,
            display: color.name,
            hex: color.hex,
            prepared: fuzzysort.prepare(color.name),
            searchText: color.name,
        });
    }

    preparedTargets = targets;
    return targets;
}

/**
 * Perform fuzzy search across all tag types
 * If query is a hex color, returns the closest predefined color
 */
export function fuzzySearch(
    query: string,
    limit = 8,
): SearchSuggestion[] {
    const trimmed = query.trim();
    if (!trimmed) return [];

    // Check if input is a hex color
    const hexInput = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (isHexColor(hexInput)) {
        const closestColorName = hexToColorName(hexInput);
        const colors = getColorsWithHex();
        const matchedColor = colors.find(
            (c) => c.name.toLowerCase() === closestColorName.toLowerCase(),
        );

        if (matchedColor) {
            return [
                {
                    type: "color",
                    value: matchedColor.name,
                    display: matchedColor.name,
                    hex: matchedColor.hex,
                    highlighted: matchedColor.name,
                },
            ];
        }
    }

    const targets = getPreparedTargets();

    const results = fuzzysort.go(trimmed, targets, {
        key: "searchText",
        limit,
        threshold: -10000,
    });

    return results.map((result) => ({
        type: result.obj.type,
        value: result.obj.value,
        display: result.obj.display,
        hex: result.obj.hex,
        highlighted: result.highlight("<mark>", "</mark>") ?? result.obj.display,
    }));
}

/**
 * Check if a query looks like it could be a hex color
 */
export function looksLikeHex(query: string): boolean {
    const trimmed = query.trim();
    if (trimmed.startsWith("#")) {
        return /^#[0-9a-fA-F]{0,6}$/.test(trimmed);
    }
    // Also match if it's all hex characters (user might be typing without #)
    return /^[0-9a-fA-F]{3,6}$/.test(trimmed);
}
