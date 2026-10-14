import { t } from "@grabient/i18n";
import { copyText } from "@grabient/ui/copy.ts";

/* The browser's side of taking things away: text and pictures onto the clipboard, and files saved. Browser only. */

/** Hands the browser a file to save. */
export function downloadFile(name: string, data: Blob): void {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Text onto the clipboard, by the copy command where the browser refuses the clipboard (another site's frame without
    clipboard-write); rejects, in the reader's language, when neither takes it. */
export async function writeText(text: string): Promise<void> {
  if (!(await copyText(text))) throw new Error(t("Couldn't copy."));
}

/** A picture onto the clipboard. False where none can go there (no image clipboard, or another site's frame without
    clipboard-write), for the caller to save it instead; a picture that could not be drawn still rejects. */
export async function copyImage(image: Promise<Blob>): Promise<boolean> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
    return true;
  } catch (error) {
    if ((error as { name?: string } | null)?.name === "NotAllowedError") return false;
    throw error;
  }
}
