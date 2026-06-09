import { useEffect, useMemo, useRef, useState } from 'react';
import type { RallyPoint, TrackPoint } from '@zhinzen/shared-types';
import { color as tokens, font, mapThemes, withAlpha } from '@zhinzen/shared-ui';
import { useDeviceStore } from '../../state/deviceStore';
import { useLocationStore } from '../../state/locationStore';
import { useMembersStore } from '../../state/membersStore';
import { useRoomStore } from '../../state/roomStore';
import { useSensorStore } from '../../state/sensorStore';
import { useUiStore } from '../../state/uiStore';
import { Icon, type IconName } from '../../components/Icon';
import { Toast, useToast } from '../../components/Toast';
import { LangToggle } from '../../components/LangToggle';
import { isMapRotatable } from '../../lib/env';
import { haptics } from '../../lib/haptics';
import { formatRoomCode, inviteLink } from '../../lib/roomCode';
import { updateRoomMembers } from '../../lib/roomHistory';
import { getFamilyRoom, setFamilyRoom } from '../../lib/familyRoom';
import { fetchRecentTrackPoints } from '../../lib/trackApi';
import { calculateDistance } from '@zhinzen/geo-utils';
import {
  createRallyPoint,
  deleteRallyPoint,
  updateRallyRadius,
  watchRallyPoints,
} from '../../lib/rallyApi';
import { sendPoke, watchPokes } from '../../lib/pokeApi';
import { GoogleMapView } from './GoogleMapView';
import { MemberDetailPanel, RallyDetailPanel } from './MemberDetailPanel';
import { MemberStrip } from './MemberStrip';

/**
 * Map screen (design.md §7.3). Keeps the mobile chrome over a full-screen
 * Google Map, with live member pins and the bottom member sheet.
 */
