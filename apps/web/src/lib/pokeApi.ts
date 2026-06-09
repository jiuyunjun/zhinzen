import { onChildAdded, push, ref, set } from 'firebase/database';

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

/** Fire `cb` for each newly-added poke (including the initial batch). */
export function watchPokes(roomId: string, cb: (poke: Poke) => void): () => void {
  const { database } = getFirebaseServices();
  return onChildAdded(ref(database, `pokes/${roomId}`), (snap) => {
    const value = snap.val() as Omit<Poke, 'id'> | null;
    if (value) cb({ ...value, id: snap.key as string });
  });
}
