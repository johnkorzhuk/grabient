import { createSignal, createUniqueId, For, Show, untrack } from "solid-js";
import block from "./CodeBlock.module.css";
import { CodeLines, selectText } from "./CodeBlock.tsx";
import { CopyButton } from "./CopyButton.tsx";
import { t } from "./i18n.ts";
import styles from "./PaletteCode.module.css";
import tabs from "./tabs.module.css";
import { tabAfter } from "./tabs.ts";

/** One kind of text a palette is written as (Seed, CSS, Colors, Shader, JSON, SVG, MD), in its spellings. */
export interface CodeSource {
  id: string;
  /** a message: the tab translates it */
  label: string;
  /** the spellings on offer where there is more than one: names, shown as they are */
  spellings?: readonly { id: string; label: string }[];
  /** the spelling shown until the reader picks one; the first where left out */
  initial?: string;
  text: (spelling?: string) => string;
  /** the line under the code, in the reader's language */
  note?: (spelling?: string) => string;
}

/* The palette as text, in a pane of the editor's sheet: one code block whose tabs are the kinds of text, the one Copy
   at their end; under them a row of spellings where a kind has more than one; then the code and, under its ground, a
   line that says what it is. The spelling chosen is kept per kind, and another text is read from its top. */
export function PaletteCode(props: {
  sources: readonly CodeSource[];
  initial?: string;
  /** a copy made: the kind, the text and its spelling */
  onCopy?: (id: string, text: string, spelling?: string) => void;
  /** as tall as the box it stands in, which sets its height; longer code scrolls inside */
  fill?: boolean;
}) {
  const panel = createUniqueId();
  const [kind, setKind] = createSignal(untrack(() => props.initial));
  const [spellings, setSpellings] = createSignal<Readonly<Record<string, string>>>({});
  const source = () => props.sources.find(s => s.id === kind()) ?? props.sources[0];
  const spelling = () =>
    spellings()[source().id] ?? source().initial ?? source().spellings?.[0]?.id;
  const text = () => source().text(spelling());
  let code: HTMLElement | undefined;
  let scroller!: HTMLDivElement;
  const pick = (id: string) => {
    setKind(id);
    scroller.scrollTop = 0;
  };
  const spell = (id: string) => {
    setSpellings(all => ({ ...all, [source().id]: id }));
    scroller.scrollTop = 0;
  };
  /* each row of tabs is one Tab stop on the chosen tab; the arrows (as the row is seen), Home and End choose and move
     the focus */
  const walk = (
    e: KeyboardEvent,
    ids: readonly string[],
    now: string | undefined,
    choose: (id: string) => void
  ) => {
    const j = tabAfter(e, ids.length, Math.max(0, ids.indexOf(now ?? "")));
    if (j < 0) return;
    e.preventDefault();
    choose(ids[j]);
    (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="tab"]')[j]?.focus();
  };
  return (
    <div class={[block.block, styles.code]} data-fill={props.fill ? "" : undefined}>
      <div class={block.bar}>
        <div
          class={block.tabs}
          role="tablist"
          aria-label={t("Format")}
          onKeyDown={e =>
            walk(
              e,
              props.sources.map(s => s.id),
              source().id,
              pick
            )
          }
        >
          <For each={props.sources} keyed={false}>
            {s => (
              <button
                type="button"
                role="tab"
                class={tabs.tab}
                aria-selected={s().id === source().id ? "true" : "false"}
                aria-controls={panel}
                tabindex={s().id === source().id ? 0 : -1}
                onClick={() => pick(s().id)}
              >
                {t(s().label)}
              </button>
            )}
          </For>
        </div>
        <CopyButton
          text={text()}
          aria-label={t("Copy code")}
          compact
          onCopy={value => props.onCopy?.(source().id, value, spelling())}
          onRefused={() => selectText(code)}
        />
      </div>
      <Show when={(source().spellings?.length ?? 0) > 1}>
        <div
          class={styles.spellings}
          role="tablist"
          aria-label={t("Syntax")}
          onKeyDown={e =>
            walk(
              e,
              (source().spellings ?? []).map(s => s.id),
              spelling(),
              spell
            )
          }
        >
          <For each={source().spellings ?? []} keyed={false}>
            {s => (
              <button
                type="button"
                role="tab"
                class={[tabs.tab, styles.spelling]}
                aria-selected={s().id === spelling() ? "true" : "false"}
                aria-controls={panel}
                tabindex={s().id === spelling() ? 0 : -1}
                onClick={() => spell(s().id)}
              >
                {s().label}
              </button>
            )}
          </For>
        </div>
      </Show>
      <div
        id={panel}
        role="tabpanel"
        aria-label={t("{label}, as text", { label: t(source().label) })}
        class={block.body}
      >
        <div ref={scroller} class={block.panel}>
          <CodeLines
            code={text()}
            ref={el => {
              code = el;
            }}
          />
        </div>
        <Show when={source().note}>
          {note => (
            <div class={block.foot}>
              <span class={block.note}>{note()(spelling())}</span>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}
