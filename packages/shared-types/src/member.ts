import type { Millis, Platform } from './common';

/**
 * What a participant's device/runtime can do. Drives capability chips and which
 * finding modes are offered (compass pointer, UWB, BLE — see design.md §5.6–5.8).
 */
export interface DeviceCapabilities {
  /** Can produce a fused location fix. */
  location: boolean;
  /** Has an inertial measurement unit (accelerometer/gyroscope). */
  imu: boolean;
  /** Can report a magnetic heading. */
  compass: boolean;
  /** Ultra-wideband ranging — App-only, both peers must support it. */
  uwb: boolean;
  /** Bluetooth LE proximity (coarse RSSI distance) — App-only fallback. */
  ble: boolean;
}

/**
 * A device participating in a room.
 * Firestore path: `rooms/{roomId}/members/{deviceId}` (design.md §6.2).
 */
export interface RoomMember {
  deviceId: string;
  displayName: string;
  joinedAt: Millis;
  lastSeenAt: Millis;
  online: boolean;
  sharingLocation: boolean;
  platform: Platform;
  capabilities: DeviceCapabilities;
}

/**
 * Derived presence used by the UI. Computed from `online`, `sharingLocation`,
 * recent movement and location staleness — not stored verbatim.
 */
export type MemberStatus =
  | 'online'
  | 'moving'
  | 'stale'
  | 'offline'
  | 'locating'
  | 'notSharing';
