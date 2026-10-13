/* What the document does before its first paint, inline in its head. */

/** Stamps the reader's theme and motion choice on <html> (`data-theme`, `data-motion`), from this browser's choice or
    else the device's, or a light-mode reader sees a dark flash and a page asked to move less starts moving. Marks a
    browser whose scrollbars take room (`data-scrollbar="classic"`), so the page is laid out under them from the start;
    a phone's overlay scrollbars, a scrollbar on the left and a framed right-to-left page are never marked. */
export const BOOT_SCRIPT = [
  "(function(d){",
  "var get=function(k){try{return localStorage.getItem(k)}catch(e){}},",
  "media=function(q){return matchMedia(q).matches};",
  'try{var t=get("grabient-theme");',
  'd.dataset.theme=t==="light"||t==="dark"?t:media("(prefers-color-scheme: light)")?"light":"dark"}',
  'catch(e){d.dataset.theme="dark"}',
  'try{var m=get("grabient-motion");',
  'd.dataset.motion=m==="reduce"||(m!=="full"&&media("(prefers-reduced-motion: reduce)"))?"reduce":"full"}catch(e){}',
  'try{var s=d.style;s.overflowY="scroll";var w=d.clientWidth;',
  'if(w&&innerWidth>w&&d.getBoundingClientRect().left<=0&&!(top!==self&&d.dir==="rtl"))d.dataset.scrollbar="classic";',
  's.overflowY="";if(!d.getAttribute("style"))d.removeAttribute("style")}catch(e){}',
  "})(document.documentElement)"
].join("");

/** The page's colors before its stylesheet arrives, and what each script needs of type: no letter spacing where
    letters join or sit loose (Arabic, Persian, Thai), and Korean broken between words only. The header is at most 84px
    tall, so a control the keyboard reaches is never under it. */
export const BASE_CSS = [
  "html{background:#0c0c0e;color:#ececea;scroll-padding-top:92px}",
  "html[data-theme=light]{background:#f3f2ee;color:#17171b}",
  "body{margin:0}",
  "html:lang(ar) *,html:lang(fa) *,html:lang(th) *{letter-spacing:normal!important}",
  "html:lang(ko){word-break:keep-all;overflow-wrap:break-word}"
].join("");
