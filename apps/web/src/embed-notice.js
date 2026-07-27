// Embed notice: inside a cross-origin iframe (e.g. the cssgradient.io embed),
// browser permissions policies silently disable features like clipboard copy.
// Show a quiet, dismissible pill pointing at the full site. Detection is the
// self/top reference comparison — universal across browsers, unlike the
// Sec-Fetch-Dest header (absent in older Safari).

/** @type {HTMLDivElement | null} */
let noticeEl = null;
let dismissed = false;

function isFramed() {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin parent access threw — definitely framed
  }
}

function noticeNode() {
  if (!noticeEl) {
    noticeEl = document.createElement("div");
    noticeEl.className =
      "fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-solid border-input bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur-md";

    const text = document.createElement("span");
    text.textContent = "Some features are limited in this embed.";

    const link = document.createElement("a");
    link.href = location.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "font-medium text-foreground underline-offset-2 hover:underline";
    link.textContent = "Open grabient.com ↗";

    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss notice");
    close.className = "px-1 text-muted-foreground hover:text-foreground";
    close.textContent = "×";
    close.addEventListener("click", () => {
      dismissed = true;
      noticeEl?.remove();
    });

    noticeEl.append(text, link, close);
  }
  // swap() replaces document.body's children on client-side nav, orphaning the
  // singleton — re-append whenever it's disconnected.
  if (!noticeEl.isConnected) document.body.append(noticeEl);
  return noticeEl;
}

export function bootEmbedNotice(framed = isFramed()) {
  if (!framed || dismissed) return;
  noticeNode();
  document.addEventListener("app:swap", () => {
    if (!dismissed) noticeNode();
  });
}

bootEmbedNotice();
