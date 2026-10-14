import { getRequestEvent, isServer } from "@solidjs/web";
import { BROWSER_ONLY, TRACKING_PARAM } from "./links.ts";

/* What every page route shares: its search back in the words of its address, which a page reads as the Worker made it
   canonical, the part of it a page's document is drawn from, and the status a page that renders answers with. */

/** The router's search object as the address wrote it. */
export function searchOf(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(search)) {
    const one = Array.isArray(value) ? value[0] : value;
    if (one !== undefined) params.set(name, typeof one === "string" ? one : JSON.stringify(one));
  }
  const query = params.toString().replace(/=(?=&|$)/g, "");
  return query ? `?${query}` : "";
}

/** The router's search as the server draws a page from it: without a landing's campaign tags, which the Worker takes
    off before the app reads the address, and without the browser's own words (the selection, an editor's locks),
    which the edge leaves out of a page's key. A route's loaderDeps read this alone, so the match a document carries is
    the match the browser finds at every address the edge serves that document for, and hydration claims the page. */
export const drawnSearch = (search: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(search).filter(
      ([name]) => !BROWSER_ONLY.includes(name) && !TRACKING_PARAM.test(name)
    )
  );

/** The status the page answers with when it is no 200, said as it renders on the server (server.ts answers with it):
    a list past its end, a private or missing collection, a search an allowance cut short. Its words stay on screen. */
export function answerWith(status: number | undefined): void {
  if (!isServer || !status) return;
  const event = getRequestEvent();
  if (event) event.locals.status = status;
}
