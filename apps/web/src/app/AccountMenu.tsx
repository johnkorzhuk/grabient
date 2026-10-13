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
import { createSignal, onSettled, Show } from "solid-js";
import { account, loginHref, signOut } from "../features/account/session.ts";
import { trackSignInPrompt } from "../features/analytics/analytics.ts";
import styles from "./AccountMenu.module.css";
import { offline, opensOffline } from "./connection.ts";
import { chooseLanguage } from "./language.ts";
import { toast } from "./toast.ts";

/* The account's corner of the header: signed out it is the way in, signed in the account's picture, and either way it
   opens one short menu under the header's edge. A visitor gets Settings too, for its privacy choices. Language turns
   the menu into the languages under Back (Escape and the arrow toward the line's start go back too); a choice loads
   the page in that language and is kept. With no connection every row keeps its place, the ones that need the server
   are disabled, and the first says Offline. */
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
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", onEscape, true);
    return () => {
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
  const rows = (): MenuItem[] =>
    account()
      ? [
          { value: "/palettes/saved", label: t("Saved palettes") },
          { value: "/collections/saved", label: t("Your collections") },
          { value: "/settings", label: t("Settings") },
          { value: "/mcp-server", label: "MCP" },
          { value: "/about", label: t("About") },
          language(),
          { value: "signout", label: t("Sign out") }
        ]
      : [
          { value: "signin", label: t("Sign in") },
          { value: "/collections", label: t("Collections") },
          { value: "/settings", label: t("Settings") },
          { value: "/mcp-server", label: "MCP" },
          { value: "/about", label: t("About") },
          language()
        ];
  const languages = (): MenuItem[] =>
    MENU_ORDER.map(l => ({
      value: `lang:${l}`,
      label: LOCALE_INFO[l].name,
      flag: LOCALE_INFO[l].flag,
      lang: LOCALE_INFO[l].tag
    }));
  const items = (): MenuItem[] => {
    if (choosing()) return languages();
    if (!offline()) return rows();
    const all = rows().map(item =>
      item.value.startsWith("/") && !opensOffline(item.value) ? { ...item, disabled: true } : item
    );
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
    if (item.value === "signin") {
      trackSignInPrompt("menu");
      go(loginHref());
    } else if (item.value === "signout") {
      /* a refusal says so: on a shared computer the reader would otherwise walk away signed in */
      signOut(localHref("/")).catch((error: unknown) =>
        toast(error instanceof Error && error.message ? error.message : t("Couldn't sign out."))
      );
    } else go(item.value);
  };
  const name = () => account()?.username || account()?.name || undefined;
  const tip = tooltip(() => (account() ? t("Account") : t("Sign in")));
  return (
    <div ref={host} class={styles.host}>
      <button
        ref={[
          el => {
            trigger = el;
          },
          tip
        ]}
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
