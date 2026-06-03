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
}

export function MemberDetailPanel({ member, ownLocation, onClose }: MemberDetailPanelProps) {
  const t = useUiStore((s) => s.t);
  const name = member.member.displayName.trim() || t('you');
  const location = member.location;
  const deviceHeading = useSensorStore((s) => s.heading);
  const compassStatus = useSensorStore((s) => s.compassStatus);
  const canNavigate = Boolean(location && member.status === 'online');
  const distance = ownLocation && location ? formatDistance(calculateDistance(ownLocation, location)) : null;
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
    <section
      style={{
        marginTop: 14,
        borderTop: `1px solid ${tokens.line}`,
        paddingTop: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            background: member.isSelf ? tokens.self : tokens.target,
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
            {member.isSelf ? t('you_short') : name}
          </div>
          <div
            style={{
              marginTop: 2,
              color: colorForStatus(member.status),
              fontFamily: font.mono,
              fontSize: 11.5,
            }}
          >
            {labelForStatus(member.status, t)}
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
          }}
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginTop: 12,
        }}
      >
        <Metric label={t('distance')} value={distance ? `${distance.value} ${t(distance.unit)}` : t('unknown')} />
        <Metric label={t('lastUpdated')} value={location ? formatRelativeTime(location.updatedAt) : t('noLocation')} />
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
            transform: `rotate(${rotation}deg)`,
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
