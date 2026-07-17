/**
 * Some link-preview crawlers (Telegram's WebpageBot among them) fetch the
 * og:image URL without decoding HTML entities, so `&amp;style=x` arrives as a
 * param literally named `amp;style`. Strip the prefix so those requests still
 * resolve the intended options instead of silently falling back to defaults.
 */
export function normalizeEntityMangledParams(url: URL): URLSearchParams {
    const params = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
        params.set(key.startsWith("amp;") ? key.slice(4) : key, value);
    }
    return params;
}
