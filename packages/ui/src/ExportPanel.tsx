import { children, createMemo, createSignal, type Element, onSettled, Show } from "solid-js";
import { Button } from "./Button.tsx";
import styles from "./ExportPanel.module.css";
import { EXPORT_DEFAULTS, type ExportSettings, exportLayout } from "./exportgrid.ts";
import { type Format, FormatStrip, SWATCH_CHIPS, stripMode } from "./FormatStrip.tsx";
import { Icon } from "./Icon.tsx";
import { msg, rich, t } from "./i18n.ts";
import { Label } from "./Label.tsx";
import { MenuButton, type MenuItem } from "./Menu.tsx";
import { Scrub } from "./Scrub.tsx";
import { Segmented } from "./Segmented.tsx";
import {
  loadPressedSize,
  normalizeSize,
  parseSide,
  pressedSize,
  pressSize,
  SIZE_MAX,
  SIZE_MIN,
  type Size,
  type SizeRow,
  screenSize,
  sizeLabel,
  sizePresetOf,
  sizeRows
} from "./sizes.ts";
import { Text } from "./Text.tsx";

export { EXPORT_DEFAULTS, type ExportSettings, exportLayout };

/* The export column, the selection's settings and its files, in sections under the dashed rule: the count, Size,
   Layout, then the files. It stands in the editor's side and in a list's export screen; under 1100px of page it is the
   whole viewport under the header, scrolling itself, its head held at the top and its files at the foot within a
   thumb's reach. With `save` the head is a toggle between Save, the collection's side in the settings' place, and
   Export. Width and Height are each palette's size and read Auto a step under their floor. */
const CELL: Size = { width: 1200, height: 720 };