export function MapScreen({ onLeave }: { onLeave: () => void }) {
  const t = useUiStore((s) => s.t);
  const roomId = useRoomStore((s) => s.roomId);
  const sharing = useRoomStore((s) => s.sharing);
  const setSharing = useRoomStore((s) => s.setSharing);
  const startLocationSharing = useLocationStore((s) => s.startSharing);
  const refreshLocationNow = useLocationStore((s) => s.refreshNow);
  const stopLocationSharing = useLocationStore((s) => s.stopSharing);
  const locationStatus = useLocationStore((s) => s.status);
  const locationError = useLocationStore((s) => s.error);
  const ownLocation = useLocationStore((s) => s.current);
  const members = useMembersStore((s) => s.members);
  const watchMembers = useMembersStore((s) => s.watchRoom);
  const stopWatchingMembers = useMembersStore((s) => s.stopWatching);
  const createdByDeviceId = useRoomStore((s) => s.createdByDeviceId);
  const kickMember = useRoomStore((s) => s.kickMember);
  const startCompass = useSensorStore((s) => s.startCompass);
  const sensorHeading = useSensorStore((s) => s.heading);
  const displayName = useDeviceStore((s) => s.displayName);
  const setDisplayName = useDeviceStore((s) => s.setDisplayName);
  const deviceId = useDeviceStore((s) => s.deviceId);
  const deviceSecret = useDeviceStore((s) => s.deviceSecret);
  const syncMembership = useRoomStore((s) => s.syncMembership);
  const updateLocationName = useLocationStore((s) => s.updateDisplayName);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [fitAllSignal, setFitAllSignal] = useState(0);
  const [followMode, setFollowMode] = useState<'self' | 'free' | 'track'>('self');
  const [headingUp, setHeadingUp] = useState(false);
  const [mapHeading, setMapHeading] = useState(0);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [rallyPoints, setRallyPoints] = useState<RallyPoint[]>([]);
  const [selectedRallyId, setSelectedRallyId] = useState<string | null>(null);
  const [pendingRally, setPendingRally] = useState<{ lat: number; lng: number } | null>(null);
  const [isFamily, setIsFamily] = useState(() => roomId !== null && getFamilyRoom() === roomId);

  const onToggleFamily = () => {
    if (!roomId) return;
    const next = getFamilyRoom() === roomId ? null : roomId;
    setFamilyRoom(next);
    setIsFamily(next !== null);
    haptics.tap();
    flash(next ? t('familyRoomSet') : t('familyRoomUnset'));
  };
  // Continuous (unwrapped) map heading so the compass needle takes the short way
  // across north instead of spinning ~360° when getHeading() wraps 359°→0°.
  const headingAccum = useRef({ prevRaw: 0, continuous: 0 });
  const { msg, flash } = useToast();

  const onMapHeadingChange = (raw: number) => {
    const acc = headingAccum.current;
    acc.continuous += shortestAngleDelta(raw, acc.prevRaw);
    acc.prevRaw = raw;
    setMapHeading(acc.continuous);
  };

  const selfMemberLocation = members.find((member) => member.isSelf)?.location ?? null;
  const effectiveOwnLocation = ownLocation ?? selfMemberLocation;
  const selectedMember = useMemo(
    () => members.find((member) => member.member.deviceId === selectedDeviceId) ?? null,
    [members, selectedDeviceId],
  );
  const trackDeviceId = selectedDeviceId ?? deviceId;

  useEffect(() => {
    if (!roomId) return;

    watchMembers(roomId, deviceId);
    return () => stopWatchingMembers();
  }, [deviceId, roomId, stopWatchingMembers, watchMembers]);

  // New-member alert + kicked detection, by diffing the member list.
  const prevMemberIdsRef = useRef<Set<string> | null>(null);
  const seenSelfRef = useRef(false);
  useEffect(() => {
    if (!roomId) return;
    const ids = new Set(members.map((m) => m.member.deviceId));
    if (prevMemberIdsRef.current) {
      for (const m of members) {
        if (!m.isSelf && !prevMemberIdsRef.current.has(m.member.deviceId)) {
          flash(t('memberJoined', { name: m.member.displayName || t('you') }));
          haptics.success();
        }
      }
    }
    prevMemberIdsRef.current = ids;

    if (members.some((m) => m.isSelf)) {
      seenSelfRef.current = true;
    } else if (seenSelfRef.current) {
      seenSelfRef.current = false;
      flash(t('kickedFromRoom'));
      haptics.error();
      onLeave();
    }
  }, [members, roomId, t, flash, onLeave]);

  const onKick = (targetDeviceId: string) => {
    setSelectedDeviceId(null);
    void kickMember(targetDeviceId).catch(() => flash(t('kickFailed')));
  };

  // Rally points: subscribe while in the room.
  useEffect(() => {
    if (!roomId) return;
    return watchRallyPoints(roomId, setRallyPoints);
  }, [roomId]);

  // Arrival/departure (geofence on rally points) + low-battery alerts.
  const geofenceInsideRef = useRef<Record<string, boolean>>({});
  const lowBatteryRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!roomId) return;
    for (const m of members) {
      if (m.isSelf || !m.location) continue;
      const name = m.member.displayName || t('you');
      for (const rp of rallyPoints) {
        const key = `${m.member.deviceId}|${rp.id}`;
        const d = calculateDistance(m.location, rp);
        const r = rp.radius ?? 100;
        const prev = geofenceInsideRef.current[key];
        const inside = prev ? d < r * 1.5 : d < r;
        if (prev !== undefined && prev !== inside) {
          flash(inside ? t('alertArrived', { name, place: rp.name }) : t('alertLeft', { name, place: rp.name }));
          haptics.success();
        }
        geofenceInsideRef.current[key] = inside;
      }
      const b = m.location.battery;
      if (typeof b === 'number') {
        if (b < 15 && !lowBatteryRef.current.has(m.member.deviceId)) {
          lowBatteryRef.current.add(m.member.deviceId);
          flash(t('alertLowBattery', { name, pct: String(b) }));
          haptics.success();
        } else if (b >= 25) {
          lowBatteryRef.current.delete(m.member.deviceId);
        }
      }
    }
  }, [members, rallyPoints, roomId, t, flash]);

  const selectedRally = useMemo(
    () => rallyPoints.find((p) => p.id === selectedRallyId) ?? null,
    [rallyPoints, selectedRallyId],
  );

  const onLongPress = (lat: number, lng: number) => {
    setSelectedDeviceId(null);
    setSelectedRallyId(null);
    haptics.tap();
    setPendingRally({ lat, lng });
  };
  const onConfirmRally = (name: string, radius: number) => {
    const at = pendingRally;
    setPendingRally(null);
    if (!at || !roomId) return;
    void createRallyPoint(roomId, { name, lat: at.lat, lng: at.lng, createdByDeviceId: deviceId, radius })
      .then(() => haptics.success())
      .catch(() => flash(t('rallyFailed')));
  };
  const onSetRallyRadius = (id: string, radius: number) => {
    if (roomId) void updateRallyRadius(roomId, id, radius).then(() => haptics.tap());
  };
  const onSelectRally = (id: string) => {
    setSelectedDeviceId(null);
    setSelectedRallyId(id);
    // Frame self + the rally point, like selecting a member.
    setFollowMode('track');
  };
  const onDeleteRally = (id: string) => {
    setSelectedRallyId(null);
    if (roomId) void deleteRallyPoint(roomId, id).then(() => haptics.tap());
  };

  // Pokes / quick messages: receive (vibrate + toast) and send.
  useEffect(() => {
    if (!roomId) return;
    const startedAt = Date.now();
    return watchPokes(roomId, (poke) => {
      if (poke.from === deviceId || poke.createdAt < startedAt) return;
      if (poke.to !== '' && poke.to !== deviceId) return;
      flash(`${poke.fromName || t('you')}: ${poke.text}`);
      haptics.success();
    });
  }, [roomId, deviceId, t, flash]);

  const onPoke = (to: string, text: string) => {
    if (!roomId) return;
    haptics.tap();
    void sendPoke(roomId, { from: deviceId, fromName: displayName, to, text }).then(() =>
      flash(t('pokeSent')),
    );
  };

  // Capture member names for the room-history avatar previews.
  const memberNamesKey = members.map((m) => m.member.displayName).join('');
  useEffect(() => {
    if (!roomId || members.length === 0) return;
    updateRoomMembers(
      roomId,
      members.map((m) => m.member.displayName || '?'),
    );
    // memberNamesKey collapses the member list to a stable string so we only
    // write when names actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, memberNamesKey]);

  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;

    if (sharing) {
      void startLocationSharing({ roomId, deviceId, deviceSecret, displayName }).then((started) => {
        if (!cancelled && started) flash(t('locationStarted'));
        if (!cancelled && !started) setSharing(false);
      });
    } else {
      void stopLocationSharing();
    }

    return () => {
      cancelled = true;
      void stopLocationSharing();
    };
    // `displayName` is intentionally excluded: renames propagate via
    // updateLocationName + syncMembership, so we don't restart the GPS watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, deviceSecret, flash, roomId, setSharing, sharing, startLocationSharing, stopLocationSharing, t]);

  useEffect(() => {
    if (locationError === 1 || locationError === 'unsupported') {
      flash(t('locationDenied'));
    } else if (locationStatus === 'error') {
      flash(t('locationUnavailable'));
    }
  }, [flash, locationError, locationStatus, t]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (!sharing) return;

      if (document.visibilityState === 'hidden') {
        flash(t('backgroundLocationLimited'));
        return;
      }

      void refreshLocationNow();
      flash(t('foregroundLocationRefresh'));
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [flash, refreshLocationNow, sharing, t]);

  useEffect(() => {
    if (selectedDeviceId && !members.some((member) => member.member.deviceId === selectedDeviceId)) {
      setSelectedDeviceId(null);
      setFollowMode('self');
    }
  }, [members, selectedDeviceId]);

  useEffect(() => {
    if (!roomId || !trackDeviceId) {
      setTrackPoints([]);
      return;
    }

    let cancelled = false;
    const loadTrack = () => {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      void fetchRecentTrackPoints(roomId, trackDeviceId, since)
        .then((points) => {
          if (!cancelled) setTrackPoints(points);
        })
        .catch(() => {
          if (!cancelled) setTrackPoints([]);
        });
    };

    loadTrack();
    const intervalId = window.setInterval(loadTrack, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [roomId, trackDeviceId]);

  const onCopy = async () => {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(inviteLink(roomId));
    } catch {
      // Clipboard may be blocked; still confirm the intent in the skeleton.
    }
    haptics.success();
    flash(t('copied'));
  };

  const onToggleSharing = () => {
    const next = !sharing;
    setSharing(next);
    if (next) void startCompass();
    flash(next ? t('sharingOn') : t('sharingOff'));
  };

  const onSelectMember = (targetDeviceId: string) => {
    haptics.light();
    setSelectedDeviceId(targetDeviceId);
    // Selecting another member enters track mode (frame me + them); selecting
    // myself opens the self editor and keeps following me.
    setFollowMode(targetDeviceId === deviceId ? 'self' : 'track');
    void startCompass();
  };

  const onCloseDetail = () => {
    setSelectedDeviceId(null);
    setFollowMode('self');
  };

  const onRecenter = () => {
    setFollowMode('self');
    setRecenterSignal((value) => value + 1);
    flash(t('recenter'));
  };

  const onFitAll = () => {
    setFollowMode('free');
    setFitAllSignal((value) => value + 1);
    flash(t('fitAll'));
  };

  const onToggleHeadingUp = () => {
    if (!isMapRotatable()) {
      flash(t('rotateNeedsMapId'));
      return;
    }
    const next = !headingUp;
    setHeadingUp(next);
    if (next) {
      void startCompass();
      flash(t('headingUpOn'));
    } else {
      flash(t('headingUpOff'));
    }
  };

  const onRename = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setDisplayName(trimmed);
    updateLocationName(trimmed);
    void syncMembership();
    flash(t('nameUpdated'));
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: mapThemes.light.paper,
      }}
    >
      <GoogleMapView
        members={members}
        ownLocation={ownLocation}
        ownDisplayName={displayName}
        ownDeviceId={deviceId}
        followMode={followMode}
        recenterSignal={recenterSignal}
        fitAllSignal={fitAllSignal}
        headingUp={headingUp}
        deviceHeading={headingUp ? sensorHeading : null}
        selectedDeviceId={selectedDeviceId}
        trackPoints={trackPoints}
        rallyPoints={rallyPoints}
        selectedRallyId={selectedRallyId}
        onSelectMember={onSelectMember}
        onSelectRally={onSelectRally}
        onLongPress={onLongPress}
        onUserPan={() => setFollowMode('free')}
        onHeadingChange={onMapHeadingChange}
      />

      {/* top status bar */}
      <div
        style={{
          position: 'absolute',
          top: 'max(16px, env(safe-area-inset-top))',
          left: 12,
          right: 12,
          zIndex: 40,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            height: 46,
            padding: '0 14px',
            borderRadius: 15,
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(14px) saturate(160%)',
            WebkitBackdropFilter: 'blur(14px) saturate(160%)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
            color: tokens.ink,
          }}
        >
          <Icon name="people" size={18} color={tokens.inkSoft} />
          <span style={{ fontSize: 14, fontWeight: 650 }}>{members.length || 1}</span>
          <span style={{ width: 1, height: 18, background: tokens.line, margin: '0 2px' }} />
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 12.5,
              letterSpacing: '0.08em',
              color: tokens.inkSoft,
              whiteSpace: 'nowrap',
            }}
          >
            {roomId ? formatRoomCode(roomId) : '—'}
          </span>
        </div>
        <button
          type="button"
          onClick={onCopy}
          style={{
            height: 46,
            padding: '0 14px',
            borderRadius: 15,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            background: tokens.self,
            color: '#fff',
            fontSize: 13.5,
            fontWeight: 600,
            boxShadow: '0 4px 14px rgba(0,0,0,0.16)',
          }}
        >
          <Icon name="copy" size={17} />
          {t('invite')}
        </button>
        <button
          type="button"
          onClick={onToggleFamily}
          title={t('familyRoom')}
          aria-label={t('familyRoom')}
          style={{
            height: 46,
            width: 46,
            borderRadius: 15,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isFamily ? '#f59e0b' : '#fff',
            color: isFamily ? '#fff' : tokens.inkFaint,
            fontSize: 20,
            boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
          }}
        >
          {isFamily ? '★' : '☆'}
        </button>
        <div style={{ alignSelf: 'center' }}>
          <LangToggle />
        </div>
      </div>

      {/* floating actions */}
      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 248,
          zIndex: 40,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <Fab
          icon="compass"
          active={headingUp}
          onClick={onToggleHeadingUp}
          label={t('compass')}
          iconRotation={-mapHeading}
        />
        <Fab icon="fitAll" onClick={onFitAll} label={t('fitAll')} />
        <Fab
          icon={sharing ? 'pause' : 'play'}
          active={!sharing}
          onClick={onToggleSharing}
          label="share"
        />
        <Fab icon="recenter" onClick={onRecenter} label="recenter" />
      </div>

      {/* bottom sheet — capped height so the map stays visible above it */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 45,
          background: '#fff',
          borderRadius: '26px 26px 0 0',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.14)',
          padding: '10px 18px max(30px, env(safe-area-inset-bottom))',
          color: tokens.ink,
          maxHeight: 'min(46vh, 460px)',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            width: 38,
            height: 5,
            borderRadius: 3,
            background: 'oklch(0.88 0.008 260)',
            margin: '0 auto 14px',
          }}
        />
        {selectedMember ? (
          <MemberDetailPanel
            member={selectedMember}
            ownLocation={effectiveOwnLocation}
            canKick={createdByDeviceId === deviceId && !selectedMember.isSelf}
            onKick={onKick}
            onPoke={(text) => onPoke(selectedMember.member.deviceId, text)}
            onClose={onCloseDetail}
            onLeaveRoom={onLeave}
            onRename={onRename}
          />
        ) : selectedRally ? (
          <RallyDetailPanel
            point={selectedRally}
            ownLocation={effectiveOwnLocation}
            canEdit={
              selectedRally.createdByDeviceId === deviceId || createdByDeviceId === deviceId
            }
            onSetRadius={(r) => onSetRallyRadius(selectedRally.id, r)}
            onDelete={() => onDeleteRally(selectedRally.id)}
            onClose={() => setSelectedRallyId(null)}
          />
        ) : (
          <MemberStrip
            members={members}
            selfName={displayName}
            sharing={sharing}
            selectedDeviceId={selectedDeviceId}
            onSelect={onSelectMember}
            rallyPoints={rallyPoints}
            selectedRallyId={selectedRallyId}
            onSelectRally={onSelectRally}
          />
        )}
      </div>

      {pendingRally && (
        <RallyNameDialog
          initial={t('rallyDefaultName')}
          onCancel={() => setPendingRally(null)}
          onConfirm={onConfirmRally}
        />
      )}

      <Toast msg={msg} />
    </div>
  );
}

