/**
 * Common scalar aliases shared across all entities.
 *
 * Time is represented as epoch milliseconds (a plain `number`) so the types stay
 * backend-agnostic — the Firestore data layer converts to/from `Timestamp`, while
 * Realtime Database already stores epoch millis directly (see design.md §6.2).
 */

/** Epoch milliseconds (e.g. `Date.now()`). */
export type Millis = number;

/** Geographic coordinate in WGS84 degrees. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Client platform a participant is running on. */
export type Platform = 'web' | 'android' | 'ios';
