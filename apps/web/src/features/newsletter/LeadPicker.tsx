import { locale, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { createSignal, onSettled, Show } from "solid-js";
import type { LeadSheet } from "./input.ts";
import styles from "./Newsletter.module.css";
import { chooseLead, readLead } from "./writes.ts";

/* An admin's choice of an issue's lead, over the lead's own picture. The arrows go through the palettes the issue
   offers, each drawn in the sheet as the issue would run with it; the check makes the one shown the lead, for the
   page and every issue sent from then on. Each sheet comes from the server the first time it is shown and is kept for
   the visit. The controls stand over the picture wherever the sheet draws it, measured from the sheet's own tree. */

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function LeadPicker(props: {
  number: number;
  /** the element whose shadow tree holds the sheet */
  host: () => HTMLElement | undefined;
  /** the sheet to show in place of the one the page drew */
  onShow: (html: string) => void;
}) {
  const [sheet, setSheet] = createSignal<LeadSheet | null>(null);
  const [box, setBox] = createSignal<Box | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal("");
  const kept = new Map<string, string>();

  const lead = () => props.host()?.shadowRoot?.querySelector('[data-part="lead"]');
  const measure = () => {
    const host = props.host();
    const picture = lead()?.getBoundingClientRect();
    // a sheet far from the screen is not laid out (content-visibility), and its picture has no size until it is
    if (!host || !picture?.width) return setBox(null);
    const outer = host.getBoundingClientRect();
    setBox({
      top: picture.top - outer.top,
      left: picture.left - outer.left,
      width: picture.width,
      height: picture.height
    });
  };
  /* the sheet and its lead's picture are watched for their sizes: the picture is a new element after each swap */
  let sizes: ResizeObserver | undefined;
  const watch = () => {
    sizes?.disconnect();
    const host = props.host();
    if (!host) return;
    sizes = new ResizeObserver(measure);
    sizes.observe(host);
    const picture = lead();
    if (picture) sizes.observe(picture);
  };
  const shown = (next: LeadSheet) => {
    setSheet(next);
    props.onShow(kept.get(next.shown) ?? next.html);
    // the sheet takes the new markup as its effect runs, before the next frame
    requestAnimationFrame(watch);
  };
  const read = async (seed?: string) => {
    setBusy(true);
    setFailed("");
    try {
      const next = await readLead(props.number, locale(), seed);
      kept.set(next.shown, next.html);
      shown(next);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : t("Something went wrong. Try again."));
    } finally {
      setBusy(false);
    }
  };
  const at = () => {
    const now = sheet();
    return now ? now.options.findIndex(option => option.seed === now.shown) : -1;
  };
  const step = (by: 1 | -1) => {
    const now = sheet();
    if (!now || busy()) return;
    const count = now.options.length;
    const seed = now.options[(at() + by + count) % count].seed;
    if (kept.has(seed)) shown({ ...now, shown: seed });
    else void read(seed);
  };
  const choose = async () => {
    const now = sheet();
    if (!now || busy() || now.chosen === now.shown) return;
    setBusy(true);
    setFailed("");
    try {
      const next = await chooseLead(props.number, now.shown, locale());
      kept.set(next.shown, next.html);
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

  onSettled(() => {
    void read();
    watch();
    return () => sizes?.disconnect();
  });

  return (
    <Show when={box()}>
      {place => (
        <fieldset
          class={styles.lead}
          aria-label={t("Lead palette")}
          aria-busy={busy() ? "true" : "false"}
          onKeyDown={keys}
          style={{
            top: `${place().top}px`,
            left: `${place().left}px`,
            width: `${place().width}px`,
            height: `${place().height}px`
          }}
        >
          <span class={styles.side} data-side="before">
            <Button
              variant="art"
              icon
              size="sm"
              aria-label={t("Previous lead")}
              onClick={() => step(-1)}
            >
              <Icon name="chevronLeft" size={14} />
            </Button>
          </span>
          <span class={styles.side} data-side="after">
            <Button
              variant="art"
              icon
              size="sm"
              aria-label={t("Next lead")}
              onClick={() => step(1)}
            >
              <Icon name="chevronRight" size={14} />
            </Button>
          </span>
          <span class={styles.check}>
            <Button
              variant={sheet()?.chosen === sheet()?.shown ? "primary" : "art"}
              icon
              size="sm"
              aria-label={t("Lead with this palette")}
              aria-pressed={!!sheet() && sheet()?.chosen === sheet()?.shown}
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
