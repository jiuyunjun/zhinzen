/**
 * @zhinzen/geo-utils — pure geographic helpers shared by all clients.
 * Implements the functions specified in design.md §13. No I/O, no platform deps.
 */
import type { LatLng, Millis, TrackPoint } from '@zhinzen/shared-types';
import {
  DEFAULT_FOLLOW_MAX_ZOOM,
  DEFAULT_POOR_ACCURACY_M,
  DEFAULT_SIMPLIFY_TOLERANCE_M,
  DEFAULT_STALE_MS,
  DEFAULT_TRACK_GAP_BREAK_MS,
  EARTH_RADIUS_M,
} from './constants';

export * from './constants';

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Great-circle distance between two coordinates, in meters (haversine).
 */
export function calculateDistance(from: LatLng, to: LatLng): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δφ = toRad(to.lat - from.lat);
  const Δλ = toRad(to.lng - from.lng);

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Initial bearing from `from` to `to`, in degrees where 0 = north, increasing
 * clockwise (0–360). This is the absolute compass direction of the target.
 */
export function calculateBearing(from: LatLng, to: LatLng): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from.lng);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return normalizeAngle(toDeg(Math.atan2(y, x)));
}

/** Wrap an angle in degrees into the [0, 360) range. */
export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/**
 * On-screen arrow rotation for the direction pointer: how far to turn from the
 * device's current heading to face the target (design.md §5.6).
 * Returns degrees in [0, 360), clockwise.
 */
export function calculateRelativeDirection(
  targetBearing: number,
  deviceHeading: number,
): number {
  return normalizeAngle(targetBearing - deviceHeading);
}

/** True when a fix is older than `thresholdMs` relative to `now`. */
export function isLocationStale(
  updatedAt: Millis,
  now: Millis = Date.now(),
  thresholdMs: number = DEFAULT_STALE_MS,
): boolean {
  return now - updatedAt > thresholdMs;
}

/** True when horizontal accuracy is worse (larger) than `thresholdMeters`. */
export function isAccuracyPoor(
  accuracyMeters: number,
  thresholdMeters: number = DEFAULT_POOR_ACCURACY_M,
): boolean {
  return accuracyMeters > thresholdMeters;
}

/** A formatted distance ready for display: value string + unit key. */
export interface FormattedDistance {
  value: string;
  /** i18n unit key — `'m'` below 1 km, `'km'` at or above. */
  unit: 'm' | 'km';
}

/**
 * Format a distance per design.md §5.6: meters below 1 km (rounded), kilometers
 * with one decimal at or above. Returns the unit as an i18n key, not literal text.
 */
export function formatDistance(meters: number): FormattedDistance {
  if (meters >= 1000) {
    return { value: (meters / 1000).toFixed(1), unit: 'km' };
  }
  return { value: Math.round(meters).toString(), unit: 'm' };
}

/**
 * Thin a track with the Ramer–Douglas–Peucker algorithm, keeping points whose
 * perpendicular deviation exceeds `toleranceMeters`. Preserves the first and last
 * points and the overall shape while dropping redundant samples (design.md §5.4).
 */
