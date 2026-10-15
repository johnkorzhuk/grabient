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

/* The page's scripts are asked for once it has painted, which needs none of them: asked for sooner they share the
   connection with the stylesheet and the fonts the first paint waits for. The router's head and Solid's lazy components
   write a preload for each script the page starts with, and the router the entry at the body's end; one inline script
   writes them all there at the first contentful paint, at once on a page that is not painting or in a browser that
   reports no paint, and after ten seconds whatever happens. A preload is asked for at low priority, behind the fonts. */
const STARTER =
  "(function(p,e){var d=document,s=0,P=window.PerformanceObserver;function go(){if(s)return;s=1;" +
  'p.forEach(function(h){var l=d.createElement("link");l.rel="modulepreload";l.href=h;l.fetchPriority="low";' +
  'd.head.appendChild(l)});var t=d.createElement("script");t.type="module";t.src=e;d.body.appendChild(t)}' +
  'if(d.visibilityState!=="visible"||!P||(P.supportedEntryTypes||[]).indexOf("paint")<0)return go();' +
  'addEventListener("visibilitychange",go);setTimeout(go,1e4);new P(function(l,o){' +
  'if(l.getEntriesByName("first-contentful-paint").length){o.disconnect();go()}})' +
  '.observe({type:"paint",buffered:true})})';
const PRELOAD = /<link rel="modulepreload"[^>]*?\shref="([^"]+)"[^>]*>/g;
const ENTRY = /<script type="module" async src="([^"]+)"><\/script>/;

function scriptsAfterPaint(html: string): string {
  const entry = ENTRY.exec(html);
  if (!entry) return html;
  // an attribute's text, where a query's & is written &amp;
  const address = (attribute: string) => attribute.replaceAll("&amp;", "&");
  const preloads: string[] = [];
  const rest = html.replace(PRELOAD, (_, href: string) => {
    preloads.push(address(href));
    return "";
  });
  const scripts = `${JSON.stringify(preloads)},${JSON.stringify(address(entry[1]!))}`;
  return rest.replace(entry[0], () => `<script>${STARTER}(${scripts})</script>`);
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

       The router writes each match's id into its script with a NUL for every slash. HTML allows no NUL in a document,
       so each is written as the escape a script reads as the same character. */
    const html = scriptsAfterPaint(dataLast(await response.text()))
      .replace(
        "<head>",
        '<head><meta charset="utf-8"><style>@layer reset, tokens, base, components;</style>'
      )
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
