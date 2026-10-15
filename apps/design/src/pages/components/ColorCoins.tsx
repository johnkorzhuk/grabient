import { dominantColors } from "@grabient/engine/dominant.ts";
import { Coins, coinHost } from "@grabient/ui/Coins.tsx";
import { type CollectChoice, CollectList } from "@grabient/ui/CollectList.tsx";
import { rich } from "@grabient/ui/i18n.ts";
import link from "@grabient/ui/link.module.css";
import { Tags } from "@grabient/ui/Tags.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Cell, Cells } from "../../doc/Specimen.tsx";
import { COLLECTIONS, hexes, POPULAR } from "../../samples.ts";

/* A tag's and a collection's colors where the site shows them: under a tag in their own light, under a link to a
   collection, and at the end of a row of Add to collection. The first two are held open; the rows open under the
   pointer or the keyboard, as on the site. */
const TAG = { label: "summer", colors: hexes(POPULAR[0].seed, 5) };
const SOURCE = COLLECTIONS[0];
const OWN: readonly CollectChoice[] = COLLECTIONS.map((c, i) => ({
  slug: c.slug,
  title: c.title,
  count: c.count,
  has: i === 0,
  colors: dominantColors(c.seeds)
}));
const nothing = async () => {};

export function ColorCoins() {
  return (
    <Section
      id="coins"
      summary="A tag's or a collection's colors, one to five, under the pointer or keyboard focus."
    >
      <Block title="Variants">
        <Cells min={280}>
          <Cell caption="under a tag · held open">
            <Tags tags={[TAG]} open={0} />
          </Cell>
          <Cell caption="under a link · held open">
            <Text variant="ui">
              {rich(
                "Saved from <source>{title}</source>",
                {
                  source: words => (
                    <span class={coinHost} data-open="">
                      <a
                        class={link.inline}
                        href={`https://grabient.com/${SOURCE.slug}`}
                        dir="auto"
                      >
                        {words}
                      </a>
                      <Coins colors={dominantColors(SOURCE.seeds)} />
                    </span>
                  )
                },
                { title: SOURCE.title }
              )}
            </Text>
          </Cell>
          <Cell caption="at a row's end · rest the pointer, or Tab to a row">
            <CollectList own={OWN} onToggle={nothing} onNew={nothing} />
          </Cell>
        </Cells>
      </Block>
      <Block title="Rules">
        <Rules
          rules={[
            "Words alone at rest; the colors come under the pointer or keyboard focus, never under a link that leads nowhere now.",
            "A tag's colors are what its words find, a collection's what its first palettes hold: the same everywhere.",
            "Under a tag or a link they take no room; at a row's end they keep theirs, so the count never moves.",
            "The middle first, a few pixels down and out, and they leave together; with less motion they are simply there.",
            "Left to right, as a palette's colors run, whichever way the page reads."
          ]}
        />
      </Block>
    </Section>
  );
}
