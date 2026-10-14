import { Show } from "solid-js";
import { msg, t } from "./i18n.ts";
import styles from "./ListNav.module.css";
import { Segmented } from "./Segmented.tsx";

export type Section = "palettes" | "collections";
export type Order = "popular" | "rising" | "saved";
export type Frame = "1w" | "3m" | "1y";

const SECTIONS: readonly { value: Section; label: string }[] = [
  { value: "palettes", label: msg("Palettes") },
  { value: "collections", label: msg("Collections") }
];
const ORDERS: readonly { value: Order; label: string }[] = [
  { value: "popular", label: msg("Popular", "order") },
  { value: "rising", label: msg("Rising", "order") },
  { value: "saved", label: msg("Saved", "order") }
];
const FRAMES: Readonly<Record<Frame, { short: string; name: string }>> = {
  "1w": { short: msg("1w", "frame"), name: msg("Rising, 1 week") },
  "3m": { short: msg("3m", "frame"), name: msg("Rising, 3 months") },
  "1y": { short: msg("1y", "frame"), name: msg("Rising, 1 year") }
};

/** The lists' row: the section (Palettes or Collections), then the order (Popular, Rising, Saved). The home shows the
    sections alone with neither chosen, and keeps the order's room so its cards stand where a list's do. Given
    addresses, the choices are links that crawlers and new tabs follow, while a plain press still goes through the
    page; Saved has no address and stays a press. Given a frame, Rising says it after its name, sized for the widest
    of the frames offered, and a press on it while it is the order asks the page for the next. Its accessible name
    starts with the words it shows, which a reader who speaks to the page says, then says the frame in full. On a
    phone both rows are full width. */
export function ListNav(props: {
  /** the page's section; null on the home, where neither is chosen */
  section: Section | null;
  /** the page's order; null on the home, where the orders are not shown */
  order: Order | null;
  /** Rising's frame: the page's, or the one a press on Rising leads to. Without one Rising is one list */
  frame?: Frame;
  /** the frames a press on Rising moves through */
  frames?: readonly Frame[];
  onSection: (section: Section) => void;
  onOrder?: (order: Order) => void;
  /** the pointer or the keyboard reached a list a press would open: the page may ask for it now */
  onIntent?: (target: { section?: Section; order?: Order }) => void;
  sectionHref?: (section: Section) => string;
  orderHref?: (order: Order) => string | undefined;
  /** a choice that keeps its place and cannot be taken now: a list that needs the connection the browser lacks */
  disabled?: (choice: Section | Order) => boolean;
}) {
  const sections = () =>
    SECTIONS.map(o => ({
      value: o.value,
      label: t(o.label),
      href: props.sectionHref?.(o.value),
      disabled: !!props.disabled?.(o.value)
    }));
  const frames = () =>
    (Object.keys(FRAMES) as Frame[])
      .filter(f => !props.frames || props.frames.includes(f) || f === props.frame)
      .map(f => t(FRAMES[f].short, { $context: "frame" }));
  const orders = () =>
    ORDERS.map(o => {
      const frame = o.value === "rising" && props.frame ? FRAMES[props.frame] : null;
      const label = t(o.label, { $context: "order" });
      const detail = frame && t(frame.short, { $context: "frame" });
      return {
        value: o.value,
        label,
        href: props.orderHref?.(o.value),
        disabled: !!props.disabled?.(o.value),
        ...(frame && detail
          ? { detail, forms: frames(), name: `${label} ${detail}, ${t(frame.name)}` }
          : {})
      };
    });
  return (
    <div class={styles.nav}>
      <div class={styles.sections}>
        <Segmented
          aria-label={t("Lists")}
          value={props.section ?? ""}
          options={sections()}
          onIntent={v => props.onIntent?.({ section: v as Section })}
          onChange={v => props.onSection(v as Section)}
        />
      </div>
      <Show
        when={props.order}
        fallback={<div class={styles.orders} data-reserved="" aria-hidden="true" />}
      >
        {order => (
          <div class={styles.orders}>
            <Segmented
              aria-label={t("Order")}
              value={order()}
              options={orders()}
              onIntent={v => props.onIntent?.({ order: v as Order })}
              onChange={v => props.onOrder?.(v as Order)}
            />
          </div>
        )}
      </Show>
    </div>
  );
}