export function simplifyTrack<T extends LatLng>(
  points: readonly T[],
  toleranceMeters: number = DEFAULT_SIMPLIFY_TOLERANCE_M,
): T[] {
  if (points.length <= 2) return [...points];

  // Equirectangular projection to local meters around the first point — accurate
  // enough for the short spans a single track covers.
  const lat0 = toRad(points[0].lat);
  const project = (p: LatLng): [number, number] => [
    toRad(p.lng) * Math.cos(lat0) * EARTH_RADIUS_M,
    toRad(p.lat) * EARTH_RADIUS_M,
  ];
  const projected = points.map(project);

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = -1;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(projected[i], projected[start], projected[end]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > toleranceMeters && index !== -1) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

/** Web-Mercator ground resolution (meters per CSS pixel) at a latitude + zoom. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos(toRad(lat))) / 2 ** zoom;
}

/**
 * Inverse of {@link metersPerPixel}: the zoom at which `meters` of ground spans
 * `pixels` on screen. Follow mode uses it to frame two people without
 * `fitBounds` — a north-aligned bounding box breaks once the map is rotated to
 * heading-up, so we size the camera by the pair's *enclosing circle* instead,
 * which is rotation-invariant (design.md §5.10).
 */
export function zoomForMeters(lat: number, meters: number, pixels: number): number {
  if (!(meters > 0) || !(pixels > 0)) return DEFAULT_FOLLOW_MAX_ZOOM;
  return Math.log2((156543.03392 * Math.cos(toRad(lat)) * pixels) / meters);
}

/** The zoom at which one screen pixel covers `mpp` meters of ground. */
export function zoomForMpp(lat: number, mpp: number): number {
  return zoomForMeters(lat, mpp, 1);
}

export type FollowRegimeKey = 'walk' | 'bike' | 'city' | 'hwy';

export interface FollowRegime {
  key: FollowRegimeKey;
  /** Ground distance from you to the top of the screen, in meters. */
  rangeM: number;
  /** Lower speed bound (m/s) this regime covers. */
  minSpeed: number;
}

/**
 * Follow mode's road scale is set by *your own speed*, not by how far away your
 * friend is (design: 追踪视角). Walking you want the next few streets; on the
 * highway you want the next few kilometers. Holding the scale steady is what makes
 * the view readable — chasing the target's distance with the zoom does not.
 */
export const FOLLOW_REGIMES: readonly FollowRegime[] = [
  { key: 'walk', rangeM: 250, minSpeed: 0 },
  { key: 'bike', rangeM: 600, minSpeed: 3 },
  { key: 'city', rangeM: 1100, minSpeed: 8 },
  { key: 'hwy', rangeM: 2800, minSpeed: 18 },
];

/**
 * Pick the road scale for a ground speed. `prev` adds hysteresis: speed hovering on
 * a boundary would otherwise flip the scale back and forth every packet, so we only
 * leave the current regime once the speed is clearly outside it.
 */
export function followRegime(speedMps: number, prev?: FollowRegimeKey): FollowRegime {
  const speed = Number.isFinite(speedMps) && speedMps > 0 ? speedMps : 0;
  let index = 0;
  for (let i = FOLLOW_REGIMES.length - 1; i >= 0; i--) {
    if (speed >= FOLLOW_REGIMES[i].minSpeed) {
      index = i;
      break;
    }
  }
  if (prev === undefined) return FOLLOW_REGIMES[index];

  const prevIndex = FOLLOW_REGIMES.findIndex((r) => r.key === prev);
  if (prevIndex < 0 || prevIndex === index) return FOLLOW_REGIMES[index];
  // Require a 25% overshoot past the boundary before changing scale.
  if (index > prevIndex) {
    return speed >= FOLLOW_REGIMES[prevIndex + 1].minSpeed * 1.25
      ? FOLLOW_REGIMES[index]
      : FOLLOW_REGIMES[prevIndex];
  }
  return speed <= FOLLOW_REGIMES[prevIndex].minSpeed * 0.75
    ? FOLLOW_REGIMES[index]
    : FOLLOW_REGIMES[prevIndex];
}

/**
 * Where the ray from `origin` along `(dx, dy)` leaves the rectangle, and how many
 * pixels away that is. Follow mode uses it twice: to know how much room the target
 * has before it falls off screen, and to park the edge indicator on that boundary.
 */
export function rayExit(
  origin: { x: number; y: number },
  dx: number,
  dy: number,
  rect: { left: number; top: number; right: number; bottom: number },
): { x: number; y: number; distance: number } {
  let s = Infinity;
  if (dx > 1e-6) s = Math.min(s, (rect.right - origin.x) / dx);
  if (dx < -1e-6) s = Math.min(s, (rect.left - origin.x) / dx);
  if (dy > 1e-6) s = Math.min(s, (rect.bottom - origin.y) / dy);
  if (dy < -1e-6) s = Math.min(s, (rect.top - origin.y) / dy);
  if (!Number.isFinite(s) || s < 0) s = 0;
  return { x: origin.x + dx * s, y: origin.y + dy * s, distance: s };
}

/**
 * The point `meters` away from `from` along `bearingDeg` (0 = north, clockwise).
 * Used to nudge the follow-mode camera center along the *screen* axis so the
 * framed pair sits above the bottom sheet.
 */
export function destinationPoint(from: LatLng, bearingDeg: number, meters: number): LatLng {
  const δ = meters / EARTH_RADIUS_M;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(from.lat);
  const λ1 = toRad(from.lng);

  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );

  return { lat: toDeg(φ2), lng: ((toDeg(λ2) + 540) % 360) - 180 };
}

// Speed→color ramp (km/h): only stopped/walking is red, slow riding warms to
// yellow, and normal riding/driving is green. Shared so the quantized bucket
// colors match the continuous gradient.
const TRACK_STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [0, [220, 38, 38]], // red — stopped / walking
  [5, [220, 38, 38]],
  [18, [234, 179, 8]], // yellow — slow riding / heavy traffic
  [32, [34, 197, 94]], // green — riding / driving
  [200, [34, 197, 94]],
];
/** Quantization step (km/h). Bigger = fewer colors → more segment merging. */
const TRACK_BUCKET_KMH = 8;
const TRACK_MAX_BUCKET = 8;

function trackRgb(kmh: number): [number, number, number] {
  for (let i = 1; i < TRACK_STOPS.length; i++) {
    const [s0, c0] = TRACK_STOPS[i - 1];
    const [s1, c1] = TRACK_STOPS[i];
    if (kmh <= s1) {
      const r = (kmh - s0) / (s1 - s0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * r),
        Math.round(c0[1] + (c1[1] - c0[1]) * r),
        Math.round(c0[2] + (c1[2] - c0[2]) * r),
      ];
    }
  }
  return [...TRACK_STOPS[TRACK_STOPS.length - 1][1]] as [number, number, number];
}

/** Quantize a speed (m/s) into a small bucket index, for color-run merging. */
export function trackSpeedBucket(speedMps: number): number {
  const kmh = Number.isFinite(speedMps) ? Math.max(0, speedMps * 3.6) : 0;
  return Math.min(Math.round(kmh / TRACK_BUCKET_KMH), TRACK_MAX_BUCKET);
}

