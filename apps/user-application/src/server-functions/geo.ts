import { createServerFn } from "@tanstack/react-start";
import { geoMiddleware } from "@/core/middleware/geo";

export interface GeoData {
    isGdprRegion: boolean;
    country?: string;
}

export const getGeoData = createServerFn({ method: "GET" })
    .middleware([geoMiddleware])
    .handler(async ({ context }): Promise<GeoData> => {
        return {
            isGdprRegion: context.isGdprRegion,
            country: context.country,
        };
    });
