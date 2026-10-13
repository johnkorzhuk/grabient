import { createContext } from "solid-js";

/** Set by a frame of the design document, so the water draws one held frame instead of moving. */
export const Still = createContext(false);

/** The wordmark's bar, as an accessor of its stops: every field's rim and a pane's bar wear its colors. The page
    provides what it hands its Logo; without it a rim is drawn in the focus ring's ink. */
export const BarLight = createContext<() => readonly string[]>(() => []);
