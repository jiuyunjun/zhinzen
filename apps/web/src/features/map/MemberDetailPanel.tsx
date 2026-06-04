import { useRef, useState } from 'react';
import {
  calculateBearing,
  calculateDistance,
  calculateRelativeDirection,
  formatDistance,
} from '@zhinzen/geo-utils';
import type { LiveLocation } from '@zhinzen/shared-types';
import { color as tokens, font, withAlpha } from '@zhinzen/shared-ui';

import { Icon } from '../../components/Icon';
import type { MemberView, MemberViewStatus } from '../../state/membersStore';
import { useSensorStore } from '../../state/sensorStore';
import { useUiStore } from '../../state/uiStore';

interface MemberDetailPanelProps {
  member: MemberView;
  ownLocation: LiveLocation | null;
  onClose: () => void;
  onLeaveRoom?: () => void;
  /** Save a new display name for self (only used for the self panel). */
  onRename?: (name: string) => void;
}

/**
 * Bottom-sheet detail shown in place of the member strip when a member is
 * selected. Self → a compact name editor + leave room. Others → distance,
 * direction pointer and navigation.
 */
export function MemberDetailPanel({
  member,
  ownLocation,
  onClose,
  onLeaveRoom,
  onRename,
}: MemberDetailPanelProps) {
  if (member.isSelf) {
    return (
      <SelfPanel member={member} onClose={onClose} onLeaveRoom={onLeaveRoom} onRename={onRename} />
    );
  }
  return <OtherPanel member={member} ownLocation={ownLocation} onClose={onClose} />;
}

function PanelHeader({
  name,
  accent,
  status,
  onClose,
}: {
  name: string;
  accent: string;
  status: MemberViewStatus;
  onClose: () => void;
}) {
  const t = useUiStore((s) => s.t);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          background: accent,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 17,
          fontWeight: 750,
          flexShrink: 0,
        }}
      >
        {[...name][0]}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            color: tokens.ink,
            fontSize: 16,
            fontWeight: 750,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
        <div
          style={{
            marginTop: 2,
            color: colorForStatus(status),
            fontFamily: font.mono,
            fontSize: 11.5,
          }}
        >
          {labelForStatus(status, t)}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('close')}
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          border: 'none',
          cursor: 'pointer',
          color: tokens.inkSoft,
          background: withAlpha(tokens.offline, 0.16),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

