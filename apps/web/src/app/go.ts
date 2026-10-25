import type { AnyRouter } from "@tanstack/solid-router";

/** The page's router while the frame runs, for code outside a component that sends the reader to another page. */
let running: AnyRouter | null = null;

/** Makes `router` the one goTo moves through, until the way out it returns is taken. */
export function goThrough(router: AnyRouter): () => void {
  running = router;
  return () => {
    if (running === router) running = null;
  };
}

/** Goes to one of the site's pages as a link press does: within the app while it runs, else by loading the page. */
export function goTo(href: string): void {
  if (running) void running.navigate({ href });
  else location.assign(href);
}
