import { BLOB_FROST_MAX, type EffectLook } from "@grabient/engine/effect.ts";
import { t } from "@grabient/i18n";
import { ColorField } from "@grabient/ui/ColorField.tsx";
import { Scrub } from "@grabient/ui/Scrub.tsx";
import { createSignal, type Element, onSettled } from "solid-js";
import fields from "./EffectFields.module.css";
import type { PaletteEditor } from "./editor.ts";
import { EffectFields } from "./GlassControls.tsx";

/* The blob's fields in the Appearance menu: the effects' own (GlassControls.tsx: angle, pace, frames a second, and in
   the editor its shape), then its frost and its ground, one color written any way CSS writes one, its alpha too, or
   none, which leaves it clear. The color's reader (engine/css-color.ts) comes with these fields; the field keeps the
   hex the address does. */

/** The blob's frost and ground, read from and written to whatever holds them, the frost laid out among the effect's
    own fields (`fields`). */
export function BlobLook(props: {
  look: EffectLook;
  onLook: (part: Partial<EffectLook>) => void;
  fields: (frost: Element) => Element;
}) {
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
      {props.fields(
        <Scrub
          label={t("Frost")}
          value={props.look.frost}
          min={0}
          max={BLOB_FROST_MAX}
          step={0.05}
          grain={0.05}
          def={1}
          fmt={x => x.toFixed(2)}
          onInput={frost => props.onLook({ frost })}
        />
      )}
      <div class={fields.pairs}>
        <ColorField
          label={t("Background")}
          value={props.look.bg}
          empty={t("Transparent")}
          read={read}
          onCommit={bg => props.onLook({ bg })}
          onPick={bg => props.onLook({ bg })}
          beside={() => document.getElementById("appearance-menu") ?? undefined}
        />
      </div>
    </>
  );
}

export function BlobFields(props: { editor: PaletteEditor }) {
  const fx = props.editor.effects;
  return (
    <BlobLook
      look={fx.settings("blob").look}
      onLook={part => fx.look("blob", part)}
      fields={frost => <EffectFields editor={props.editor} kind="blob" extra={frost} />}
    />
  );
}
