import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@repo/data-ops/database/setup";
import { getPopularPalettesPaginated } from "@repo/data-ops/queries/palettes";

const BASE_URL = "https://grabient.com";
const PALETTE_URL_COUNT = 1000;
const PAGE_SIZE = 100;

function xmlEscape(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function buildSitemap(): Promise<Response> {
    const staticUrls = [
        { loc: `${BASE_URL}/`, priority: "1.0" },
        { loc: `${BASE_URL}/newest`, priority: "0.8" },
        { loc: `${BASE_URL}/oldest`, priority: "0.5" },
    ];

    const paletteUrls: { loc: string; priority: string }[] = [];
    try {
        const db = getDb();
        for (
            let page = 1;
            page <= Math.ceil(PALETTE_URL_COUNT / PAGE_SIZE);
            page++
        ) {
            const { palettes } = await getPopularPalettesPaginated(
                page,
                PAGE_SIZE,
                db,
            );
            if (palettes.length === 0) break;
            for (const palette of palettes) {
                paletteUrls.push({
                    loc: `${BASE_URL}/${encodeURIComponent(palette.id)}`,
                    priority: "0.6",
                });
            }
            if (palettes.length < PAGE_SIZE) break;
        }
    } catch (error) {
        console.error("sitemap: failed to load palettes", error);
    }

    const entries = [...staticUrls, ...paletteUrls]
        .map(
            (url) =>
                `  <url><loc>${xmlEscape(url.loc)}</loc><priority>${url.priority}</priority></url>`,
        )
        .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;

    return new Response(xml, {
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            // Regenerating this runs ~10 DB queries; cache hard at the edge
            "Cache-Control": "public, max-age=3600",
            "CDN-Cache-Control": "max-age=86400, stale-while-revalidate=86400",
        },
    });
}

export const Route = createFileRoute("/sitemap.xml")({
    server: {
        handlers: {
            GET: () => buildSitemap(),
        },
    },
});
