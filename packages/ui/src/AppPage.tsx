import type { Element } from "solid-js";
import { BarLight } from "./contexts.ts";
import { Header } from "./Header.tsx";

/** An app page (the design document's own): the header in its app form with the dashed rule, then the page, whose
    fields and panes wear the bar's colors. The water behind it is the caller's to draw. */
export function AppPage(props: {
  /** the bar's colors: the water's, or a palette the page holds */
  stops: readonly string[];
  /** the water has drawn */
  lit?: boolean;
  /** where the wordmark leads, and the word on the connection after it (Header) */
  home?: { href: string; label: string };
  status?: string;
  barRef?: (el: SVGRectElement) => void;
  /** the header's corner: the page's tools, the theme */
  corner: Element;
  children: Element;
}) {
  return (
    <>
      <Header
        stops={props.stops}
        lit={props.lit}
        rule
        home={props.home}
        status={props.status}
        barRef={props.barRef}
      >
        {props.corner}
      </Header>
      <BarLight value={() => props.stops}>{props.children}</BarLight>
    </>
  );
}
