import { EFFECT_KINDS, type EffectKind } from "@grabient/engine/effect.ts";
import { msg, t } from "@grabient/i18n";
import { ColorField } from "@grabient/ui/ColorField.tsx";
import { createSignal, onSettled } from "solid-js";
import fields from "./EffectFields.module.css";

/* An effect's ground in the Appearance menu, where it takes one (engine/effect.ts EFFECT_KINDS' `ground`): one color
   written any way CSS writes one, its alpha too, or none. The blob's none is clear, the page through it; the strings'
   is their designed ground, the palette's darkest color made deeper, which the swatch shows where one palette is drawn
   (`auto`) and the press at the field's end goes back to (Reset background), as a wholly clear color is a ground of theirs
   (engine/effect.ts CLEAR_GROUND). The color's reader (engine/css-color.ts) comes with the field; the field keeps the
   hex the address does. */

/** An effect's ground, read from and written to whatever holds it. */
export function GroundField(props: {
  kind: EffectKind;
  bg: string | null;
  /** the strings' designed ground as #rrggbb, where one palette is drawn: what none is */
  auto?: string;
  onBg: (bg: string | null) => void;
}) {
  /* the color reader, loaded as the field first shows */
  const [reader, setReader] = createSignal<typeof import("@grabient/engine/css-color.ts") | null>(
    null
  );
  onSettled(() => {
    void import("@grabient/engine/css-color.ts").then(m => setReader(() => m));
  });
  /* none is the ground the effect was designed on, which a clear color is not */
  const designed = () => EFFECT_KINDS[props.kind].ground === "designed";
  /* the press back to the designed ground, named apart from the menu's own Reset */
  const reset = () => t("Reset background");
  const read = (text: string): string | null | undefined => {
    const m = reader();
    if (!text.trim()) return null;
    if (!m) return undefined;
    return m.cssColorText(text, designed());
  };
  return (
    <div class={fields.pairs}>
      <ColorField
        label={t("Background")}
        value={props.bg}
        empty={t(designed() ? msg("Auto") : msg("Transparent"))}
        auto={designed() ? props.auto : undefined}
        clear={designed() ? reset() : undefined}
        read={read}
        onCommit={props.onBg}
        onPick={props.onBg}
        beside={() => document.getElementById("appearance-menu") ?? undefined}
      />
    </div>
  );
}
