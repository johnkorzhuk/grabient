import {
  LOCALE_INFO,
  type Locale,
  locale,
  localHref,
  localizePath,
  MENU_ORDER,
  msg,
  t
} from "@grabient/i18n";
import { Avatar } from "@grabient/ui/Avatar.tsx";
import { type MenuItem, MenuList } from "@grabient/ui/Menu.tsx";
import { tooltip } from "@grabient/ui/Tooltip.tsx";
import { useRouter } from "@tanstack/solid-router";
import { createMemo, createSignal, onSettled, Show, untrack } from "solid-js";
import {
  account,
  checkAccount,
  engineNow,
  loadAccount,
  loginHref,
  signOut
} from "../features/account/session.ts";
import { syncStatus, viewNow } from "../features/account/state.ts";
import { trackSignInPrompt } from "../features/analytics/analytics.ts";
import { collectionHref } from "../features/collections/address.ts";
import { listPath, listSearch } from "../features/collections/params.ts";
import { readerOrder, recallOrder } from "../features/gallery/order.ts";
import { inView, rememberedView } from "../features/list/appearance.ts";
import { shownError } from "../lib/query.ts";
import styles from "./AccountMenu.module.css";
import { offline, opensOffline } from "./connection.ts";
import { chooseLanguage } from "./language.ts";
import { toast } from "./toast.ts";

/* The account's corner of the header: signed out it is the way in, signed in the account's picture, and either way it
   opens one short menu under the header's edge. A visitor gets Settings too, for its privacy choices. The account's
   changes the server does not hold yet lead the menu: refused, waiting for a sign-in, or waiting to sync. Language
   turns the menu into the languages under Back (Escape and the arrow toward the line's start go back too); a choice
   loads the page in that language and is kept. With no connection every row keeps its place, the ones that need the
   server are disabled, and the first says Offline. */
