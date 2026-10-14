import { createSignal } from "solid-js";

/* Whether the swatch files are open: on every strip that has them at once, for as long as the page is open
   (FormatStrip.tsx). Its own module, so the app can watch it without loading the strip. Only a press writes it, so the
   server, which never presses, draws it closed. */
const [open, setOpen] = createSignal(false);

/** Whether the swatch files are open on the page's strips: a swatch file is likely the next press. */
export const swatchesOpen = (): boolean => open();
export const openSwatches = (to: boolean) => setOpen(to);
