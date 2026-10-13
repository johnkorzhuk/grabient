import styles from "./Flag.module.css";
import { FLAGS, type FlagRegion } from "./flags.data.ts";

export type { FlagRegion };

/** A country's flag beside a language's name, where it stands for the language: drawn, never an emoji, since Windows
    draws a flag emoji as two letters. 3:2 at an icon's width, with a hairline just inside its edge so a white field
    still reads as a flag on paper. It says nothing to a screen reader: the name beside it is the language. */
export function Flag(props: {
  region: FlagRegion /** the width; the height is two thirds of it */;
  size?: number;
}) {
  const width = () => props.size ?? 15;
  return (
    <svg
      class={styles.flag}
      width={width()}
      height={(width() * 2) / 3}
      viewBox={FLAGS[props.region].viewBox}
      aria-hidden="true"
      data-flag={props.region}
      innerHTML={FLAGS[props.region].body}
    />
  );
}
