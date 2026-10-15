/* Old `_` links no map holds, fitted on the Worker as the reader's browser fits them (engine/legacy-import.ts), so a
   crawler, a link preview and an old page's share card land on the palette too. A fit is deterministic, so its 301 is
   kept at the edge and by the browser (lib/cache.ts): each old seed and view is fitted once in a data center for each
   deploy. The address's minute and the site's day bound how many fits run, and a budget how long each runs. A fit any
   of these refuses leaves the address to the app: a page the reader's browser fits, or a card that is not found. */
import { encodePalette } from "@grabient/engine/codec.ts";
import { decodeLegacySeed } from "@grabient/engine/legacy.ts";
import { importLegacy } from "@grabient/engine/legacy-import.ts";
import { parseView, type View, viewSearch } from "@grabient/engine/view.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { checkLimits, type LimitEnv } from "@grabient/server/limits/check.ts";
import { FITTED } from "../../lib/cache.ts";
import { CARD_VERSION } from "../../lib/page-meta.ts";
import { addressParams } from "../files/address.ts";
import { legacySeed } from "./legacy.ts";

/* How many times a fit may measure its error (engine/fit.ts). The old links indexes have shown take 1,410 to 4,892
   measures, 1,579 at the median. The fourteen past 2,000 are near white or near black, and black takes the most. In
   workerd a measure takes about 25 µs: a fit costs 40 to 80 ms of CPU, a black strip's about 120 ms, twice that in a
   new isolate, and none can pass about 0.3 s, a tenth of what a request may spend. */
const FIT_BUDGET = 6000;

/** An old seed no map holds, the view its address asks for, and whether the address is its share card's. */
export interface OldFit {
  seed: string;
  view: View;
  card: boolean;
}

/** The old `_` seed no map holds that an address names, with the view it asks for: a page's ("/{seed}", the form its
    canonical rule leads to), or a share card's (/api/og?seed=, as grabient.com's pages named them), whose view is its
    style, steps and angle. Null for any other address, which is never fitted. */
export function oldFit(path: string, params: URLSearchParams): OldFit | null {
  const card = path === "/api/og";
  const query = card ? addressParams(params) : params;
  const seed = card ? (query.get("seed") ?? "") : path.slice(1);
  if (!decodeLegacySeed(seed) || legacySeed(seed)) return null;
  const view = parseView(query);
  return {
    seed,
    view: card ? { style: view.style, steps: view.steps, angle: view.angle } : view,
    card
  };
}

/** The 301 to an old seed's fitted palette at its view, or to its share card: a page's address `at` writes in the
    request's language. Null when a limit or the budget refuses the fit. */
export async function fittedRedirect(
  env: LimitEnv,
  request: Request,
  old: OldFit,
  at: (path: string) => string
): Promise<Response | null> {
  const who = clientAddress(request);
  const allowed = await checkLimits(env, [
    ...(who ? [[`fit:${who}`, "oldLinkFit"] as const] : []),
    ["fit-day", "oldLinkFitDaily"]
  ]);
  const P = allowed?.success ? decodeLegacySeed(old.seed) : null;
  const fit = P && importLegacy(P, FIT_BUDGET);
  if (!fit) return null;
  const seed = encodePalette(fit.palette);
  const view = viewSearch({
    ...old.view,
    steps: Math.max(old.view.steps, fit.palette.anchors.length)
  });
  const to = old.card
    ? new URL(`/api/og?seed=${seed}&v=${CARD_VERSION}${view.replace("?", "&")}`, request.url)
    : at(`/${seed}${view}`);
  return new Response(null, { status: 301, headers: { ...FITTED, Location: to.toString() } });
}
