import { isServer } from "@solidjs/web";
import { type Element, onCleanup, onSettled } from "solid-js";
import { createHold } from "./press.ts";
import styles from "./Tooltip.module.css";

/* One line under a control after the pointer rests on it, for what the control cannot say itself: an icon's name, its
   key. One bubble for the page, appended to the body so no frame, scroll or transform clips it. The first opens after
   DELAY; while one is open, moving to another tipped control moves it at once. Visible keyboard focus opens it too,
   and Escape, a scroll or a resize closes it. A finger cannot rest: its long press opens it, and the lift that ends
   that press presses nothing, except on a link, whose long press is the browser's own. Words that do nothing when
   pressed (a title, an age) open and close it at a tap, and take the keyboard's focus to show it (tabindex). The
   pointer may move onto the bubble and it stays, so it can be read at any zoom. While it shows, the control it names
   is described by it (aria-describedby). A press closes it, the keyboard's too, since what it named is done; a press
   that turns its control in place (`turns`: a toggle, a mode that steps on) keeps it open, saying the control's new
   name. */
const DELAY = 700;
/* the room between two tipped controls: leaving one and reaching the next, or the bubble, inside this keeps it */
const GRACE = 120;
/* how long a bubble a long press opened stays once the finger lifts, to be read */
const LINGER = 1500;
const GAP = 8;
const EDGE = 8;
const ID = "grabient-tip";

export interface TipOptions {
  /** a press turns the control to its next state in place: the bubble stays and says its new name */
  turns?: boolean;
}

/** What a bubble says: words, or words and a quieter line under them, such as who and when beside what. */
export type TipText = string | { text: string; quiet: string };
const said = (words: TipText | null | undefined): words is TipText =>
  typeof words === "string" ? !!words : !!words && !!(words.text || words.quiet);

let bubble: HTMLElement | null = null;
/* the control the bubble names now */
let current: HTMLElement | null = null;
let closing: ReturnType<typeof setTimeout> | undefined;

