import { type Element, For, Show } from "solid-js";
import { Icon, type IconName } from "./Icon.tsx";
import styles from "./Segmented.module.css";

export interface SegmentedOption {
  value: string;
  label: string;
  /** the choice is a page: the row is a nav of links */
  href?: string;
  /** the link's relation to its page: nofollow where the index keeps it out */
  rel?: string;
  /** a glyph before the word */
  icon?: IconName;
  /** what the choice is set to, after its name: short (1w), lighter and quieter */
  detail?: string;
  /** every form `detail` takes, so the choice keeps one shape and its name one place as it changes */
  forms?: readonly string[];
  /** the choice said in full where `detail` shortens it: its accessible name */
  name?: string;
  /** shown and not chosen now: a page that needs the connection the browser lacks */
  disabled?: boolean;
}

/** A few choices that are one setting, all in view, the chosen one in ink: a radio group that is one Tab stop, moved
    by the arrows as the reader sees the row. Choices that are pages render as a nav of links, the chosen one the
    current page: a plain press still goes through onChange so the page decides what it means, and a modified press
    opens the address. A press on the chosen one goes through onChange too. */
export function Segmented(props: {
  options: readonly SegmentedOption[];
  value: string;
  "aria-label": string;
  /** the control height, for a row of tools */
  size?: "sm" | "lg";
  /** the pointer or the keyboard reached a choice: a page may fetch what the press would open */
  onIntent?: (value: string) => void;
  onChange: (value: string) => void;
}) {
  const intent = (value: string) => {
    if (value !== props.value) props.onIntent?.(value);
  };
  /* the choice the keyboard stands on: the chosen one, or the first while none is */
  const stop = () =>
    props.options.some(o => o.value === props.value) ? props.value : props.options[0]?.value;
  /* the next choice that can be taken, past any that cannot now */
  const move = (group: HTMLElement, step: number) => {
    const n = props.options.length;
    const at = Math.max(
      0,
      props.options.findIndex(o => o.value === props.value)
    );
    for (let k = 1; k < n; k++) {
      const j = (at + step * k + n * n) % n;
      if (props.options[j].disabled) continue;
      props.onChange(props.options[j].value);
      group.querySelectorAll<HTMLElement>('[role="radio"]')[j]?.focus();
      return;
    }
  };
  const keys = (e: KeyboardEvent) => {
    const group = e.currentTarget as HTMLElement;
    /* in a right-to-left row the first choice stands at the right, so the right arrow goes back */
    const right = getComputedStyle(group).direction === "rtl" ? -1 : 1;
    const step = { ArrowRight: right, ArrowLeft: -right, ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    move(group, step);
  };
  /* a plain press on a page's link is the page's to decide; bound on the link itself, so it answers before a listener
     on the document that turns every link into a change of page */
  const press = (value: () => string) => (el: HTMLAnchorElement) =>
    el.addEventListener("click", e => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      props.onChange(value());
    });
  const pages = () => props.options.some(o => o.href !== undefined);
  return (
    <Show
      when={pages()}
      fallback={
        <div
          role="radiogroup"
          aria-label={props["aria-label"]}
          class={styles.track}
          data-size={props.size}
          onKeyDown={keys}
        >
          <For each={props.options} keyed={false}>
            {o => (
              /* biome-ignore lint/a11y/useSemanticElements: a press on the chosen one goes through onChange, which a
                 native radio never reports */
              <button
                type="button"
                role="radio"
                class={styles.choice}
                aria-label={o().name}
                aria-checked={o().value === props.value ? "true" : "false"}
                tabindex={o().value === stop() ? 0 : -1}
                disabled={o().disabled}
                onPointerEnter={() => intent(o().value)}
                onFocus={() => intent(o().value)}
                onClick={() => props.onChange(o().value)}
              >
                {face(o())}
              </button>
            )}
          </For>
        </div>
      }
    >
      <nav aria-label={props["aria-label"]} class={styles.track} data-size={props.size}>
        <For each={props.options} keyed={false}>
          {o => (
            <Show
              when={o().href !== undefined}
              fallback={
                /* a choice with no page of its own to offer (the account's Saved) stays a press */
                <button
                  type="button"
                  class={styles.choice}
                  aria-label={o().name}
                  aria-current={o().value === props.value ? "page" : undefined}
                  disabled={o().disabled}
                  onPointerEnter={() => intent(o().value)}
                  onFocus={() => intent(o().value)}
                  onClick={() => props.onChange(o().value)}
                >
                  {face(o())}
                </button>
              }
            >
              {/* a page that cannot be reached now keeps its place and has no address, so no press or Tab lands on it */}
              <a
                ref={press(() => o().value)}
                class={styles.choice}
                href={o().disabled ? undefined : o().href}
                rel={o().rel}
                aria-label={o().name}
                aria-current={o().value === props.value ? "page" : undefined}
                aria-disabled={o().disabled ? "true" : undefined}
                onPointerEnter={() => {
                  if (!o().disabled) intent(o().value);
                }}
                onFocus={() => intent(o().value)}
              >
                {face(o())}
              </a>
            </Show>
          )}
        </For>
      </nav>
    </Show>
  );
}

/* A choice's face: its word, or its glyph and word. A word alone stays a single text child, so the server writes the
   bare word, which crawlers and agents read the row by. A choice that says what it is set to stands in two layers over
   one cell: an unseen one that takes the shape of the name beside the widest form the setting takes, on one line where
   there is room and the forms under the name where a language's words run long, and the seen one, which takes that
   shape. So a choice is one line or two by its language and width alone, never by the form it shows, and its name
   keeps its place as the setting changes. */
function face(o: SegmentedOption): Element {
  if (o.detail)
    return (
      <span class={styles.pair}>
        <span class={styles.fit} aria-hidden="true" data-name={o.label}>
          <span class={styles.forms}>
            {(o.forms ?? [o.detail]).map(form => (
              <span class={styles.form} data-form={form} />
            ))}
          </span>
        </span>
        <span class={styles.face}>
          <span class={styles.set}>
            <span>{o.label}</span> <span class={styles.detail}>{o.detail}</span>
          </span>
        </span>
      </span>
    );
  if (o.icon)
    return (
      <>
        <Icon name={o.icon} size={14} />
        {o.label}
      </>
    );
  return o.label;
}
