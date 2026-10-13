import { type Element, Show } from "solid-js";
import { Backdrop } from "./Backdrop.tsx";
import { BarLight } from "./contexts.ts";
import { Header } from "./Header.tsx";

/** The props a page's frame takes for the water and the header above it. */
export interface PageShellProps {
  /** the bar's colors: the water's, or a palette the page holds */
  stops: readonly string[];
  /** the water behind the page (the shader's canvas), drawn first */
  water?: Element;
  /** the water has drawn, so a brand header's bar may open onto it */
  lit?: boolean;
  /** the water could not run: the Backdrop stands in for it */
  backdrop?: boolean;
  /** where the wordmark leads, and the word on the connection after it (Header) */
  home?: { href: string; label: string };
  status?: string;
  barRef?: (el: SVGRectElement) => void;
  /** theme and account, in the header's corner */
  corner: Element;
  children: Element;
}

/** A brand page (sign-in, settings, about): the water, the header in its brand form, and the page's own PageFrame in
    front, whose fields and panes wear the bar's colors. */
export function BrandPage(
  props: PageShellProps & {
    /** the sign-in page: the stronger backdrop, and a wordmark that keeps moving under reduced motion */
    login?: boolean;
    /** the page has scrolled under the header */
    scrolled?: boolean;
  }
) {
  return (
    <>
      {props.water}
      <Show when={props.backdrop}>
        <Backdrop stops={props.stops} strong={props.login} />
      </Show>
      <Header
        stops={props.stops}
        brand
        scrolled={props.scrolled}
        lit={props.lit}
        moves={props.login}
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
