import { BLOB_FROST_MAX } from "@grabient/engine/effect.ts";
import { t } from "@grabient/i18n";
import { ColorField } from "@grabient/ui/ColorField.tsx";
import { Scrub } from "@grabient/ui/Scrub.tsx";
import { createSignal, onSettled } from "solid-js";
import type { PaletteEditor } from "./editor.ts";
import { EffectFields } from "./GlassControls.tsx";

/* The blob's fields in the Appearance menu: the effects' own (GlassControls.tsx: angle, pace, frames a second, shape),
   then its frost and its ground, one color written any way CSS writes one, its alpha too, or none, which leaves it
   clear. The color's reader (engine/css-color.ts) comes with these fields; the field keeps the hex the address
   does. */

export function BlobFields(props: { editor: PaletteEditor }) {
  const fx = props.editor.effects;
  const look = () => fx.settings("blob").look;
  const wide = { "grid-column": "1 / -1" };
  /* the color reader, loaded as the fields first show */
  const [reader, setReader] = createSignal<typeof import("@grabient/engine/css-color.ts") | null>(
    null
  );
  onSettled(() => {
    void import("@grabient/engine/css-color.ts").then(m => setReader(() => m));
  });
  const read = (text: string): string | null | undefined => {
    const m = reader();
    if (!text.trim()) return null;
    if (!m) return undefined;
    return m.cssColorText(text);
  };
  return (
    <>
      <EffectFields
        editor={props.editor}
        kind="blob"
        extra={
          <Scrub
            label={t("Frost")}
            value={look().frost}
            min={0}
            max={BLOB_FROST_MAX}
            step={0.05}
            grain={0.05}
            def={1}
            fmt={x => x.toFixed(2)}
            onInput={frost => fx.look("blob", { frost })}
          />
        }
      />
      <div style={wide}>
        <ColorField
          label={t("Background")}
          value={look().bg}
          empty={t("Transparent")}
          read={read}
          onCommit={bg => fx.look("blob", { bg })}
          onPick={bg => fx.look("blob", { bg })}
          beside={() => document.getElementById("appearance-menu") ?? undefined}
        />
      </div>
    </>
  );
}
