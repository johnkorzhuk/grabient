import { BLOB_FROST_MAX, type EffectLook } from "@grabient/engine/effect.ts";
import { t } from "@grabient/i18n";
import { Scrub } from "@grabient/ui/Scrub.tsx";
import type { Element } from "solid-js";
import fields from "./EffectFields.module.css";
import type { PaletteEditor } from "./editor.ts";
import { EffectFields } from "./GlassControls.tsx";
import { GroundField } from "./GroundField.tsx";

/* The blob's fields in the Appearance menu: the effects' own (GlassControls.tsx: pace, frames a second, and in the
   editor its shape; the blob has no angle), then its frost and its ground (GroundField.tsx), one color written any way
   CSS writes one, its alpha too, or none, which leaves it clear. */

/** The blob's frost and ground, read from and written to whatever holds them, the frost laid out among the effect's
    own fields (`fields`). */
export function BlobLook(props: {
  look: EffectLook;
  onLook: (part: Partial<EffectLook>) => void;
  fields: (frost: Element) => Element;
}) {
  return (
    <>
      {props.fields(
        <div class={fields.pairs}>
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
        </div>
      )}
      <GroundField kind="blob" bg={props.look.bg} onBg={bg => props.onLook({ bg })} />
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
