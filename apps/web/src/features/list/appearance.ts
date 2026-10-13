import type { Style } from "@grabient/engine/view.ts";
import type { Element } from "solid-js";

/* Stands in for the shell's list appearance (shellui) until it lands: the view a list draws its palettes in, and the
   toolbar that sets it. Here the view is the address's own and the toolbar draws nothing. */

export interface ListView {
  style: Style | "auto";
  steps: number | "auto";
  angle: number | "auto";
  size: string | "auto";
}

/** The view the cards draw: the address's, with whatever the toolbar is setting before the address takes it. */
export const listView = (address: ListView): ListView => address;

export function AppearanceToolbar(_props: { view: ListView }): Element {
  return null;
}
