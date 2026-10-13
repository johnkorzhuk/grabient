import { cardBackground } from "@grabient/engine/css.ts";
import { seedName } from "@grabient/engine/name.ts";
import { isStyle, type Style, viewSearch } from "@grabient/engine/view.ts";
import { locale, localHref, t } from "@grabient/i18n";
import { type Format, FormatStrip } from "@grabient/ui/FormatStrip.tsx";
import { PaletteSheet } from "@grabient/ui/PaletteSheet.tsx";
import { Segmented } from "@grabient/ui/Segmented.tsx";
import { SolidPane } from "@grabient/ui/SolidPane.tsx";
import { useQueryClient } from "@tanstack/solid-query";
import {
  createEffect,
  createMemo,
  createSignal,
  type Element,
  For,
  onSettled,
  Show,
  untrack
} from "solid-js";
import { offline } from "../../app/connection.ts";
import { toast } from "../../app/toast.ts";
import { heading } from "../../lib/page-meta.ts";
import { seedAddress } from "./address.ts";
import { codeSources } from "./code.ts";
import type { PaletteEditor } from "./editor.ts";
import { copyContrast, NO_IMAGE_CLIPBOARD, saveContrast, type Taken } from "./formats.ts";
import type { PaletteData } from "./page.ts";
import type { Rest } from "./rest.ts";
import styles from "./Sheet.module.css";
import { ordered, type Similar, similarQuery } from "./similar.ts";

/* The editor's sheet: the palette's name, the collections that hold it, which of its colors read on which and on the
   reader's own text colors, its path through the color solid, the palette as text, and the palettes like it. All but
   the last two are read from the palette, in the browser. The palettes like it, and the public collections the
   answer names, are asked for only while the sheet has a good part of the window and the palette has rested: a
   palette opened and edited on the first screen asks the server nothing however many edits it takes. */

/* how many of the palettes like this one are drawn */
const SHOWN = 12;
/* the sheet has the window's lower two fifths: the reader has left the first screen for it */
const IN_VIEW = "0px 0px -40% 0px";
const CONTRAST: Format[] = ["svg", "png"];
const INKS_KEY = "grabient-contrast-inks";
const INKS_MAX = 12;

/** The reader's own text colors for the contrast grid, kept in this browser, written once they rest. */
function createInks() {
  const [inks, setInks] = createSignal<string[]>([]);
  onSettled(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(INKS_KEY) ?? "[]");
      if (Array.isArray(raw))
        setInks(
          [
            ...new Set(
              raw.filter((h): h is string => typeof h === "string" && /^#[0-9a-f]{6}$/.test(h))
            )
          ].slice(0, INKS_MAX)
        );
    } catch {
      /* none kept */
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const write = (next: string[]) => {
    setInks(next);
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        if (next.length) localStorage.setItem(INKS_KEY, JSON.stringify(next));
        else localStorage.removeItem(INKS_KEY);
      } catch {
        /* a browser that keeps no site data: they last as long as the page */
      }
    }, 300);
  };
  return [inks, write] as const;
}

