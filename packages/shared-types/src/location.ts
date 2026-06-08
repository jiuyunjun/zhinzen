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
}

/**
 * A single recorded track point.
 * Firestore path: `rooms/{roomId}/tracks/{deviceId}/points/{pointId}` (design.md §6.2).
 */
export interface TrackPoint {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number;
  createdAt: Millis;
  expiresAt?: Millis;
  segmentKind?: TrackSegmentKind;
}
