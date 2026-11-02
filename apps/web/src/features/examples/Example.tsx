import { formatNumber, t } from "@grabient/i18n";
import { announce } from "@grabient/ui/announce.ts";
import { Button } from "@grabient/ui/Button.tsx";
import { type CodeTab, CodeTabs } from "@grabient/ui/CodeTabs.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { keyRow } from "@grabient/ui/keymap.ts";
import { rowKeys, showKey } from "@grabient/ui/keys.ts";
import { Text } from "@grabient/ui/Text.tsx";
import {
  children,
  createEffect,
  createSignal,
  createUniqueId,
  type Element,
  For,
  onSettled,
  Show
} from "solid-js";
import { EffectArt } from "../editor/EffectArt.tsx";
import styles from "./Example.module.css";
import { type Shown, twoPlaces } from "./paint.ts";
import { gradientOf, levelWords } from "./shared.ts";
import { turnsOn } from "./swipe.ts";

/* One way to use a palette, as the page shows it: its number and its use in a few words, a line on what it is for, then
   the example itself on a stage of its own, and under it a tag naming how the palette is drawn there (the look the page
   gives it, or the other way it is shown here, which the tag's dashed edge marks) with the facts the example measures
   as chips beside it, and its code in tabs, each one Copy takes whole. A reader turns the stage to another look with a
   swipe, a press or the arrow keys (swipe.ts), which a hint beside the tag says. Every example of the page stands in
   this frame, so they read as one page, with few words. */

/** What every example of a palette's examples page is given. */
export interface ExampleProps {
  /** the palette as the page paints it */
  s: Shown;
  /** the site's address, which the code names */
  origin: string;
  /** its place on the page, which its heading says */
  n: number;
  /** which of its looks a reader turned it to, 0 for the page's own: the cards take their tiles' set by it */
  turn?: number;
  /** turns it to another look, on or back */
  onTurn?: (by: 1 | -1) => void;
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
  /** the stage shows the palette otherwise than its look draws it: the tag says so */
  differs?: boolean;
  /** the example */
  children: Element;
  /** chips under the stage, after the tag */
  notes?: Element;
  /** its code in tabs; none where the stage shows things made with the palette, as the cards do */
  code?: readonly CodeTab[];
  /** what the code's tabs hold, for a screen reader */
  codeLabel?: string;
  /** turns the stage to another look, on or back, where a reader may */
  onTurn?: (by: 1 | -1) => void;
}) {
  const heading = createUniqueId();
  const hint = createUniqueId();
  let stage!: HTMLDivElement;
  /* a look a reader turned to is said to one who listens, as the tag says it */
  turnsSaid(
    () => stage,
    () => props.onTurn,
    () => props.drawn
  );
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
        {/* biome-ignore lint/a11y/useSemanticElements: the example, named for a reader who listens and turned by keys; a
            fieldset is for a form's controls */}
        <div
          ref={stage}
          class={styles.stage}
          data-look={props.onTurn ? props.id : undefined}
          role="group"
          aria-label={props.title}
          aria-describedby={props.onTurn ? hint : undefined}
          tabindex={props.onTurn ? 0 : undefined}
        >
          {props.children}
        </div>
        <figcaption class={styles.caption}>
          <span class={styles.drawn} data-differs={props.differs ? "" : undefined}>
            {props.drawn}
          </span>
          {notes()}
          <Show when={props.onTurn}>
            <TurnHint id={hint} />
          </Show>
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

/** Lets a reader turn a part to another look (swipe.ts's turnsOn) where `onTurn` gives a turn, and says to one who
    listens what `words` reads after each of their turns: the look as the part's tag names it, or the cards' count of
    looks, which says the turn was made where the words stay. Another palette, which other keys turn to, says nothing
    here. */
export function turnsSaid(
  part: () => HTMLElement,
  onTurn: () => ((by: 1 | -1) => void) | undefined,
  words: () => string
) {
  const [turned, setTurned] = createSignal(0);
  let said = 0;
  onSettled(() => {
    if (!onTurn()) return;
    return turnsOn(part(), by => {
      setTurned(n => n + 1);
      onTurn()?.(by);
    });
  });
  createEffect(
    () => [turned(), words()] as const,
    ([n, now]) => {
      if (n === said) return;
      said = n;
      announce(now);
    },
    { defer: true }
  );
}

/** How a reader turns a part to another look, beside its tag: the keys that do it where a pointer hovers, a swipe where
    a finger works the screen. */
export function TurnHint(props: { id: string }) {
  const row = keyRow("look");
  return (
    <span id={props.id} class={styles.hint}>
      <span class={styles.keysHint}>
        <For each={row ? rowKeys(row) : []}>
          {key => <kbd class={styles.key}>{showKey(key)}</kbd>}
        </For>
        {t("Another look")}
      </span>
      <span class={styles.swipeHint}>{t("Swipe for another look")}</span>
    </span>
  );
}