function describe(el: HTMLElement, on: boolean) {
  const ids = (el.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(id => id && id !== ID);
  if (on) ids.push(ID);
  if (ids.length) el.setAttribute("aria-describedby", ids.join(" "));
  else el.removeAttribute("aria-describedby");
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape") close();
};
function close() {
  clearTimeout(closing);
  closing = undefined;
  if (!current || !bubble) return;
  describe(current, false);
  current = null;
  delete bubble.dataset.open;
  removeEventListener("scroll", close, true);
  removeEventListener("resize", close);
  removeEventListener("keydown", onKey);
}
const closeSoon = (ms = GRACE) => {
  clearTimeout(closing);
  closing = setTimeout(close, ms);
};
const stay = () => {
  clearTimeout(closing);
  closing = undefined;
};

function layer(): HTMLElement {
  if (bubble?.isConnected) return bubble;
  bubble = document.createElement("div");
  bubble.id = ID;
  bubble.setAttribute("role", "tooltip");
  bubble.className = styles.bubble;
  bubble.addEventListener("pointerenter", stay);
  bubble.addEventListener("pointerleave", () => closeSoon());
  // appendChild: the Worker's types give Element an append of their own, and the app checks both
  document.body.appendChild(bubble);
  return bubble;
}

/* The bubble over `el` with `text`. Its words and place change in place, so a bubble handed from one control to the
   next never fades in again. */
function show(el: HTMLElement, text: TipText) {
  stay();
  const b = layer();
  if (current && current !== el) describe(current, false);
  if (!current) {
    addEventListener("scroll", close, true);
    addEventListener("resize", close);
    addEventListener("keydown", onKey);
  }
  current = el;
  describe(el, true);
  if (typeof text === "string") b.textContent = text;
  else {
    b.textContent = text.text;
    if (text.quiet) {
      const quiet = document.createElement("span");
      quiet.className = styles.quiet;
      quiet.textContent = text.quiet;
      b.appendChild(quiet);
    }
  }
  const r = el.getBoundingClientRect();
  const w = b.offsetWidth;
  const h = b.offsetHeight;
  /* the page's own width: the window's includes a scrollbar that takes room, and a bubble would end under it */
  const x = Math.max(
    EDGE,
    Math.min(r.left + r.width / 2 - w / 2, document.documentElement.clientWidth - w - EDGE)
  );
  let y = r.bottom + GAP;
  if (y + h > innerHeight - EDGE) y = r.top - GAP - h;
  b.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  b.dataset.open = "";
}

/* The listeners on one control, and the function that takes them off. */
function listen(
  el: HTMLElement,
  text: () => TipText | null | undefined,
  options?: TipOptions
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let again = 0;
  const cancel = () => {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = undefined;
    frame = 0;
  };
  /* a control that left the page while its timer ran shows nothing, and its text is never asked for */
  const open = () => {
    const words = el.isConnected ? text() : null;
    if (said(words)) show(el, words);
  };
  /* the rest is over: open in the next frame, after the pointer moves it delivers, so a late frame never opens a
     bubble beside a control the pointer has already left */
  const rested = () => {
    timer = undefined;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (el.matches(":hover, :focus-visible")) open();
    });
  };
  const arm = () => {
    cancel();
    if (current || closing) open();
    else timer = setTimeout(rested, DELAY);
  };
  const enter = (e: PointerEvent) => {
    if (e.pointerType !== "touch") arm();
  };
  const leave = () => {
    cancel();
    if (current === el) closeSoon(longed ? LINGER : GRACE);
  };
  /* words, which a tap opens; a control, whose press is its own; a link, which keeps its long press */
  const still = !el.matches("a[href], button, input, select, textarea, label");
  const link = el.matches("a[href]");
  let finger = false;
  /* a finger down on a host whose long press opens the bubble, and whether it has */
  let holding = false;
  let longed = false;
  const hold = createHold(() => {
    longed = true;
    open();
  });
  const press = (e: PointerEvent) => {
    cancel();
    longed = false;
    finger = e.pointerType === "touch";
    holding = finger && !link;
    if (holding) hold.down(e);
    if (finger && still) return;
    if (current === el && !options?.turns) close();
  };
  const lift = (e: PointerEvent) => {
    holding = false;
    if (e.type === "pointerup") hold.up(e);
    else hold.cancel();
  };
  /* the press turned the control: the open bubble says its new name in the next frame, once the page's own handler
     has run and its writes have landed; a control with no name now lets it go */
  const turned = () => {
    cancelAnimationFrame(again);
    again = requestAnimationFrame(() => {
      if (current !== el) return;
      const words = el.isConnected ? text() : null;
      if (said(words)) show(el, words);
      else close();
    });
  };
  const click = (e: MouseEvent) => {
    if (longed) {
      longed = false;
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (finger && still) {
      if (current === el) close();
      else open();
    } else if (current === el) {
      if (options?.turns) turned();
      else close();
    }
  };
  const focus = () => {
    if (el.matches(":focus-visible")) arm();
  };
  const events = [
    ["pointerenter", enter],
    ["pointerleave", leave],
    ["pointerdown", press],
    ["pointermove", (e: PointerEvent) => hold.move(e)],
    ["pointerup", lift],
    ["pointercancel", lift],
    /* the long press's own menu and word selection give way to the bubble */
    [
      "contextmenu",
      (e: Event) => {
        if (holding || longed) e.preventDefault();
      }
    ],
    ["click", click],
    ["focus", focus],
    ["blur", leave]
  ] as const;
  for (const [type, fn] of events) el.addEventListener(type, fn as EventListener);
  return () => {
    cancel();
    hold.cancel();
    cancelAnimationFrame(again);
    if (current === el) close();
    for (const [type, fn] of events) el.removeEventListener(type, fn as EventListener);
  };
}

/** Gives an element a tooltip, as a ref: `ref={tooltip(() => t("Theme · {key}", { key }))}`. `text` is read when the
    bubble opens, and again after a press that keeps it, so it may change; nothing shows while it is empty. It may
    hold a quieter line under its words. Made in a component, the listeners come off with it. */
export function tooltip(
  text: () => TipText | null | undefined,
  options?: TipOptions
): (el: HTMLElement) => void {
  let off: (() => void) | undefined;
  onCleanup(() => off?.());
  return el => {
    if (isServer) return;
    off?.();
    off = listen(el, text, options);
  };
}

/** Takes the bubble off a control whose meaning just changed under it, so it never names what a press did a moment
    ago. The next rest reads the new text. */
export function dropTip(el: HTMLElement): void {
  if (current === el) close();
}

/** Gives the one control it wraps a tooltip. The wrapper has no box of its own. */
export function Tooltip(props: { text: string; children: Element }) {
  let host!: HTMLSpanElement;
  onSettled(() => listen((host.firstElementChild as HTMLElement | null) ?? host, () => props.text));
  return (
    <span ref={host} class={styles.host}>
      {props.children}
    </span>
  );
}
