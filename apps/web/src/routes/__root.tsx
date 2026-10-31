import "@grabient/ui/tokens.css";
import "@grabient/ui/base.css";
import catalogs from "virtual:i18n/assets";
import { delocalizePath, LOCALE_INFO, locale, t } from "@grabient/i18n";
import { motionScript } from "@grabient/ui/motion.ts";
import { scrollbarScript } from "@grabient/ui/scrollbar.ts";
import { themeScript } from "@grabient/ui/theme.ts";
import { isServer, type JSX } from "@solidjs/web";
import type { QueryClient } from "@tanstack/solid-query";
import { createRootRouteWithContext, HeadContent, redirect, Scripts } from "@tanstack/solid-router";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { newerBuild } from "../app/build-watch.ts";
import { NotFound } from "../app/NotFound.tsx";
import { Shell } from "../app/Shell.tsx";
import { pageFrom } from "../app/shell.ts";
import type { SiteFacts } from "../app/site.ts";
import { iconLinks } from "../app/tab-icon.ts";
import { NO_STORE } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";
import { readSite } from "../server/site/facts.ts";

/** An old grabient.com id: one segment that starts with `_` or `~`. */
const OLD_ID = /^\/[_~][A-Za-z0-9_-]{6,}$/;
/** Poppins at the two weights the site sets text in; the latin-ext files load only for the letters they hold. */
const FONTS = ["/fonts/poppins-latin-500-normal.woff2", "/fonts/poppins-latin-700-normal.woff2"];

/* The site's facts are read once, before the first render, and ride in the document: the browser never asks again. */
const siteFacts = createIsomorphicFn()
  .server(readSite)
  .client((): SiteFacts => ({ stars: null, newsletter: false }));

/* The tab's icon in the colors the page's loader paints, or the week's (app/tab-icon.ts). Only the server names it:
   the frame sets these two links by hand as the page changes, which a head that named them again would undo. */
const tabIcons = createIsomorphicFn()
  .server((matches: Parameters<typeof pageFrom>[0], path: string, words: string) => {
    const page = pageFrom(matches);
    return iconLinks({
      frame: page.options.frame ?? "app",
      path,
      words,
      seeds: page.painted.map(palette => palette.seed)
    });
  })
  .client((): ReturnType<typeof iconLinks> => []);

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // a deploy happened since this page loaded: the next page loads whole, with the build that serves it
  beforeLoad: ({ location }) => {
    if (newerBuild()) throw redirect({ href: location.publicHref, reloadDocument: true });
  },
  /* the site's facts, and the address the document is drawn for, which the frame hydrates as (app/Shell.tsx) */
  loader: async ({ location }) => ({ ...(await siteFacts()), drawn: location.pathname }),
  staleTime: Number.POSITIVE_INFINITY,
  shouldReload: false,
  // a page says how long it may be kept; one that says nothing is kept nowhere
  headers: () => NO_STORE,
  head: ({ matches, loaderData }) => {
    const language = LOCALE_INFO[locale()];
    const catalog = catalogs[language.tag];
    const leaf = matches[matches.length - 1];
    /* an address no page answers is named as it came, an old grabient.com id as a palette not found */
    const at = isServer ? (loaderData?.drawn ?? "/") : delocalizePath(location.pathname).path;
    const lost = matches.some(m => m.status === "notFound" || m._notFound)
      ? pageHead({ kind: OLD_ID.test(at) ? "legacy" : "notfound", path: at })
      : { meta: [], links: [] };
    return {
      meta: [
        // viewport-fit=cover runs the page under a notch and makes the safe-area insets real; pinch zoom stays
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "color-scheme", content: "light dark" },
        { name: "theme-color", content: "#0c0c0e" },
        { title: "Grabient" },
        { name: "google-adsense-account", content: "ca-pub-2436216252635443" },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "Grabient" },
        { property: "og:locale", content: language.og },
        ...lost.meta
      ],
      links: [
        // the bar on no ground for Safari and Google Search (its sizes keeps Chrome on the SVG), then light and dark marks
        { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
        ...tabIcons(matches, leaf.pathname, String((leaf.search as { q?: unknown }).q ?? "")),
        { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
        // browsers keep the manifest and its icons a week, so its v and its icons' change when they are drawn anew
        { rel: "manifest", href: "/site.webmanifest?v=2" },
        ...FONTS.map(href => ({
          rel: "preload",
          href,
          as: "font" as const,
          type: "font/woff2",
          crossorigin: "anonymous" as const
        })),
        {
          rel: "alternate",
          type: "text/plain",
          href: "/llms.txt",
          title: t("Guide for AI agents")
        },
        { rel: "ai-catalog", href: "/.well-known/ai-catalog.json" },
        ...lost.links
      ],
      /* before the first paint: the reader's theme and motion on <html>, and whether scrollbars take room. Then the
         page's messages, asked for while the head is read so the app starts in its language at once: a fetch the app
         takes up (client.tsx), where a preload that the service worker answers is fetched twice */
      scripts: [
        { children: themeScript },
        { children: motionScript },
        { children: scrollbarScript },
        ...(catalog ? [{ children: `self.$catalog=fetch(${JSON.stringify(catalog)})` }] : [])
      ]
    };
  },
  shellComponent: Document,
  component: Shell,
  /* The root's alone answers a page that throws notFound(), inside the frame. A page route with a not-found component of
     its own wraps its content in a boundary that rethrows every other error, and the server then sends a failed page as
     an empty 200 instead of a 500. */
  notFoundComponent: NotFound
});

/** The document. Its <head> holds HeadContent alone: an element written there by hand would be hydrated by position,
    and browser extensions add nodes to <head> as a page loads. One element holds the app, so a node an extension puts
    at the start of <body> breaks no hydration either. */
function Document(props: { children?: JSX.Element }) {
  const language = LOCALE_INFO[locale()];
  return (
    <html lang={language.tag} dir={language.dir}>
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app">{props.children}</div>
        <Scripts />
      </body>
    </html>
  );
}
