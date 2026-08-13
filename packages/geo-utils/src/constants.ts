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

/**
 * If two consecutive track points are more than this far apart in time, the track
 * is considered to have a gap (e.g. the app was closed) and the two points are NOT
 * joined by a line. Comfortably above the ~20s heartbeat so normal sampling — even
 * with a few missed beats — stays connected.
 */
export const DEFAULT_TRACK_GAP_BREAK_MS = 90_000;

/*
 * Follow ("tracking") mode — design.md §5.10. Shared by web and Android so the
 * camera feels identical on both.
 */

/** Extra ground margin past the target so its pin never touches the edge. */
export const DEFAULT_FOLLOW_MARGIN_M = 40;

/** Never zoom out past this, even when the two are very far apart. */
export const DEFAULT_FOLLOW_MIN_ZOOM = 13;

/**
 * Never zoom in past this. Riding side by side (<30m apart) should not slam the
 * camera to street level, where the relative positions become unreadable.
 */
export const DEFAULT_FOLLOW_MAX_ZOOM = 17.5;

/** Zoom dead zone: ignore smaller changes so the map doesn't "breathe". */
export const DEFAULT_FOLLOW_ZOOM_EPSILON = 0.35;

/**
 * Where *you* sit inside the usable viewport, top 0 → bottom 1. Below center, so
 * there is more map ahead of you than behind — and, crucially, the camera center is
 * derived from this every frame, which is what keeps you pinned in place while the
 * world rotates around you instead of orbiting the screen center.
 */
export const DEFAULT_FOLLOW_ANCHOR_FRAC = 0.62;

/** Camera position/zoom easing time constant (ms); settles in roughly 3×. */
export const DEFAULT_FOLLOW_CENTER_TAU_MS = 220;

/** Heading easing when it comes from the compass (dense, ~25 samples/s). */
export const DEFAULT_FOLLOW_HEADING_TAU_MS = 90;

/**
 * Heading easing when it comes from GPS course: those arrive once per position
 * packet (every few seconds), so they need far more smoothing or the map snaps.
 */
export const DEFAULT_FOLLOW_GPS_HEADING_TAU_MS = 450;

/**
 * At or above this ground speed, the GPS course over ground is a far better
 * heading source than the magnetometer, which drifts badly near a bike/car mount
 * (the same drift behind the figure-8 calibration prompt).
 */
export const DEFAULT_FOLLOW_GPS_HEADING_MIN_SPEED = 3;
