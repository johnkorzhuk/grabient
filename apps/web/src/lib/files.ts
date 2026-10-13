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

/** Text onto the clipboard; rejects when the browser refuses. */
export const writeText = (text: string): Promise<void> => navigator.clipboard.writeText(text);

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
