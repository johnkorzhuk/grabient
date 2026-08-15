declare module "*.css" {
  const text: string;
  export default text;
}

interface Env {
  DB: D1Database;
  /** Zero Trust team domain, e.g. "grabient.cloudflareaccess.com". */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** Access application audience (AUD) tag. */
  CF_ACCESS_AUD?: string;
  /** Comma-separated allow-list, checked on top of the Access policy. */
  ADMIN_EMAILS?: string;
  /**
   * Cloudflare API token with Zone → Analytics → Read on grabient.com, and the
   * zone's id. Both optional: without them the traffic sections are omitted and
   * the D1-backed half of the dashboard still renders. See src/traffic.ts.
   */
  CF_ANALYTICS_TOKEN?: string;
  CF_ZONE_ID?: string;
  /** Account tag. Needed for the RUM dataset, which is account-scoped. */
  CF_ACCOUNT_ID?: string;
  /**
   * The full service-account JSON from Google Cloud, stored verbatim. Unlike the
   * Access values this one IS a credential — it contains an RSA private key that
   * authenticates as the service account. Optional: without it the search
   * sections are omitted.
   */
  GSC_SERVICE_ACCOUNT?: string;
  /**
   * Optional override for the Search Console property. Normally leave this
   * unset — the property is discovered from the API, which avoids having to
   * know whether it is a Domain ("sc-domain:grabient.com") or URL-prefix
   * ("https://grabient.com/") property. Set it only to disambiguate when the
   * account can read several properties for the same host.
   */
  GSC_PROPERTY?: string;
  /**
   * Local development escape hatch. Set ONLY in .dev.vars (which is gitignored
   * and never uploaded by `wrangler deploy`) to the literal string
   * "i-am-running-wrangler-dev". Never put this in wrangler.jsonc.
   */
  DEV_UNSAFE_SKIP_ACCESS?: string;
}
