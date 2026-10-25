import { CARD_SIZE, type PaletteView, paletteFile } from "../../lib/page-meta.ts";

/** A palette's picture as its files, under the picture its page paints: an image search indexes images and no
    painted background, so the PNG in `src` is the one it finds, as the palette's sitemap entry names it. A browser
    takes the SVG, which costs no drawing. The paint over it is the picture a reader sees, in the screen's own colors
    and through every edit, so this one is hidden from assistive technology and takes no pointer. */
export function FilePicture(props: {
  seed: string;
  view: PaletteView;
  alt: string;
  class: string;
}) {
  return (
    <picture class={props.class}>
      <source type="image/svg+xml" srcset={paletteFile(props.seed, props.view, "svg")} />
      <img
        src={paletteFile(props.seed, props.view, "png")}
        alt={props.alt}
        aria-hidden="true"
        width={CARD_SIZE.width}
        height={CARD_SIZE.height}
        decoding="async"
      />
    </picture>
  );
}
