import { BLOB_FROST_MAX, BLOB_SHAPE_MAX } from "@grabient/engine/effect.ts";
import { msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { HexField } from "@grabient/ui/HexField.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { Scrub } from "@grabient/ui/Scrub.tsx";
import { Segmented } from "@grabient/ui/Segmented.tsx";
import { Switch } from "@grabient/ui/Switch.tsx";
import { Show } from "solid-js";
import styles from "./Controls.module.css";
import type { PaletteEditor } from "./editor.ts";
import { EffectFields } from "./GlassControls.tsx";

/* The blob's fields in the Appearance menu, where Steps and Angle stand for the gradients: its pace (0, Off, holds its
   first frame) and frames a second, its frost, its shape (a number, and a press for another), whether it drifts near
   and far, whether three fill the box, and the ground behind it. */

const GROUNDS = [
  { value: "none", label: msg("None") },
  { value: "deep", label: msg("Deep") },
  { value: "color", label: msg("Color") }
] as const;
/** the ground a color choice starts on */
const INK = "#101014";

export function BlobFields(props: { editor: PaletteEditor }) {
  const fx = props.editor.effects;
  const look = () => fx.settings("blob").look;
  const ground = () => (look().bg === null ? "none" : look().bg === "deep" ? "deep" : "color");
  const wide = { "grid-column": "1 / -1" };
  return (
    <>
      <EffectFields editor={props.editor} kind="blob" />
      <Scrub
        label={t("Frost")}
        value={look().frost}
        min={0}
        max={BLOB_FROST_MAX}
        step={0.05}
        grain={0.05}
        def={1}
        fmt={x => x.toFixed(2)}
        onInput={frost => fx.look({ frost })}
      />
      <div class={styles.kind} style={{ gap: "var(--space-s2)" }}>
        <span style={{ flex: "1", "min-width": "0" }}>
          <Scrub
            label={t("Shape")}
            value={look().shape ?? 0}
            min={0}
            max={BLOB_SHAPE_MAX}
            step={1}
            grain={1}
            fmt={x => String(Math.round(x))}
            onInput={shape => fx.look({ shape: Math.round(shape) })}
          />
        </span>
        <Button
          icon
          size="sm"
          aria-label={t("New shape")}
          tip={t("New shape")}
          onClick={() => fx.shuffle()}
        >
          <Icon name="dice" size={14} />
        </Button>
      </div>
      <span class={styles.kind}>
        <span id="blob-depth">{t("Depth")}</span>
        <Switch
          checked={look().depth}
          aria-labelledby="blob-depth"
          onChange={depth => fx.look({ depth })}
        />
      </span>
      <span class={styles.kind}>
        <span id="blob-fill">{t("Fill")}</span>
        <Switch
          checked={look().fill}
          aria-labelledby="blob-fill"
          onChange={fill => fx.look({ fill })}
        />
      </span>
      <div style={wide}>
        <Segmented
          size="sm"
          aria-label={t("Background")}
          options={GROUNDS.map(g => ({ value: g.value, label: t(g.label) }))}
          value={ground()}
          onChange={value =>
            fx.look({
              bg:
                value === "none"
                  ? null
                  : value === "deep"
                    ? "deep"
                    : ground() === "color"
                      ? look().bg
                      : INK
            })
          }
        />
      </div>
      <Show when={ground() === "color"}>
        <div style={wide}>
          <HexField
            quiet
            label={t("Background")}
            value={look().bg && look().bg !== "deep" ? (look().bg as string) : INK}
            onCommit={hex => fx.look({ bg: hex.toLowerCase() as `#${string}` })}
            onPick={hex => fx.look({ bg: hex.toLowerCase() as `#${string}` })}
          />
        </div>
      </Show>
    </>
  );
}
