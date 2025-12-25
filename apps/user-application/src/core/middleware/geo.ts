import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// GDPR applies to EEA (EU + Iceland, Liechtenstein, Norway) and UK
const GDPR_COUNTRIES = new Set([
    // EU Member States
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
    "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
    "PL", "PT", "RO", "SK", "SI", "ES", "SE",
    // EEA (non-EU)
    "IS", "LI", "NO",
    // UK (post-Brexit still has GDPR-equivalent)
    "GB",
]);

interface CfGeoProperties {
    country?: string;
    isEUCountry?: "1";
}

export const geoMiddleware = createMiddleware({
    type: "function",
}).server(async ({ next, context }) => {
    // Try to get geo from context first (set in server.ts)
    if (context.isGdprRegion !== undefined) {
        return next({
            context: {
                isGdprRegion: context.isGdprRegion as boolean,
                country: context.country as string | undefined,
            },
        });
    }

    // Fallback: try to extract from request.cf
    const request = getRequest();
    const cf = (request as unknown as { cf?: CfGeoProperties }).cf;
    const country = cf?.country;
    const isEUCountry = cf?.isEUCountry === "1";
    const isGdprRegion = isEUCountry || (country ? GDPR_COUNTRIES.has(country) : false);

    return next({
        context: {
            isGdprRegion,
            country,
        },
    });
});
