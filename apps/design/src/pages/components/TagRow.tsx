import { t } from "@grabient/ui/i18n.ts";
import { Tags } from "@grabient/ui/Tags.tsx";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Cell, Cells } from "../../doc/Specimen.tsx";
import { hexes, POPULAR } from "../../samples.ts";

/* The row as the lists draw it under their search, the gallery's popular searches with colors read from palettes; one
   tag holds its colors open, and the rest open under the pointer. */
const WORDS = [
  "sunset",
  "dark academia",
  "blue",
  "pastel",
  "warm",
  "summer",
  "tropical",
  "charcoal",
  "neon"
];
const TAGS = WORDS.map((label, i) => ({
  label,
  colors: hexes(POPULAR[i % POPULAR.length].seed, 4)
}));

export function TagRow() {
  return (
    <Section
      id="tags"
      summary="One row of tags under the search; a tag's colors open under the pointer."
    >
      <Cells min={560}>
        <Cell caption="one held open · the rest under the pointer">
          <Tags lead={t("Popular")} tags={TAGS} open={0} />
        </Cell>
      </Cells>
      <Block title="Rules">
        <Rules
          rules={[
            "Words alone at rest; one to five colors under the pointer or keyboard focus.",
            "One row that scrolls sideways, never wraps and never shows a scrollbar.",
            "The colors take no room: keep 40px clear under the row.",
            "A toolbar: one Tab stop, walked by the arrows, Home and End."
          ]}
        />
      </Block>
    </Section>
  );
}
