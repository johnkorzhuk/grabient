import { createEffect, createSignal, For, onSettled, Show } from "solid-js";
import { Button } from "./Button.tsx";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import { reducedMotion } from "./motion.ts";
import styles from "./Tags.module.css";
import { Text } from "./Text.tsx";

/* The row of searches under the search field, each a small press of words. At rest a tag wears no color; under the
   pointer or keyboard focus its colors arrive beneath it as a tooltip does, one to five coins, the middle one first,
   and leave together. The coins are not in the server's markup: nobody sees them at rest, so they mount once the
   browser is idle after the page settles, or as soon as the pointer or focus reaches the row.

   One row, a little wider than the field, that never wraps and scrolls sideways: centered while it fits, from its
   start once it does not, edge to edge on a phone. An edge with more beyond it fades, and on a fine pointer carries an
   arrow that moves the row most of its width. A mouse drags it and its throw carries on; a finger scrolls it as the
   browser does; a wheel turns it sideways while it has somewhere to go and never takes a scroll the page began. While
   the page waits on its tags, blocks at a tag's size stand in the row, so nothing beneath moves when they land. The
   row is one stop for the keyboard; the arrows, Home and End move along it. */

export interface Tag {
  label: string;
  /** one to five colors, shown only under the pointer or focus */
  colors?: readonly string[];
  href?: string;
  /** shown and not followed: a search that needs the connection the browser lacks */
  disabled?: boolean;
}

/** a coin, the distance from one to the next, and the most a tag opens */
const COIN = 16;
const STEP = 19;
const MOST = 5;
/** the scroll over which an edge's fade arrives, the quiet that ends a wheel gesture, and a glide's pace */
const FADE = 64;
const GESTURE = 250;
const GLIDE = 90;
/** the widths of the blocks that stand in for tags on their way */
const GHOSTS = [64, 88, 56, 76, 96, 60, 84, 72, 92, 52];

const coinsOf = (tag: Tag) => (tag.colors ?? []).slice(0, MOST);
const lightOf = (colors: readonly string[]) =>
  colors.length > 1 ? `linear-gradient(90deg, ${colors.join(", ")})` : colors[0];

