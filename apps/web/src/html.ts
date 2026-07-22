import styles from "../dist/styles.css";
import manifest from "../dist/client/.vite/manifest.json";
import { DEFAULT_FAVICON } from "./palette";

const entry = manifest["src/islands/entry.tsx"];
const SCRIPT_TAG = entry ? `<script type="module" src="/${entry.file}"></script>` : "";

// Runs before paint: applies the persisted (or system) theme class — the
// current site's FOUC-prevention pattern.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd25f"/><stop offset=".5" stop-color="#ff5f6d"/><stop offset="1" stop-color="#a17fff"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#g)"/></svg>`,
  );

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  /** Data-URI favicon override (e.g. the seed page's own gradient). */
  favicon?: string;
  /** Browser-chrome tint (seed pages: the gradient's top-strip average). */
  themeColor?: string;
  /** Omit the footer (the non-scrolling edit view). */
  noFooter?: boolean;
}

export function layout(meta: PageMeta, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<link rel="canonical" href="${esc(meta.canonical)}">
<link rel="icon" href="${meta.favicon ?? DEFAULT_FAVICON ?? FAVICON}">
${meta.themeColor ? `<meta name="theme-color" content="${esc(meta.themeColor)}">` : ""}
<link rel="preload" href="/fonts/poppins-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/poppins-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<script>${THEME_SCRIPT}</script>
<style>${styles}</style>
${SCRIPT_TAG}
</head>
<body class="flex min-h-dvh flex-col bg-background font-sans text-foreground${meta.noFooter ? " overflow-hidden" : ""}">
<div id="live" role="status" aria-live="polite" class="sr-only"></div>
${body}
</body>
</html>`;
}
