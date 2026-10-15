/* Where the sheet leads once signed in, kept for this tab as it leaves for Google. A sign-in that fails there comes
   back to /login?error=… without the sheet's query, so the sheet reads it here, within the ten minutes Google's state
   lasts: a failure that comes later is not that press's. */
const KEPT_RETURN = "grabient-sign-in-return";
const KEPT_FOR_MS = 600_000;
export function keptReturn(): string | null {
  try {
    const [, at, to] = /^(\d+) (.+)$/.exec(sessionStorage.getItem(KEPT_RETURN) ?? "") ?? [];
    return to && Date.now() - Number(at) < KEPT_FOR_MS ? to : null;
  } catch {
    return null;
  }
}
export function keepReturn(to: string | null) {
  try {
    if (to === null) sessionStorage.removeItem(KEPT_RETURN);
    else sessionStorage.setItem(KEPT_RETURN, `${Date.now()} ${to}`);
  } catch {
    // no storage: the sheet comes back without where it led
  }
}
/** A line for the document's head: back from Google with no request in its address, the sheet may still be an app's,
    which only this tab's kept return knows. The line marks `<html data-connecting>` before anything paints, and the
    sheet holds both ways until it reads the kept return itself, so it never grows. */
export const connectingScript = `try{var k=/^(\\d+) \\/oauth\\/authorize/.exec(sessionStorage.getItem(${JSON.stringify(KEPT_RETURN)})||""),q=new URLSearchParams(location.search);document.documentElement.toggleAttribute("data-connecting",!!k&&q.has("error")&&!q.has("redirect")&&Date.now()-k[1]<${KEPT_FOR_MS})}catch(e){}`;
