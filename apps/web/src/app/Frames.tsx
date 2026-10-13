import { localHref, t } from "@grabient/i18n";
import { Footer } from "@grabient/ui/Footer.tsx";
import { type FrameLink, PageFrame } from "@grabient/ui/PageFrame.tsx";
import { type Element, onSettled, Show, useContext } from "solid-js";
import { account } from "../features/account/session.ts";
import { inView } from "../features/list/appearance.ts";
import { offline } from "./connection.ts";
import styles from "./Frames.module.css";
import { LanguageMenu } from "./LanguageMenu.tsx";
import { ShellContext } from "./shell.ts";
import { type FramePage, footerLinks, navLinks, siteFacts } from "./site.ts";

/* The two frames a page stands in under the header. An app page (a list, a collection, the 404) is its content with
   the footer's links at the bottom; a brand page (About, Settings and the pages beside them) is a side navigation, one
   frosted pane and the footer (PageFrame). Both end in the language menu. The header, the water and the keys are the
   shell's and stay as pages change. */

type FooterPage = "privacy" | "terms" | "mcp";
const footerPage = (page: string | undefined): FooterPage | null =>
  page === "privacy" || page === "terms" || page === "mcp" ? page : null;

/** The language menu as a frame draws it: this page in every language, which the shell knows. A page that draws its
    own PageFrame (MCP, an app's consent) takes it from here. */
export function Languages() {
  const shell = useContext(ShellContext)!;
  return <LanguageMenu path={shell.here} follow={shell.translated()} disabled={offline()} />;
}

/** The links at the foot of a page, then the language menu. */
export function SiteFooter(props: { page?: FooterPage; note?: Element }) {
  const site = siteFacts();
  return (
    <Footer
      links={footerLinks(props.page ?? null, site().stars, localHref)}
      languages={<Languages />}
      note={props.note}
    />
  );
}

let feeds = 0;

/** An app route's page: its content, then the footer, which rests at the bottom of the screen when the page is
    short. `feed`: a windowed list places its rows itself, and the browser's scroll anchoring would pull the reader up
    as a page joins its end, so anchoring is off while one stands. `bare`: the export screen stands in for the page,
    with no footer under it. */
export function AppPage(props: { feed?: boolean; bare?: boolean; children: Element }) {
  onSettled(() => {
    if (!props.feed) return;
    /* counted, since a feed can settle before the one it replaces is gone */
    if (++feeds === 1) document.documentElement.style.setProperty("overflow-anchor", "none");
    return () => {
      if (--feeds === 0) document.documentElement.style.removeProperty("overflow-anchor");
    };
  });
  return (
    <div class={styles.page}>
      {props.children}
      <Show when={!props.bare}>
        <SiteFooter />
      </Show>
    </div>
  );
}

/** The frame's way home, with the reader's view as the wordmark's; with no connection, a signed-in reader's Saved
    palettes, since the home needs the server. */
export const homeLink = (): FrameLink =>
  offline() && account()
    ? { href: localHref("/palettes/saved"), label: t("Saved palettes") }
    : { href: localHref(inView("/")), label: t("Home") };

/** A brand page's frame: the navigation with `page` marked, the way home over it, the pane, and the footer with the
    language menu. `login` is the sign-in sheet's frame, `open` a page of its own sheets, `note` a line beneath the
    footer. */
export function BrandFrame(props: {
  page?: FramePage | FooterPage | "privacy" | "terms";
  login?: boolean;
  open?: boolean;
  note?: Element;
  children: Element;
}) {
  const site = siteFacts();
  const navPage = () =>
    props.page && props.page !== "privacy" && props.page !== "terms" ? props.page : null;
  return (
    <PageFrame
      nav={navLinks(navPage(), site().stars, localHref)}
      all={homeLink()}
      footer={footerLinks(footerPage(props.page), site().stars, localHref)}
      languages={<Languages />}
      note={props.note}
      login={props.login}
      open={props.open}
    >
      {props.children}
    </PageFrame>
  );
}
