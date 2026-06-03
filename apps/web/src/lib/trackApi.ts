import type { TrackPoint, TrackSegmentKind } from '@zhinzen/shared-types';
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

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

export interface AppendTrackPointResult {
  roomId: string;
  deviceId: string;
  pointId: string;
  createdAt: number;
  expiresAt: number;
  segmentKind: TrackSegmentKind;
}

export async function appendTrackPoint(
  payload: AppendTrackPointPayload,
): Promise<AppendTrackPointResult> {
  const { functions } = getFirebaseServices();
  const appendTrack = httpsCallable<AppendTrackPointPayload, AppendTrackPointResult>(
    functions,
    'appendTrackPoint',
  );
  const result = await appendTrack(payload);
  return result.data;
}

export async function fetchRecentTrackPoints(
  roomId: string,
  deviceId: string,
  since: number,
): Promise<TrackPoint[]> {
  const { firestore } = getFirebaseServices();
  const snapshot = await getDocs(
    query(
      collection(firestore, 'rooms', roomId, 'tracks', deviceId, 'points'),
      where('createdAt', '>=', since),
      orderBy('createdAt', 'asc'),
    ),
  );

  return snapshot.docs.map((doc) => doc.data() as TrackPoint);
}
