/* Taking things away in the browser: text onto the clipboard, and a file handed over to save. */

/** Writes text to the clipboard; true when it is there. The control that asked shows the result on itself. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* refused: a frame on another site without clipboard-write, or an old browser */
  }
  /* The copy command copies a selection, and selecting the text takes the focus: it goes back to the control that
     asked, so a copy made by the keys keeps the reader's place. */
  const was = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    if (was?.isConnected) was.focus({ preventScroll: true });
  }
}

/** Hands the browser a file to save. */
export function downloadFile(name: string, data: Blob): void {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