export function Sheet(props: {
  editor: PaletteEditor;
  rest: Rest;
  facts: () => PaletteData["facts"];
  heading: () => string | undefined;
  opened: () => string;
  taken: () => Taken;
  used: (action: "copy" | "download", format: string) => void;
  actions: Element;
  /** the way into the selection, at the end of the row of palettes like this one */
  selection: Element;
  resting: boolean;
  clear: boolean;
  onBand: (height: number) => void;
}) {
  const e = untrack(() => props.editor);
  const rest = untrack(() => props.rest);
  const queries = useQueryClient();
  let sheet!: HTMLElement;
  const [inks, setInks] = createInks();
  const view = () => ({ style: e.style(), steps: e.steps(), angle: e.angle() });
  /* the figures under the sheet's head come a task after it: neither is on the first screen, and a phone answers
     between the two */
  const [figured, setFigured] = createSignal(false);
  onSettled(() => {
    const timer = setTimeout(() => setFigured(true), 0);
    return () => clearTimeout(timer);
  });

  /* the palettes like this one: the answer read last, or one the browser keeps, so a palette an undo or Back returns
     to shows its palettes at once */
  const [inView, setInView] = createSignal(false);
  onSettled(() => {
    const seen = new IntersectionObserver(
      entries => setInView(entries[entries.length - 1].isIntersecting),
      {
        rootMargin: IN_VIEW
      }
    );
    seen.observe(sheet);
    return () => seen.disconnect();
  });
  const [answered, setAnswered] = createSignal<{ seed: string; answer: Similar } | null>(null);
  const [failed, setFailed] = createSignal<string | null>(null);
  const answer = createMemo((): Similar | null => {
    const seed = e.seed();
    const got = answered();
    if (got?.seed === seed) return got.answer;
    return queries.getQueryData(similarQuery(seed, locale()).queryKey) ?? null;
  });
  createEffect(
    () => [inView(), e.seed()] as const,
    ([inside, seed]) => {
      if (!inside) return;
      const options = similarQuery(seed, locale());
      /* a fresh answer the browser keeps is no ask: it neither waits nor lengthens the next wait */
      const kept = queries.getQueryState(options.queryKey);
      if (kept?.data && Date.now() - kept.dataUpdatedAt < 5 * 60_000) return;
      setFailed(null);
      rest.is(seed);
      const timer = setTimeout(() => {
        rest.asked(seed);
        queries.fetchQuery(options).then(
          got => setAnswered({ seed, answer: got }),
          () => setFailed(seed)
        );
      }, rest.left());
      return () => {
        clearTimeout(timer);
        void queries.cancelQueries({ queryKey: options.queryKey });
      };
    }
  );
  const [order, setOrder] = createSignal<"popular" | "rising">("popular");
  const like = createMemo(() => {
    const got = answer();
    return got
      ? ordered(
          got.items.filter(item => item.kseed !== e.seed()),
          order()
        ).slice(0, SHOWN)
      : null;
  });

  /* the collections that hold the palette the page opened on: the server's, where it sent the page, else the answer's */
  const collections = () => {
    const held = props.facts()?.heldBy ?? answer()?.heldBy ?? [];
    return held.map(c => ({
      title: c.title,
      href: offline() ? undefined : `/${c.slug}`,
      colors: c.colors
    }));
  };
  /* What the reader set on this page (a style, steps or an angle) goes for every palette drawn here, as a list's
     choice goes for its cards; otherwise each is drawn as it was saved. The stage's size goes with every link. */
  const set = () => e.opened().set;
  const drawn = (item: { kseed: string; style: string; steps: number; angle: number }) => ({
    seed: item.kseed,
    view: {
      style: set().style
        ? e.style()
        : isStyle(item.style)
          ? item.style
          : ("linearGradient" as Style),
      steps: set().steps ? e.steps() : item.steps,
      angle: set().angle ? e.angle() : item.angle,
      size: e.size()
    }
  });
  const likeHref = () => {
    const query = new URLSearchParams(viewSearch({ ...view(), size: e.size() }).slice(1));
    query.set("q", e.seed());
    if (order() === "rising") return `/palettes/rising?${query}`;
    return `/palettes?${query}`;
  };
  const title = () =>
    props.heading() ||
    heading({
      kind: "palette",
      seed: e.seed(),
      palette: e.palette(),
      view: view(),
      ...(props.facts()?.written ? { written: props.facts()?.written } : {})
    }) ||
    t("Palette editor");
  const contrastCopy = async (f: Format) => {
    try {
      await copyContrast(f, props.taken(), inks());
      props.used("copy", `contrast:${f}`);
      return true;
    } catch (error) {
      toast(
        error instanceof Error && error.message === NO_IMAGE_CLIPBOARD
          ? t("Images can't be copied here.")
          : t("Couldn't copy the palette.")
      );
      return false;
    }
  };
  return (
    <PaletteSheet
      ref={el => {
        sheet = el;
      }}
      title={title()}
      onBand={props.onBand}
      clear={props.clear}
      resting={props.resting}
      actions={props.actions}
      selection={props.selection}
      collections={collections()}
      order={
        <Segmented
          aria-label={t("Order")}
          value={order()}
          options={[
            { value: "popular", label: t("Popular", { $context: "order" }) },
            { value: "rising", label: t("Rising", { $context: "order" }) }
          ]}
          onChange={value => setOrder(value === "rising" ? "rising" : "popular")}
        />
      }
      sources={codeSources(
        e.palette(),
        view(),
        e.seed(),
        () => ({ facts: props.facts(), opened: props.opened() === e.seed() }),
        rest
      )}
      onCopy={(id, _text, spelling) =>
        props.used("copy", spelling ? `code:${id}:${spelling}` : `code:${id}`)
      }
      colors={figured() ? e.stops() : []}
      contrastCopies={
        <FormatStrip
          size="sm"
          variant="paper"
          copy={CONTRAST}
          download={CONTRAST}
          onCopy={contrastCopy}
          onDownload={f =>
            void saveContrast(f, props.taken(), inks()).then(
              () => props.used("download", `contrast:${f}`),
              () => toast(t("Couldn't download the file."))
            )
          }
        />
      }
      inks={inks()}
      onInks={setInks}
      solid={
        figured() && (
          <SolidPane
            palette={e.shownPalette()}
            wide={e.wide()}
            steps={e.steps()}
            stepped={e.style().endsWith("Swatches")}
            selection={e.held()}
            onSelect={e.pick}
            onSweep={e.sweep}
            onHover={e.setReading}
            seed={e.seed()}
            style={e.style()}
            angle={e.angle()}
            onTake={(action, f) => props.used(action, `space:${f}`)}
          />
        )
      }
    >
      <Show
        when={like()}
        fallback={
          <Show when={inView() && failed() !== e.seed()}>
            <div class={styles.cards} aria-hidden="true">
              <For each={Array.from({ length: SHOWN }, (_, i) => i)}>
                {() => <span class={styles.placeholder} />}
              </For>
            </div>
          </Show>
        }
      >
        {list => (
          <Show when={list().length}>
            <section class={styles.similar} aria-labelledby="similar-palettes">
              <h2 id="similar-palettes" class={styles.heading}>
                <a href={offline() ? undefined : localHref(likeHref())}>{t("Similar palettes")}</a>
              </h2>
              <div class={styles.cards}>
                <For each={list()} keyed={item => item.kseed}>
                  {item => {
                    const card = () => drawn(item());
                    return (
                      <a
                        class={styles.card}
                        href={localHref(seedAddress(card()))}
                        aria-label={t("{name} palette", {
                          name:
                            seedName(card().seed, card().view.style, card().view.steps, {
                              t,
                              locale: locale()
                            }) ?? card().seed
                        })}
                      >
                        <span
                          class={styles.art}
                          style={{
                            background:
                              cardBackground(
                                card().seed,
                                card().view.style,
                                card().view.steps,
                                card().view.angle
                              ) ?? undefined
                          }}
                        />
                      </a>
                    );
                  }}
                </For>
              </div>
            </section>
          </Show>
        )}
      </Show>
    </PaletteSheet>
  );
}
