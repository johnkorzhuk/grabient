import { locale, msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { createEffect, createSignal, onSettled, Show } from "solid-js";
import type { ChoiceSheet } from "./input.ts";
import styles from "./Newsletter.module.css";
import { chooseSheet, type IssuePart, readSheet, type SheetAsk } from "./writes.ts";

/* An admin's choice of a part of an issue among the ones it offers, over that part of the sheet: the palette it leads
   with, over the lead's picture, or the quick tip it ends with, along the tip's heading. The arrows go through the
   options, each drawn in the sheet as the issue would run with it, beside what the other part's picker shows; the check
   makes the one shown the issue's, for the page and every issue sent from then on. Each sheet comes from the server the
   first time it is shown and is kept for the visit. The controls stand where the sheet draws the part, measured from the
   sheet's own tree, and the options are asked for once it is drawn, so an issue with no tip asks nothing of tips. */

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
  /** the tip's way: the sheet's own, which its heading's line is read in */
  dir?: "ltr" | "rtl";
}

const WORDS = {
  lead: {
    group: msg("Lead palette"),
    previous: msg("Previous lead"),
    next: msg("Next lead"),
    choose: msg("Lead with this palette")
  },
  tip: {
    group: msg("Quick tip"),
    previous: msg("Previous tip"),
    next: msg("Next tip"),
    choose: msg("End with this tip")
  }
} as const;
/* where the controls stand in the sheet: the lead's picture, and the tip's heading, a level under the email's on a
   page */
const PLACE: Readonly<Record<IssuePart, string>> = {
  lead: '[data-part="lead"]',
  tip: '[data-part="tip"] :is(h2, h3)'
};

