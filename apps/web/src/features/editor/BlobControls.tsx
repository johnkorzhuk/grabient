import { msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { HexField } from "@grabient/ui/HexField.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { Scrub } from "@grabient/ui/Scrub.tsx";
import { Segmented } from "@grabient/ui/Segmented.tsx";
import { Switch } from "@grabient/ui/Switch.tsx";
import { Show } from "solid-js";
import { type BlobSettings, FPS_MAX, FROST_MAX, SHAPE_MAX, SPEED } from "./blob.ts";
import styles from "./Controls.module.css";

/* The side's blob: a switch that plays the palette as the animated blob in the picture, and, while it plays, how: its
   pace and frames a second (Auto, the screen's own, under 1; a GIF takes 12 then), its frost, its shape (a number, and
   a press for another), whether it drifts near and far, whether three fill the box, and the ground behind it. */

const GROUNDS = [
  { value: "none", label: msg("None") },
  { value: "deep", label: msg("Deep") },
  { value: "color", label: msg("Color") }
] as const;
/** the ground a color choice starts on */
const INK = "#101014";
const times = (v: number) => `${Number(v.toFixed(2))}×`;

export function BlobSection(props: { blob: BlobSettings; beside?: () => HTMLElement | undefined }) {
  const b = props.blob;
  const v = () => b.view();
  const ground = () => (v().bg === null ? "none" : v().bg === "deep" ? "deep" : "color");
  return (
    <div class={styles.axis}>
      <div class={styles.kind} style={{ "justify-content": "space-between" }}>
        <span id="blob-name">{t("Blob")}</span>
        <Switch checked={b.on()} aria-labelledby="blob-name" onChange={b.setOn} />
      </div>
      <Show when={b.on()}>
        <div class={styles.axis}>
          <div class={styles.fields}>
            <Scrub
              small
              label={t("Speed")}
              value={v().speed}
              min={SPEED.min}
              max={SPEED.max}
              step={0.1}
              grain={0.05}
              def={1}
              fmt={times}
              onInput={speed => b.set({ speed })}
            />
            <Scrub
              small
              label={t("FPS")}
              value={v().fps ?? 0}
              min={0}
              max={FPS_MAX}
              step={1}
              grain={1}
              def={0}
              fmt={x => (x < 1 ? t("Auto") : String(Math.round(x)))}
              onInput={fps => b.set({ fps: fps < 1 ? null : Math.round(fps) })}
            />
          </div>
          <div class={styles.fields}>
            <Scrub
              small
              label={t("Frost")}
              value={v().frost}
              min={0}
              max={FROST_MAX}
              step={0.05}
              grain={0.05}
              def={1}
              fmt={x => x.toFixed(2)}
              onInput={frost => b.set({ frost })}
            />
            <Scrub
              small
              label={t("Shape")}
              value={v().shape ?? 0}
              min={0}
              max={SHAPE_MAX}
              step={1}
              grain={1}
              fmt={x => String(Math.round(x))}
              onInput={shape => b.set({ shape: Math.round(shape) })}
            />
            <span style={{ flex: "none" }}>
              <Button
                icon
                size="sm"
                aria-label={t("New shape")}
                tip={t("New shape")}
                onClick={b.shuffle}
              >
                <Icon name="dice" size={14} />
              </Button>
            </span>
          </div>
          <div class={styles.kind} style={{ "flex-wrap": "wrap", "column-gap": "var(--space-s4)" }}>
            <span class={styles.kind}>
              <span id="blob-depth">{t("Depth")}</span>
              <Switch
                checked={v().depth}
                aria-labelledby="blob-depth"
                onChange={depth => b.set({ depth })}
              />
            </span>
            <span class={styles.kind}>
              <span id="blob-fill">{t("Fill")}</span>
              <Switch
                checked={v().fill}
                aria-labelledby="blob-fill"
                onChange={fill => b.set({ fill })}
              />
            </span>
          </div>
          <div class={styles.fields}>
            <Segmented
              size="sm"
              aria-label={t("Background")}
              options={GROUNDS.map(g => ({ value: g.value, label: t(g.label) }))}
              value={ground()}
              onChange={value =>
                b.set({
                  bg:
                    value === "none"
                      ? null
                      : value === "deep"
                        ? "deep"
                        : ground() === "color"
                          ? v().bg
                          : INK
                })
              }
            />
          </div>
          <Show when={ground() === "color"}>
            <HexField
              quiet
              label={t("Background")}
              value={v().bg && v().bg !== "deep" ? (v().bg as string) : INK}
              onCommit={hex => b.set({ bg: hex.toLowerCase() as `#${string}` })}
              onPick={hex => b.set({ bg: hex.toLowerCase() as `#${string}` })}
              beside={props.beside}
            />
          </Show>
        </div>
      </Show>
    </div>
  );
}
