/* A stand-in for @grabient/ui/PaletteCard.tsx until the design system lands it, with grabient4's name and props: the
   picture, its tools while the pointer is in it (or `hover`), and the line of its age and its likes. It goes once the
   real module lands. */
import { gradientCss } from "@grabient/engine/css.ts";
import type { Style } from "@grabient/engine/view.ts";
import { Button } from "@grabient/ui/Button.tsx";
import { FormatStrip, SWATCH_CHIPS } from "@grabient/ui/FormatStrip.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import styles from "./PaletteCard.module.css";

export function PaletteCard(props: {
  seed: string;
  stops: readonly string[];
  style?: Style;
  angle?: number;
  age: string;
  likes: number;
  liked?: boolean;
  selected?: boolean;
  hover?: boolean;
  onLike?: () => void;
  onSelect?: () => void;
}) {
  const art = () => gradientCss(props.stops, props.style ?? "linearGradient", props.angle ?? 90);
  return (
    <article class={styles.card}>
      <div class={styles.art} data-hover={props.hover ? "" : undefined}>
        <span class={styles.glow} style={{ background: art() }} aria-hidden="true" />
        <div class={styles.paint} style={{ background: art() }} role="img" aria-label="gradient" />
        <span class={styles.lead}>
          <Button variant="art" icon size="sm" href={`/${props.seed}`} aria-label="Edit" tip="Edit">
            <Icon name="edit" size={13} />
          </Button>
        </span>
        <span class={styles.end} data-kept={props.selected ? "" : undefined}>
          <Button
            variant={props.selected ? "primary" : "art"}
            icon
            size="sm"
            aria-pressed={!!props.selected}
            aria-label={props.selected ? "Remove from selection" : "Add to selection"}
            onClick={() => props.onSelect?.()}
          >
            <Icon name={props.selected ? "check" : "plus"} size={14} />
          </Button>
        </span>
        <span class={styles.strip}>
          <FormatStrip
            size="sm"
            variant="art"
            copy={["url", "css", "svg", "png"]}
            download={["md", "css", "svg", "png"]}
            swatches={SWATCH_CHIPS}
            link={["md", "css", "svg", "png"]}
          />
        </span>
      </div>
      <div class={styles.meta}>
        <Text variant="num">{props.age}</Text>
        <button
          type="button"
          class={styles.like}
          data-liked={props.liked ? "" : undefined}
          aria-pressed={props.liked ? "true" : "false"}
          onClick={() => props.onLike?.()}
        >
          <Icon name="heart" size={16} fill={props.liked} />
          <Text variant="num">{props.likes}</Text>
        </button>
      </div>
    </article>
  );
}
