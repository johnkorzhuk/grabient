import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";

/* How much the site moves. The reader chooses per browser in Settings (`grabient-motion`): System follows the device's
   prefers-reduced-motion, On always reduces and Off never does. The answer is `data-motion` on <html>, reduce or full:
   base.css stops every transition and animation under reduce, and code that animates on its own (the water, the bar,
   the theme's change, a smooth scroll) asks reducedMotion() or reducesNow(). Only this module reads the media query,
   so the reader's choice overrides the device either way, and no component's CSS asks it.
   The head stamps the attribute before the first paint (motionScript). The signals start at the server's answer
   (System, motion allowed) on both sides, so hydration matches, and syncMotion() reads the browser's once the page is
   live. They are written only in the browser. */
export type MotionChoice = "system" | "reduce" | "full";

const KEY = "grabient-motion";
const QUERY = "(prefers-reduced-motion: reduce)";

const [choice, setChoice] = createSignal<MotionChoice>("system");
const [device, setDevice] = createSignal(false);
/* the same two values, plain: a signal written now reads its old value until the write settles, and the stamp must
   be right at once */
let now = { choice: "system" as MotionChoice, device: false };

/** What the reader chose in this browser. */
export const motionChoice = choice;
/** Whether the device asks for less motion, whatever the reader chose: what System follows. */
export const deviceReducesMotion = device;
/** Whether the page moves less. Reactive; until syncMotion() it is the server's answer, so a decision made at once
    reads reducesNow(). */
export const reducedMotion = (): boolean =>
  choice() === "reduce" || (choice() === "system" && device());
/** The page's own stamp, right from the first paint. */
export const reducesNow = (): boolean =>
  !isServer && document.documentElement.dataset.motion === "reduce";

function stored(): MotionChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "reduce" || v === "full" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(next: MotionChoice, asks: boolean) {
  now = { choice: next, device: asks };
  setChoice(next);
  setDevice(asks);
  const reduce = next === "reduce" || (next === "system" && asks);
  document.documentElement.dataset.motion = reduce ? "reduce" : "full";
}

let synced = false;
/** Reads this browser's choice and the device's setting once the page is live, and follows both from then on, the
    choice made in another tab included. */
export function syncMotion(): void {
  if (isServer || synced) return;
  synced = true;
  const query = matchMedia(QUERY);
  apply(stored(), query.matches);
  query.addEventListener("change", e => apply(now.choice, e.matches));
  addEventListener("storage", e => {
    if (e.key === KEY || e.key === null) apply(stored(), now.device);
  });
}

/** The reader's choice for this browser: kept, stamped on the page at once, and read by everything that animates.
    System is kept as no value, which is what the head's stamp reads too. */
export function setMotionChoice(next: MotionChoice): void {
  try {
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* a browser that keeps no site data: the choice lasts as long as the page */
  }
  apply(next, now.device);
}

/** The head's script that stamps the choice before anything paints: the same decision as apply(). */
export const motionScript = `(function(){try{var c=localStorage.getItem(${JSON.stringify(KEY)});var r=c==="reduce"||(c!=="full"&&matchMedia(${JSON.stringify(QUERY)}).matches);document.documentElement.dataset.motion=r?"reduce":"full"}catch(e){}})();`;
