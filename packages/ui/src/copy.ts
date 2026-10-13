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
