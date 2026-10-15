/* Old `_` links no map holds, fitted on the Worker as the reader's browser fits them (engine/legacy-import.ts), so a
   crawler or a link preview lands on the palette too. A fit is deterministic, so its 301 is kept at the edge and by the
   browser (lib/cache.ts): each old seed and view is fitted once in a data center for each deploy. The address's minute
   and the site's day bound how many fits run, and a budget how long each runs. A fit any of these refuses leaves the
   address to the app, whose page the reader's browser fits. */
import { encodePalette } from "@grabient/engine/codec.ts";
import { decodeLegacySeed } from "@grabient/engine/legacy.ts";
import { importLegacy } from "@grabient/engine/legacy-import.ts";
import { parseView, type View, viewSearch } from "@grabient/engine/view.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { checkLimits, type LimitEnv } from "@grabient/server/limits/check.ts";
import { FITTED } from "../../lib/cache.ts";
import { legacySeed } from "./legacy.ts";

/* How many times a fit may measure its error (engine/fit.ts). Every old link an index has shown takes 1,410 to 1,700,
   but a flat strip (black, or one color), which takes 4,892; a measure takes 20 to 50 µs, so a fit costs 30 to 80 ms
   of CPU and never much more than 0.3 s, a tenth of what a request may spend. */
const FIT_BUDGET = 6000;

/** An old seed no map holds, and the view its address asks for. */
export interface OldFit {
  seed: string;
  view: View;
}

/** The old `_` seed no map holds at a page's address ("/{seed}", the form its canonical rule leads to), with the view
    its query asks for; null for any other address, which is never fitted. */
export function oldFit(path: string, params: URLSearchParams): OldFit | null {
  const seed = path.slice(1);
  return decodeLegacySeed(seed) && !legacySeed(seed) ? { seed, view: parseView(params) } : null;
}

/** The 301 to an old seed's fitted palette at its view, an address `at` writes in the request's language; null when a
    limit or the budget refuses the fit. */
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
  const steps = Math.max(old.view.steps, fit.palette.anchors.length);
  const to = at(`/${encodePalette(fit.palette)}${viewSearch({ ...old.view, steps })}`);
  return new Response(null, { status: 301, headers: { ...FITTED, Location: to } });
}
