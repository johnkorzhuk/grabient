import { ConsentBanner } from "@grabient/ui/ConsentBanner.tsx";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Cell, Cells } from "../../doc/Specimen.tsx";

/* The banner's two sets of words, drawn in place: where the law asks for consent first, and where it lets analytics
   count visits once the reader is told. Their answers press as on the site and record nothing here. */
export function ConsentBanners() {
  return (
    <Section
      id="consent"
      summary="What the site would measure and why, with two equal answers, at the screen's foot."
    >
      <Block title="Variants">
        <Cells min={720}>
          <Cell caption="ask · the EEA, and wherever consent comes first" column>
            <ConsentBanner
              still
              rule="ask"
              choose="#consent"
              privacy="#consent"
              onChoose={() => {}}
            />
          </Cell>
          <Cell caption="tell · Switzerland" column>
            <ConsentBanner
              still
              rule="tell"
              choose="#consent"
              privacy="#consent"
              onChoose={() => {}}
            />
          </Cell>
        </Cells>
      </Block>
      <Block title="Rules">
        <Rules
          rules={[
            "Reject all and Accept all share one variant, one size and one width, side by side. Nothing is chosen before the reader answers.",
            "Choose leads to the privacy choices in Settings, one switch a category, and records nothing.",
            "Fixed at the screen's foot over the page, so nothing on the page moves when it comes or goes. On the editor it stands above the stops.",
            "It takes no focus as it arrives, traps nothing and is no live region. It comes right after Skip to content, and an answer from the keyboard lands on the page's content.",
            "A caption's type and a fade in, so it stays small beside the page's own words: on a phone, under a third of the screen."
          ]}
        />
      </Block>
    </Section>
  );
}