export function ExportPanel(props: {
  /** how many palettes are selected */
  count: number;
  settings: ExportSettings;
  onSettings: (next: ExportSettings) => void;
  onClear?: () => void;
  onCopy?: (format: Format) => unknown;
  onDownload?: (format: Format) => void;
  /** the other side of the head's toggle: the selection kept as a collection, in the settings' place */
  save?: Element;
  /** a seed route: what Auto is, the artwork's own measured size */
  autoSize?: Size;
  /** the image as it will be, shown where the panel is the whole viewport */
  preview?: Element;
  onClose?: () => void;
}) {
  const set = (patch: Partial<ExportSettings>) => props.onSettings({ ...props.settings, ...patch });
  onSettled(loadPressedSize);
  const count = () => Math.max(1, props.count);
  const layout = createMemo(() => exportLayout(props.count, props.settings, props.autoSize));
  /* Auto with what it is, the reader's screen read as the list is drawn, then the presets in their groups */
  const sizes = () => sizeRows(props.autoSize ?? CELL, screenSize());
  const flat = (): SizeRow[] => sizes().flatMap(r => [r, ...(r.items ?? [])]);
  /* the row the size is: the one pressed last while its pixels are the size, else the one the settings name */
  const preset = () => {
    const p = flat().find(r => r.value === pressedSize());
    const s = props.settings;
    return p?.w && p.h && s.preset !== "auto" && s.width === p.w && s.height === p.h
      ? p.value
      : s.preset;
  };
  /* a maker's row names the device the size is, as the account menu's Language names the page's */
  const rows = (): MenuItem[] =>
    sizes().map(p => {
      const device = p.items?.find(x => x.value === preset());
      return {
        ...p,
        label: sizeLabel(p),
        ...(p.items
          ? {
              items: p.items.map(x => ({ ...x, label: sizeLabel(x) })),
              detail: device ? sizeLabel(device) : undefined
            }
          : {})
      };
    });
  const presetLabel = () => {
    const p = flat().find(x => x.value === preset());
    return p ? sizeLabel(p) : t("Custom");
  };
  const pick = (item: MenuItem) => {
    const row = flat().find(r => r.value === item.value);
    pressSize(item.value);
    set(
      row?.w && row.h
        ? { preset: row.value, width: row.w, height: row.h }
        : { preset: "auto", width: "auto", height: "auto" }
    );
  };
  /* Width and Height read Auto at Auto and where a side was lowered past its floor; a number from Auto keeps the
     other side at the size it had, so the shape follows the number */
  const whole = () => props.settings.preset === "auto";
  const isAuto = (k: "width" | "height") => whole() || props.settings[k] === "auto";
  const pixels = (k: "width" | "height") => (k === "width" ? layout().cell.w : layout().cell.h);
  const write = (k: "width" | "height", v: number) => {
    const o = k === "width" ? "height" : "width";
    const mine: number | "auto" = v < SIZE_MIN ? "auto" : Math.round(v);
    const theirs: number | "auto" = whole()
      ? mine === "auto"
        ? "auto"
        : pixels(o)
      : props.settings[o];
    const next = normalizeSize(
      k === "width" ? { width: mine, height: theirs } : { width: theirs, height: mine }
    );
    set(
      next
        ? { ...next, preset: sizePresetOf(next, screenSize()) }
        : { preset: "auto", width: "auto", height: "auto" }
    );
  };
  const field = (k: "width" | "height", label: string) => (
    <Scrub
      label={label}
      min={SIZE_MIN - 1}
      max={SIZE_MAX}
      step={8}
      grain={1}
      def={SIZE_MIN - 1}
      value={isAuto(k) ? SIZE_MIN - 1 : pixels(k)}
      origin={isAuto(k) ? pixels(k) : undefined}
      fmt={v => (v < SIZE_MIN ? t("Auto") : String(Math.round(v)))}
      parse={parseSide}
      onInput={v => write(k, v)}
    />
  );
  const percent = (v: number) => `${Math.round(v)}%`;
  /* the Save side is made once: toggling back and forth keeps a title half typed */
  const saveView = children(() => props.save);
  const previewView = children(() => props.preview);
  const [side, setSide] = createSignal<"save" | "export">("export");
  const exporting = () => !saveView() || side() === "export";
  return (
    <aside class={styles.panel} aria-label={t("Export")}>
      <div class={styles.head}>
        <Show when={saveView()} fallback={<Text variant="h3">{t("Export")}</Text>}>
          <Segmented
            aria-label={t("Save or export")}
            value={side()}
            options={[
              { value: "save", label: t("Save"), icon: "bookmark" },
              { value: "export", label: t("Export"), icon: "export" }
            ]}
            onChange={v => setSide(v === "save" ? "save" : "export")}
          />
        </Show>
        <Button size="lg" aria-label={t("Close selection")} onClick={() => props.onClose?.()}>
          {t("Close")} <Icon name="close" size={14} />
        </Button>
      </div>
      <div class={styles.row}>
        {/* the count says itself as palettes leave the selection */}
        <span aria-live="polite" aria-atomic="true">
          <Text variant="ui">
            {rich(
              "{count, plural, one {<n>#</n> selected} other {<n>#</n> selected}}",
              { n: digits => <Text variant="num">{digits}</Text> },
              { count: props.count }
            )}
          </Text>
        </span>
        <Button variant="ghost" size="sm" disabled={!props.count} onClick={() => props.onClear?.()}>
          {t("Clear")}
        </Button>
      </div>
      <Show when={exporting()} fallback={saveView()}>
        {/* each palette's size, never the image's: the image is the grid of them */}
        {/* biome-ignore lint/a11y/useSemanticElements: a section of settings under its label, which a fieldset would box */}
        <div class={styles.section} role="group" aria-label={t("Size")}>
          <Label>{t("Size")}</Label>
          <div class={styles.pair}>
            {field("width", t("Width"))}
            {field("height", t("Height"))}
          </div>
          <MenuButton
            full
            variant="input"
            size="lg"
            dense
            items={rows()}
            value={preset()}
            icon={<Icon name="monitor" size={15} />}
            aria-label={t("Size")}
            onPick={pick}
          >
            {presetLabel()}
          </MenuButton>
        </div>
        {/* how the palettes stand together in the image */}
        {/* biome-ignore lint/a11y/useSemanticElements: a section of settings under its label, which a fieldset would box */}
        <div class={styles.section} role="group" aria-label={t("Layout")}>
          <Label>{t("Layout")}</Label>
          <div class={styles.pair}>
            {/* no more columns than palettes */}
            <Scrub
              label={t("Columns")}
              min={0}
              max={count()}
              step={1}
              grain={1}
              def={0}
              fmt={v => (v < 1 ? t("Auto") : String(Math.round(v)))}
              value={
                props.settings.columns === "auto" ? 0 : Math.min(props.settings.columns, count())
              }
              onInput={v => set({ columns: v < 1 ? "auto" : Math.min(count(), Math.round(v)) })}
            />
            <Scrub
              label={t("Gap")}
              min={0}
              max={50}
              step={1}
              grain={1}
              def={EXPORT_DEFAULTS.gap}
              fmt={percent}
              value={props.settings.gap}
              onInput={v => set({ gap: Math.round(v) })}
            />
          </div>
          <div class={styles.pair}>
            <Scrub
              label={t("Padding")}
              min={0}
              max={50}
              step={1}
              grain={1}
              def={EXPORT_DEFAULTS.padding}
              fmt={percent}
              value={props.settings.padding}
              onInput={v => set({ padding: Math.round(v) })}
            />
            <Scrub
              label={t("Corners")}
              min={0}
              max={50}
              step={1}
              grain={1}
              def={EXPORT_DEFAULTS.corners}
              fmt={percent}
              value={props.settings.corners}
              onInput={v => set({ corners: Math.round(v) })}
            />
          </div>
        </div>
        <Show when={previewView()}>
          <div class={styles.preview}>{previewView()}</div>
        </Show>
        <div class={styles.files}>
          {/* what a press on the files does, said over them: the mode every strip is in */}
          <Label>{t(stripMode() === "download" ? msg("Download") : msg("Copy"))}</Label>
          <FormatStrip
            size="lg"
            variant="paper"
            full
            copy={["png", "svg", "css"]}
            download={["png", "svg", "jpeg"]}
            swatches={{ copy: SWATCH_CHIPS.copy, download: SWATCH_CHIPS.download }}
            onCopy={props.onCopy}
            onDownload={props.onDownload}
          />
        </div>
      </Show>
    </aside>
  );
}
