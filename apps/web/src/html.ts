import styles from "../dist/styles.css";
import manifest from "../dist/client/.vite/manifest.json";
import { DEFAULT_FAVICON } from "./palette";
import { esc } from "./esc";

export { esc };

const entry = manifest["src/islands/entry.tsx"];
const SCRIPT_TAG = entry ? `<script type="module" src="/${entry.file}"></script>` : "";

// Runs before paint: applies the persisted (or system) theme class — the
// current site's FOUC-prevention pattern.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd25f"/><stop offset=".5" stop-color="#ff5f6d"/><stop offset="1" stop-color="#a17fff"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#g)"/></svg>`,
  );

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  /** Social preview image. Defaults to the shared 1200x630 Grabient image. */
  image?: string;
  imageAlt?: string;
  keywords?: string;
  /** Use for personalized/auth-only surfaces that should not enter search. */
  robots?: string;
  /** Optional page-specific JSON-LD in addition to the global WebApplication. */
  structuredData?: Record<string, unknown> | Record<string, unknown>[];
  /** Data-URI favicon override (e.g. the seed page's own gradient). */
  favicon?: string;
  /** Browser-chrome tint (seed pages: the gradient's top-strip average). */
  themeColor?: string;
  /** Omit the footer (the non-scrolling edit view). */
  noFooter?: boolean;
}

function jsonLd(value: Record<string, unknown>): string {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
}

export function layout(meta: PageMeta, body: string): string {
  const siteUrl = new URL(meta.canonical).origin;
  const zarazLoader =
    new URL(siteUrl).hostname === "grabient.com"
      ? '<script defer src="/cdn-cgi/zaraz/i.js"></script>'
      : "";
  const image = meta.image ?? new URL("/grabber.png", meta.canonical).toString();
  const imageAlt = meta.imageAlt ?? "Grabient gradient palette generator";
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Grabient",
      url: siteUrl,
      description:
        "A free CSS gradient generator and color palette finder for designers and developers.",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${siteUrl}/palettes/{search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Grabient",
      url: siteUrl,
      description:
        "CSS gradient generator and color palette finder. Browse and customize gradient palettes, then export them as CSS, SVG, or PNG.",
      applicationCategory: "DesignApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    ...(Array.isArray(meta.structuredData)
      ? meta.structuredData
      : meta.structuredData
        ? [meta.structuredData]
        : []),
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
${meta.keywords ? `<meta name="keywords" content="${esc(meta.keywords)}">` : ""}
${meta.robots ? `<meta name="robots" content="${esc(meta.robots)}">` : ""}
<meta name="google-adsense-account" content="ca-pub-2436216252635443">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Grabient">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:url" content="${esc(meta.canonical)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:secure_url" content="${esc(image)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(meta.title)}">
<meta name="twitter:description" content="${esc(meta.description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta name="twitter:image:alt" content="${esc(imageAlt)}">
<link rel="canonical" href="${esc(meta.canonical)}">
<link data-route-head data-route-icon rel="icon" href="${esc(meta.favicon ?? DEFAULT_FAVICON ?? FAVICON)}">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt — guide for LLMs and AI agents">
${meta.themeColor ? `<meta name="theme-color" content="${esc(meta.themeColor)}">` : ""}
<link rel="preload" href="/fonts/poppins-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/poppins-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
${structuredData.map(jsonLd).join("\n")}
<script>${THEME_SCRIPT}</script>
<style>${styles}</style>
${zarazLoader}
${SCRIPT_TAG}
</head>
<body class="flex min-h-dvh flex-col bg-background font-sans text-foreground${meta.noFooter ? " overflow-hidden" : ""}">
<div id="live" role="status" aria-live="polite" class="sr-only"></div>
${body}
</body>
</html>`;
}
