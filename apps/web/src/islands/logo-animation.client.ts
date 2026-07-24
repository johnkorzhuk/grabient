import { logoAnimationCss } from "../logo-animation";

/** Update one palette source without disturbing a higher-priority overlay. */
export function syncLogoAnimation(
  source: "list" | "export",
  colors: readonly (readonly string[])[],
): void {
  const id = `logo-${source}-animation`;
  const css = logoAnimationCss(colors, `logo-${source}`);
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    // Export is created after the list style, so equal-specificity rules make
    // it the active source until it is removed on close.
    document.body.append(style);
  }
  style.textContent = css;
}

export function clearLogoAnimation(source: "list" | "export"): void {
  document.getElementById(`logo-${source}-animation`)?.remove();
}
