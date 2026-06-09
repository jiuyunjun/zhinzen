import { useEffect, useRef, useState } from 'react';
import { useDeviceStore } from './state/deviceStore';
import { useRoomStore } from './state/roomStore';
import { getFamilyRoom } from './lib/familyRoom';
import { Onboarding } from './features/onboarding/Onboarding';
import { RoomChoice } from './features/room/RoomChoice';
import { MapScreen } from './features/map/MapScreen';

type Phase = 'onboarding' | 'room' | 'map';

/**
 * App phase router (design.md §4 user flows). Computes the entry phase from
 * persisted identity + any invite link the app was opened with, then drives the
 * onboarding → room → map skeleton flow.
 */
function initialPhase(): Phase {
  const hasName = useDeviceStore.getState().hasName;
  const hasRoom = useRoomStore.getState().roomId !== null;
  if (!hasName) return 'onboarding';
  return hasRoom ? 'map' : 'room';
}

export function App() {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const leaveRoom = useRoomStore((s) => s.leaveRoom);
  const joinRoom = useRoomStore((s) => s.joinRoom);

  // Auto-enter the family room on launch: if a family room is pinned and we're not
  // already in a room or following an invite link, join it and go to the map.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current) return;
    const family = getFamilyRoom();
    const { hasName } = useDeviceStore.getState();
    const { roomId, pendingJoinCode } = useRoomStore.getState();
    if (!family || !hasName || roomId || pendingJoinCode) return;
    autoJoined.current = true;
    void joinRoom(family).then((id) => {
      if (id) setPhase('map');
    });
  }, [joinRoom]);

  if (phase === 'onboarding') {
    return (
      <Onboarding
        // If opened via an invite link, jump straight to the room after naming.
        onContinue={() => setPhase('room')}
      />
    );
  }

  if (phase === 'room') {
    return <RoomChoice onEnterRoom={() => setPhase('map')} />;
  }

  return (
    <MapScreen
      onLeave={() => {
        leaveRoom();
        setPhase('room');
      }}
    />
  );
}
