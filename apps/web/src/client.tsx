import catalogs from "virtual:i18n/assets";
import { addCatalog, DEFAULT_LOCALE, isLocale, setLocaleSource } from "@grabient/i18n";
import { hydrate } from "@solidjs/web";
import { hydrateStart, StartClient } from "@tanstack/solid-start/client";
import { watchBuild } from "./app/build-watch.ts";
import { installErrorReports, reportCaught } from "./app/error-report.ts";
import { forgetOldAnalytics } from "./app/forget-analytics.ts";
import { framed } from "./app/framed.ts";
import { guardNavigation } from "./app/navigation.ts";
import { loadAccount } from "./features/account/session.ts";
import { afterBoot } from "./features/editor/boot.ts";
import { loadSoft } from "./lib/soft-load.ts";

/* before anything can fail: an error while the page loads its language or hydrates is reported too */
installErrorReports();
/* before the router takes the history's methods, and before anything can stop the page */
guardNavigation();

/* The app starts inside a function, never with an await at the module's top level: an entry that waits as it loads
   is left a file of its own that only imports the chunk the app is in, one more request before the app starts. */
async function start() {
  /* The browser speaks the document's language, which the Worker wrote on <html lang>, and only that one: a page never
     changes language without a load. The head asked for its catalog, so waiting for it before the app starts usually
     costs nothing; a catalog that cannot be read starts the page in English rather than not at all. */
  const lang = document.documentElement.lang;
  const pageLocale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  setLocaleSource(() => pageLocale);
  const catalog = catalogs[pageLocale];
  if (catalog) {
    try {
      const response = await (window.$catalog ?? fetch(catalog));
      if (response.ok) addCatalog(pageLocale, await response.json());
    } catch {
      // English, below
    }
  }

  /* a picture drawn soft draws with code no other page loads (lib/picture.ts): asked for before the page hydrates, so
     the server's pictures are claimed as they were drawn */
  if (Number(new URLSearchParams(location.search).get("soft")) > 0)
    await loadSoft().catch(() => {});
  /* a palette's examples page reads the field effects' colors as it draws its parts' looks (features/examples/paint.ts),
     with code no other page loads: asked for before it hydrates, as the server drew it with them, with the hero's module
     that hands them to the page and not after it (budget.ts counts both) */
  if (/\/examples\/?$/.test(location.pathname))
    await Promise.all([
      import("./features/examples/hero.ts"),
      import("@grabient/engine/kit/colors.ts")
    ])
      .then(([hero]) => hero.loadKitColors())
      .catch(() => {});
  watchBuild();
  const router = await hydrateStart();
  /* a page's boundary showing its fallback is the one failure the window never hears of: it is reported from here */
  hydrate(() => <StartClient router={router} />, document, { onError: reportCaught });
  /* the account loads after the page has drawn its public form: no page waits on it */
  void loadAccount();
  forgetOldAnalytics();
  /* the service worker that opens the site with no connection, once the page has loaded and drawn its first screen,
     the page idle: a production build's alone, and never in another site's frame, where the browser keeps it apart
     from the site's own. A palette's page asks for it once its editor stands and is drawn (boot.ts). The files it
     keeps at install, every chunk of the build, are fetched while nothing else waits for them, not while the browser
     draws the first screen; and a worker that takes the page over has the browser fetch the picture's files again for
     the editor's first screen, rather than take those the page loaded before it, and the picture they arrive under,
     the glass's whole filter, drawn again */
  if (import.meta.env.PROD && "serviceWorker" in navigator && !framed()) {
    const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 300));
    const register = () =>
      afterBoot(() =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            idle(() => void navigator.serviceWorker.register("/sw.js").catch(() => {}), {
              timeout: 3000
            })
          )
        )
      );
    if (document.readyState === "complete") register();
    else addEventListener("load", register, { once: true });
  }
}

void start();
