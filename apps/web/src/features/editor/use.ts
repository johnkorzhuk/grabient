import { isAdmin } from "../account/session.ts";

/* A public palette used from the editor: copied or downloaded, counted as a use of the palette the page opened on, with
   the palette on screen as `edited` where it differs, so the site learns which palettes people take and how they change
   them. The Worker counts it with no address, account or cookie (POST /api/used). An admin's use is the site at work
   and is never sent. Nothing waits on it and nothing is shown. */
export function usedInEditor(
  action: "copy" | "download",
  format: string,
  opened: string,
  palette: { seed: string; style: string; steps: number; angle: number }
): void {
  if (typeof window === "undefined" || isAdmin()) return;
  const edited = palette.seed !== opened ? palette.seed : undefined;
  const body = {
    action,
    format,
    surface: "editor",
    items: [{ seed: opened, style: palette.style, steps: palette.steps, angle: palette.angle }],
    ...(edited ? { edited } : {})
  };
  try {
    void fetch("/api/used", {
      method: "POST",
      keepalive: true,
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).catch(() => {});
  } catch {
    /* counting never stands in a press's way */
  }
}
