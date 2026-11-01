import { FormatStrip, SWATCH_CHIPS } from "@grabient/ui/FormatStrip.tsx";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Cell, Cells, Matrix } from "../../doc/Specimen.tsx";
import { art } from "../../samples.ts";

/* The strip at its three heights in its two looks, then a card's own strip with every mode and the swatch book. The
   strips are live: a turn of one mode turns every strip on the page, as on the site. */
const ART = art(5, 135);

export function FormatStrips() {
  return (
    <Section
      id="format-strip"
      summary="Copies, downloads and links as one strip: the mode first, a swatch book last."
    >
      <Block title="Variants">
        <Matrix
          rows={["sm", "md", "lg"] as const}
          cols={["art", "paper"] as const}
          axes="size · variant"
          art={(_, variant) => (variant === "art" ? ART : undefined)}
          cell={(size, variant) => (
            <FormatStrip
              variant={variant}
              size={size}
              copy={["css", "svg", "png"]}
              download={["svg", "png"]}
            />
          )}
        />
      </Block>
      <Block title="Modes">
        <Cells min={360}>
          <Cell
            caption="a card's strip · press its first glyph to turn the mode, its last for the swatch files"
            art={ART}
          >
            <FormatStrip
              copy={["url", "css", "svg", "png"]}
              download={["md", "css", "svg", "png"]}
              swatches={SWATCH_CHIPS}
              link={["md", "css", "svg", "png"]}
            />
          </Cell>
          <Cell
            caption="the editor's strip and a list card's while an effect plays · Copy adds HTML, the two tags that play it behind a page, and Figma, its own layers moving on Figma's timeline; Copy link adds its script"
            art={ART}
          >
            <FormatStrip
              copy={["url", "css", "svg", "png", "html", "figma"]}
              download={["md", "css", "svg", "png"]}
              swatches={SWATCH_CHIPS}
              link={["md", "css", "svg", "png", "js"]}
            />
          </Cell>
        </Cells>
      </Block>
      <Block title="Rules">
        <Rules
          rules={[
            "Anchored at its picture's bottom right; a format keeps its place in every mode, and nothing else moves.",
            "Its height and radius follow the row's size. Below 300px it keeps its icons and drops their names.",
            "The mode is its glyph, a dot per mode over it on hover. Every strip on the page turns as one.",
            "Named by its mode; the mode press names the next one; the swatch book is Swatches or Back.",
            "A copy for another app is named for where it goes: Copy for Figma."
          ]}
        />
      </Block>
    </Section>
  );
}
