/**
 * Tunable thresholds. These are MVP defaults; several are flagged "待确认" in
 * design.md §17 and may later become room- or platform-configurable.
 */

/** Mean Earth radius in meters (spherical model, good enough for short ranges). */
export const EARTH_RADIUS_M = 6_371_000;

/** A fix older than this is shown as "位置已过期" (location stale). */
export const DEFAULT_STALE_MS = 60_000;

/** A fix with horizontal accuracy worse than this is shown as "精度较低". */
export const DEFAULT_POOR_ACCURACY_M = 50;

/** Default Ramer–Douglas–Peucker tolerance when thinning a track, in meters. */
export const DEFAULT_SIMPLIFY_TOLERANCE_M = 8;
