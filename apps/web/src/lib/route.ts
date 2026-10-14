import { getRequestEvent, isServer } from "@solidjs/web";

/* What every page route shares: its search back in the words of its address, which a page reads as the Worker made it
   canonical, and the status a page that renders answers with. */

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

/** The status the page answers with when it is no 200, said as it renders on the server (server.ts answers with it):
    a list past its end, a private or missing collection, a search an allowance cut short. Its words stay on screen. */
export function answerWith(status: number | undefined): void {
  if (!isServer || !status) return;
  const event = getRequestEvent();
  if (event) event.locals.status = status;
}
