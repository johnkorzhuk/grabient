import { createSignal, createUniqueId, For, onSettled, Show } from "solid-js";
import block from "./CodeBlock.module.css";
import { CodeLines, selectText } from "./CodeBlock.tsx";
import styles from "./CodeTabs.module.css";
import { CopyButton } from "./CopyButton.tsx";
import hidden from "./hidden.module.css";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import tabs from "./tabs.module.css";
import { tabAfter } from "./tabs.ts";

export interface CodeTab {
  /** the tab's name, as it is: an app's name is the same in every language */
  label: string;
  /** what the panel shows and Copy takes */
  code: string;
  /** where the code goes, under it: a file or a place in an app as the app writes it (`path`), or words */
  where?: { text: string; path?: boolean };
  /** the maker's guide, at the end of that line; with no `href` it cannot be reached now and leads nowhere */
  guide?: { label: string; href?: string };
}

/** Code in tabs, one shown at a time, with one Copy: the tabs and Copy at their end, the chosen code, then where it
    goes and its maker's guide. The tabs are one Tab stop, walked by the arrows, Home and End. */
export function CodeTabs(props: {
  tabs: readonly CodeTab[];
  "aria-label": string;
  /** a specimen's state, held: Copied */
  state?: "copied";
}) {
  const [on, setOn] = createSignal(0);
  const tab = () => props.tabs[on()] ?? props.tabs[0];
  const id = createUniqueId();
  let row!: HTMLDivElement;
  let scroller!: HTMLDivElement;
  let code: HTMLElement | undefined;
  /* whether the row has tabs past its start and past its end; none until the row is measured, as the server drew it */
  const [edges, setEdges] = createSignal({ less: 0, more: 0 });
  const measure = () => {
    const at = Math.abs(row.scrollLeft);
    const room = row.scrollWidth - row.clientWidth;
    const next = { less: at > 1 ? 1 : 0, more: room - at > 1 ? 1 : 0 };
    if (next.less !== edges().less || next.more !== edges().more) setEdges(next);
  };
  onSettled(() => {
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(row);
    return () => sizes.disconnect();
  });
  const tabAt = (i: number) => row.querySelectorAll<HTMLElement>('[role="tab"]')[i];
  /* a tab chosen at the row's edge comes fully into the row, and its code is read from its top */
  const choose = (i: number) => {
    setOn(i);
    tabAt(i)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    scroller.scrollTop = 0;
  };
  const walk = (e: KeyboardEvent) => {
    const next = tabAfter(e, props.tabs.length, on());
    if (next < 0) return;
    e.preventDefault();
    choose(next);
    tabAt(next)?.focus();
  };
  return (
    <div class={block.block}>
      <div class={block.bar}>
        <div
          ref={row}
          class={block.tabs}
          style={{ "--less": String(edges().less), "--more": String(edges().more) }}
          role="tablist"
          aria-label={props["aria-label"]}
          onKeyDown={walk}
          onScroll={measure}
        >
          <For each={props.tabs} keyed={false}>
            {(item, i) => (
              <button
                type="button"
                role="tab"
                id={`${id}-${i}`}
                class={tabs.tab}
                aria-selected={i === on() ? "true" : "false"}
                aria-controls={`${id}-panel`}
                tabindex={i === on() ? 0 : -1}
                onClick={() => choose(i)}
              >
                {item().label}
              </button>
            )}
          </For>
        </div>
        {/* a copy the browser refuses selects the code for the reader to copy */}
        <CopyButton
          text={tab()?.code ?? ""}
          aria-label={t("Copy code")}
          compact
          state={props.state}
          onRefused={() => selectText(code)}
        />
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${on()}`} class={block.body}>
        <div ref={scroller} class={block.panel}>
          <CodeLines
            code={tab()?.code ?? ""}
            ref={el => {
              code = el;
            }}
          />
        </div>
        <Show when={tab()?.where || tab()?.guide}>
          <div class={block.foot}>
            <Show when={tab()?.where}>
              {where => (
                <span class={block.note} dir={where().path ? "ltr" : undefined}>
                  {where().text}
                </span>
              )}
            </Show>
            <Show when={tab()?.guide}>
              {guide => (
                <a
                  class={styles.guide}
                  href={guide().href}
                  aria-disabled={guide().href ? undefined : "true"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {guide().label}
                  <span class={styles.glyph}>
                    <Icon name="external" size={12} />
                  </span>
                  <span class={hidden.text}>{t("(opens in a new tab)")}</span>
                </a>
              )}
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}
