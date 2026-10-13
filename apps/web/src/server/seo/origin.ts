import { env } from "cloudflare:workers";
import { RequestContext, type RequestEvent } from "@solidjs/web";
import { setOriginSource } from "../../lib/page-meta.ts";
import { publicOrigin } from "./site.ts";

/* Page metadata names the deploy's public origin, read from the request being rendered. Solid keeps that request in
   an AsyncLocalStorage under RequestContext; asked directly, it says there is none outside a request, where
   getRequestEvent() would warn. Imported by server.ts before anything renders. */
const requests = () =>
  (globalThis as { [RequestContext]?: { getStore(): RequestEvent | undefined } })[RequestContext];

setOriginSource(() => publicOrigin(env, requests()?.getStore()?.request));
