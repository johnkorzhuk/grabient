import { describe, expect, it } from "vitest";
import { layout } from "../src/html";
import { renderPalette } from "../src/palette";
import {
  OG_RENDER_VERSION,
  ROBOTS_TXT,
  normalizeEntityMangledParams,
  paletteOgImageUrl,
  paletteOgSvg,
  queryOgSvg,
  robotsTxt,
  sitemapXml,
} from "../src/seo";

const SEED = "_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKb";

describe("SEO parity", () => {
  it("renders canonical, social, crawler, manifest, and structured-data metadata", () => {
    const html = layout(
      {
        title: "Test palette | Grabient",
        description: "A test gradient palette.",
        canonical: `https://grabient.com/${SEED}`,
        image: `https://grabient.com/api/og?seed=${SEED}`,
        imageAlt: "Test gradient",
      },
      "<main>Palette</main>",
    );

    expect(html).toContain('<link rel="canonical" href="https://grabient.com/');
    expect(html).toContain('<meta property="og:image" content="https://grabient.com/api/og');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta name="google-adsense-account"');
    expect(html).toContain('<link rel="apple-touch-icon"');
    expect(html).toContain('<link rel="manifest" href="/site.webmanifest">');
    expect(html).toContain('<link rel="alternate" type="text/plain" href="/llms.txt"');
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('"@type":"WebSite"');
    expect(html).toContain('"@type":"WebApplication"');
    expect(html).toContain('"@type":"SearchAction"');
    expect(html).toContain(
      '"urlTemplate":"https://grabient.com/palettes/{search_term_string}"',
    );
    expect(html).toContain(
      '<link data-route-head data-route-icon rel="icon" href="data:image/svg+xml',
    );
    expect(html).not.toContain('href="/favicon-32x32.png"');
  });

  it("builds versioned per-palette social image URLs", () => {
    const view = renderPalette(SEED, "radialGradient", 11, 135);
    expect(view).not.toBeNull();
    const url = new URL(paletteOgImageUrl("https://grabient.com", view));
    expect(url.pathname).toBe("/api/og");
    expect(url.searchParams.get("seed")).toBe(SEED);
    expect(url.searchParams.get("style")).toBe("radialGradient");
    expect(url.searchParams.get("steps")).toBe("11");
    expect(url.searchParams.get("angle")).toBe("135");
    expect(url.searchParams.get("v")).toBe(String(OG_RENDER_VERSION));
  });

  it("renders a 1200x630 palette preview SVG with the Grabient wordmark", () => {
    const view = renderPalette(SEED, "linearGradient", 7, 90);
    expect(view).not.toBeNull();
    const svg = paletteOgSvg(view);
    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain('id="logoG"');
    expect(svg).toContain(view.hexColors[0]);
  });

  it("renders a full-bleed, shallow golden-ratio search-query mosaic", () => {
    const svg = queryOgSvg(
      [
        {
          seed: SEED,
          tags: ["blue"],
          style: "linearGradient",
          steps: 7,
          angle: 90,
          likesCount: 1,
          createdAt: 0,
          score: 1,
        },
      ],
      "auto",
      "auto",
      "auto",
    );
    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain('id="og-cell-0"');
    expect(svg).toContain('id="og-cell-5"');
    expect(svg).not.toContain('id="og-cell-6"');
    expect(svg).toContain('<rect x="0" y="0" width="742" height="389"');
    expect(svg).toContain('<rect x="0" y="389" width="459" height="241"');
    expect(svg).toContain('<rect x="742" y="481" width="458" height="149"');
    expect(svg).not.toContain('id="og-logo-shade"');
    expect(svg).toContain('id="logoG"');
  });

  it("applies forced query style, steps, and angle to every OG palette", () => {
    const svg = queryOgSvg(
      [
        {
          seed: SEED,
          tags: ["blue"],
          style: "radialGradient",
          steps: 7,
          angle: 135,
          likesCount: 1,
          createdAt: 0,
          score: 1,
        },
      ],
      "linearGradient",
      2,
      45,
    );
    const firstGradient = svg.match(
      /<linearGradient id="gradient_0" x1="0\.146" y1="0\.854" x2="0\.854" y2="0\.146">([\s\S]*?)<\/linearGradient>/,
    );
    expect(firstGradient).not.toBeNull();
    expect(firstGradient?.[1].match(/<stop /g)).toHaveLength(2);
    expect(svg).not.toContain('id="radial_0"');
  });

  it("publishes the current crawler policy and canonical sitemap entries", () => {
    expect(ROBOTS_TXT).toContain("User-agent: GPTBot");
    expect(ROBOTS_TXT).toContain("User-agent: ClaudeBot");
    expect(ROBOTS_TXT).toContain("Sitemap: https://grabient.com/sitemap.xml");

    const xml = sitemapXml([SEED, "not-a-seed"]);
    expect(xml).toContain("<loc>https://grabient.com/</loc>");
    expect(xml).toContain("<loc>https://grabient.com/newest</loc>");
    expect(xml).toContain("<loc>https://grabient.com/palettes/sunset</loc>");
    expect(xml).toContain(`<loc>https://grabient.com/${SEED}</loc>`);
    expect(xml).not.toContain("not-a-seed");
    expect(xml).not.toContain("/llms.txt</loc>");

    const staging = "https://grabient-lite.jkorzhuk.workers.dev";
    expect(robotsTxt(staging)).toContain(`Sitemap: ${staging}/sitemap.xml`);
    expect(sitemapXml([SEED], staging)).toContain(`<loc>${staging}/${SEED}</loc>`);
  });

  it("normalizes entity-mangled OG parameters from social crawlers", () => {
    const params = normalizeEntityMangledParams(
      new URL("https://grabient.com/api/og?seed=x&amp;style=radialGradient"),
    );
    expect(params.get("style")).toBe("radialGradient");
  });
});
