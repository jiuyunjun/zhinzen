import type { Millis } from './common';

export type TrackSegmentKind = 'stopped' | 'slow' | 'moving' | 'fast';

/**
 * A participant's latest live position. Lives in Realtime Database for low-latency
 * fan-out: `liveLocations/{roomId}/{deviceId}` (design.md §6.2).
 */
export interface LiveLocation {
  deviceId: string;
  displayName: string;
  lat: number;
  lng: number;
  /** Horizontal accuracy radius in meters (lower is better). */
  accuracy: number;
  /** Direction of travel in degrees, 0 = north, clockwise. May be null when still. */
  heading: number | null;
  /** Ground speed in meters/second. */
  speed: number;
  updatedAt: Millis;
  sharingLocation: boolean;
  /** Battery level 0–100, or null when unavailable (e.g. browsers without the API). */
  battery?: number | null;
}

/**
 * A shared rally point — a long-press-placed marker that behaves like a member
 * (shows on the map + list). Lives in RTDB `rallyPoints/{roomId}/{id}`.
 */
export interface RallyPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  createdByDeviceId: string;
  createdAt: Millis;
  /** Arrival geofence radius in meters (default applied by clients if absent). */
  radius?: number;
}

/**
 * A single recorded track point. RTDB path `tracks/{roomId}/{deviceId}/{pointId}`.
 *
 * Only lat/lng/speed/createdAt are written: rendering never used `accuracy` or
 * `heading`, and `deviceId` is already in the path, so storing them was ~a third of
 * the bytes for nothing. They stay optional here because points written by older
 * clients still carry them.
 */
export interface TrackPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
  speed: number;
  createdAt: Millis;
  expiresAt?: Millis;
  segmentKind?: TrackSegmentKind;
}
