/**
 * Check if Pro features are enabled.
 *
 * Uses VITE_ENABLE_PRO environment variable which works in both
 * client and server contexts.
 *
 * Set VITE_ENABLE_PRO=true in:
 * - .env file for local development
 * - Cloudflare Dashboard for production
 *
 * Defaults to false (Pro features disabled) if not set.
 */
export function isProEnabled(): boolean {
    return import.meta.env.VITE_ENABLE_PRO === "true";
}
