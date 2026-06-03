import type { LiveLocation } from '@zhinzen/shared-types';
import { ref, remove, set } from 'firebase/database';

import { getFirebaseServices } from './firebase';

export function liveLocationPath(roomId: string, deviceId: string): string {
  return `liveLocations/${roomId}/${deviceId}`;
}

export async function writeLiveLocation(roomId: string, location: LiveLocation): Promise<void> {
  const { database } = getFirebaseServices();
  await set(ref(database, liveLocationPath(roomId, location.deviceId)), location);
}

export async function clearLiveLocation(roomId: string, deviceId: string): Promise<void> {
  const { database } = getFirebaseServices();
  await remove(ref(database, liveLocationPath(roomId, deviceId)));
}
