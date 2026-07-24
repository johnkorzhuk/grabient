// GDPR detection, ported from apps/user-application's core/middleware/geo.ts:
// EEA + UK. Cloudflare exposes both signals on request.cf.
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

interface CfGeo {
  country?: string;
  isEUCountry?: "1" | string;
}

export function isGdprRegion(raw: unknown): boolean {
  const cf = raw as CfGeo | undefined;
  if (!cf) return false;
  return cf.isEUCountry === "1" || (cf.country ? GDPR_COUNTRIES.has(cf.country) : false);
}
