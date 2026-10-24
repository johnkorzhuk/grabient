import type { Locale } from "@grabient/i18n";
import type { Env } from "@grabient/server/env.ts";

/* The visits' counting (visits.ts), loaded the first time there is one to count: an isolate starts, and answers Start's
   first request, without it. Counting never fails a request. */

type Counts = Pick<Env, "USAGE" | "CACHE" | "DEPLOYMENT" | "GA4_API_SECRET" | "GA4_MEASUREMENT_ID">;

/** The call every page's script makes right after its first render (features/account/session.ts). */
const SESSION_CHECK = "/api/auth/get-session";

/** A page a browser navigated to, counted after its answer (ctx.waitUntil), and the page's own session check, which
    says its browser ran it (visits.ts `checkedSession`). */
export async function countPage(
  env: Counts,
  request: Request,
  path: string,
  locale: Locale,
  answered: Response,
  tracking: string
): Promise<void> {
  if (!env.USAGE || request.method !== "GET") return;
  try {
    if (path === SESSION_CHECK) {
      if (answered.status !== 200) return;
      const { checkedSession } = await import("./visits.ts");
      await checkedSession(env, request);
      return;
    }
    if (request.headers.get("Sec-Fetch-Mode") !== "navigate") return;
    const { countVisit, pageVisit } = await import("./visits.ts");
    const visit = pageVisit(request, path, locale, answered, tracking);
    if (visit) await countVisit(env, request, visit);
  } catch {
    // counted by no one
  }
}

/** A palette used or a search made on one of the site's pages. */
export async function countAct(
  env: Counts,
  request: Request,
  what: "use" | "search"
): Promise<void> {
  if (!env.USAGE) return;
  try {
    const { actVisit, countVisit } = await import("./visits.ts");
    const visit = actVisit(request, what);
    if (visit) await countVisit(env, request, visit);
  } catch {
    // counted by no one
  }
}
