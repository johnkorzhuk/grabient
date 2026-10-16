import { delocalizePath, localHref, msg, t } from "@grabient/i18n";
import { Backdrop } from "@grabient/ui/Backdrop.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import { BarLight } from "@grabient/ui/contexts.ts";
import { Header } from "@grabient/ui/Header.tsx";
import { KeyList } from "@grabient/ui/KeyList.tsx";
import { keyRow } from "@grabient/ui/keymap.ts";
import type { Binding } from "@grabient/ui/keys.ts";
import { rowKeys, showKeys } from "@grabient/ui/keys.ts";
import { reducedMotion, syncMotion } from "@grabient/ui/motion.ts";
import { PageRoot } from "@grabient/ui/PageRoot.tsx";
import { Shader } from "@grabient/ui/Shader.tsx";
import { SkipLink, SkipTarget } from "@grabient/ui/SkipLink.tsx";
import { swatchesOpen } from "@grabient/ui/swatch-book.ts";
import { ThemeIcon } from "@grabient/ui/ThemeIcon.tsx";
import {
  setThemeOrigin,
  syncTheme,
  theme,
  themeChanging,
  toggleTheme
} from "@grabient/ui/theme.ts";
import { Dynamic } from "@solidjs/web";
import { Outlet, useLoaderData, useLocation, useMatches, useRouter } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  Loading,
  lazy,
  onSettled,
  Show,
  untrack
} from "solid-js";
import { account } from "../features/account/session.ts";
import { trackEvent, withheld } from "../features/analytics/analytics.ts";
import { consentDue } from "../features/analytics/consent.ts";
import {
  AppearanceContext,
  createAppearance,
  inView,
  recallView
} from "../features/list/appearance.ts";
import { syncColorFormat } from "../lib/color-format.ts";
import { preciseNames } from "../lib/color-names.ts";
import type { Drawn } from "../lib/palette.ts";
import { hexesOf } from "../lib/palette.ts";
import { AccountMenu } from "./AccountMenu.tsx";
import { offline, watchConnection } from "./connection.ts";
import { EmbedNotice } from "./EmbedNotice.tsx";
import { framed } from "./framed.ts";
import { createSiteKeys } from "./keys.ts";
import { pageInEveryLanguage } from "./language.ts";
import { watchNavigation } from "./navigation.ts";
import styles from "./Shell.module.css";
import type { Shell as ShellApi } from "./shell.ts";
import { pageFrom, ShellContext } from "./shell.ts";
import { Toast } from "./Toast.tsx";
import { walkSelection } from "./undo.ts";
import { createWater } from "./water.ts";

/* The frame every page stands in, mounted once and kept as pages change under it: the privacy banner, the water behind
   the page, the header with the wordmark and its corner, the keys, the line toasts write to, and the embed notice. A
   route says how it is framed (shell.ts); the page's own content, with its footer, is the Outlet. */

/** The bar reads at most this many palettes. */
const PAINTED = 8;
const THEME = keyRow("theme")!;
const ConsentBanner = lazy(() =>
  import("./ConsentBanner.tsx").then(m => ({ default: m.ConsentBanner }))
);

/** The header's word for a page with no connection. */
const offlineStatus = () => (offline() ? t("Offline") : undefined);