export function AccountMenu(props: {
  /** this page's address without its language, as the language menu offers it */
  path: () => string;
}) {
  const router = useRouter();
  const [open, setOpen] = createSignal(false);
  const [choosing, setChoosing] = createSignal(false);
  let keep = false;
  let host!: HTMLDivElement;
  let trigger!: HTMLButtonElement;
  onSettled(() => {
    void loadAccount();
    // a look back at the window asks who is signed in, and syncs the account's copy
    const focus = () => checkAccount();
    const away = (e: PointerEvent) => {
      if (open() && !host.contains(e.target as Node)) setOpen(false);
    };
    /* Escape steps back out of the languages first, then closes, the keyboard back on the button */
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !open()) return;
      e.stopPropagation();
      if (choosing()) back();
      else {
        setOpen(false);
        trigger.focus();
      }
    };
    window.addEventListener("focus", focus);
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", onEscape, true);
    return () => {
      window.removeEventListener("focus", focus);
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", onEscape, true);
    };
  });
  const language = (): MenuItem => ({
    value: "language",
    label: t("Language"),
    detail: LOCALE_INFO[locale()].name,
    more: true
  });
  /* the account's changes the server does not hold yet: refused, waiting for the reader to sign in again, or waiting
     to sync, with no connection or before a sync has answered */
  const sync = (): MenuItem[] => {
    const s = syncStatus();
    if (s.refused.length) {
      return [
        {
          value: "sync:refused",
          label: t("{count, plural, one {# change not saved} other {# changes not saved}}", {
            count: s.refused.length
          })
        }
      ];
    }
    if (!s.pending) return [];
    if (s.signedOut) return [{ value: "sync:signin", label: t("Sign in to sync your changes") }];
    return [
      {
        value: "sync:now",
        label: t("{count, plural, one {# change to sync} other {# changes to sync}}", {
          count: s.pending
        }),
        ...(s.online && !s.cutOff ? {} : { detail: t("Offline") })
      }
    ];
  };
  /* the sync's row as it stood when the menu opened: one that a sync settles while the menu is open would leave from
     under a press, moving every row after it */
  const held = createMemo(() => (open() ? untrack(sync) : []));
  const rows = (): MenuItem[] => {
    if (!account()) {
      return [
        { value: "signin", label: t("Sign in") },
        { value: "/collections", label: t("Collections") },
        { value: "/settings", label: t("Settings") },
        { value: "/mcp-server", label: "MCP" },
        { value: "/about", label: t("About") },
        language()
      ];
    }
    const lead = held();
    return [
      ...lead,
      { value: "/palettes/saved", label: t("Saved palettes"), group: lead.length > 0 },
      { value: "/collections/saved", label: t("Your collections") },
      { value: "/settings", label: t("Settings") },
      { value: "/mcp-server", label: "MCP" },
      { value: "/about", label: t("About") },
      language(),
      { value: "signout", label: t("Sign out") }
    ];
  };
  const languages = (): MenuItem[] =>
    MENU_ORDER.map(l => ({
      value: `lang:${l}`,
      label: LOCALE_INFO[l].name,
      flag: LOCALE_INFO[l].flag,
      lang: LOCALE_INFO[l].tag
    }));
  /* with no connection every row keeps its place and the ones that need the server are disabled; the first row says
     why, unless the sync's already does */
  const items = (): MenuItem[] => {
    if (choosing()) return languages();
    if (!offline()) return rows();
    const all = rows().map(item =>
      item.value.startsWith("sync:") || opensOffline(item.value)
        ? item
        : { ...item, disabled: true }
    );
    if (all[0]?.value.startsWith("sync:")) return all;
    return [
      { value: "offline", label: t("Offline"), disabled: true },
      ...all.map((item, i) => (i ? item : { ...item, group: true }))
    ];
  };
  /* a press on Language keeps the menu open on the languages; any other close puts the account's rows back */
  const close = () => {
    if (keep) {
      keep = false;
      return;
    }
    setOpen(false);
    setChoosing(false);
  };
  const back = () => {
    setChoosing(false);
    setTimeout(() =>
      host.querySelector<HTMLElement>('[role="menu"] [data-value="language"]')?.focus()
    );
  };
  const go = (to: string) => void router.navigate({ href: localHref(to) });
  /* the lists open in the reader's view, as the wordmark's home does, and a visitor's Collections in the order the
     reader chose last */
  const listed = (to: string) => {
    if (to !== "/collections") return to.endsWith("/saved") ? inView(to) : to;
    recallOrder();
    return (
      listPath(readerOrder().order, readerOrder().frame) + listSearch({ view: rememberedView() })
    );
  };
  const pick = (item: MenuItem) => {
    if (item.value === "language") {
      keep = true;
      setChoosing(true);
      setTimeout(() =>
        host.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus()
      );
      return;
    }
    if (item.value.startsWith("lang:")) {
      const to = item.value.slice(5) as Locale;
      if (to === locale()) return;
      chooseLanguage(to);
      location.assign(localizePath(props.path(), to));
      return;
    }
    if (item.value === "sync:refused") {
      /* the refusals are set aside, and the row leads to where the latest was, which shows what the server holds: its
         collection while the account has it, else Saved for a like, else the account's collections */
      const latest = syncStatus().refused.at(-1);
      const slug = latest?.slug && viewNow().collections.has(latest.slug) ? latest.slug : null;
      void engineNow()?.dismissRefused();
      go(
        inView(
          slug
            ? collectionHref(slug)
            : latest?.op === "like"
              ? "/palettes/saved"
              : "/collections/saved"
        )
      );
    } else if (item.value === "sync:now") engineNow()?.schedule(0, true);
    else if (item.value === "sync:signin" || item.value === "signin") {
      trackSignInPrompt("menu");
      go(loginHref());
    } else if (item.value === "signout") {
      /* a refusal says so: on a shared computer the reader would otherwise walk away signed in */
      signOut().catch((error: unknown) => toast(shownError(error, msg("Couldn't sign out."))));
    } else go(listed(item.value));
  };
  const name = () => account()?.username || account()?.name || undefined;
  // made here, in the component's scope, so the tip it attaches goes when the menu does
  const tip = tooltip(() => (account() ? t("Account") : t("Sign in")));
  return (
    <div ref={host} class={styles.host}>
      <button
        ref={el => {
          trigger = el;
          tip(el);
        }}
        type="button"
        class={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open() ? "true" : "false"}
        aria-label={t(account() ? msg("Your account") : msg("Sign in"))}
        onClick={() => {
          setChoosing(false);
          setOpen(!open());
        }}
      >
        <Avatar name={name()} src={account()?.image ?? undefined} />
      </button>
      <Show when={open()}>
        <MenuList
          items={items()}
          value={choosing() ? `lang:${locale()}` : undefined}
          align="end"
          dense={choosing()}
          label={t(choosing() ? msg("Language") : msg("Account"))}
          onPick={pick}
          onClose={close}
          back={choosing() ? { label: t("Back"), onBack: back } : undefined}
        />
      </Show>
    </div>
  );
}
