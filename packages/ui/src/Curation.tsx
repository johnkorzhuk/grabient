import { gradientCss } from "@grabient/engine/css.ts";
import { numeral } from "@grabient/engine/typed.ts";
import { STEPS_MAX, STYLE_LABELS, STYLES, type Style } from "@grabient/engine/view.ts";
import { createSignal, createUniqueId, For, onSettled, Show } from "solid-js";
import { Button } from "./Button.tsx";
import styles from "./Curation.module.css";
import { CURATION_COMMENT_MAX, CURATION_REASONS } from "./curation.ts";
import { Field } from "./Field.tsx";
import hidden from "./hidden.module.css";
import { Icon, type IconName } from "./Icon.tsx";
import { msg, t } from "./i18n.ts";
import { composing } from "./keys.ts";
import { Label } from "./Label.tsx";
import { Segmented } from "./Segmented.tsx";
import { Select } from "./Select.tsx";
import { Status } from "./Status.tsx";
import { Text } from "./Text.tsx";

/* An admin's word on one palette, kept for the seeding agents: why it leaves, or how it should be drawn. A press opens
   a sheet beneath it with the reason chips, a comment and, to set a view, the style, steps and angle with the picture
   redrawn as they change. The sheet is the confirmation, and every chip and the comment are optional, since an admin
   does this dozens of times in a sitting. */

export type CurationMode = "remove" | "delete" | "view";
export interface CurationView {
  style: Style;
  steps: number;
  angle: number;
}
export interface CurationResult {
  reasons: string[];
  comment: string;
  /** the view chosen, to set a view */
  view?: CurationView;
  /** a gallery deletion: the gallery alone, or Grabient's collections too */
  scope?: "everywhere" | "gallery";
}
const WORDS: Record<CurationMode, { title: string; confirm: string; pending: string }> = {
  remove: {
    title: msg("Remove from collection"),
    confirm: msg("Remove"),
    pending: msg("Removing…")
  },
  delete: { title: msg("Delete palette"), confirm: msg("Delete"), pending: msg("Deleting…") },
  view: { title: msg("Set view"), confirm: msg("Save"), pending: msg("Saving…") }
};
const STEPS_FLOOR = 3;

/* The page stays where it is while a sheet is open and through the frame that closes it: the act it confirms may take
   a card out of the grid, which the browser's scroll anchoring would answer by moving the page. Anchoring stands down
   for that time, counted, so two sheets in a row never undo each other. */
let holds = 0;
let anchorBefore = "";
function holdStill() {
  if (holds++ === 0) {
    anchorBefore = document.documentElement.style.getPropertyValue("overflow-anchor");
    document.documentElement.style.setProperty("overflow-anchor", "none");
  }
}
function letGo() {
  setTimeout(() => {
    if (--holds > 0) return;
    if (anchorBefore) document.documentElement.style.setProperty("overflow-anchor", anchorBefore);
    else document.documentElement.style.removeProperty("overflow-anchor");
  }, 80);
}

/** The line under a number field while it is out of range. */
const rangeHelp = (bad: boolean, min: number, max: number): string | undefined =>
  bad ? t("{min} to {max}", { min, max }) : undefined;

