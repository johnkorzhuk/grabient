import {
  EFFECTS,
  type EffectKind,
  type EffectSettings,
  effectEmbedHtml
} from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { createDone } from "@grabient/ui/done.ts";
import { Icon } from "@grabient/ui/Icon.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { createSignal, createUniqueId, For, onSettled, Show } from "solid-js";
import { toast } from "../../app/toast.ts";
import { EffectArt } from "./EffectArt.tsx";
import styles from "./EffectsBand.module.css";
import type { PaletteEditor } from "./editor.ts";
import { effectLabel } from "./effect-page.ts";
import { copyFormat, type Taken } from "./formats.ts";

/* The first frame as the tags' sample shows it: its bytes are the copy's, too many to read */
const STILL_SHOWN: Readonly<Record<EffectKind, string>> = {
  glass: 'url("data:image/webp;base64,…") 50% 50%/cover no-repeat',
  blob: 'url("data:image/svg+xml,…") 50% 50% / 100% 100% no-repeat'
};
/* a page that plays each effect behind it, as the tags make one */
const SAMPLE: Readonly<Record<EffectKind, string>> = {
  glass: "/examples/background",
  blob: "/examples/background-blob"
};
const TIPS = msg(
  "Copy HTML gives the tags that play it behind a web page: its first frame inside the page, so the page paints it at once, and a script that plays it from that frame with WebGL. Without WebGL, or for a reader who asks for less motion, the first frame stays."
);

/** The sheet's band of the effects the palette can play, while its picture shows a gradient: each effect's tile, the
    palette as it would play there with the effect's own settings, its still at rest and moving under the pointer or
    the focus; a press on the picture plays it in the page's own picture, and Copy HTML takes the tags that play it
    behind another page. Under them the tags as a page takes them, for the tile last reached, and a sample page. */
export function EffectsBand(props: {
  editor: PaletteEditor;
  taken: () => Taken;
  used: (action: "copy" | "download", format: string) => void;
}) {
  const e = props.editor;
  const fx = e.effects;
  const heading = createUniqueId();
  /* the tile the reader reached last, whose tags the sample shows */
  const [about, setAbout] = createSignal<EffectKind>("glass");
  /* the sample names this site, which only the browser knows */
  const [origin, setOrigin] = createSignal<string | null>(null);
  onSettled(() => {
    setOrigin(location.origin);
  });
  const show = (kind: EffectKind) => {
    e.clearPeek();
    fx.choose(kind);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
  };
  const copyHtml = (kind: EffectKind) =>
    copyFormat("html", { ...props.taken(), effect: { kind, ...fx.settings(kind) } }).then(
      () => {
        props.used("copy", "html");
        return true;
      },
      () => {
        toast(t("Couldn't copy the palette."));
        return false;
      }
    );
  const sample = () => {
    const at = origin();
    if (!at) return "";
    const kind = about();
    return effectEmbedHtml(
      at,
      e.seed(),
      { kind, ...fx.settings(kind) },
      e.angle(),
      STILL_SHOWN[kind]
    );
  };
  return (
    <section class={styles.band} aria-labelledby={heading}>
      <Text variant="title" as="h2" id={heading}>
        {t("Effects")}
      </Text>
      <div class={styles.tiles}>
        <For each={EFFECTS}>
          {kind => (
            <Tile
              kind={kind}
              palette={e.shownPalette()}
              settings={fx.settings(kind)}
              angle={e.angle()}
              onReach={() => setAbout(kind)}
              onShow={() => show(kind)}
              onCopy={() => copyHtml(kind)}
            />
          )}
        </For>
      </div>
      <div class={styles.tips}>
        <p class={styles.note}>{t(TIPS)}</p>
        <Show when={sample()}>
          <pre class={styles.code}>
            <code>{sample()}</code>
          </pre>
        </Show>
        <a class={styles.sample} href={SAMPLE[about()]}>
          {t("See a sample page")}
        </a>
      </div>
    </section>
  );
}

function Tile(props: {
  kind: EffectKind;
  palette: Palette;
  settings: EffectSettings;
  angle: number;
  onReach: () => void;
  onShow: () => void;
  onCopy: () => Promise<boolean>;
}) {
  const [active, setActive] = createSignal(false);
  const [done, mark] = createDone();
  const name = () => effectLabel(props.kind);
  const reach = (on: boolean) => {
    setActive(on);
    if (on) props.onReach();
  };
  return (
    <figure class={styles.tile}>
      <button
        type="button"
        class={styles.picture}
        data-bare={props.kind === "blob" && props.settings.look.bg === null ? "" : undefined}
        aria-label={t("Show the palette as {name}", { name: name() })}
        onPointerEnter={() => reach(true)}
        onPointerLeave={() => reach(false)}
        onFocus={() => reach(true)}
        onBlur={() => reach(false)}
        onClick={() => props.onShow()}
      >
        <EffectArt
          kind={props.kind}
          palette={props.palette}
          settings={props.settings}
          angle={props.angle}
          active={active()}
        />
      </button>
      <figcaption class={styles.caption}>
        <span class={styles.name}>{name()}</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void props.onCopy().then(ok => ok && mark(true))}
        >
          <Icon name={done() ? "check" : "copy"} size={14} />
          {t("Copy {format}", { format: "HTML" })}
        </Button>
      </figcaption>
    </figure>
  );
}