export function Picker(props: {
  number: number;
  part: IssuePart;
  /** the element whose shadow tree holds the sheet */
  host: () => HTMLElement | undefined;
  /** what the sheet is drawn with now, as each picker shows it */
  ask: () => SheetAsk;
  /** the sheet shown now, by either picker: the controls are placed again after each */
  shown: () => string | undefined;
  /** the sheet to show in place of the one the page drew, and the option it shows */
  onShow: (html: string, id: string) => void;
}) {
  const [sheet, setSheet] = createSignal<ChoiceSheet | null>(null);
  const [box, setBox] = createSignal<Box | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal("");
  const kept = new Map<string, string>();
  const words = () => WORDS[props.part];
  /* the other part as the sheet shows it, which every sheet this picker asks for is drawn with */
  const other = () => (props.part === "lead" ? props.ask().tip : props.ask().seed) ?? "";
  const keyOf = (id: string) => `${id}\n${other()}`;
  const asking = (id?: string): SheetAsk =>
    props.part === "lead" ? { ...props.ask(), seed: id } : { ...props.ask(), tip: id };

  const place = () => props.host()?.shadowRoot?.querySelector(PLACE[props.part]);
  const measure = () => {
    const host = props.host();
    const part = place();
    const rect = part?.getBoundingClientRect();
    // a sheet far from the screen is not laid out (content-visibility), and its part has no size until it is
    if (!host || !part || !rect?.width) return setBox(null);
    const outer = host.getBoundingClientRect();
    const top = rect.top - outer.top;
    if (props.part === "lead") {
      setBox({ top, left: rect.left - outer.left, width: rect.width, height: rect.height });
    } else {
      // the rest of the heading's line, after its words, so the controls never cover them
      const words = document.createRange();
      words.selectNodeContents(part);
      const said = words.getBoundingClientRect();
      const dir = getComputedStyle(part).direction === "rtl" ? "rtl" : "ltr";
      const [from, to] = dir === "rtl" ? [rect.left, said.left] : [said.right, rect.right];
      setBox({
        top,
        left: from - outer.left,
        width: Math.max(0, to - from),
        height: rect.height,
        dir
      });
    }
    if (!sheet() && !busy() && !failed()) void read();
  };
  /* the sheet and its part are watched for their sizes: the part is a new element after each swap */
  let sizes: ResizeObserver | undefined;
  const watch = () => {
    sizes?.disconnect();
    const host = props.host();
    if (!host) return;
    sizes = new ResizeObserver(measure);
    sizes.observe(host);
    const part = place();
    if (part) sizes.observe(part);
  };
  const show = (next: ChoiceSheet) => {
    setSheet(next);
    props.onShow(kept.get(keyOf(next.shown)) ?? next.html, next.shown);
  };
  const read = async (id?: string) => {
    setBusy(true);
    setFailed("");
    const drawnWith = other();
    try {
      const next = await readSheet(props.part, props.number, locale(), asking(id));
      kept.set(`${next.shown}\n${drawnWith}`, next.html);
      // the other part moved on while this sheet was on its way: the sheet shown is the newer one
      if (drawnWith === other()) show(next);
      else setSheet(next);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : t("Something went wrong. Try again."));
    } finally {
      setBusy(false);
    }
  };
  const at = () => {
    const now = sheet();
    return now ? now.options.findIndex(option => option.id === now.shown) : -1;
  };
  const step = (by: 1 | -1) => {
    const now = sheet();
    if (!now || busy()) return;
    const count = now.options.length;
    const id = now.options[(at() + by + count) % count].id;
    if (kept.has(keyOf(id))) show({ ...now, shown: id });
    else void read(id);
  };
  const choose = async () => {
    const now = sheet();
    if (!now || busy() || now.chosen === now.shown) return;
    setBusy(true);
    setFailed("");
    try {
      const next = await chooseSheet(props.part, props.number, now.shown, locale(), props.ask());
      kept.set(keyOf(next.shown), next.html);
      setSheet(next);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : t("Something went wrong. Try again."));
    } finally {
      setBusy(false);
    }
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    // the arrows go the way the sheet reads, which is the page's way
    const forward =
      (e.key === "ArrowRight") ===
      (getComputedStyle(e.currentTarget as Element).direction !== "rtl");
    step(forward ? 1 : -1);
  };

  /* a sheet either picker shows takes the markup as its effect runs, before the next frame */
  createEffect(
    () => props.shown(),
    () => {
      requestAnimationFrame(watch);
    }
  );
  onSettled(() => {
    watch();
    return () => sizes?.disconnect();
  });

  const chosen = () => !!sheet() && sheet()?.chosen === sheet()?.shown;
  return (
    <Show when={box()}>
      {where => (
        <fieldset
          class={styles.picker}
          data-part={props.part}
          dir={where().dir}
          aria-label={t(words().group)}
          aria-busy={busy() ? "true" : "false"}
          onKeyDown={keys}
          style={{
            top: `${where().top}px`,
            left: `${where().left}px`,
            width: `${where().width}px`,
            height: `${where().height}px`
          }}
        >
          <span class={styles.side} data-side="before">
            <Button
              variant={props.part === "lead" ? "art" : "ghost"}
              icon
              size="sm"
              aria-label={t(words().previous)}
              onClick={() => step(-1)}
            >
              <Icon name="chevronLeft" size={14} />
            </Button>
          </span>
          <span class={styles.side} data-side="after">
            <Button
              variant={props.part === "lead" ? "art" : "ghost"}
              icon
              size="sm"
              aria-label={t(words().next)}
              onClick={() => step(1)}
            >
              <Icon name="chevronRight" size={14} />
            </Button>
          </span>
          <span class={styles.check}>
            <Button
              variant={chosen() ? "primary" : props.part === "lead" ? "art" : "secondary"}
              icon
              size="sm"
              aria-label={t(words().choose)}
              aria-pressed={chosen()}
              onClick={() => void choose()}
            >
              <Icon name="check" size={14} />
            </Button>
          </span>
          <Show when={sheet()}>
            {now => (
              <p class={styles.which} aria-live="polite">
                <Show when={!failed() && now().chosen === now().shown}>
                  <Icon name="check" size={12} />
                </Show>
                <span dir="auto">{failed() || now().options[at()]?.name}</span>
                <span>{t("{at} of {count}", { at: at() + 1, count: now().options.length })}</span>
              </p>
            )}
          </Show>
        </fieldset>
      )}
    </Show>
  );
}
