/* A palette's blob on any page, by one script: `<script src="https://grabient.com/{seed}.js?style=blob&fill=1"></script>`.
   The script is the same for every palette and reads the palette and the blob's options from its own address, so the
   address is the whole setting, as the SVG's is. It fills the element it stands in, or the window where it stands in
   the body, behind what that element holds: the still first frame as vector at once, then the WebGL player over it,
   fading in on its first frame and playing from there. `data-target` names another element by a CSS selector. Where
   WebGL is missing the still frame stays. Built into one classic script by build.ts, which the Worker serves at
   /{seed}.js. */
import { blobSvg, parseBlob } from "@grabient/engine/blob.ts";
import { decodePalette } from "@grabient/engine/codec.ts";
import { playBlob } from "@grabient/ui/blob-player.ts";

const FADE_MS = 300;

function mount(script: HTMLScriptElement) {
  const address = new URL(script.src, location.href);
  const name = address.pathname.slice(address.pathname.lastIndexOf("/") + 1).replace(/\.js$/, "");
  const palette = decodePalette(decodeURIComponent(name));
  if (!palette) return;
  const view = parseBlob(address.searchParams);
  const selector = script.dataset.target;
  const found = selector ? document.querySelector<HTMLElement>(selector) : script.parentElement;
  const target = found ?? document.body;
  const page = target === document.body || target === document.documentElement;

  /* a layer behind the element's own content, over its background: the element made its own stacking context */
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    position: page ? "fixed" : "absolute",
    inset: "0",
    zIndex: "-1",
    overflow: "hidden",
    pointerEvents: "none"
  });
  if (!page) {
    const style = getComputedStyle(target);
    if (style.position === "static") target.style.position = "relative";
    if (style.isolation !== "isolate") target.style.isolation = "isolate";
  }
  target.prepend(layer);

  const box = layer.getBoundingClientRect();
  const size = {
    width: Math.max(1, Math.round(box.width || innerWidth)),
    height: Math.max(1, Math.round(box.height || innerHeight))
  };
  const still = document.createElement("div");
  Object.assign(still.style, { position: "absolute", inset: "0" });
  still.innerHTML = blobSvg(palette, { ...view, still: true }, size, `${address.origin}/${name}`);
  const svg = still.firstElementChild as SVGElement | null;
  if (svg) Object.assign(svg.style, { display: "block", width: "100%", height: "100%" });
  layer.append(still);

  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    opacity: "0",
    transition: `opacity ${FADE_MS}ms ease-out`
  });
  layer.append(canvas);
  playBlob(canvas, palette, view, () => {
    canvas.style.opacity = "1";
    setTimeout(() => still.remove(), FADE_MS + 50);
  });
}

const script = document.currentScript;
if (script instanceof HTMLScriptElement) {
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => mount(script), { once: true });
  else mount(script);
}