export function Shell() {
  const router = useRouter();
  const matches = useMatches();
  const location = useLocation();
  /* The page as the document drew it until the frame is live, so the frame hydrates what the server sent: with no
     connection the service worker answers a page it never kept with Saved's document. Live, the page on screen. */
  const drawnAt = untrack(useLoaderData({ from: "__root__" })).drawn;
  const [live, setLive] = createSignal(false);
  const page = createMemo(() =>
    pageFrom(live() || drawnAt === location().pathname ? matches() : router.matchRoutes(drawnAt))
  );
  const frame = () => page().options.frame ?? "app";
  const brand = () => frame() !== "app";

  /* what the page hands in while it is mounted: its palettes over its loader's, and its keys */
  const [handed, setHanded] = createSignal<(() => readonly Drawn[] | null) | null>(null);
  const [own, setOwn] = createSignal<(() => readonly Binding[]) | null>(null);
  const drawn = createMemo((): readonly Drawn[] => handed()?.() ?? page().painted);
  const palettes = createMemo(() => drawn().slice(0, PAINTED).map(hexesOf));
  const water = createWater({ palettes, brand });
  const keys = createSiteKeys(() => own()?.() ?? []);
  const look = createAppearance(() => drawn()[0] ?? null);

  const shell: ShellApi = {
    paint(source) {
      onSettled(() => {
        setHanded(() => source);
        return () => setHanded(now => (now === source ? null : now));
      });
    },
    keys(bindings) {
      onSettled(() => {
        setOwn(() => bindings);
        return () => setOwn(now => (now === bindings ? null : now));
      });
    },
    here: () => pageInEveryLanguage(location().pathname + location().searchStr, !page().lost),
    translated: () =>
      !!page().options.translated && !new URLSearchParams(location().searchStr).has("q")
  };

  /* the tab's icon wears what the page paints (tab-icon.ts). The server wrote the first one, so the code that draws
     it is asked for when a page first changes it; where no connection brings it, the icon stays as it is */
  createEffect(
    () => ({
      frame: frame(),
      path: location().pathname,
      words: new URLSearchParams(location().searchStr).get("q") ?? "",
      seeds: drawn().map(palette => palette.seed)
    }),
    tab => {
      if (import.meta.env.SSR) return;
      void import("./tab-icon.ts").then(
        icon => icon.showIcon(tab),
        () => {}
      );
    },
    { defer: true }
  );

  /* the swatch files open on a strip: the colors' precise names are read now, so the file pressed next has them */
  createEffect(swatchesOpen, open => {
    if (open) void preciseNames();
  });

  /* the page has scrolled under the header: a brand header takes its surface, so the wordmark never sits on the text */
  const [scrolled, setScrolled] = createSignal(false);
  let bar: SVGRectElement | undefined;
  onSettled(() => {
    /* the theme, motion and color spelling start at the server's values, so the page hydrates as it was sent; once it
       is live they are the browser's own */
    setLive(true);
    syncTheme();
    syncMotion();
    syncColorFormat();
    recallView();
    watchConnection();
    /* while the address holds the selection over the page, an undo walks only the steps made in it */
    walkSelection(() => new URLSearchParams(location().searchStr).has("selection"));
    const leave = watchNavigation(router);
    let frameId = 0;
    const read = () => {
      frameId = 0;
      setScrolled(scrollY > 0);
    };
    const onScroll = () => {
      frameId ||= requestAnimationFrame(read);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    read();
    return () => {
      leave();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frameId);
    };
  });

  /* where the wordmark leads: the home in the reader's view, or with no connection a signed-in reader's Saved palettes */
  const home = () =>
    offline() && account()
      ? { href: localHref(inView("/palettes/saved")), label: t("Saved palettes") }
      : { href: localHref(inView("/")), label: t("home") };
  /* under reduced motion only the brand pages whose sheet stands on the water keep it, as one still frame */
  const waterOff = () => reducedMotion() && !page().options.still && !page().options.moving;
  /* the privacy banner, while the reader's region wants it and this browser holds no choice (consent.ts). The server
     draws none, since every reader is sent the same page, so it waits for the frame to be live. It stays out of
     another site's frame, out of the pages analytics stays out of, and off Settings, whose Privacy section holds every
     choice */
  const consentShown = () =>
    live() &&
    consentDue() &&
    delocalizePath(location().pathname).path !== "/settings" &&
    !withheld() &&
    !framed();

  return (
    <ShellContext value={shell}>
      <AppearanceContext value={look}>
        <PageRoot>
          <SkipLink />
          <Show when={consentShown()}>
            <Loading>
              <ConsentBanner strip={!!page().options.strip} />
            </Loading>
          </Show>
          <Shader
            bar={() => bar}
            paint={water.paint()}
            onReady={water.setLit}
            onStops={water.setInk}
            off={waterOff}
            moves={() => !!page().options.moving}
          />
          <Show when={water.lit() === false}>
            <Backdrop stops={water.light()} strong={frame() === "sheet"} />
          </Show>
          <BarLight value={water.light}>
            <Header
              stops={water.light()}
              brand={brand()}
              scrolled={scrolled()}
              lit={!!water.lit()}
              moves={!!page().options.moving}
              rule
              home={home()}
              status={offlineStatus()}
              barRef={el => {
                bar = el;
              }}
            >
              <div class={styles.corner}>
                <Show when={page().options.corner}>
                  {corner => <Dynamic component={corner()} />}
                </Show>
                {/* the theme button's place, where a key's change of theme arrives from */}
                <span class={styles.spot} ref={el => setThemeOrigin(() => el)}>
                  <Button
                    icon
                    size="lg"
                    aria-label={t(theme() === "dark" ? msg("Light theme") : msg("Dark theme"))}
                    tip={t("Theme · {key}", { key: showKeys(rowKeys(THEME)) })}
                    onClick={e => {
                      const next = toggleTheme(e.currentTarget as HTMLElement);
                      if (next) trackEvent("change_setting", { setting: "theme", value: next });
                    }}
                  >
                    <ThemeIcon dark={theme() === "dark"} moving={themeChanging()} />
                  </Button>
                </span>
                <Show when={frame() !== "sheet"}>
                  <AccountMenu path={shell.here} />
                </Show>
              </div>
            </Header>
            <SkipTarget />
            <Outlet />
          </BarLight>
          <Show when={keys.rows()}>{rows => <KeyList rows={rows()} onClose={keys.close} />}</Show>
          <Toast />
          <EmbedNotice strip={!!page().options.strip} />
        </PageRoot>
      </AppearanceContext>
    </ShellContext>
  );
}
