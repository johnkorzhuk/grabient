import { createSignal, createUniqueId, For, Show, untrack } from "solid-js";
import block from "./CodeBlock.module.css";
import { CodeLines, refusedCopy } from "./CodeBlock.tsx";
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
  /** what Copy takes where it is not the text as shown: the text with what it elides written in whole (an effect's
      first frame inside its tags), made on the press */
  take?: (spelling?: string) => Promise<string>;
  /** the line under the code, in the reader's language */
  note?: (spelling?: string) => string;
  /** the text is pasted in parts, each under its header line (`// ==== Buffer A ====`, Shadertoy's tabs): a row of
      tabs shows one part at a time, which Copy takes */
  parted?: (spelling?: string) => boolean;
}

/** One part of a text pasted in parts: its name, its code, and whether its header names inputs to set (Shadertoy's
    channels). */
export interface CodePart {
  name: string;
  text: string;
  channels: boolean;
}

/* a header line of a text pasted in parts: the part's name between its rules, and after them what it reads */
const HEADER = /^\/\/ ={2,} (.+?) ={2,}(.*)$/;
/** A text pasted in parts, cut at its header lines: each part its header and the lines to the next, the lines before
    the first (a credit) going with the first. */
export function codeParts(code: string): CodePart[] {
  const parts: { name: string; channels: boolean; lines: string[] }[] = [];
  const lead: string[] = [];
  for (const line of code.split("\n")) {
    const header = HEADER.exec(line);
    if (header)
      parts.push({
        name: header[1],
        channels: /\biChannel\d/.test(header[2]),
        lines: parts.length ? [line] : [...lead, line]
      });
    else if (parts.length) parts.at(-1)!.lines.push(line);
    else lead.push(line);
  }
  return parts.map(({ name, channels, lines }) => ({
    name,
    text: `${lines.join("\n").trim()}\n`,
    channels
  }));
}

/* where the part shown goes: its Shadertoy tab, and the channels its header names */
const partNote = (part: CodePart) =>
  part.channels
    ? t(
        "Paste it into Shadertoy's {tab} tab, and set the tab's channels as the code's first line says.",
        {
          tab: part.name
        }
      )
    : t("Paste it into Shadertoy's {tab} tab.", { tab: part.name });

/* The palette as text, in a pane of the editor's sheet: one code block whose tabs are the kinds of text, the one Copy
   at their end; under them a row of spellings where a kind has more than one, and under that a row of parts where a
   spelling is pasted in parts (Shadertoy's tabs), one shown at a time; then the code, which Copy takes, and, under its
   ground, a line that says what it is. The spelling and the part chosen are kept per kind, and another text is read
   from its top. */
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
  /* a spelling kept for a kind is passed over where the kind no longer offers it: the gradient's GPL, once an effect's
     Colors, which offer none, take the tab's place */
  const spelling = () => {
    const { id, spellings: offered = [], initial } = source();
    return [spellings()[id], initial].find(s => offered.some(o => o.id === s)) ?? offered[0]?.id;
  };
  let code: HTMLElement | undefined;
  const copy = refusedCopy(() => code);
  const text = () => copy.shown(source().text(spelling()));
  /* a text pasted in parts: its parts, and the one shown, the first until the reader picks another */
  const [chosenParts, setChosenParts] = createSignal<Readonly<Record<string, string>>>({});
  const parts = () => (source().parted?.(spelling()) ? codeParts(text()) : []);
  const partKey = () => `${source().id}|${spelling() ?? ""}`;
  const part = () => {
    const all = parts();
    if (all.length < 2) return null;
    return all.find(p => p.name === chosenParts()[partKey()]) ?? all[0];
  };
  /* the code shown and copied: the part where the text is pasted in parts, else the whole */
  const shown = () => part()?.text ?? text();
  const take = () => {
    const { take } = source();
    const spelled = spelling();
    return take && !part() ? () => take(spelled) : undefined;
  };
  let scroller!: HTMLDivElement;
  const pick = (id: string) => {
    setKind(id);
    scroller.scrollTop = 0;
  };
  const spell = (id: string) => {
    setSpellings(all => ({ ...all, [source().id]: id }));
    scroller.scrollTop = 0;
  };
  const choosePart = (name: string) => {
    setChosenParts(all => ({ ...all, [partKey()]: name }));
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
          text={shown()}
          take={take()}
          aria-label={t("Copy code")}
          compact
          onCopy={value => props.onCopy?.(source().id, value, spelling())}
          onRefused={taken => copy.refuse(part() ? shown() : source().text(spelling()), taken)}
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
      <Show when={part()}>
        <div
          class={styles.spellings}
          role="tablist"
          aria-label={t("Shadertoy tab")}
          onKeyDown={e =>
            walk(
              e,
              parts().map(p => p.name),
              part()?.name,
              choosePart
            )
          }
        >
          <For each={parts()} keyed={false}>
            {p => (
              <button
                type="button"
                role="tab"
                class={[tabs.tab, styles.spelling]}
                aria-selected={p().name === part()?.name ? "true" : "false"}
                aria-controls={panel}
                tabindex={p().name === part()?.name ? 0 : -1}
                onClick={() => choosePart(p().name)}
              >
                {p().name}
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
            code={shown()}
            ref={el => {
              code = el;
            }}
          />
        </div>
        <Show
          when={[part() && partNote(part()!), source().note?.(spelling())]
            .filter(Boolean)
            .join(" ")}
        >
          {note => (
            <div class={block.foot}>
              <span class={block.note}>{note()}</span>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}
