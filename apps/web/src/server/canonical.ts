import { canonicalSeedAddress } from "../features/editor/address.ts";
import { canonicalGallery } from "../features/gallery/address.ts";
import { collectionRules } from "./collections/routing.ts";

/* One address per page. Before any cache is read, the Worker asks these rules for the canonical form of a page's
   address (path and query, without the language) and answers 301 to it in the request's language, so a junk or old
   query string never fills the cache and every link people share leads to one place.

   Each feature adds the rule for the addresses it owns, ahead of the ones it must win over: a seed's canonical form
   and view, old grabient.com links from the legacy maps, the lists' query forms (order, defaults, out-of-range values).
   A rule answers null for an address it does not know; the first that answers wins. */

/** The canonical form of `address` ("/path?query"), or null when this rule leaves it alone. */
export type CanonicalRule = (address: string) => string | null;

const RULES: readonly CanonicalRule[] = [canonicalSeedAddress, canonicalGallery, ...collectionRules];

/** The address a page request should be redirected to, or null when it is canonical already. */
export function canonicalRedirect(address: string, rules = RULES): string | null {
  for (const rule of rules) {
    const canonical = rule(address);
    if (canonical !== null) return canonical === address ? null : canonical;
  }
  return null;
}
