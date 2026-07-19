// Bump whenever rendered OG output changes (style renderers, layout, logo).
// The version goes into both the KV cache key and the og:image URL as a `v`
// param — the Cloudflare CDN edge cache and social crawlers (Telegram,
// Twitter, Discord) cache by full URL, so a KV-only bump keeps serving stale
// PNGs from those layers.
export const OG_RENDER_VERSION = 7;
