import { decodePalette } from "@grabient/engine/codec.ts";
import { effectSoftShare, type Size } from "@grabient/engine/view.ts";
import { t } from "@grabient/i18n";
import { ExportPanel, type ExportSettings } from "@grabient/ui/ExportPanel.tsx";
import { ExportPreview, type PreviewItem } from "@grabient/ui/ExportPreview.tsx";
import type { Format } from "@grabient/ui/FormatStrip.tsx";
import hidden from "@grabient/ui/hidden.module.css";
import { createMemo, type Element, Loading, lazy, onSettled } from "solid-js";
import { cardPicture } from "../../lib/picture.ts";
import { effectLabel } from "../editor/effect-page.ts";
import { effectUnderCss } from "../editor/effect-under.ts";
import { nameOf } from "../gallery/drawing.ts";
import { standsBare } from "../list/card-effect.tsx";
import { useTaken } from "../palette-use/use.ts";
import { copySelection, downloadSelection } from "./export.ts";
import styles from "./Selection.module.css";
import { clearSelection, removeSelected, type SelectedPalette, selection } from "./selection.ts";

/* The selection's export screen: the selection drawn on the stage as it will export, and the export column at its
   right, Close at its head. Its code is no page's start: the page asks for it as the selection is about to open, and
   stands until it has come (SelectionScreen.tsx), which keeps the screen's state, the column's numbers and the size. */

/* the effects' stills, with the first palette that plays one: never a player, as nothing moves here */
const EffectArt = lazy(() => import("../editor/EffectArt.tsx"), { export: "EffectArt" });

/* A palette of the selection as the preview draws it: its gradient as a card draws it, its soft stops and its grain,
   or the still of the effect it played, held at its first frame, blurred by its soft over the gradient its files lay
   under it (none under a blob the page shows through), the grain over it, named as a card playing it is. */
function previewOf(item: SelectedPalette): PreviewItem {
  const picture = cardPicture(item);
  const shown: PreviewItem = {
    id: item.id,
    name: nameOf(item),
    stops: picture.stops,
    style: picture.style,
    angle: item.angle,
    ...(picture.at ? { at: picture.at } : {}),
    ...(picture.grain ? { grain: picture.grain } : {})
  };
  const fx = item.effect;
  const palette = fx ? decodePalette(item.seed) : null;
  if (!fx || !palette) return shown;
  const held = { ...fx, speed: 0 };
  return {
    ...shown,
    name: t("{name}, {style}", { name: shown.name, style: effectLabel(fx.kind) }),
    picture: () => (
      <Loading>
        <EffectArt
          kind={fx.kind}
          palette={palette}
          settings={held}
          angle={item.angle}
          active={false}
          still
        />
      </Loading>
    ),
    ...(item.soft
      ? {
          blur: effectSoftShare(item.soft),
          ...(standsBare(fx)
            ? {}
            : { under: effectUnderCss(palette, fx.kind, item.angle, item.soft) })
        }
      : {})
  };
}

/** While the column covers the page (a narrow screen, where it is fixed), the page beneath it is inert, so the
    keyboard stays in the column. Returns the way out. */
function inertBehind(panel: HTMLElement): () => void {
  const marked: HTMLElement[] = [];
  const release = () => {
    for (const el of marked.splice(0)) el.inert = false;
  };
  const apply = () => {
    release();
    const main = panel.closest("main");
    if (!main || getComputedStyle(panel).position !== "fixed") return;
    for (let el: HTMLElement | null = panel; el && el !== main; el = el.parentElement) {
      for (const sibling of el.parentElement?.children ?? []) {
        if (sibling !== el && sibling instanceof HTMLElement && !sibling.inert) {
          sibling.inert = true;
          marked.push(sibling);
        }
      }
    }
  };
  let frame = 0;
  const later = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  };
  apply();
  window.addEventListener("resize", later);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", later);
    release();
  };
}

/** The export column's place, which makes the page beneath inert while the column covers it. */
function Covering(props: { children: Element }) {
  let box!: HTMLDivElement;
  onSettled(() => {
    const panel = box.firstElementChild;
    return panel instanceof HTMLElement ? inertBehind(panel) : undefined;
  });
  return (
    <div ref={box} class={styles.covering}>
      {props.children}
    </div>
  );
}

/** The export screen while the selection stands, in the page's content's place. */
export function ExportScreen(props: {
  settings: ExportSettings;
  onSettings: (next: ExportSettings) => void;
  /** what Auto is: the page's own picture, where it has one */
  autoSize: Size | undefined;
  /** the page's status line: what the selection could not do */
  note: (message: string) => void;
  /** the column's Save side */
  save?: Element;
  onClose: () => void;
}) {
  const previews = createMemo(() => selection().map(previewOf));
  const copy = (format: Format) =>
    copySelection(selection(), props.settings, format, props.autoSize).then(
      done => {
        if (done === "downloaded")
          props.note(t("Images can't be copied here, so the file was downloaded."));
        useTaken(
          done === "downloaded" ? "download" : "copy",
          format,
          { surface: "selection" },
          selection()
        );
        return done === "copied";
      },
      (reason: unknown) => {
        props.note(reason instanceof Error ? reason.message : t("Couldn't copy the selection."));
        return false;
      }
    );
  const download = (format: Format) =>
    void downloadSelection(selection(), props.settings, format, props.autoSize).then(
      () =>
        useTaken(
          format === "url" ? "copy" : "download",
          format,
          { surface: "selection" },
          selection()
        ),
      (reason: unknown) =>
        props.note(reason instanceof Error ? reason.message : t("Couldn't download the selection."))
    );
  return (
    <main class={styles.screen} data-beside-scrollbar="">
      <h1 class={hidden.text}>{t("Selection")}</h1>
      <div class={styles.stage}>
        <div class={styles.fit}>
          <ExportPreview
            items={previews()}
            settings={props.settings}
            autoSize={props.autoSize}
            onRemove={removeSelected}
          />
        </div>
      </div>
      <div class={styles.column}>
        <Covering>
          <ExportPanel
            count={selection().length}
            settings={props.settings}
            onSettings={props.onSettings}
            onClear={clearSelection}
            onCopy={copy}
            onDownload={download}
            save={props.save}
            autoSize={props.autoSize}
            onClose={props.onClose}
            preview={
              <ExportPreview
                items={previews()}
                settings={props.settings}
                autoSize={props.autoSize}
                onRemove={removeSelected}
              />
            }
          />
        </Covering>
      </div>
    </main>
  );
}
