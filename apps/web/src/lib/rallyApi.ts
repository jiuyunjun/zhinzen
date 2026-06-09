import type { RallyPoint } from '@zhinzen/shared-types';
import { onValue, push, ref, remove, set } from 'firebase/database';

import { getFirebaseServices } from './firebase';

function rallyPath(roomId: string): string {
  return `rallyPoints/${roomId}`;
}

/** Subscribe to a room's rally points. Returns an unsubscribe. */
export function watchRallyPoints(roomId: string, cb: (points: RallyPoint[]) => void): () => void {
  const { database } = getFirebaseServices();
  return onValue(ref(database, rallyPath(roomId)), (snapshot) => {
    const value = (snapshot.val() as Record<string, RallyPoint> | null) ?? {};
    cb(
      Object.entries(value)
        .map(([id, p]) => ({ ...p, id }))
        .sort((a, b) => a.createdAt - b.createdAt),
    );
  });
}

export async function createRallyPoint(
  roomId: string,
  point: { name: string; lat: number; lng: number; createdByDeviceId: string; radius: number },
): Promise<void> {
  const { database } = getFirebaseServices();
  const id = push(ref(database, rallyPath(roomId))).key as string;
  await set(ref(database, `${rallyPath(roomId)}/${id}`), { ...point, createdAt: Date.now() });
}

export async function updateRallyRadius(roomId: string, id: string, radius: number): Promise<void> {
  const { database } = getFirebaseServices();
  await set(ref(database, `${rallyPath(roomId)}/${id}/radius`), radius);
}

export async function deleteRallyPoint(roomId: string, id: string): Promise<void> {
  const { database } = getFirebaseServices();
  await remove(ref(database, `${rallyPath(roomId)}/${id}`));
}