function RallyNameDialog({
  initial,
  onCancel,
  onConfirm,
}: {
  initial: string;
  onCancel: () => void;
  onConfirm: (name: string, radius: number) => void;
}) {
  const t = useUiStore((s) => s.t);
  const [name, setName] = useState(initial);
  const [radius, setRadius] = useState(100);
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, padding: 18, width: '100%', maxWidth: 320 }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, color: tokens.ink, marginBottom: 12 }}>
          {t('newRally')}
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) onConfirm(name.trim(), radius);
          }}
          style={{
            width: '100%',
            height: 44,
            boxSizing: 'border-box',
            padding: '0 14px',
            fontSize: 15,
            fontFamily: 'inherit',
            border: `1.5px solid ${tokens.line}`,
            borderRadius: 12,
            outline: 'none',
          }}
        />
        <div style={{ fontSize: 12.5, color: tokens.inkSoft, margin: '14px 0 6px' }}>
          {t('rallyRadius')}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[50, 100, 200, 500].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRadius(r)}
              style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 11,
                border: `1.5px solid ${radius === r ? '#7c3aed' : tokens.line}`,
                background: radius === r ? withAlpha('#7c3aed', 0.1) : '#fff',
                color: radius === r ? '#7c3aed' : tokens.inkSoft,
                fontFamily: 'inherit',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {r}m
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              height: 42,
              borderRadius: 12,
              border: `1.5px solid ${tokens.line}`,
              background: '#fff',
              color: tokens.inkSoft,
              fontFamily: 'inherit',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => onConfirm(name.trim(), radius)}
            style={{
              flex: 1,
              height: 42,
              borderRadius: 12,
              border: 'none',
              background: name.trim() ? '#7c3aed' : withAlpha(tokens.offline, 0.2),
              color: name.trim() ? '#fff' : tokens.inkFaint,
              fontFamily: 'inherit',
              fontWeight: 700,
              cursor: name.trim() ? 'pointer' : 'default',
            }}
          >
            {t('create')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shortest signed angular distance from `current` to `target`, in (-180, 180]. */
function shortestAngleDelta(target: number, current: number): number {
  return ((target - current + 540) % 360) - 180;
}

function Fab({
  icon,
  onClick,
  active = false,
  label,
  iconRotation,
}: {
  icon: IconName;
  onClick: () => void;
  active?: boolean;
  label: string;
  /** Rotate just the glyph (e.g. compass needle tracking map heading). */
  iconRotation?: number;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        haptics.tap();
        onClick();
      }}
      aria-label={label}
      style={{
        width: 46,
        height: 46,
        borderRadius: 16,
        border: 'none',
        cursor: 'pointer',
        background: active ? tokens.self : 'rgba(255,255,255,0.92)',
        color: active ? '#fff' : tokens.ink,
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          display: 'flex',
          transform: iconRotation !== undefined ? `rotate(${iconRotation}deg)` : undefined,
          transition: 'transform 120ms ease',
        }}
      >
        <Icon name={icon} size={22} strokeWidth={2.1} />
      </span>
    </button>
  );
}