function SelfPanel({
  member,
  onClose,
  onLeaveRoom,
  onRename,
}: {
  member: MemberView;
  onClose: () => void;
  onLeaveRoom?: () => void;
  onRename?: (name: string) => void;
}) {
  const t = useUiStore((s) => s.t);
  const currentName = member.member.displayName.trim() || t('you');
  const [draft, setDraft] = useState(member.member.displayName);
  const trimmed = draft.trim();
  const canSave = trimmed.length > 0 && trimmed !== member.member.displayName.trim();

  const save = () => {
    if (canSave) onRename?.(trimmed);
  };

  return (
    <section>
      <PanelHeader name={currentName} accent={tokens.self} status={member.status} onClose={onClose} />

      <label
        style={{
          display: 'block',
          marginTop: 14,
          marginBottom: 6,
          color: tokens.inkFaint,
          fontSize: 11.5,
          fontWeight: 650,
        }}
      >
        {t('yourName')}
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
          placeholder={t('namePh')}
          autoComplete="off"
          style={{
            flex: 1,
            minWidth: 0,
            height: 46,
            boxSizing: 'border-box',
            padding: '0 14px',
            fontSize: 16,
            fontFamily: 'inherit',
            color: tokens.ink,
            background: '#fff',
            border: `1.5px solid ${tokens.line}`,
            borderRadius: 12,
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          style={{
            height: 46,
            padding: '0 18px',
            borderRadius: 12,
            border: 'none',
            cursor: canSave ? 'pointer' : 'default',
            background: canSave ? tokens.self : withAlpha(tokens.offline, 0.2),
            color: canSave ? '#fff' : tokens.inkFaint,
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {t('save')}
        </button>
      </div>

      {onLeaveRoom && (
        <button
          type="button"
          onClick={onLeaveRoom}
          style={{
            width: '100%',
            height: 44,
            marginTop: 14,
            borderRadius: 14,
            border: 'none',
            cursor: 'pointer',
            background: withAlpha(tokens.danger, 0.1),
            color: tokens.danger,
            fontFamily: 'inherit',
            fontSize: 13.5,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Icon name="back" size={16} />
          {t('leaveRoom')}
        </button>
      )}
    </section>
  );
}

function OtherPanel({
  member,
  ownLocation,
  onClose,
}: {
  member: MemberView;
  ownLocation: LiveLocation | null;
  onClose: () => void;
}) {
  const t = useUiStore((s) => s.t);
  const name = member.member.displayName.trim() || t('you');
  const location = member.location;
  const deviceHeading = useSensorStore((s) => s.heading);
  const compassStatus = useSensorStore((s) => s.compassStatus);
  const canNavigate = Boolean(location && member.status === 'online');
  const distance =
    ownLocation && location ? formatDistance(calculateDistance(ownLocation, location)) : null;
  const targetBearing = ownLocation && location ? calculateBearing(ownLocation, location) : null;
  const relativeDirection =
    targetBearing !== null && deviceHeading !== null
      ? calculateRelativeDirection(targetBearing, deviceHeading)
      : null;

  const onNavigate = () => {
    if (!location || !canNavigate) return;
    const destination = `${location.lat},${location.lng}`;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      destination,
    )}&travelmode=walking`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <section>
      <PanelHeader name={name} accent={tokens.target} status={member.status} onClose={onClose} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <Metric
          label={t('distance')}
          value={distance ? `${distance.value} ${t(distance.unit)}` : t('unknown')}
        />
        <Metric
          label={t('lastUpdated')}
          value={location ? formatRelativeTime(location.updatedAt) : t('noLocation')}
        />
      </div>

      {location && member.status === 'stale' && (
        <div style={{ marginTop: 10, color: tokens.stale, fontSize: 12.5, lineHeight: 1.35 }}>
          {t('staleNavigationHint')}
        </div>
      )}

      <DirectionPointer
        available={relativeDirection !== null}
        rotation={relativeDirection ?? 0}
        bearing={targetBearing}
        compassStatus={compassStatus}
      />

      <button
        type="button"
        onClick={onNavigate}
        disabled={!canNavigate}
        style={{
          width: '100%',
          height: 44,
          marginTop: 12,
          borderRadius: 14,
          border: 'none',
          cursor: canNavigate ? 'pointer' : 'not-allowed',
          background: canNavigate ? tokens.self : withAlpha(tokens.offline, 0.2),
          color: canNavigate ? '#fff' : tokens.inkFaint,
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Icon name="nav" size={17} />
        {t('navigate')}
      </button>
    </section>
  );
}

function DirectionPointer({
  available,
  rotation,
  bearing,
  compassStatus,
}: {
  available: boolean;
  rotation: number;
  bearing: number | null;
  compassStatus: 'idle' | 'requesting' | 'watching' | 'unavailable';
}) {
  const t = useUiStore((s) => s.t);
  // Unwrap to a continuous angle so the needle takes the short path across 0°/360°
  // instead of spinning ~360° when the relative direction wraps.
  const displayRotation = useContinuousAngle(rotation);
  const detail =
    available && bearing !== null
      ? `${Math.round(bearing)}°`
      : compassStatus === 'requesting'
        ? t('compassRequesting')
        : t('compassUnavailable');

  return (
    <div
      style={{
        marginTop: 12,
        borderRadius: 16,
        background: available ? withAlpha(tokens.target, 0.1) : withAlpha(tokens.offline, 0.12),
        padding: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: `inset 0 0 0 1px ${tokens.line}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: available ? tokens.target : tokens.inkFaint,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            transform: `rotate(${displayRotation}deg)`,
            transition: 'transform 180ms ease',
            display: 'flex',
          }}
        >
          <Icon name="nav" size={30} strokeWidth={2.4} />
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: tokens.ink, fontSize: 13.5, fontWeight: 750 }}>{t('direction')}</div>
        <div style={{ marginTop: 3, color: tokens.inkSoft, fontSize: 12.5, lineHeight: 1.35 }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 14,
        background: withAlpha(tokens.self, 0.06),
        padding: '10px 11px',
      }}
    >
      <div style={{ color: tokens.inkFaint, fontSize: 11.5, fontWeight: 650 }}>{label}</div>
      <div
        style={{
          color: tokens.ink,
          fontFamily: font.mono,
          fontSize: 13,
          fontWeight: 700,
          marginTop: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** Shortest signed angular distance from `current` to `target`, in (-180, 180]. */
function shortestAngleDelta(target: number, current: number): number {
  return ((target - current + 540) % 360) - 180;
}

/**
 * Turn a wrapping 0–360 angle into a continuous one that only ever changes by the
 * shortest step, so CSS rotation transitions never spin the long way across north.
 */
function useContinuousAngle(raw: number): number {
  const ref = useRef({ prevRaw: raw, continuous: raw });
  const acc = ref.current;
  acc.continuous += shortestAngleDelta(raw, acc.prevRaw);
  acc.prevRaw = raw;
  return acc.continuous;
}

function formatRelativeTime(updatedAt: number): string {
  const diffSeconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  return `${Math.round(diffMinutes / 60)}h`;
}

function labelForStatus(status: MemberViewStatus, t: ReturnType<typeof useUiStore.getState>['t']) {
  switch (status) {
    case 'online':
      return t('online');
    case 'offline':
      return t('offline');
    case 'stale':
      return t('stale');
    case 'notSharing':
      return t('notSharing');
  }
}

function colorForStatus(status: MemberViewStatus): string {
  switch (status) {
    case 'online':
      return tokens.online;
    case 'offline':
      return tokens.offline;
    case 'stale':
      return tokens.stale;
    case 'notSharing':
      return tokens.inkFaint;
  }
}
