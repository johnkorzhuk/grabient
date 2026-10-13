import { t } from "@grabient/i18n";
import { BarRim } from "@grabient/ui/BarRim.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { tooltip } from "@grabient/ui/Tooltip.tsx";
import { createEffect, createUniqueId, Show, untrack } from "solid-js";
import styles from "./SearchField.module.css";

/* The search field over a list. Every committed keystroke reaches the page and Enter submits; text an input method is
   still composing counts once it is committed. It draws its own clear press, since the browser's varies by engine and is
   mostly out of the keyboard's reach. Where the page reads pictures, the picture press stands in the clear press's place
   while the field is empty, and a picture dropped or pasted on the field goes to the page. The page owns the words: it
   writes them while nobody is composing, and the field keeps a reader's caret. */
export function SearchField(props: {
  /** the words the page holds; the clear press shows while there are any */
  value?: string;
  placeholder?: string;
  /** a pasted link may be long; the page says how long */
  maxlength?: number;
  /** every committed keystroke, and "" when the field is cleared */
  onInput?: (words: string) => void;
  /** Enter: the words, trimmed */
  onSubmit?: (words: string) => void;
  /** the words stay in view and nothing can be typed or cleared */
  disabled?: boolean;
  /** the search as a tool an agent in the browser can call (WebMCP's form annotations) */
  tool?: { name: string; description: string; words?: string };
  /** a picture picked, dropped or pasted */
  onImage?: (file: File) => void;
}) {
  const id = createUniqueId();
  let input!: HTMLInputElement;
  let picker!: HTMLInputElement;
  let composing = false;
  const filled = () => (props.value ?? "") !== "";
  const clearable = () => filled() && !props.disabled;
  const takes = () => !!props.onImage && !props.disabled;

  createEffect(
    () => props.value ?? "",
    words => {
      if (!composing && input.value !== words) input.value = words;
    }
  );

  const clear = () => {
    input.value = "";
    props.onInput?.("");
    input.focus();
  };
  const pictureOf = (files?: FileList | null) =>
    [...(files ?? [])].find(file => file.type.startsWith("image/"));
  // only a picture is taken: dropped or pasted words and links reach the field as they always do
  const take = (e: Event, files?: FileList | null) => {
    const file = takes() ? pictureOf(files) : undefined;
    if (!file) return;
    e.preventDefault();
    props.onImage?.(file);
  };
  const picked = () => {
    const file = pictureOf(picker.files);
    picker.value = "";
    if (file && takes()) props.onImage?.(file);
  };
  // WebMCP's annotations are in no element's types yet; the form submits itself when an agent fills it
  const formTool = (): Record<string, string> =>
    props.tool
      ? { toolname: props.tool.name, tooldescription: props.tool.description, toolautosubmit: "" }
      : {};
  const fieldTool = (): Record<string, string> =>
    props.tool?.words ? { toolparamdescription: props.tool.words } : {};
  const label = () => props.placeholder ?? t("Search palettes");

  return (
    <search class={styles.form}>
      <form
        {...formTool()}
        onSubmit={e => {
          e.preventDefault();
          props.onSubmit?.(input.value.trim());
        }}
      >
        <label for={id} hidden>
          {label()}
        </label>
        {/* a picture dropped on the field goes to the page; the field and its presses are the controls */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target, beside controls the keyboard reaches */}
        <div
          class={styles.wrap}
          data-disabled={props.disabled ? "" : undefined}
          onDragOver={e => {
            if (takes() && e.dataTransfer?.types.includes("Files")) e.preventDefault();
          }}
          onDrop={e => take(e, e.dataTransfer?.files)}
        >
          <BarRim />
          <span class={styles.glyph}>
            <Icon name="search" size={15} />
          </span>
          {/* the words read in their own direction (English words in an Arabic page); empty, the field keeps the page's */}
          <input
            ref={input}
            id={id}
            class={styles.input}
            type="search"
            name="q"
            {...fieldTool()}
            dir={filled() ? "auto" : undefined}
            value={untrack(() => props.value ?? "")}
            placeholder={label()}
            maxlength={props.maxlength}
            autocomplete="off"
            spellcheck={false}
            enterkeyhint="search"
            disabled={props.disabled}
            onInput={e => {
              if (!e.isComposing) props.onInput?.(e.currentTarget.value);
            }}
            onCompositionStart={() => {
              composing = true;
            }}
            onCompositionEnd={e => {
              composing = false;
              props.onInput?.(e.currentTarget.value);
            }}
            onPaste={e => take(e, e.clipboardData?.files)}
          />
          <Show when={props.onImage}>
            <input ref={picker} type="file" accept="image/*" hidden onChange={picked} />
            {/* offline it keeps its place, dimmed with the field, since reading a picture leads to a search */}
            <button
              type="button"
              ref={tooltip(() => t("Search by image"))}
              class={styles.press}
              data-idle={filled() ? "" : undefined}
              aria-label={t("Search by image")}
              aria-hidden={filled() ? "true" : undefined}
              tabindex={filled() ? -1 : 0}
              disabled={props.disabled}
              onClick={() => picker.click()}
            >
              <Icon name="image" size={15} />
            </button>
          </Show>
          <button
            type="button"
            class={styles.press}
            data-idle={clearable() ? undefined : ""}
            aria-label={t("Clear search")}
            aria-hidden={clearable() ? undefined : "true"}
            tabindex={clearable() ? 0 : -1}
            onClick={clear}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </form>
    </search>
  );
}
