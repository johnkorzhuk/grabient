/* A frame rate kept on any screen, for the effects' players: a frame is due once each 1/fps, a little early rather
   than a refresh late, so a rate the screen shows exactly draws every refresh, a lower one draws on the refreshes
   nearest its own times (90 on a 120 Hz screen three refreshes in four), and a higher one than the screen's draws
   every refresh. Counting from the last frame's due time rather than its draw keeps the rate from drifting. */
export function createPace() {
  let last = Number.NEGATIVE_INFINITY;
  return {
    /** whether a frame is due at `now` (milliseconds) for `fps` frames a second at most; none draws every refresh */
    due(now: number, fps: number | null | undefined): boolean {
      if (!fps) return true;
      const every = 1000 / fps;
      if (now - last < every - Math.min(4, every * 0.2)) return false;
      last = now - last > 2 * every ? now : last + every;
      return true;
    },
    /** the next frame is due at once */
    reset() {
      last = Number.NEGATIVE_INFINITY;
    }
  };
}
