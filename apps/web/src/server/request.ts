import { RequestContext, type RequestEvent } from "@solidjs/web";

/** The request being answered. Solid keeps it in an AsyncLocalStorage under RequestContext; asked directly, it says
    there is none outside a request (a scheduled job), where getRequestEvent() would warn. */
export const currentRequest = (): RequestEvent | undefined =>
  (globalThis as { [RequestContext]?: { getStore(): RequestEvent | undefined } })[
    RequestContext
  ]?.getStore();
