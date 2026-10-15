/**
 * Whether this browser is a phone / tablet.
 *
 * Used to gate the screen-share affordance (mobile browsers mostly cannot
 * capture the screen) and the candidate-side interview recorder, which needs a
 * desktop-class canvas and enough upload headroom to stream chunks for the
 * length of an interview. Touch-only iPads report themselves as "Macintosh", so
 * the user agent alone is not enough to tell them apart from a MacBook.
 */
export function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)) {
    return true;
  }
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}
