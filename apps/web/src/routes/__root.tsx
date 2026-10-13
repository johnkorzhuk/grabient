import "@grabient/ui/tokens.css";
import "@grabient/ui/base.css";
import catalogs from "virtual:i18n/assets";
import { LOCALE_INFO, locale, t } from "@grabient/i18n";
import { motionScript } from "@grabient/ui/motion.ts";
import { scrollbarScript } from "@grabient/ui/scrollbar.ts";
import { themeScript } from "@grabient/ui/theme.ts";
import type { JSX } from "@solidjs/web";
import type { QueryClient } from "@tanstack/solid-query";
import { createRootRouteWithContext, HeadContent, redirect, Scripts } from "@tanstack/solid-router";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { newerBuild } from "../app/build-watch.ts";
import { NotFound } from "../app/NotFound.tsx";
import { Shell } from "../app/Shell.tsx";
import type { SiteFacts } from "../app/site.ts";
import { NO_STORE } from "../lib/cache.ts";
import { readSite } from "../server/site/facts.ts";

/** Poppins at the two weights the site sets text in; the latin-ext files load only for the letters they hold. */
const FONTS = ["/fonts/poppins-latin-500-normal.woff2", "/fonts/poppins-latin-700-normal.woff2"];

/* The site's facts are read once, before the first render, and ride in the document: the browser never asks again. */
const siteFacts = createIsomorphicFn()
  .server(readSite)
  .client((): SiteFacts => ({ stars: null }));

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // a deploy happened since this page loaded: the next page loads whole, with the build that serves it
  beforeLoad: ({ location }) => {
    if (newerBuild()) throw redirect({ href: location.publicHref, reloadDocument: true });
  },
  loader: () => siteFacts(),
  staleTime: Number.POSITIVE_INFINITY,
  shouldReload: false,
  // a page says how long it may be kept; one that says nothing is kept nowhere
  headers: () => NO_STORE,
  head: () => {
    const language = LOCALE_INFO[locale()];
    const catalog = catalogs[language.tag];
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
        { property: "og:locale", content: language.og }
      ],
      links: [
        // the tile for Safari and Google Search (its sizes keeps Chrome on the SVG), then light and dark marks
        { rel: "icon", href: "/favicon-tile.ico", sizes: "32x32" },
        {
          rel: "icon",
          href: "/favicon.svg",
          type: "image/svg+xml",
          sizes: "any",
          media: "(prefers-color-scheme: light)"
        },
        {
          rel: "icon",
          href: "/favicon-dark.svg",
          type: "image/svg+xml",
          sizes: "any",
          media: "(prefers-color-scheme: dark)"
        },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/site.webmanifest" },
        // the page's messages, fetched while the head is read so the app starts in its language at once
        ...(catalog
          ? [
              {
                rel: "preload",
                href: catalog,
                as: "fetch" as const,
                crossorigin: "anonymous" as const
              }
            ]
          : []),
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
        { rel: "ai-catalog", href: "/.well-known/ai-catalog.json" }
      ],
      /* before the first paint: the reader's theme and motion on <html>, and whether scrollbars take room */
      scripts: [
        { children: themeScript },
        { children: motionScript },
        { children: scrollbarScript }
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
