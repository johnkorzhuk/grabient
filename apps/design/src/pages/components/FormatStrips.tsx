import { FormatStrip, SWATCH_CHIPS } from "@grabient/ui/FormatStrip.tsx";
import { MakingIcon, makingLabel, makingName } from "@grabient/ui/MakingIcon.tsx";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Cell, Cells, Matrix } from "../../doc/Specimen.tsx";
import { art } from "../../samples.ts";

/* The strip at its three heights in its two looks, then a card's own strip with every mode and the swatch book, its
   formats named without icons. The strips are live: a turn of one mode turns every strip on the page, as on the site. */
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
            caption="a card's strip, each format its name · press its first glyph to turn the mode, its last for the swatch files"
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
            caption="a list card's strip while an effect plays · Copy adds HTML, the two tags that play it behind a page, and Figma, its own layers moving on Figma's timeline, its soft a layer blur over the palette's gradient and its grain Figma's Noise; Copy link adds its script"
            art={ART}
          >
            <FormatStrip
              copy={["url", "css", "svg", "png", "html", "figma"]}
              download={["md", "css", "svg", "png"]}
              swatches={SWATCH_CHIPS}
              link={["md", "css", "svg", "png", "js"]}
            />
          </Cell>
          <Cell
            caption="a list card's strip while the papercut, the strings or a field effect plays · no Figma: their shapes change as they move, which no layer on Figma's timeline can, so a paste could only stand still, and their SVG goes into Figma as it is"
            art={ART}
          >
            <FormatStrip
              copy={["url", "css", "svg", "png", "html"]}
              download={["md", "css", "svg", "png"]}
              swatches={SWATCH_CHIPS}
              link={["md", "css", "svg", "png", "js"]}
            />
          </Cell>
          <Cell
            caption="the editor's strip while an effect plays · as a card's, and Download adds MP4, its clip drawn and coded in the reader's browser; Copy link adds the clip's address where the server draws new clips for the reader (a preview: an admin on grabient.com, anyone on staging); MP4 shares HTML's place, the script Figma's"
            art={ART}
          >
            <FormatStrip
              size="lg"
              copy={["url", "css", "svg", "png", "html", "figma"]}
              download={["md", "css", "svg", "png", "mp4"]}
              swatches={SWATCH_CHIPS}
              link={["md", "css", "svg", "png", "mp4", "js"]}
            />
          </Cell>
          <Cell
            caption="an MP4 being made, which shows in Download: turn a strip to it · its ring round as far as the clip is drawn, its square the stop a press makes, its tooltip how far along; its check comes once the file is saved"
            art={ART}
          >
            <FormatStrip
              size="lg"
              copy={["url", "css", "svg", "png", "html", "figma"]}
              download={["md", "css", "svg", "png", "mp4"]}
              link={["md", "css", "svg", "png", "mp4", "js"]}
              making={{
                format: "mp4",
                done: 0.62,
                name: makingName("mp4"),
                label: makingLabel("mp4", 0.62),
                Icon: MakingIcon
              }}
            />
          </Cell>
        </Cells>
      </Block>
      <Block title="Rules">
        <Rules
          rules={[
            "Anchored at its picture's bottom right; a format keeps its place in every mode, and nothing else moves.",
            "Its height and radius follow the row's size. On a card (small, over art) each format is its name alone, and the mode and the swatch book keep their glyphs; elsewhere below 300px a strip keeps its icons and drops their names.",
            "Chips never run over one another: with less room than they take, the formats give up their padding evenly, then scroll sideways between the mode and the swatch book, an edge fading where more wait.",
            "The mode is its glyph, a dot per mode over it on hover. Every strip on the page turns as one.",
            "Named by its mode; the mode press names the next one; the swatch book is Swatches or Back.",
            "A copy for another app is named for where it goes: Copy for Figma.",
            "Copy for Figma only where Figma's timeline plays the effect (the glass, the blob, the silk, the rosette); for the others the SVG is the way into Figma.",
            "A download made as it is asked for, an effect's MP4, shows how far along it is on its own chip, a ring round its stop (MakingIcon), its tooltip Making MP4, 62%. Stop. Its name stays Making MP4. Stop until the file is made, so a screen reader is not told each percent, and is told Downloaded MP4 then. A press stops it, and so does the stage showing another clip; its check comes once the file is saved. Only the page that makes it loads the ring."
          ]}
        />
      </Block>
    </Section>
  );
}
