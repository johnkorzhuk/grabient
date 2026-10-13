/** The head's script that marks a browser whose scrollbars take room, before anything paints, so the page is laid out
    under them (base.css, PageRoot) and a scrollbar coming or going moves nothing. It reads the window with a scrollbar
    forced on for that moment. A phone or a trackpad draws its scrollbars over the page and is never marked; nor is a
    browser that puts the scrollbar on the left, where the page would have to run under it the other way. Chrome does
    that for a framed right-to-left page once the body exists, so that one is told by its frame and its direction. */
export const scrollbarScript =
  "try{(function(d){var s=d.style;s.overflowY='scroll';var w=d.clientWidth;" +
  "if(w&&innerWidth>w&&d.getBoundingClientRect().left<=0&&!(top!==self&&d.dir==='rtl'))d.dataset.scrollbar='classic';" +
  "s.overflowY='';if(!d.getAttribute('style'))d.removeAttribute('style')})(document.documentElement)}catch(e){}";
