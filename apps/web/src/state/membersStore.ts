import type { LiveLocation, RoomMember } from '@zhinzen/shared-types';
import { isLocationStale } from '@zhinzen/geo-utils';
import { onValue, ref, type Unsubscribe as DatabaseUnsubscribe } from 'firebase/database';
import { collection, onSnapshot, type Unsubscribe as FirestoreUnsubscribe } from 'firebase/firestore';
import { create } from 'zustand';

import { getFirebaseServices } from '../lib/firebase';

export type MemberViewStatus = 'online' | 'offline' | 'stale' | 'notSharing';

export interface MemberView {
  member: RoomMember;
  location: LiveLocation | null;
  status: MemberViewStatus;
  isSelf: boolean;
}

interface MembersState {
  members: MemberView[];
  loading: boolean;
  error: string | null;
  watchRoom: (roomId: string, selfDeviceId: string) => void;
  stopWatching: () => void;
}

let stopMembers: FirestoreUnsubscribe | null = null;
let stopLocations: DatabaseUnsubscribe | null = null;
let currentRoomId: string | null = null;
let currentSelfDeviceId: string | null = null;
let memberDocs = new Map<string, RoomMember>();
let liveLocations = new Map<string, LiveLocation>();

function deriveStatus(member: RoomMember, location: LiveLocation | null): MemberViewStatus {
  if (!member.online) return 'offline';
  if (!member.sharingLocation || location?.sharingLocation === false) return 'notSharing';
  if (!location || isLocationStale(location.updatedAt)) return 'stale';
  return 'online';
}

function rebuildMembers(): MemberView[] {
  const selfDeviceId = currentSelfDeviceId;
  return [...memberDocs.values()]
    .map((member) => {
      const location = liveLocations.get(member.deviceId) ?? null;
      return {
        member,
        location,
        status: deriveStatus(member, location),
        isSelf: member.deviceId === selfDeviceId,
      };
    })
    .sort((a, b) => {
      if (a.isSelf) return -1;
      if (b.isSelf) return 1;
      if (a.status === 'online' && b.status !== 'online') return -1;
      if (b.status === 'online' && a.status !== 'online') return 1;
      return a.member.displayName.localeCompare(b.member.displayName);
    });
}

function resetCache(): void {
  memberDocs = new Map();
  liveLocations = new Map();
}

export const useMembersStore = create<MembersState>((set) => ({
  members: [],
  loading: false,
  error: null,
  watchRoom: (roomId, selfDeviceId) => {
    if (currentRoomId === roomId && currentSelfDeviceId === selfDeviceId) return;

    if (stopMembers) stopMembers();
    if (stopLocations) stopLocations();

    resetCache();
    currentRoomId = roomId;
    currentSelfDeviceId = selfDeviceId;
    set({ members: [], loading: true, error: null });

    const { firestore, database } = getFirebaseServices();

    stopMembers = onSnapshot(
      collection(firestore, 'rooms', roomId, 'members'),
      (snapshot) => {
        memberDocs = new Map(
          snapshot.docs.map((doc) => [doc.id, doc.data() as RoomMember]),
        );
        set({ members: rebuildMembers(), loading: false, error: null });
      },
      (error) => set({ loading: false, error: error.message }),
    );

    stopLocations = onValue(
      ref(database, `liveLocations/${roomId}`),
      (snapshot) => {
        const value = snapshot.val() as Record<string, LiveLocation> | null;
        liveLocations = new Map(Object.entries(value ?? {}));
        set({ members: rebuildMembers(), loading: false, error: null });
      },
      (error) => set({ loading: false, error: error.message }),
    );
  },
  stopWatching: () => {
    if (stopMembers) stopMembers();
    if (stopLocations) stopLocations();
    stopMembers = null;
    stopLocations = null;
    currentRoomId = null;
    currentSelfDeviceId = null;
    resetCache();
    set({ members: [], loading: false, error: null });
  },
}));
