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

/** Writes HTML to the clipboard as it stands, the clipboard's only type, as an app that reads its own data out of the
    markup needs: Figma's layers ride in the attributes of the HTML it copies. The copy command's event hands it over
    untouched; the async clipboard, which may rewrite markup, is the fallback. True when it is there. */
export async function copyHtml(html: string): Promise<boolean> {
  let put = false;
  const write = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData("text/html", html);
    event.preventDefault();
    put = true;
  };
  document.addEventListener("copy", write);
  try {
    if (document.execCommand("copy") && put) return true;
  } catch {
    /* no copy command here */
  } finally {
    document.removeEventListener("copy", write);
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }) })
    ]);
    return true;
  } catch {
    return false;
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
