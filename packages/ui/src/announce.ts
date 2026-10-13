import { isServer } from "@solidjs/web";

/* What a screen reader is told that a sighted reader sees on screen: the page a link led to, a copy made or refused.
   One polite live region for the page, appended in the browser (the server never draws it, so hydration never meets
   it) and seen by no one. The control that acted still shows its own result (createDone). The region empties before
   each message, so the same words twice are read twice. It has no role of status, since the checks that read a page's
   own status lines must pass it by; `data-announce` names it. */
let region: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function live(): HTMLElement {
  if (region?.isConnected) return region;
  region = document.createElement("div");
  region.setAttribute("aria-live", "polite");
  region.setAttribute("aria-atomic", "true");
  region.setAttribute("data-announce", "");
  Object.assign(region.style, {
    position: "fixed",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    pointerEvents: "none"
  });
  document.body.append(region);
  return region;
}

/** Makes the region ahead of the first message, since a region made and filled at once is often not read. PageRoot
    calls it in the browser. */
export function mountAnnouncer(): void {
  if (!isServer) queueMicrotask(live);
}

/** Tells a screen reader `text`, politely, after what it is reading now. */
export function announce(text: string): void {
  if (isServer || !text) return;
  const r = live();
  r.textContent = "";
  clearTimeout(timer);
  timer = setTimeout(() => {
    r.textContent = text;
  }, 60);
}
