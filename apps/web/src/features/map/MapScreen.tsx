import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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
import { SourceLink } from '../../components/SourceLink';
import { isMapRotatable } from '../../lib/env';
import { haptics } from '../../lib/haptics';
import { formatRoomCode, inviteLink } from '../../lib/roomCode';
import { updateRoomMembers } from '../../lib/roomHistory';
import { getFamilyRoom, setFamilyRoom } from '../../lib/familyRoom';
import { fetchRecentTrackPoints } from '../../lib/trackApi';
import {
  calculateBearing,
  calculateDistance,
  formatDistance,
  normalizeAngle,
  DEFAULT_FOLLOW_GPS_HEADING_MIN_SPEED,
} from '@zhinzen/geo-utils';
import {
  createRallyPoint,
  deleteRallyPoint,
  updateRallyRadius,
  watchRallyPoints,
} from '../../lib/rallyApi';
import { sendPoke, watchPokes } from '../../lib/pokeApi';
import { GoogleMapView, type FollowMode, type FollowTargetState } from './GoogleMapView';
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
  const [followMode, setFollowMode] = useState<FollowMode>('self');
  // Follow mode's target is deliberately separate from `selectedDeviceId`: the
  // sheet gets collapsed (or another member tapped) while following, and the
  // camera must keep tracking regardless (design.md §5.10).
  const [followTarget, setFollowTarget] = useState<{
    kind: 'member' | 'rally';
    id: string;
  } | null>(null);
  const [headingUp, setHeadingUp] = useState(false);
  // Heading-up state to restore when a follow session ends.
  const headingUpBeforeFollowRef = useRef(false);
  const [mapHeading, setMapHeading] = useState(0);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [rallyPoints, setRallyPoints] = useState<RallyPoint[]>([]);
  const [selectedRallyId, setSelectedRallyId] = useState<string | null>(null);
  const [pendingRally, setPendingRally] = useState<{ lat: number; lng: number } | null>(null);
  const [isFamily, setIsFamily] = useState(() => roomId !== null && getFamilyRoom() === roomId);

  // Draggable bottom sheet: grab the handle and slide it down to a small peek so it
  // stops covering the map; slide back up to read the detail. `sheetOffset` is the
  // live translateY in px; selecting a new target resets it to fully open.
  const SHEET_PEEK = 52;
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetOffset, setSheetOffset] = useState(0);
  const sheetDrag = useRef({ startY: 0, base: 0, max: 0, active: false });
  const onSheetPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = sheetRef.current;
    if (!el) return;
    const max = Math.max(0, el.offsetHeight - SHEET_PEEK);
    sheetDrag.current = { startY: e.clientY, base: sheetOffset, max, active: true };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onSheetPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = sheetDrag.current;
    if (!d.active) return;
    setSheetOffset(Math.min(d.max, Math.max(0, d.base + (e.clientY - d.startY))));
  };
  const onSheetPointerUp = () => {
    const d = sheetDrag.current;
    if (!d.active) return;
    d.active = false;
    // Snap to whichever end (open / peek) the sheet is closer to.
    setSheetOffset(sheetOffset > d.max / 2 ? d.max : 0);
  };
  // Fully open the sheet whenever the selection changes (new detail to read).
  useEffect(() => {
    setSheetOffset(0);
  }, [selectedDeviceId, selectedRallyId]);

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
  // Only show a track for the explicitly selected member — including yourself when
  // you tap your own avatar. Nothing selected → no track (keeps the default map clean).
  // While actively following, the track is dropped entirely: you are watching the road,
  // not a history trail, and its 15s poll + polyline rebuild is pure cost mid-ride.
  const trackDeviceId = followMode === 'track' || followMode === 'trackBoth' ? null : selectedDeviceId;

  // ---- Follow mode (design.md §5.10) ----------------------------------------
  // A follow session only ever ends when *you* end it. If the target goes offline,
  // stops sharing or otherwise drops out of the feed, we keep following their last
  // known position (and say how old it is) rather than dropping the session.
  const lastFollowRef = useRef<{ name: string; lat: number; lng: number; updatedAt: number | null } | null>(
    null,
  );
  if (!followTarget) lastFollowRef.current = null;
  const followInfo = useMemo(() => {
    if (!followTarget) return null;
    const known = lastFollowRef.current;
    if (followTarget.kind === 'member') {
      const m = members.find((x) => x.member.deviceId === followTarget.id);
      const name = m ? m.member.displayName.trim() || t('you') : known?.name ?? t('you');
      if (m?.location) {
        lastFollowRef.current = {
          name,
          lat: m.location.lat,
          lng: m.location.lng,
          updatedAt: m.location.updatedAt,
        };
      }
      const held = lastFollowRef.current;
      // Three states worth telling apart while riding: they're moving, they've
      // stopped, or we've lost them and are looking at an old fix.
      const state: FollowTargetState =
        !m || m.status === 'stale' || m.status === 'offline' || m.status === 'notSharing'
          ? 'stale'
          : (m.location?.speed ?? 0) < 0.6
            ? 'stopped'
            : 'moving';
      return {
        name,
        point: held ? { lat: held.lat, lng: held.lng } : null,
        updatedAt: held?.updatedAt ?? null,
        state,
      };
    }
    const r = rallyPoints.find((p) => p.id === followTarget.id);
    if (r) lastFollowRef.current = { name: r.name, lat: r.lat, lng: r.lng, updatedAt: null };
    const held = lastFollowRef.current;
    return {
      name: r?.name ?? held?.name ?? '',
      point: held ? { lat: held.lat, lng: held.lng } : null,
      updatedAt: null,
      state: 'stopped' as FollowTargetState,
    };
  }, [followTarget, members, rallyPoints, t]);
  const ownSpeed = effectiveOwnLocation?.speed ?? 0;
  // Tick once a second while following so the "x ago" keeps counting up even when no
  // new packets arrive — which is exactly when its value matters most.
  const [, setAgeTick] = useState(0);
  useEffect(() => {
    if (!followTarget) return;
    const id = window.setInterval(() => setAgeTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [followTarget]);
  const followAgeLabel = followInfo?.updatedAt ? formatAgo(followInfo.updatedAt) : null;
  // Reported by the map from its own bounds — no hand-rolled projection.
  const [targetOffScreen, setTargetOffScreen] = useState(false);

  // Heading source: the GPS course over ground while actually moving, the compass
  // otherwise. A magnetometer next to a bike/car mount drifts badly — that drift is
  // exactly what the figure-8 calibration prompt is reacting to.
  const gpsHeading =
    effectiveOwnLocation &&
    effectiveOwnLocation.heading !== null &&
    effectiveOwnLocation.speed >= DEFAULT_FOLLOW_GPS_HEADING_MIN_SPEED
      ? effectiveOwnLocation.heading
      : null;
  const followHeading = gpsHeading ?? sensorHeading;

  const followBearing =
    effectiveOwnLocation && followInfo?.point
      ? calculateBearing(effectiveOwnLocation, followInfo.point)
      : null;
  const followDistance =
    effectiveOwnLocation && followInfo?.point
      ? formatDistance(calculateDistance(effectiveOwnLocation, followInfo.point))
      : null;
  // With the map rotated heading-up, screen-up *is* our heading, so the arrow can
  // point at the target directly. On a non-rotatable map it stays relative to north.
  const followArrow =
    followBearing === null
      ? null
      : isMapRotatable() && followHeading !== null
        ? normalizeAngle(followBearing - followHeading)
        : followBearing;
  // Same angle folded into (-180, 180] so it reads as "ahead / to your right / …".
  const followRelative = followArrow === null ? null : shortestAngleDelta(followArrow, 0);

  const startFollow = (kind: 'member' | 'rally', id: string) => {
    haptics.light();
    setFollowTarget({ kind, id });
    setFollowMode('track');
    if (isMapRotatable()) {
      if (!followTarget) headingUpBeforeFollowRef.current = headingUp;
      setHeadingUp(true);
    } else {
      flash(t('rotateNeedsMapId'));
    }
    void startCompass();
    // Collapse the sheet to its peek so the map is fully visible.
    const el = sheetRef.current;
    if (el) setSheetOffset(Math.max(0, el.offsetHeight - SHEET_PEEK));
  };

  const stopFollow = () => {
    if (!followTarget) return;
    setFollowTarget(null);
    setFollowMode('self');
    if (isMapRotatable()) setHeadingUp(headingUpBeforeFollowRef.current);
  };

  // Note: there is deliberately no auto-stop. Losing the target's signal is exactly
  // when you most want the camera parked on their last known spot.

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

  // A tap on the empty map drops a pending rally point here (then the name dialog).
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
    // Focus it once; "Follow" in the detail starts a tracking session.
    if (!followTarget) setFollowMode('free');
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
      // An active follow session owns the camera; only reset it when idle.
      if (!followTarget) setFollowMode('self');
    }
  }, [members, selectedDeviceId, followTarget]);

  // Track points for the active device, fetched incrementally: a full 24h load
  // once, then every 15s only the points newer than the latest we hold are
  // fetched and appended (and points older than 24h are trimmed). Re-downloading
  // the whole 24h window every tick was the main source of jank on long tracks.
  const trackWindowMs = 24 * 60 * 60 * 1000;
  const lastTrackAtRef = useRef(0);
  useEffect(() => {
    lastTrackAtRef.current = 0;
    setTrackPoints([]);
    if (!roomId || !trackDeviceId) return;

    let cancelled = false;
    let held: TrackPoint[] = [];

    const loadInitial = () => {
      void fetchRecentTrackPoints(roomId, trackDeviceId, Date.now() - trackWindowMs)
        .then((points) => {
          if (cancelled) return;
          held = points;
          lastTrackAtRef.current = points.length ? points[points.length - 1].createdAt : 0;
          setTrackPoints(points);
        })
        .catch(() => {
          if (!cancelled) setTrackPoints([]);
        });
    };

    const loadIncremental = () => {
      const last = lastTrackAtRef.current;
      if (!last) {
        loadInitial();
        return;
      }
      // startAt is inclusive of the boundary point; keep only strictly newer ones.
      void fetchRecentTrackPoints(roomId, trackDeviceId, last)
        .then((points) => {
          if (cancelled) return;
          const fresh = points.filter((p) => p.createdAt > last);
          const cutoff = Date.now() - trackWindowMs;
          const next = (fresh.length ? held.concat(fresh) : held).filter(
            (p) => p.createdAt >= cutoff,
          );
          // Only re-render when the rendered set actually changed.
          if (fresh.length === 0 && next.length === held.length) return;
          held = next;
          if (fresh.length) lastTrackAtRef.current = fresh[fresh.length - 1].createdAt;
          setTrackPoints(next);
        })
        .catch(() => {});
    };

    loadInitial();
    const intervalId = window.setInterval(loadIncremental, 15000);

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
    // Selecting is just "show me this" — it focuses the map once (GoogleMapView)
    // and opens the detail, where "Follow" starts the real tracking session.
    if (!followTarget) setFollowMode(targetDeviceId === deviceId ? 'self' : 'free');
    void startCompass();
  };

  const onCloseDetail = () => {
    setSelectedDeviceId(null);
    if (!followTarget) setFollowMode('self');
  };

  const onRecenter = () => {
    // While following, taking the camera pauses the session instead of ending it.
    setFollowMode(followTarget ? 'trackPaused' : 'self');
    setRecenterSignal((value) => value + 1);
    flash(t('recenter'));
  };

  const onFitAll = () => {
    setFollowMode(followTarget ? 'trackPaused' : 'free');
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
        followTargetPoint={followInfo?.point ?? null}
        followTargetState={followInfo?.state ?? 'moving'}
        ownSpeed={ownSpeed}
        ownHeading={followHeading}
        onFollowTargetOffScreen={setTargetOffScreen}
        recenterSignal={recenterSignal}
        fitAllSignal={fitAllSignal}
        headingUp={headingUp}
        deviceHeading={headingUp ? followHeading : null}
        headingFromGps={gpsHeading !== null}
        selectedDeviceId={selectedDeviceId}
        trackPoints={trackPoints}
        rallyPoints={rallyPoints}
        selectedRallyId={selectedRallyId}
        onSelectMember={onSelectMember}
        onSelectRally={onSelectRally}
        onLongPress={onLongPress}
        // A stray pan must not end a follow session — it only hands the camera
        // back until you tap "resume".
        onUserPan={() => setFollowMode((mode) => (mode === 'track' ? 'trackPaused' : 'free'))}
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
        <div style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6 }}>
          <SourceLink compact />
          <LangToggle />
        </div>
      </div>

      {/* follow HUD — the one line that answers "which way, how far" */}
      {followInfo && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(max(16px, env(safe-area-inset-top)) + 54px)',
            left: 12,
            right: 12,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 18,
            background: 'rgba(255,255,255,0.93)',
            backdropFilter: 'blur(16px) saturate(170%)',
            WebkitBackdropFilter: 'blur(16px) saturate(170%)',
            boxShadow: '0 6px 22px rgba(0,0,0,0.16)',
            color: tokens.ink,
          }}
        >
          {followArrow !== null && (
            <span
              style={{
                display: 'flex',
                flexShrink: 0,
                transform: `rotate(${followArrow}deg)`,
                transition: 'transform 220ms ease',
              }}
            >
              <Icon
                name="nav"
                size={26}
                strokeWidth={2.5}
                color={followInfo.state === 'stale' ? tokens.stale : '#7c3aed'}
              />
            </span>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontFamily: font.mono, fontSize: 11.5, color: tokens.inkFaint }}>
                {t('followApart')}
              </span>
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 26,
                  fontWeight: 600,
                  lineHeight: 1,
                  letterSpacing: '-0.01em',
                }}
              >
                {followDistance ? followDistance.value : '—'}
              </span>
              <span style={{ fontFamily: font.mono, fontSize: 14, opacity: 0.7 }}>
                {followDistance ? t(followDistance.unit) : ''}
              </span>
            </div>
            <div
              style={{
                fontSize: 12.5,
                marginTop: 3,
                color: tokens.inkSoft,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {followRelative !== null && t('followTargetAt', { dir: t(directionWord(followRelative)) })}
              {targetOffScreen && ` · ${t('followOffScreen')}`}
              {followAgeLabel && (
                <>
                  {' · '}
                  <span style={{ color: followInfo.state === 'stale' ? tokens.stale : 'inherit' }}>
                    {t('followUpdatedAgo', { t: followAgeLabel })}
                  </span>
                </>
              )}
            </div>
          </div>
          <span
            style={{
              flexShrink: 0,
              fontFamily: font.mono,
              fontSize: 10.5,
              padding: '3px 7px',
              borderRadius: 7,
              background:
                followInfo.state === 'moving'
                  ? withAlpha(tokens.online, 0.16)
                  : followInfo.state === 'stale'
                    ? withAlpha(tokens.stale, 0.18)
                    : withAlpha(tokens.offline, 0.2),
              color:
                followInfo.state === 'moving'
                  ? tokens.online
                  : followInfo.state === 'stale'
                    ? tokens.stale
                    : tokens.inkSoft,
            }}
          >
            {t(
              followInfo.state === 'moving'
                ? 'followMoving'
                : followInfo.state === 'stale'
                  ? 'followStale'
                  : 'followStopped',
            )}
          </span>
        </div>
      )}

      {/* paused → one tap to hand the camera back to the follow session */}
      {followInfo && followMode === 'trackPaused' && (
        <button
          type="button"
          onClick={() => {
            haptics.tap();
            setFollowMode('track');
          }}
          style={{
            position: 'absolute',
            bottom: 'calc(112px + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 46,
            height: 42,
            padding: '0 18px',
            borderRadius: 21,
            border: 'none',
            cursor: 'pointer',
            background: tokens.self,
            color: '#fff',
            fontFamily: 'inherit',
            fontSize: 13.5,
            fontWeight: 700,
            boxShadow: '0 6px 20px rgba(0,0,0,0.24)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
          }}
        >
          <Icon name="recenter" size={17} strokeWidth={2.2} />
          {t('followRecenter')}
        </button>
      )}

      {/* follow controls: two explicit camera modes + exit */}
      {followInfo && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 'calc(58px + env(safe-area-inset-bottom))',
            zIndex: 46,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <FollowModeButton
            active={followMode === 'track'}
            activeColor={tokens.self}
            icon="nav"
            label={t('followSelf')}
            onClick={() => {
              haptics.tap();
              setFollowMode('track');
            }}
          />
          <FollowModeButton
            active={followMode === 'trackBoth'}
            activeColor="#7c3aed"
            icon="fitAll"
            label={t('followViewBoth')}
            onClick={() => {
              haptics.tap();
              setFollowMode('trackBoth');
            }}
          />
          <button
            type="button"
            onClick={stopFollow}
            aria-label={t('followStop')}
            style={{
              width: 52,
              height: 52,
              flexShrink: 0,
              borderRadius: 16,
              border: 'none',
              cursor: 'pointer',
              background: 'rgba(255,255,255,0.94)',
              color: tokens.danger,
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="close" size={20} strokeWidth={2.4} />
          </button>
        </div>
      )}

      {/* floating actions — the follow controls replace them while following */}
      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 248,
          zIndex: 40,
          display: followInfo ? 'none' : 'flex',
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

      {/* bottom sheet — drag the handle down to a peek so the map stays visible */}
      <div
        ref={sheetRef}
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
          transform: `translateY(${sheetOffset}px)`,
          transition: sheetDrag.current.active ? 'none' : 'transform 240ms ease',
        }}
      >
        {/* When peeked, tap anywhere on the sheet (incl. the name) to expand it. */}
        {!sheetDrag.current.active && sheetOffset > 8 && (
          <div
            onClick={() => setSheetOffset(0)}
            style={{ position: 'absolute', inset: 0, zIndex: 3, cursor: 'pointer' }}
          />
        )}
        {/* Drag the whole top strip (handle + name) to peek; the close-button corner
            is left free. Only when a detail is open (the member strip needs taps). */}
        {(selectedMember || selectedRally) && (
          <div
            onPointerDown={onSheetPointerDown}
            onPointerMove={onSheetPointerMove}
            onPointerUp={onSheetPointerUp}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 54,
              height: 66,
              zIndex: 2,
              cursor: 'grab',
              touchAction: 'none',
            }}
          />
        )}
        {/* grab handle — visual affordance + drag target for the member strip */}
        <div
          onPointerDown={onSheetPointerDown}
          onPointerMove={onSheetPointerMove}
          onPointerUp={onSheetPointerUp}
          style={{ margin: '-10px -18px 2px', padding: '9px 18px 9px', cursor: 'grab', touchAction: 'none' }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: 'oklch(0.89 0.006 260)',
              margin: '0 auto',
            }}
          />
        </div>
        {selectedMember ? (
          <MemberDetailPanel
            member={selectedMember}
            ownLocation={effectiveOwnLocation}
            canKick={createdByDeviceId === deviceId && !selectedMember.isSelf}
            onKick={onKick}
            following={followTarget?.kind === 'member' && followTarget.id === selectedMember.member.deviceId}
            onToggleFollow={() =>
              followTarget?.kind === 'member' && followTarget.id === selectedMember.member.deviceId
                ? stopFollow()
                : startFollow('member', selectedMember.member.deviceId)
            }
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
            following={followTarget?.kind === 'rally' && followTarget.id === selectedRally.id}
            onToggleFollow={() =>
              followTarget?.kind === 'rally' && followTarget.id === selectedRally.id
                ? stopFollow()
                : startFollow('rally', selectedRally.id)
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
                background: radius === r ? 'rgba(124, 58, 237, 0.1)' : '#fff',
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

/**
 * Turn a relative bearing into the phrase you'd actually say out loud. Eight
 * sectors: precise enough to act on, coarse enough to read at a glance.
 */
function directionWord(
  relative: number,
): 'dirAhead' | 'dirFrontRight' | 'dirRight' | 'dirBackRight' | 'dirBack' | 'dirBackLeft' | 'dirLeft' | 'dirFrontLeft' {
  const a = Math.abs(relative);
  const right = relative > 0;
  if (a < 22.5) return 'dirAhead';
  if (a < 67.5) return right ? 'dirFrontRight' : 'dirFrontLeft';
  if (a < 112.5) return right ? 'dirRight' : 'dirLeft';
  if (a < 157.5) return right ? 'dirBackRight' : 'dirBackLeft';
  return 'dirBack';
}

/** One of the two big camera-mode buttons at the bottom of the follow view. */
function FollowModeButton({
  active,
  activeColor,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  activeColor: string;
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        height: 52,
        borderRadius: 16,
        border: 'none',
        cursor: 'pointer',
        background: active ? activeColor : 'rgba(255,255,255,0.94)',
        color: active ? '#fff' : tokens.ink,
        fontFamily: 'inherit',
        fontSize: 14.5,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
      }}
    >
      <Icon name={icon} size={18} strokeWidth={2.3} />
      {label}
    </button>
  );
}

/** Compact "how long ago" for the follow bar when the target's fix went stale. */
function formatAgo(updatedAt: number): string {
  const s = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m${s % 60}s` : `${Math.round(m / 60)}h`;
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
