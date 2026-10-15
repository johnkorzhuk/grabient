/** Follows an element's box once the page has settled, calling `read` now and in the frame after every change of its
    size, and returns the cleanup: `onSettled(() => watchSize(el, () => setWidth(el.clientWidth)))`. Until then a
    component draws at the size it was given, as the server did. A change is read in the next frame: a read inside the
    observer's report that changes the element's own size (a strip that turns to two rows) is a loop the browser
    reports. A hidden element is not read, so it keeps its last size and shows again at that size from its first
    frame. */
export function watchSize(el: Element, read: () => void): () => void {
  let frame = 0;
  const observer = new ResizeObserver(() => {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      if (el.getClientRects().length) read();
    });
  });
  observer.observe(el);
  read();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}
