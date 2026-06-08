/**
 * @zhinzen/geo-utils — pure geographic helpers shared by all clients.
 * Implements the functions specified in design.md §13. No I/O, no platform deps.
 */
import type { LatLng, Millis, TrackPoint } from '@zhinzen/shared-types';
import {
  DEFAULT_POOR_ACCURACY_M,
  DEFAULT_SIMPLIFY_TOLERANCE_M,
  DEFAULT_STALE_MS,
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

// Speed→color ramp (km/h): 0–15 red, ~28 yellow, 40+ green. Shared so the
// quantized bucket colors match the original continuous gradient.
const TRACK_STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [0, [220, 38, 38]],
  [15, [220, 38, 38]],
  [28, [234, 179, 8]],
  [40, [34, 197, 94]],
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
 */
export function buildTrackSegments<T extends LatLng & { speed: number }>(
  points: readonly T[],
  zoom: number,
  pixelTolerance = 2.5,
): TrackSegment[] {
  const ordered = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (ordered.length < 2) return [];
  const midLat = ordered[Math.floor(ordered.length / 2)].lat;
  const tolerance = Math.max(0.5, metersPerPixel(midLat, zoom) * pixelTolerance);
  const simplified = simplifyTrack(ordered, tolerance);

  const segments: TrackSegment[] = [];
  for (let i = 1; i < simplified.length; i++) {
    const a = simplified[i - 1];
    const b = simplified[i];
    const colorHex = trackBucketColor(trackSpeedBucket((a.speed + b.speed) / 2));
    const last = segments[segments.length - 1];
    if (last && last.colorHex === colorHex) {
      last.path.push({ lat: b.lat, lng: b.lng });
    } else {
      segments.push({ path: [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }], colorHex });
    }
  }
  return segments;
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