/** Hex color for a speed bucket (matches the continuous gradient at the bucket center). */
export function trackBucketColor(bucket: number): string {
  const [r, g, b] = trackRgb(bucket * TRACK_BUCKET_KMH);
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export interface TrackSegment {
  path: LatLng[];
  colorHex: string;
}

/**
 * Build renderable track segments (lever 1 + 2): simplify the points by the
 * current zoom (tolerance ≈ `pixelTolerance` screen px), quantize speed into
 * color buckets, and merge consecutive same-color runs into one polyline. Turns
 * O(N) per-segment polylines into O(color runs), and drops sub-pixel detail when
 * zoomed out. Input must be time-ordered.
 *
 * Points more than `gapMs` apart in time are treated as separate runs and never
 * joined by a line — so a long pause (e.g. the app was closed and reopened) shows
 * as a break in the track, not one long straight segment across the gap.
 */
export function buildTrackSegments<T extends LatLng & { speed: number; createdAt: number }>(
  points: readonly T[],
  zoom: number,
  pixelTolerance = 2.5,
  gapMs: number = DEFAULT_TRACK_GAP_BREAK_MS,
): TrackSegment[] {
  const ordered = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (ordered.length < 2) return [];

  // Split into time-contiguous runs; each run is simplified + colored on its own
  // and runs are never merged together, leaving a visible break across the gap.
  const segments: TrackSegment[] = [];
  let runStart = 0;
  for (let i = 1; i <= ordered.length; i++) {
    const broke = i === ordered.length || ordered[i].createdAt - ordered[i - 1].createdAt > gapMs;
    if (!broke) continue;
    appendRunSegments(segments, ordered.slice(runStart, i), zoom, pixelTolerance);
    runStart = i;
  }
  return segments;
}

/** Simplify + color one time-contiguous run, appending its segments to `out`. */
function appendRunSegments<T extends LatLng & { speed: number; createdAt: number }>(
  out: TrackSegment[],
  run: readonly T[],
  zoom: number,
  pixelTolerance: number,
): void {
  if (run.length < 2) return;
  // GPS Doppler speed is often missing (reported as 0/null) even while moving, which
  // would colour the whole run red. Fall back to ground speed from consecutive-point
  // distance ÷ time so a moving track is coloured by how fast it actually travelled.
  // A median-of-3 pass removes single-sample spikes that would otherwise flip colour
  // buckets back and forth and fragment the track into many tiny polylines.
  const speeds = smoothSpeeds(run.map((p, i) => effectiveSpeed(i > 0 ? run[i - 1] : undefined, p)));
  const midLat = run[Math.floor(run.length / 2)].lat;
  const tolerance = Math.max(0.5, metersPerPixel(midLat, zoom) * pixelTolerance);
  // Tag each point with its index so the simplified subset can look its speed back up.
  const simplified = simplifyTrack(
    run.map((p, i) => ({ ...p, _i: i })),
    tolerance,
  );

  // A fresh run must not merge into the previous run's trailing segment.
  const runHead = out.length;
  for (let i = 1; i < simplified.length; i++) {
    const a = simplified[i - 1];
    const b = simplified[i];
    const colorHex = trackBucketColor(trackSpeedBucket((speeds[a._i] + speeds[b._i]) / 2));
    const last = out.length > runHead ? out[out.length - 1] : undefined;
    if (last && last.colorHex === colorHex) {
      last.path.push({ lat: b.lat, lng: b.lng });
    } else {
      out.push({ path: [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }], colorHex });
    }
  }
}

/** Median-of-3 smoothing; endpoints unchanged. Tames single-sample speed spikes. */
function smoothSpeeds(speeds: number[]): number[] {
  if (speeds.length < 3) return speeds;
  const out = speeds.slice();
  for (let i = 1; i < speeds.length - 1; i++) {
    const a = speeds[i - 1];
    const b = speeds[i];
    const c = speeds[i + 1];
    out[i] = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
  }
  return out;
}

/**
 * Ground speed (m/s) for a track point: the reported GPS speed when present,
 * otherwise derived from distance ÷ time since the previous point.
 */
function effectiveSpeed(
  prev: (LatLng & { createdAt: number }) | undefined,
  cur: LatLng & { speed: number; createdAt: number },
): number {
  if (Number.isFinite(cur.speed) && cur.speed > 0) return cur.speed;
  if (!prev) return 0;
  const dtSec = (cur.createdAt - prev.createdAt) / 1000;
  if (dtSec <= 0) return 0;
  return calculateDistance(prev, cur) / dtSec;
}

function perpendicularDistance(
  point: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number],
): number {
  const [px, py] = point;
  const [ax, ay] = lineStart;
  const [bx, by] = lineEnd;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  const clamped = Math.max(0, Math.min(1, t));
  const cx = ax + clamped * dx;
  const cy = ay + clamped * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Re-export so callers can simplify `TrackPoint[]` without importing the type twice. */
export type { TrackPoint };
