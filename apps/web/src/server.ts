import "./server/i18n.ts";
import "./server/seo/origin.ts";
import { setAccountMailer } from "@grabient/server/email/send.ts";
import type { Env as AppEnv, Env } from "@grabient/server/env.ts";
import { getRequestEvent } from "@solidjs/web";
import {
  createStartHandler,
  defaultStreamHandler,
  defineHandlerCallback
} from "@tanstack/solid-start/server";
import { NO_STORE } from "./lib/cache.ts";
import { handle } from "./server/pipeline.ts";

export { RateLimiter } from "@grabient/server/limits/rate-limiter.ts";

// sign-in's emails are the app's letters, which load with the first email an isolate sends
setAccountMailer(async (...sent) =>
  (await import("./server/email/letters/account.ts")).accountMailer(...sent)
);

declare module "@solidjs/web" {
  interface RequestEventLocals {
    /** a page's error boundary caught a failure during the render (app/ErrorPage.tsx) */
    renderFailed?: boolean;
    /** the status a page that renders says it answers with: a list past its end, a search cut short, a private
        collection's */
    status?: number;
  }
}

declare global {
  namespace Cloudflare {
    /** What `import { env } from "cloudflare:workers"` holds: the bindings server/env.ts declares. */
    interface Env extends AppEnv {}
  }
}

/* Solid writes the page's data just after its hydration bootstrap, ahead of everything the head names. The data moves
   to the head's end, so the title, the description, the card, the stylesheet and the fonts stand in the document's
   first few kilobytes, where a link preview reads them, and the data still comes before the body and the app. */
function dataLast(html: string): string {
  const boot = html.indexOf("window._$HY||");
  if (boot < 0) return html;
  const from = html.indexOf("</script>", boot) + "</script>".length;
  const to = html.indexOf("<!--xs-->", from);
  const end = html.indexOf("</head>", to);
  if (to <= from || end < 0) return html;
  return html.slice(0, from) + html.slice(to, end) + html.slice(from, to) + html.slice(end);
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
       node a browser extension adds there breaks.

       The page's scripts are preloaded at low priority: at the default they compete with the stylesheet and the fonts,
       and the first paint on a slow connection waits for them. The router's head and Solid's lazy components both
       write these links, so the priority is set here, on the document.

       The router writes each match's id into its script with a NUL for every slash. HTML allows no NUL in a document,
       so each is written as the escape a script reads as the same character. */
    const html = dataLast(await response.text())
      .replace(
        "<head>",
        '<head><meta charset="utf-8"><style>@layer reset, tokens, base, components;</style>'
      )
      .replaceAll('<link rel="modulepreload"', '<link rel="modulepreload" fetchpriority="low"')
      .replaceAll("\0", "\\u0000");
    const headers = new Headers(response.headers);
    const locals = getRequestEvent()?.locals;
    const failed = locals?.renderFailed === true;
    if (failed) for (const [name, value] of Object.entries(NO_STORE)) headers.set(name, value);
    return new Response(html, {
      status: failed ? 500 : (locals?.status ?? response.status),
      headers
    });
  })
);

export default {
  fetch: (request, env, ctx) => handle(request, env, ctx, async request => start(request)),
  async scheduled(controller, env) {
    // the jobs' steps load with a trigger's run: an isolate that answers requests never needs them
    const { JOBS } = await import("./server/jobs.ts");
    const job = JOBS[controller.cron];
    if (!job) throw new Error(`No job runs on the schedule ${controller.cron}`);
    await job(env);
  }
} satisfies ExportedHandler<Env>;
