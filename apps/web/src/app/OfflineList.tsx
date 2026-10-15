import { localHref, msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { For, Show } from "solid-js";
import { account } from "../features/account/session.ts";
import { inView } from "../features/list/appearance.ts";
import list from "./list.module.css";

/** The account's own lists, which open from its copy with no connection. */
const WAYS = {
  palettes: { path: "/palettes/saved", label: msg("Saved palettes") },
  collections: { path: "/collections/saved", label: msg("Your collections") }
} as const;
type Way = keyof typeof WAYS;

/** The ways that open with no connection, for a reader with an account. */
export function OfflineWays(props: { ways: readonly Way[] }) {
  return (
    <Show when={account()}>
      <div class={list.ways}>
        <For each={props.ways}>
          {way => (
            <Button size="lg" href={localHref(inView(WAYS[way].path))}>
              {t(WAYS[way].label)}
            </Button>
          )}
        </For>
      </div>
    </Show>
  );
}

/** In a list's place while it stands unread for want of a connection (connection.ts): why, and the ways that open. */
export function OfflineList(props: { ways: readonly Way[] }) {
  return (
    <div class={list.empty}>
      <Text variant="h3" as="h2">
        {t("You're offline.")}
      </Text>
      <Text variant="body">{t("This list opens offline once you've seen it online.")}</Text>
      <OfflineWays ways={props.ways} />
    </div>
  );
}
