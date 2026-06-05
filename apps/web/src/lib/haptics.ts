/**
 * Lightweight haptics via the Vibration API. Short ticks for taps, distinct
 * patterns for success/error. No-ops where unsupported (e.g. iOS Safari).
 */
function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration may be blocked or unsupported — ignore.
  }
}

export const haptics = {
  /** A crisp tap for button presses. */
  tap: () => vibrate(10),
  /** A softer tick for lighter interactions (selection, toggles). */
  light: () => vibrate(7),
  /** A short rising double for a completed action. */
  success: () => vibrate([12, 40, 18]),
  /** A buzzier triple for errors. */
  error: () => vibrate([26, 50, 26, 50, 26]),
};
