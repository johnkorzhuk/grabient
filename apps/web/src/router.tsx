import { locale, localizePath, splitLocale } from "@grabient/i18n";
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
    /* A parameter that is a word alone, `?selection`, keeps its form: the server renders an address only as the router
       would write it, and `selection=` there would send the reader back and forth between the two. */
    stringifySearch: search => defaultStringifySearch(search).replace(/=(?=&|$)/g, ""),
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
