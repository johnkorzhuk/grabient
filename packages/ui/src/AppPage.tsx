import { Show } from "solid-js";
import { Backdrop } from "./Backdrop.tsx";
import type { PageShellProps } from "./BrandPage.tsx";
import { BarLight } from "./contexts.ts";
import { Header } from "./Header.tsx";

/** An app page (the lists, the editor): the water painted with what the bar shows, the header in its app form with
    the dashed rule, then the page, whose fields and panes wear the bar's colors. */
export function AppPage(props: PageShellProps) {
  return (
    <>
      {props.water}
      <Show when={props.backdrop}>
        <Backdrop stops={props.stops} />
      </Show>
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
