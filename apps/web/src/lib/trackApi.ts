import type { TrackPoint } from '@zhinzen/shared-types';
import { get, orderByKey, query, ref, set, startAt } from 'firebase/database';

import { getFirebaseServices } from './firebase';

export interface AppendTrackPointPayload {
  roomId: string;
  deviceId: string;
  deviceSecret: string;
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number;
  createdAt?: number;
}

function trackPath(roomId: string, deviceId: string): string {
  return `tracks/${roomId}/${deviceId}`;
}

/**
 * Append a track point. Written directly to RTDB (like liveLocations) — RTDB has
 * no per-write cost, which suits the high-frequency append; tracks are cleaned up
 * per room when it expires (firebase functions pruneExpiredRooms). The point id is
 * `{createdAt}_{rand}` so RTDB orderByKey is chronological.
 */
export async function appendTrackPoint(payload: AppendTrackPointPayload): Promise<void> {
  const { database } = getFirebaseServices();
  const createdAt = payload.createdAt ?? Date.now();
  const pointId = `${createdAt}_${Math.random().toString(16).slice(2, 8)}`;
  await set(ref(database, `${trackPath(payload.roomId, payload.deviceId)}/${pointId}`), {
    deviceId: payload.deviceId,
    lat: payload.lat,
    lng: payload.lng,
    accuracy: payload.accuracy,
    heading: payload.heading,
    speed: payload.speed,
    createdAt,
  });
}

export async function fetchRecentTrackPoints(
  roomId: string,
  deviceId: string,
  since: number,
): Promise<TrackPoint[]> {
  const { database } = getFirebaseServices();
  const snapshot = await get(
    query(ref(database, trackPath(roomId, deviceId)), orderByKey(), startAt(`${since}_`)),
  );
  // orderByKey yields chronological order (createdAt-prefixed keys).
  const points: TrackPoint[] = [];
  snapshot.forEach((child) => {
    points.push(child.val() as TrackPoint);
  });
  return points;
}
