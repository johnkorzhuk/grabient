import { locale, localizePath, splitLocale } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { QueryClientProvider } from "@tanstack/solid-query";
import { createRouter, defaultStringifySearch } from "@tanstack/solid-router";
import { ErrorPage } from "./app/ErrorPage.tsx";
import { createQueryClient } from "./lib/query.ts";
import { routeTree } from "./routeTree.gen.ts";

/** Called once per request on the server and once in the browser. The QueryClient rides in the route context, so a
    loader fills the cache the page then reads, and QueryClientProvider carries the server's cache into the document. */
export function getRouter() {
  const queryClient = createQueryClient();
  return createRouter({
    routeTree,
    context: { queryClient },
    /* Routes are addresses without the language: the router takes the prefix off what it reads and puts the page's
       language on every address it writes, links and redirects included. */
    rewrite: {
      input: ({ url }) => {
        url.pathname = splitLocale(url.pathname).path;
        return url;
      },
      output: ({ url }) => {
        url.pathname = localizePath(url.pathname, locale());
        return url;
      }
    },
    /* A parameter that is a word alone, `?selection`, keeps that form in the browser, in the address bar and on every
       navigation. On the server the router writes `selection=`, as Start reads a request's query: it redirects a
       request to its own writing of the address, and the bare word there would redirect the request to itself. */
    stringifySearch: search =>
      isServer
        ? defaultStringifySearch(search)
        : defaultStringifySearch(search).replace(/=(?=&|$)/g, ""),
    defaultPreload: "intent",
    // Query decides whether a preloaded page's data is still fresh
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultErrorComponent: ErrorPage,
    Wrap: props => <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
  });
}

declare module "@tanstack/solid-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
