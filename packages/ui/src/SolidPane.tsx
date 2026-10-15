import type { Palette } from "@grabient/engine/palette.ts";
import type { Style } from "@grabient/engine/view.ts";
import { createSignal, onSettled, Show } from "solid-js";
import { announce } from "./announce.ts";
import { Button } from "./Button.tsx";
import { copyText, downloadFile } from "./copy.ts";
import { FigurePane } from "./FigurePane.tsx";
import { type Format, FormatStrip } from "./FormatStrip.tsx";
import type { FigureOpts } from "./figure.ts";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import type { PickMode } from "./Keyframes.tsx";
import { watchSize } from "./measure.ts";
import { CAM0, type Cam, Solid } from "./Solid.tsx";

/* The palette's path through the color solid in a pane of the editor's sheet, drawn as large as the pane, whose height
   the page sets and the scene never changes. At the head's end the figure of this view as an SVG or a PNG: the three
   panels with the orbit as the reader left it, or the solid alone once a click has kept the color space home. The press
   that lets the color space go stands before them. Left to right in every language. */
const FILES: readonly Format[] = ["svg", "png"];

export function SolidPane(props: {
  palette: Palette;
  wide?: boolean;
  steps: number;
  /** the stops as hard bands: the dots are what ships */
  stepped?: boolean;
  selection?: readonly number[];
  onSelect?: (i: number, mode: PickMode) => void;
  onSweep?: (from: number, to: number) => void;
  onRestore?: (selection: readonly number[]) => void;
  onHover?: (t: number | null) => void;
  /** for the figure it copies: the palette's seed, and how its picture is drawn */
  seed?: string;
  style?: Style;
  angle?: number;
  /** the figure taken: copied, or saved as a file */
  onTake?: (action: "copy" | "download", format: Format) => void;
}) {
  const [kept, setKept] = createSignal(false);
  /* the scene is drawn to the pane's own height */
  let box: HTMLDivElement | undefined;
  const [tall, setTall] = createSignal(420);
  onSettled(() => {
    const el = box;
    if (el) return watchSize(el, () => setTall(Math.max(200, Math.floor(el.clientHeight))));
  });
  let cam: Cam = { ...CAM0 };
  /* the figure of the view at the press; its writer and the fonts it embeds load on the first copy or save */
  const figure = async () => {
    const view: FigureOpts = {
      palette: props.palette,
      steps: props.steps,
      stepped: props.stepped,
      wide: props.wide,
      cam,
      kept: kept(),
      theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
      style: props.style,
      angle: props.angle,
      seed: props.seed
    };
    const writer = await import("./figure.ts");
    await writer.loadFigureFonts();
    return {
      writer,
      svg: writer.buildFigure(view),
      name: writer.figureName(view.seed ?? "palette", view.kept)
    };
  };
  /* whether the copy happened, so the chip confirms only one that did */
  const copy = async (format: Format): Promise<boolean> => {
    const { writer, svg } = await figure();
    if (format === "png") {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": writer.svgToPngBlob(svg, 2) })
        ]);
      } catch {
        announce(t("Images can't be copied here."));
        return false;
      }
    } else if (!(await copyText(svg))) return false;
    props.onTake?.("copy", format);
    return true;
  };
  const download = async (format: Format) => {
    const { writer, svg, name } = await figure();
    if (format === "png") downloadFile(`${name}.png`, await writer.svgToPngBlob(svg, 2));
    else downloadFile(`${name}.svg`, new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    props.onTake?.("download", format);
  };
  return (
    <FigurePane
      name={t("Color space")}
      fill
      center
      body={el => {
        box = el;
      }}
      pinned={
        <Show when={kept()}>
          <Button
            icon
            variant="ghost"
            size="sm"
            aria-label={t("Hide color space")}
            tip={t("Hide color space")}
            onClick={() => setKept(false)}
          >
            <Icon name="close" size={14} />
          </Button>
        </Show>
      }
      aside={
        <FormatStrip
          size="sm"
          variant="paper"
          copy={FILES}
          download={FILES}
          onCopy={copy}
          onDownload={f => void download(f)}
        />
      }
    >
      <div dir="ltr">
        <Solid
          palette={props.palette}
          wide={props.wide}
          steps={props.steps}
          stepped={props.stepped}
          selection={props.selection}
          onSelect={props.onSelect}
          onSweep={props.onSweep}
          onRestore={props.onRestore}
          height={tall()}
          onHover={props.onHover}
          kept={kept()}
          onKept={setKept}
          onView={view => {
            cam = view.cam;
          }}
        />
      </div>
    </FigurePane>
  );
}
