import { AppPage } from "@grabient/ui/AppPage.tsx";
import { announce } from "@grabient/ui/announce.ts";
import { Backdrop } from "@grabient/ui/Backdrop.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import { createBarCycle } from "@grabient/ui/barcycle.ts";
import { copyText } from "@grabient/ui/copy.ts";
import { t } from "@grabient/ui/i18n.ts";
import { KeyList } from "@grabient/ui/KeyList.tsx";
import { installKeys, type KeyRow, sharedKeys } from "@grabient/ui/keys.ts";
import { PageRoot } from "@grabient/ui/PageRoot.tsx";
import { Segmented } from "@grabient/ui/Segmented.tsx";
import { SkipLink } from "@grabient/ui/SkipLink.tsx";
import { ThemeIcon } from "@grabient/ui/ThemeIcon.tsx";
import { setThemeOrigin, theme, themeChanging, toggleTheme } from "@grabient/ui/theme.ts";
import { createEffect, createSignal, Match, onSettled, Show, Switch } from "solid-js";
import styles from "./App.module.css";
import { PAGES } from "./contents.ts";
import { DocPage } from "./doc/DocPage.tsx";
import { Components } from "./pages/Components.tsx";
import { Cover } from "./pages/Cover.tsx";
import { Foundations } from "./pages/Foundations.tsx";
import { createRouter } from "./router.ts";
import { supply } from "./samples.ts";

/* The document's one shell, an app page of grabient.com: the header and its bar cycling through palettes, the pages
   and the theme in its corner, then the page. A change of page swaps the page alone, so the bar carries on. The keys
   are the site's own: T for the theme, U for the address, ? for the list. The light behind the paper is the site's
   Backdrop, still on one palette: the water is not drawn here, and a wash that tweened with the bar would blur the
   whole page again on every frame of a tween. */
export function App() {
  const router = createRouter();
  const palettes = supply();
  const stops = createBarCycle(() => palettes);
  const [keys, setKeys] = createSignal<readonly KeyRow[] | null>(null);
  let themeHost!: HTMLSpanElement;
  const copyAddress = async () => {
    if (await copyText(location.href)) announce(t("Copied"));
  };
  createEffect(
    () => router.page(),
    page => {
      document.title = page.id === "cover" ? "Grabient Design" : `${page.title} · Grabient Design`;
    }
  );
  onSettled(() => {
    setThemeOrigin(() => themeHost);
    const stopRouter = router.install();
    const stopKeys = installKeys(
      () => sharedKeys({ theme: () => toggleTheme(), copyUrl: () => void copyAddress() }),
      setKeys
    );
    return () => {
      stopRouter();
      stopKeys();
    };
  });
  return (
    <div class={styles.app}>
      <PageRoot>
        <SkipLink />
        <Backdrop stops={palettes[0] ?? []} />
        <AppPage
          stops={stops()}
          home={{ href: "/", label: "cover" }}
          corner={
            <>
              <Segmented
                size="sm"
                aria-label="Pages"
                value={router.page().id}
                options={PAGES.map(p => ({ value: p.id, label: p.title, href: p.path }))}
                onChange={id => router.go(PAGES.find(p => p.id === id)?.path ?? "/")}
              />
              <span ref={themeHost} class={styles.theme}>
                <Button
                  icon
                  aria-label={theme() === "dark" ? t("Light theme") : t("Dark theme")}
                  tip={t("Theme · {key}", { key: "T" })}
                  turns
                  onClick={e => toggleTheme(e.currentTarget as HTMLElement)}
                >
                  <ThemeIcon dark={theme() === "dark"} moving={themeChanging()} />
                </Button>
              </span>
            </>
          }
        >
          <Switch>
            <Match when={router.page().id === "foundations"}>
              <DocPage page={router.page()}>
                <Foundations />
              </DocPage>
            </Match>
            <Match when={router.page().id === "components"}>
              <DocPage page={router.page()}>
                <Components />
              </DocPage>
            </Match>
            <Match when={router.page().id === "cover"}>
              <Cover />
            </Match>
          </Switch>
        </AppPage>
        <Show when={keys()}>{rows => <KeyList rows={rows()} onClose={() => setKeys(null)} />}</Show>
      </PageRoot>
    </div>
  );
}
