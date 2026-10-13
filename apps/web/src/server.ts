import "./server/i18n.ts";
import type { Env as AppEnv, Env } from "@grabient/server/env.ts";
import { getRequestEvent } from "@solidjs/web";
import {
  createStartHandler,
  defaultStreamHandler,
  defineHandlerCallback
} from "@tanstack/solid-start/server";
import { NO_STORE } from "./lib/cache.ts";
import { JOBS } from "./server/jobs.ts";
import { handle } from "./server/pipeline.ts";

export { RateLimiter } from "@grabient/server/limits/rate-limiter.ts";

declare module "@solidjs/web" {
  interface RequestEventLocals {
    /** a page's error boundary caught a failure during the render (app/ErrorPage.tsx) */
    renderFailed?: boolean;
  }
}

declare global {
  namespace Cloudflare {
    /** What `import { env } from "cloudflare:workers"` holds: the bindings server/env.ts declares. */
    interface Env extends AppEnv {}
  }
}

/* A page answers once it has rendered whole, so the query cache rides along in the document and the answer can still
   say the render failed: a broken page is a 500 that no cache keeps. */
const start = createStartHandler(
  defineHandlerCallback(async context => {
    const rendered = await defaultStreamHandler(context);
    const response = rendered instanceof Response ? rendered : rendered.response;
    /* <meta charset> leads the document, within its first 1024 bytes, and the design system's order of layers comes
       next, before any stylesheet: the first stylesheet to name a layer would otherwise order them, and the stylesheets
       arrive in the order the build collects them. Written in <head> by hand they would be hydrated by position, which a
       node a browser extension adds there breaks. */
    const html = (await response.text()).replace(
      "<head>",
      '<head><meta charset="utf-8"><style>@layer reset, tokens, base, components;</style>'
    );
    const headers = new Headers(response.headers);
    const failed = getRequestEvent()?.locals.renderFailed === true;
    if (failed) for (const [name, value] of Object.entries(NO_STORE)) headers.set(name, value);
    return new Response(html, { status: failed ? 500 : response.status, headers });
  })
);

export default {
  fetch: (request, env, ctx) => handle(request, env, ctx, async request => start(request)),
  async scheduled(controller, env, ctx) {
    const job = JOBS[controller.cron];
    if (!job) throw new Error(`No job runs on the schedule ${controller.cron}`);
    await job(env, ctx);
  }
} satisfies ExportedHandler<Env>;
