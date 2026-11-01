import { formatNumber, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { type CodeTab, CodeTabs } from "@grabient/ui/CodeTabs.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { children, createSignal, createUniqueId, type Element, Show } from "solid-js";
import { EffectArt } from "../editor/EffectArt.tsx";
import styles from "./Example.module.css";
import { type Shown, twoPlaces } from "./paint.ts";
import { gradientOf, levelWords } from "./shared.ts";

/* One way to use a palette, as the page shows it: its number and its use in a few words, a line on what it is for, then
   the example itself on a stage of its own, and under it a tag naming how the palette is drawn there (the address's
   style, or the other way it is shown here, which the tag's dashed edge marks) with the facts the example measures as
   chips beside it, and its code in tabs, each one Copy takes whole. Every example of the page stands in this frame, so
   they read as one page, with few words. */

/** What every example of a palette's examples page is given. */
export interface ExampleProps {
  /** the palette as the page paints it */
  s: Shown;
  /** the site's address, which the code names */
  origin: string;
  /** its place on the page, which its heading says */
  n: number;
}

/** A fact the stage measures, in the tag's shape beside it: a coin of the color it names, where it names one, then its
    few words or numbers. */
export function Chip(props: { color?: string; children: Element }) {
  return (
    <span class={styles.chip}>
      <Show when={props.color}>
        {color => <span class={styles.coin} style={{ background: color() }} />}
      </Show>
      {props.children}
    </span>
  );
}

/** The palette filling its holder: the gradient, or the effect's still, playing while `lit`. */
export function Painted(props: { s: Shown; lit: boolean }) {
  return (
    <Show
      when={props.s.effect}
      fallback={<span class={styles.fill} style={{ background: gradientOf(props.s) }} />}
    >
      {effect => (
        <EffectArt
          kind={effect().kind}
          palette={props.s.palette}
          settings={effect()}
          angle={props.s.view.angle}
          active={props.lit}
        />
      )}
    </Show>
  );
}

/** A contrast written the reader's way, never rounded up across a line: 4.496 is 4.49:1 (the contrast grid's). */
export const contrastWords = (ratio: number): string =>
  `${formatNumber(twoPlaces(ratio), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}:1`;

/** The least contrast an ink reaches on what it stands on, as a chip: the ink's coin where there is one ink, the
    ratio, the WCAG level. */
export function ContrastChip(props: { ink?: string; ratio: number }) {
  return (
    <Chip color={props.ink}>
      <span class={styles.ratio} dir="ltr">
        {contrastWords(props.ratio)}
      </span>
      <Show when={levelWords(props.ratio)}>{level => <span>{level()}</span>}</Show>
    </Chip>
  );
}

export function Example(props: {
  /** its anchor on the page */
  id: string;
  n: number;
  /** its use in a few words: a message, translated */
  title: string;
  /** what it is for, in one short line */
  about: Element;
  /** how the palette is drawn on the stage, in the reader's language */
  drawn: string;
  /** the stage shows the palette otherwise than its address names it: the tag says so */
  differs?: boolean;
  /** the stage's own ground: the page's, for an example that stands on a page; paper by default */
  ground?: "page" | "paper";
  /** the example */
  children: Element;
  /** chips under the stage, after the tag */
  notes?: Element;
  /** its code in tabs; none where the stage shows things made with the palette, as the cards do */
  code?: readonly CodeTab[];
  /** what the code's tabs hold, for a screen reader */
  codeLabel?: string;
}) {
  const heading = createUniqueId();
  /* resolved once: each read of an element prop would build it again, and the browser's copy would miss the server's */
  const notes = children(() => props.notes);
  /* the code stays folded under its press until it is asked for, so the page shows the palette first */
  const [open, setOpen] = createSignal(false);
  const codeId = createUniqueId();
  return (
    <section id={props.id} class={styles.section} aria-labelledby={heading}>
      <div class={styles.head}>
        <Text variant="h2" id={heading}>
          {t("{number} · {title}", { number: String(props.n), title: props.title })}
        </Text>
        <Text variant="body">{props.about}</Text>
      </div>
      <figure class={styles.figure}>
        <div class={styles.stage} data-ground={props.ground ?? "paper"}>
          {props.children}
        </div>
        <figcaption class={styles.caption}>
          <span class={styles.drawn} data-differs={props.differs ? "" : undefined}>
            {props.drawn}
          </span>
          {notes()}
          <Show when={props.code?.length}>
            <span class={styles.codePress} data-open={open() ? "" : undefined}>
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={open()}
                aria-controls={codeId}
                onClick={() => setOpen(!open())}
              >
                <Icon name="codeXml" size={14} />
                {t("Code", { $context: "examples" })}
                <Icon name="chevron" size={14} />
              </Button>
            </span>
          </Show>
        </figcaption>
      </figure>
      <div id={codeId} class={styles.code}>
        <Show when={open() && props.code?.length ? props.code : undefined}>
          {code => <CodeTabs tabs={code()} aria-label={props.codeLabel ?? ""} />}
        </Show>
      </div>
    </section>
  );
}
