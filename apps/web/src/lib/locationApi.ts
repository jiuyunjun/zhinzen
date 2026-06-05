import type { LiveLocation } from '@zhinzen/shared-types';
import { onDisconnect, onValue, ref, remove, set } from 'firebase/database';

import { getFirebaseServices } from './firebase';

export function liveLocationPath(roomId: string, deviceId: string): string {
  return `liveLocations/${roomId}/${deviceId}`;
}

/**
 * RTDB presence: while sharing, re-arm an onDisconnect that flips our live
 * location to not-sharing whenever the connection drops (tab closed / network
 * lost), so peers stop seeing us as online almost immediately. Returns a cleanup
 * that cancels the scheduled onDisconnect and stops watching connectivity.
 */
export function setupPresence(roomId: string, deviceId: string): () => void {
  const { database } = getFirebaseServices();
  const liveRef = ref(database, liveLocationPath(roomId, deviceId));
  const connectedRef = ref(database, '.info/connected');
  const unsubscribe = onValue(connectedRef, (snapshot) => {
    if (snapshot.val() === true) {
      void onDisconnect(liveRef).update({ sharingLocation: false });
    }
  });
  return () => {
    void onDisconnect(liveRef).cancel();
    unsubscribe();
  };
}

export async function writeLiveLocation(roomId: string, location: LiveLocation): Promise<void> {
  const { database } = getFirebaseServices();
  await set(ref(database, liveLocationPath(roomId, location.deviceId)), location);
}

export async function clearLiveLocation(roomId: string, deviceId: string): Promise<void> {
  const { database } = getFirebaseServices();
  await remove(ref(database, liveLocationPath(roomId, deviceId)));
}
