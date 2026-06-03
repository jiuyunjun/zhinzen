import { useEffect, useMemo, useState } from 'react';
import type { TrackPoint } from '@zhinzen/shared-types';
import { color as tokens, font, mapThemes } from '@zhinzen/shared-ui';
import { useDeviceStore } from '../../state/deviceStore';
import { useLocationStore } from '../../state/locationStore';
import { useMembersStore } from '../../state/membersStore';
import { useRoomStore } from '../../state/roomStore';
import { useSensorStore } from '../../state/sensorStore';
import { useUiStore } from '../../state/uiStore';
import { Icon, type IconName } from '../../components/Icon';
import { Toast, useToast } from '../../components/Toast';
import { LangToggle } from '../../components/LangToggle';
import { formatRoomCode, inviteLink } from '../../lib/roomCode';
import { fetchRecentTrackPoints } from '../../lib/trackApi';
import { GoogleMapView } from './GoogleMapView';
import { MemberDetailPanel } from './MemberDetailPanel';
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
  const startCompass = useSensorStore((s) => s.startCompass);
  const displayName = useDeviceStore((s) => s.displayName);
  const deviceId = useDeviceStore((s) => s.deviceId);
  const deviceSecret = useDeviceStore((s) => s.deviceSecret);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const { msg, flash } = useToast();

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
  }, [
    deviceId,
    deviceSecret,
    displayName,
    flash,
    roomId,
    setSharing,
    sharing,
    startLocationSharing,
    stopLocationSharing,
    t,
  ]);

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
    flash(t('copied'));
  };

  const onToggleSharing = () => {
    const next = !sharing;
    setSharing(next);
    if (next) void startCompass();
    flash(next ? t('sharingOn') : t('sharingOff'));
  };

  const onSelectMember = (targetDeviceId: string) => {
    setSelectedDeviceId(targetDeviceId);
    void startCompass();
  };

  const onRecenter = () => {
    setRecenterSignal((value) => value + 1);
    flash(t('recenter'));
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
        recenterSignal={recenterSignal}
        selectedDeviceId={selectedDeviceId}
        trackPoints={trackPoints}
        onSelectMember={onSelectMember}
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
          icon={sharing ? 'pause' : 'play'}
          active={!sharing}
          onClick={onToggleSharing}
          label="share"
        />
        <Fab icon="recenter" onClick={onRecenter} label="recenter" />
      </div>

      {/* bottom sheet */}
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
        <MemberStrip
          members={members}
          selfName={displayName}
          sharing={sharing}
          selectedDeviceId={selectedDeviceId}
          onSelect={onSelectMember}
        />
        {selectedMember && (
          <MemberDetailPanel
            member={selectedMember}
            ownLocation={effectiveOwnLocation}
            onClose={() => setSelectedDeviceId(null)}
            onLeaveRoom={onLeave}
          />
        )}
      </div>

      <Toast msg={msg} />
    </div>
  );
}

function Fab({
  icon,
  onClick,
  active = false,
  label,
}: {
  icon: IconName;
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
      <Icon name={icon} size={22} strokeWidth={2.1} />
    </button>
  );
}
