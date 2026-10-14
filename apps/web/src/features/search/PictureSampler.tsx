import { t } from "@grabient/i18n";
import { record } from "../../app/undo.ts";
import type { createPicture, Picture, Settled } from "./picture.ts";
import { Sampler } from "./Sampler.tsx";

/** A picture searched by its colors, with its points, as a list shows it beside the palettes the colors make. A point
    that comes to rest, or one added or taken out, searches the colors again in the page's place (`search`), and each
    change is a step of the page's undo. */
export function PictureSampler(props: {
  picture: ReturnType<typeof createPicture>;
  shown: Picture;
  search: (colors: string | null) => void;
}) {
  const rest = (done: Settled | null) => {
    if (!done) return;
    const show = (points: Settled["before"]) => async () =>
      props.search(props.picture.show(points));
    record({ undo: show(done.before), redo: show(done.after) });
    props.search(done.colors);
  };
  const settle = () => void props.picture.settle().then(rest);
  return (
    <Sampler
      src={props.shown.src}
      width={props.shown.width}
      height={props.shown.height}
      label={t("Your image")}
      points={props.shown.points}
      onMove={(i, x, y) => void props.picture.move(i, x, y)}
      onRelease={settle}
      onReset={
        props.picture.moved(props.shown) ? () => void props.picture.reset().then(rest) : undefined
      }
      onAdd={(x, y) => {
        void props.picture.add(x, y);
        settle();
      }}
      onRemove={
        props.picture.canRemove(props.shown)
          ? i => {
              void props.picture.remove(i);
              settle();
            }
          : undefined
      }
    />
  );
}
