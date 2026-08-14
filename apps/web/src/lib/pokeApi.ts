import { limitToLast, onChildAdded, push, query, ref, set } from 'firebase/database';

import { getFirebaseServices } from './firebase';

export interface Poke {
  id: string;
  from: string;
  fromName: string;
  to: string;
  text: string;
  createdAt: number;
}

export async function sendPoke(
  roomId: string,
  poke: { from: string; fromName: string; to: string; text: string },
): Promise<void> {
  const { database } = getFirebaseServices();
  const id = push(ref(database, `pokes/${roomId}`)).key as string;
  await set(ref(database, `pokes/${roomId}/${id}`), { ...poke, createdAt: Date.now() });
}

/** How many recent pokes to attach to. Callers discard anything older than the
 * subscription anyway, so this only has to be deep enough that a burst arriving at
 * the same moment isn't missed. */
const POKE_TAIL = 20;

/**
 * Fire `cb` for each newly-added poke (including the initial batch).
 *
 * Bounded to the tail on purpose: an unbounded `onChildAdded` replays — and bills
 * for — every poke the room has ever received, on every open, forever. `push` keys
 * are chronological, so `limitToLast` needs no `.indexOn`; ordering by `createdAt`
 * instead would fall back to client-side filtering and download the whole node.
 */
export function watchPokes(roomId: string, cb: (poke: Poke) => void): () => void {
  const { database } = getFirebaseServices();
  return onChildAdded(query(ref(database, `pokes/${roomId}`), limitToLast(POKE_TAIL)), (snap) => {
    const value = snap.val() as Omit<Poke, 'id'> | null;
    if (value) cb({ ...value, id: snap.key as string });
  });
}