export function Curation(props: {
  mode: CurationMode;
  /** the press as an icon on glass over a card's picture: the mode's words are its name and its tooltip */
  icon?: IconName;
  /** why the act is not offered for this palette: the press keeps its place, disabled, and says why */
  blocked?: string;
  /** the palette's stops as the card shows them */
  stops: readonly string[];
  /** how it is drawn now */
  view: CurationView;
  /** the stops at another step count, so the picture follows the steps */
  stopsAt?: (steps: number) => readonly string[];
  /** the fewest steps this palette takes: its keyframes, three at the least */
  minSteps?: number;
  /** a gallery deletion: offer the scope */
  scopes?: boolean;
  /** does it; resolves once kept, rejects with the reason to show */
  onConfirm: (result: CurationResult) => Promise<void>;
  disabled?: boolean;
}) {
  const words = () => WORDS[props.mode];
  const [open, setOpen] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  const [reasons, setReasons] = createSignal<string[]>([]);
  const [comment, setComment] = createSignal("");
  const [scope, setScope] = createSignal<"everywhere" | "gallery">("everywhere");
  const [style, setStyle] = createSignal<Style>("linearGradient");
  const [steps, setSteps] = createSignal("");
  const [angle, setAngle] = createSignal("");
  const id = createUniqueId();
  let host!: HTMLDivElement;
  const minSteps = () => Math.max(STEPS_FLOOR, props.minSteps ?? STEPS_FLOOR);
  /* a number from any keyboard: Persian or full-width digits read as the number they spell */
  const whole = (raw: string, min: number, max: number) => {
    const n = Number(numeral(raw));
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const stepsValue = () => whole(steps(), minSteps(), STEPS_MAX);
  const angleValue = () => whole(angle(), 0, 360);
  const picture = () =>
    gradientCss(
      props.stopsAt && stepsValue() ? props.stopsAt(stepsValue()!) : props.stops,
      style(),
      angleValue() ?? props.view.angle
    );
  const press = () => host.querySelector<HTMLButtonElement>(":scope > button");
  /* the focus goes back to the press without moving the page, which the act may have changed under it */
  const close = (back = true) => {
    if (open()) letGo();
    setOpen(false);
    if (back) press()?.focus({ preventScroll: true });
  };
  const show = () => {
    setReasons([]);
    setComment("");
    setError("");
    setScope("everywhere");
    setStyle(props.view.style);
    setSteps(String(props.view.steps));
    setAngle(String(props.view.angle));
    holdStill();
    setOpen(true);
    setTimeout(
      () =>
        host
          .querySelector<HTMLElement>('[role="dialog"] button, [role="dialog"] input')
          ?.focus({ preventScroll: true }),
      0
    );
  };
  onSettled(() => {
    /* a press elsewhere closes the sheet: on the pointer's way down, and on a click that came without one */
    const away = (e: Event) => {
      if (open() && !pending() && !host.contains(e.target as Node)) close(false);
    };
    /* an input method's Escape drops a candidate in the comment, and the sheet stays */
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open() && !composing(e)) {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("click", away, true);
    document.addEventListener("keydown", onEscape, true);
    return () => {
      if (open()) letGo();
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("click", away, true);
      document.removeEventListener("keydown", onEscape, true);
    };
  });
  const toggleReason = (key: string) =>
    setReasons(list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]));
  const valid = () => props.mode !== "view" || (stepsValue() !== null && angleValue() !== null);
  const confirm = async () => {
    if (pending() || !valid()) return;
    setPending(true);
    setError("");
    const result: CurationResult = {
      reasons: CURATION_REASONS.map(r => r.key).filter(key => reasons().includes(key)),
      comment: comment().trim(),
      ...(props.mode === "view"
        ? { view: { style: style(), steps: stepsValue()!, angle: angleValue()! } }
        : {}),
      ...(props.mode === "delete" && props.scopes ? { scope: scope() } : {})
    };
    try {
      await props.onConfirm(result);
      close();
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : t("Couldn't save."));
    } finally {
      setPending(false);
    }
  };
  const name = () => t(words().title);
  const toggle = () => (open() ? close() : show());
  /* a blocked press keeps the keyboard and the pointer, and says why it is blocked as its tip */
  return (
    <div ref={host} class={styles.host} data-icon={props.icon ? "" : undefined}>
      <Show
        when={props.icon}
        fallback={
          <Button
            size="sm"
            danger={props.mode !== "view"}
            disabled={props.disabled || pending() || !!props.blocked}
            keep
            aria-describedby={props.blocked ? `${id}-why` : undefined}
            tip={props.blocked}
            aria-expanded={open()}
            onClick={toggle}
          >
            {name()}
          </Button>
        }
      >
        {icon => (
          <Button
            variant="art"
            icon
            size="sm"
            disabled={props.disabled || pending() || !!props.blocked}
            keep
            aria-label={name()}
            aria-describedby={props.blocked ? `${id}-why` : undefined}
            tip={props.blocked ?? name()}
            aria-expanded={open()}
            onClick={toggle}
          >
            <Icon name={icon()} size={13} />
          </Button>
        )}
      </Show>
      <Show when={props.blocked}>
        <span id={`${id}-why`} class={hidden.text}>
          {props.blocked}
        </span>
      </Show>
      <Show when={open()}>
        <div class={styles.sheet} role="dialog" aria-labelledby={id}>
          {/* Enter in a field confirms, as a form's submit does */}
          <form
            class={styles.form}
            onSubmit={e => {
              e.preventDefault();
              void confirm();
            }}
          >
            <Text variant="h3" as="h2" id={id}>
              {name()}
            </Text>
            <Show when={props.mode === "view"}>
              <div
                class={styles.picture}
                style={{ background: picture() }}
                role="img"
                aria-label={t("Preview")}
              />
              <Select
                label={t("Style")}
                name="style"
                value={style()}
                options={STYLES.map(s => ({ value: s, label: t(STYLE_LABELS[s]) }))}
                onChange={value => setStyle(value as Style)}
              />
              <div class={styles.fields}>
                <Field
                  label={t("Steps")}
                  name="steps"
                  inputmode="numeric"
                  value={steps()}
                  invalid={stepsValue() === null}
                  help={rangeHelp(stepsValue() === null, minSteps(), STEPS_MAX)}
                  onInput={setSteps}
                />
                <Field
                  label={t("Angle")}
                  name="angle"
                  inputmode="numeric"
                  value={angle()}
                  invalid={angleValue() === null}
                  help={rangeHelp(angleValue() === null, 0, 360)}
                  onInput={setAngle}
                />
              </div>
            </Show>
            <Show when={props.mode === "delete" && props.scopes}>
              <Segmented
                aria-label={t("Where")}
                size="sm"
                value={scope()}
                options={[
                  { value: "everywhere", label: t("Everywhere") },
                  { value: "gallery", label: t("Gallery only") }
                ]}
                onChange={value => setScope(value as "everywhere" | "gallery")}
              />
            </Show>
            <Label>
              {t(props.mode === "view" ? msg("Why, optional") : msg("What is wrong, optional"))}
            </Label>
            <fieldset class={styles.chips} aria-label={t("Reasons")}>
              <For each={CURATION_REASONS} keyed={false}>
                {reason => (
                  <Button
                    size="sm"
                    variant={reasons().includes(reason().key) ? "primary" : "secondary"}
                    aria-pressed={reasons().includes(reason().key)}
                    tip={t(reason().hint)}
                    onClick={() => toggleReason(reason().key)}
                  >
                    {t(reason().label)}
                  </Button>
                )}
              </For>
            </fieldset>
            <Field
              label={t("Comment")}
              name="comment"
              value={comment()}
              placeholder={t("Optional")}
              maxlength={CURATION_COMMENT_MAX}
              onInput={setComment}
            />
            <div class={styles.row}>
              <Status error={!!error()}>{error()}</Status>
              <span class={styles.spacer} />
              <Button size="sm" disabled={pending()} onClick={() => close()}>
                {t("Cancel")}
              </Button>
              <Button
                size="sm"
                type="submit"
                variant={props.mode === "view" ? "primary" : undefined}
                danger={props.mode !== "view"}
                disabled={pending() || !valid()}
              >
                {t(pending() ? words().pending : words().confirm)}
              </Button>
            </div>
          </form>
        </div>
      </Show>
    </div>
  );
}
