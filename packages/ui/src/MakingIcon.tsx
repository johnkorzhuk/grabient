import { type Format, formatName } from "./FormatStrip.tsx";
import styles from "./Icon.module.css";
import { msg, t } from "./i18n.ts";

/* A download being made, in its chip's icon's place on the format strip (FormatStrip's making): Lucide's circle-stop,
   its ring drawn round as far as the file is made and its square the stop a press makes, with the chip's words while
   it is made. Only a page that makes a file as it is asked for loads it: the editor's stage, for an effect's MP4. */

const MAKING = msg("Making {format}. Stop");
const MAKING_SO_FAR = msg("Making {format}, {done, number, percent}. Stop");
const MADE = msg("Downloaded {format}");

/** A busy chip's name, the same until the file is made, so a screen reader on it is not told each percent: what it is
    making, then what a press does now. */
export const makingName = (f: Format): string => t(MAKING, { format: formatName(f) });

/** A busy chip's tooltip: its name with how far along it is, in whole percents, never more than is made (a hair over
    the share, so 0.29 of it, which is 28.999... percent in floating point, says 29). */
export const makingLabel = (f: Format, done: number): string =>
  t(MAKING_SO_FAR, { format: formatName(f), done: Math.floor(done * 100 + 1e-9) / 100 });

/** What a screen reader is told once the file is handed over to be saved. */
export const madeLabel = (f: Format): string => t(MADE, { format: formatName(f) });

/** The ring and the stop, `done` of the ring drawn (0 to 1), at an icon's size in CSS px. */
export function MakingIcon(props: { done: number; size?: number }) {
  const size = () => props.size ?? 15;
  return (
    <svg
      class={styles.icon}
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.9"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke-opacity="0.35" />
      <circle
        cx="12"
        cy="12"
        r="10"
        pathLength="100"
        stroke-dasharray={`${(props.done * 100).toFixed(1)} 100`}
        transform="rotate(-90 12 12)"
      />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
