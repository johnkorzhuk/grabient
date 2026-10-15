import { createSignal, onSettled } from "solid-js";
import styles from "./BackToTop.module.css";
import { Button } from "./Button.tsx";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import { reducesNow } from "./motion.ts";
import { focusMain } from "./SkipLink.tsx";

/** The way back up a long page: the primary press with the up arrow at the bottom right, shown once the reader is a
    screen down. Hidden, it takes no pointer and leaves the Tab order and the accessibility tree by its visibility,
    which the fade keeps until it ends; shown, it marks the screen's floor (data-floor), above which a phone keeps the
    control the keyboard reaches. Where a page floats a button of its own in that corner on a phone, `raised`
    stands it above. A page with a way of its own says when it shows and how it goes; one whose first screen leads on
    to more below (`down`) points it down, and the same press leads back up from there. A page that shows a row along
    the screen's foot (--peek) has the button stand in that row, and one with no room for it at its first screen says
    so in its styles (--corner-rest), so the first paint is right before anything is measured. */
export function BackToTop(props: {
  /** how far down before it shows, in screens */
  after?: number;
  /** in the flow and always shown: a cell of the design document */
  still?: boolean;
  raised?: boolean;
  /** the page says when it shows */
  shown?: boolean;
  /** the page's own way up */
  onUp?: () => void;
  /** the press leads down the page for now: its arrow points there */
  down?: boolean;
  onDown?: () => void;
  /** the page is at its first screen, where the button shows only where the page's styles give it a place */
  resting?: boolean;
}) {
  const [far, setFar] = createSignal(false);
  onSettled(() => {
    if (props.still) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      setFar(scrollY > innerHeight * (props.after ?? 1));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    read();
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  });
  const shown = () => props.shown ?? far();
  /* the keyboard goes up with the page, to the start of its content: the button hides at the top, and a keyboard left
     on it would be left nowhere. On the way down it stays, to lead back up when the page arrives */
  const press = () => {
    if (props.down) return props.onDown?.();
    if (props.onUp) props.onUp();
    else scrollTo({ top: 0, behavior: reducesNow() ? "auto" : "smooth" });
    focusMain();
  };
  const words = () => (props.down ? t("Scroll down") : t("Back to top"));
  return (
    <div
      class={styles.corner}
      data-shown={shown() ? "" : undefined}
      data-floor={shown() && !props.still ? "" : undefined}
      data-raised={props.raised ? "" : undefined}
      data-resting={shown() && props.resting ? "" : undefined}
      data-still={props.still ? "" : undefined}
    >
      <Button variant="primary" icon size="lg" aria-label={words()} tip={words()} onClick={press}>
        <Icon name={props.down ? "down" : "up"} />
      </Button>
    </div>
  );
}