export function Tags<T extends Tag>(props: {
  /** a word before the tags */
  lead?: string;
  tags: readonly T[];
  /** a tag pressed, as the page gave it, with its place in the row */
  onPick?: (tag: T, index: number) => void;
  /** the tags are on their way: while there are none, blocks stand in the row */
  loading?: boolean;
  /** for the design document: the tag at this place holds its colors open */
  open?: number;
  /** for the design document: every tag held in a state, its colors open */
  state?: "hover" | "focus" | "pressed";
}) {
  let host!: HTMLDivElement;
  let row!: HTMLDivElement;
  const [dragging, setDragging] = createSignal(false);
  const [scrolls, setScrolls] = createSignal(false);
  const [before, setBefore] = createSignal(false);
  const [after, setAfter] = createSignal(false);
  const [armed, setArmed] = createSignal(false);
  const ghosts = () => !!props.loading && !props.tags.length;
  const arm = () => setArmed(true);
  const room = () => Math.max(0, host.scrollWidth - host.clientWidth);
  /* How far the row has moved from its start, 0 to the room. A right-to-left row starts at its right edge and its
     scrollLeft runs down from 0, so `flip` turns one into the other; a drag and the fades keep to scrollLeft. */
  let flip = 1;
  const offset = () => host.scrollLeft * flip;
  const setOffset = (to: number) => {
    host.scrollLeft = to * flip;
  };

  /* one frame loop, for a glide to a place and for a throw that runs down */
  let frame = 0;
  let aim: number | null = null;
  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    aim = null;
  };
  const glide = (to: number) => {
    const target = Math.min(room(), Math.max(0, to));
    if (reducedMotion()) {
      stop();
      setOffset(target);
      return;
    }
    if (aim !== null) {
      aim = target;
      return;
    }
    stop();
    aim = target;
    let at = offset();
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (aim === null) {
        frame = 0;
        return;
      }
      at += (aim - at) * (1 - Math.exp(-dt / GLIDE));
      if (Math.abs(aim - at) < 0.5) {
        setOffset(aim);
        frame = 0;
        aim = null;
        return;
      }
      setOffset(at);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  const coast = (speed: number) => {
    stop();
    let v = speed;
    let at = offset();
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      at += v * dt;
      v *= 0.996 ** dt;
      const held = Math.min(room(), Math.max(0, at));
      setOffset(held);
      if (held !== at || Math.abs(v) < 0.02) {
        frame = 0;
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };

  /* a mouse drags the row; a finger is the browser's */
  let startX = 0;
  let startLeft = 0;
  let moved = false;
  let pointer: number | null = null;
  let trail: { t: number; x: number }[] = [];
  const down = (e: PointerEvent) => {
    stop();
    if (e.button !== 0 || e.pointerType === "touch") return;
    pointer = e.pointerId;
    startX = e.clientX;
    startLeft = host.scrollLeft;
    moved = false;
    trail = [{ t: e.timeStamp, x: e.clientX }];
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    const dx = e.clientX - startX;
    if (!moved && (Math.abs(dx) < 4 || !room())) return;
    if (!moved) {
      moved = true;
      setDragging(true);
      row.setPointerCapture(e.pointerId);
    }
    host.scrollLeft = startLeft - dx;
    trail.push({ t: e.timeStamp, x: e.clientX });
    if (trail.length > 8) trail.shift();
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    if (row.hasPointerCapture(e.pointerId)) row.releasePointerCapture(e.pointerId);
    if (!moved) return;
    setDragging(false);
    // the throw: the pointer's speed over its last tenth of a second, carried on along the row
    const last = trail[trail.length - 1];
    const first = trail.find(s => last.t - s.t <= 100) ?? last;
    const speed =
      last.t > first.t && e.type === "pointerup" ? (first.x - last.x) / (last.t - first.t) : 0;
    if (Math.abs(speed) > 0.15 && !reducedMotion()) coast(speed * flip);
  };
  // a row that scrolls is dragged as a row: the browser's own drag of the link under the press would end the scrub
  const noLinkDrag = (e: DragEvent) => {
    if (room()) e.preventDefault();
  };
  // a drag that moved is a scrub, not a press on the tag it ended over
  const click = (e: MouseEvent) => {
    if (!moved) return;
    moved = false;
    e.preventDefault();
    e.stopPropagation();
  };

  /* A gesture belongs to whoever had it first: one that began on the page stays the page's as the row passes under the
     pointer, and one that began here ends here. A sideways wheel, Shift and a zoom are the browser's. */
  let lastWheel = Number.NEGATIVE_INFINITY;
  let gesture: "row" | "page" | null = null;
  const seen = (e: WheelEvent) => {
    if (e.timeStamp - lastWheel > GESTURE) gesture = null;
    lastWheel = e.timeStamp;
    if (gesture === null && !(e.target instanceof Node && row.contains(e.target))) gesture = "page";
  };
  const wheel = (e: WheelEvent) => {
    if (gesture === "page") return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) {
      stop();
      return;
    }
    // down the page is on along the row, whichever way it reads
    const from = aim ?? offset();
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? host.clientWidth : 1);
    const to = Math.min(room(), Math.max(0, from + delta));
    if (gesture === null) {
      if (to === from) {
        gesture = "page";
        return;
      }
      gesture = "row";
    }
    e.preventDefault();
    if (to === from) return;
    // a notch of a wheel glides; a trackpad's small steps land as they come
    if (Math.abs(delta) >= 40) glide(to);
    else {
      stop();
      setOffset(to);
    }
  };

  /* what the edges show: the fades are drawn left and right, by what is out of sight past each */
  const measure = () => {
    const max = room();
    const along = Math.min(max, Math.max(0, offset()));
    const left = flip === 1 ? along : max - along;
    host.style.setProperty("--l", String(Math.min(1, left / FADE)));
    host.style.setProperty("--r", String(Math.min(1, (max - left) / FADE)));
    setScrolls(max > 0);
    setBefore(along > 4);
    setAfter(max - along > 4);
  };
  const page = (direction: 1 | -1) =>
    glide((aim ?? offset()) + direction * Math.max(160, host.clientWidth * 0.7));

  /* one stop for the keyboard, on the tag it stood on last, so two dozen tags never cost two dozen Tabs */
  let at = 0;
  const tagEls = () => [...row.querySelectorAll<HTMLElement>("a[href], button")];
  const rove = () => {
    const list = tagEls();
    at = Math.min(at, Math.max(0, list.length - 1));
    list.forEach((el, i) => {
      el.tabIndex = i === at ? 0 : -1;
    });
  };
  const walk = (e: KeyboardEvent) => {
    const list = tagEls();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const on = flip === 1 ? "ArrowRight" : "ArrowLeft";
    const back = flip === 1 ? "ArrowLeft" : "ArrowRight";
    const j =
      e.key === on
        ? Math.min(list.length - 1, i + 1)
        : e.key === back
          ? Math.max(0, i - 1)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? list.length - 1
              : -1;
    if (j < 0) return;
    e.preventDefault();
    at = j;
    rove();
    list[j].focus();
  };
  // a tag reached by the keyboard stands clear of the fades
  const focused = (e: FocusEvent) => {
    arm();
    const i = tagEls().indexOf(e.target as HTMLElement);
    if (i >= 0 && i !== at) {
      at = i;
      rove();
    }
    const el = e.target;
    if (!(el instanceof HTMLElement) || !el.matches(":focus-visible") || !row.contains(el)) return;
    const box = host.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const clear = FADE + 8;
    const shift =
      r.left < box.left + clear
        ? r.left - (box.left + clear)
        : r.right > box.right - clear
          ? r.right - (box.right - clear)
          : 0;
    if (shift) glide(offset() + shift * flip);
  };

  onSettled(() => {
    flip = getComputedStyle(host).direction === "rtl" ? -1 : 1;
    const sizes = new ResizeObserver(measure);
    sizes.observe(host);
    sizes.observe(row);
    host.addEventListener("click", click, true);
    host.addEventListener("wheel", wheel, { passive: false });
    host.addEventListener("scroll", measure, { passive: true });
    addEventListener("wheel", seen, { passive: true, capture: true });
    measure();
    rove();
    const idle = requestIdleCallback(arm, { timeout: 2000 });
    return () => {
      cancelIdleCallback(idle);
      stop();
      sizes.disconnect();
      host.removeEventListener("click", click, true);
      host.removeEventListener("wheel", wheel);
      host.removeEventListener("scroll", measure);
      removeEventListener("wheel", seen, true);
    };
  });

  /* other tags start from the beginning; the same tags with other addresses stay where they are */
  let shown = "";
  createEffect(
    () => props.tags.map(tag => tag.label).join("\n"),
    labels => {
      if (labels === shown) return;
      const first = shown === "";
      shown = labels;
      if (!first) {
        stop();
        host.scrollLeft = 0;
        measure();
        at = 0;
      }
      queueMicrotask(rove);
    }
  );

  return (
    <div class={styles.wrap}>
      <div
        ref={host}
        class={styles.host}
        data-dragging={dragging() ? "" : undefined}
        role="toolbar"
        aria-label={t("Tags")}
        aria-busy={ghosts() ? "true" : undefined}
        onPointerOver={arm}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onDragStart={noLinkDrag}
        onFocusIn={focused}
        onKeyDown={walk}
      >
        <div ref={row} class={styles.row} data-scrolls={scrolls() ? "" : undefined}>
          <Show when={props.lead}>
            <span class={styles.lead}>
              <Text variant="small" as="span">
                {props.lead}
              </Text>
            </span>
          </Show>
          <Show when={ghosts()}>
            <For each={GHOSTS}>
              {width => (
                <span class={styles.ghost} style={{ width: `${width}px` }} aria-hidden="true" />
              )}
            </For>
          </Show>
          <For each={props.tags} keyed={false}>
            {(tag, index) => (
              <span
                class={styles.tag}
                data-quiet={tag().disabled ? "" : undefined}
                data-open={props.open === index || props.state ? "" : undefined}
              >
                <Button
                  size="sm"
                  href={tag().href}
                  state={props.state}
                  disabled={tag().disabled}
                  onClick={() => {
                    if (!tag().disabled) props.onPick?.(tag(), index);
                  }}
                >
                  {/* the words are the readers' own: they read in their direction whatever the page's */}
                  <span dir="auto">{tag().label}</span>
                </Button>
                <Show
                  when={
                    (armed() || props.open !== undefined || props.state) && coinsOf(tag()).length
                  }
                >
                  <span
                    class={styles.bloom}
                    style={{ "--w": `${COIN + (coinsOf(tag()).length - 1) * STEP}px` }}
                    aria-hidden="true"
                  >
                    <span class={styles.light} style={{ background: lightOf(coinsOf(tag())) }} />
                    <For each={coinsOf(tag())} keyed={false}>
                      {(coin, i) => {
                        // how far from the middle coin: its place, and its turn to open
                        const from = () => i - (coinsOf(tag()).length - 1) / 2;
                        return (
                          <span
                            class={styles.coin}
                            style={{
                              background: coin(),
                              "--x": `${from() * STEP}px`,
                              "--d": String(Math.abs(from()))
                            }}
                          />
                        );
                      }}
                    </For>
                  </span>
                </Show>
              </span>
            )}
          </For>
        </div>
      </div>
      <span
        class={styles.arrow}
        data-side="before"
        data-on={before() && !ghosts() ? "" : undefined}
      >
        <Button
          variant="ghost"
          icon
          size="sm"
          aria-label={t("Previous tags")}
          onClick={() => page(-1)}
        >
          <Icon name="chevronLeft" size={14} />
        </Button>
      </span>
      <span class={styles.arrow} data-side="after" data-on={after() && !ghosts() ? "" : undefined}>
        <Button variant="ghost" icon size="sm" aria-label={t("More tags")} onClick={() => page(1)}>
          <Icon name="chevronRight" size={14} />
        </Button>
      </span>
    </div>
  );
}
