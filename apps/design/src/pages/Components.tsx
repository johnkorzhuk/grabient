import { Buttons } from "./components/Buttons.tsx";
import { CodeBlocks } from "./components/CodeBlocks.tsx";
import { CollectionCards } from "./components/CollectionCards.tsx";
import { Fields } from "./components/Fields.tsx";
import { FormatStrips } from "./components/FormatStrips.tsx";
import { Menus } from "./components/Menus.tsx";
import { PaletteCards } from "./components/PaletteCards.tsx";
import { Segments } from "./components/Segments.tsx";
import { Switches } from "./components/Switches.tsx";
import { TagRow } from "./components/TagRow.tsx";
import { Tooltips } from "./components/Tooltips.tsx";

/* The components that matter most, by kind, in the outline's order. Every specimen is the component itself on sample
   data, so what this page shows is what the site draws. */
export function Components() {
  return (
    <>
      <Buttons />
      <Menus />
      <FormatStrips />
      <Fields />
      <Switches />
      <Segments />
      <Tooltips />
      <TagRow />
      <PaletteCards />
      <CollectionCards />
      <CodeBlocks />
    </>
  );
}
