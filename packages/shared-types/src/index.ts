/**
 * @zhinzen/shared-types — portable data model shared by web, future Android/iOS
 * clients and Cloud Functions. Mirrors the Firestore / Realtime Database schema
 * in design.md §6.2. No backend SDK types leak in here (time is epoch millis).
 */
export type { Millis, LatLng, Platform } from './common';
export type { Room, RoomStatus } from './room';
export type { RoomMember, MemberStatus, DeviceCapabilities } from './member';
export type { LiveLocation, TrackPoint, TrackSegmentKind } from './location';
export type { DeviceIdentity, DeviceSession } from './device';
