import { color as tokens, font, withAlpha } from '@zhinzen/shared-ui';
import type { MemberView, MemberViewStatus } from '../../state/membersStore';
import { useUiStore } from '../../state/uiStore';

/**
 * Bottom member strip (design.md §5.2, §7.3). Shows self first, then other
 * members with online/offline/stale/not-sharing status.
 */
export function MemberStrip({
  members,
  selfName,
  sharing,
}: {
  members: MemberView[];
  selfName: string;
  sharing: boolean;
}) {
  const t = useUiStore((s) => s.t);
  const me = selfName.trim() || t('you');
  const sharingLabel = sharing ? t('sharingShort') : t('pausedShort');
  const fallbackSelf = makeFallbackSelf(me, sharing);
  const visibleMembers = members.length > 0 ? members : [fallbackSelf];
  const onlineCount = visibleMembers.filter((member) => member.status === 'online').length;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2px 4px 12px',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: tokens.ink, whiteSpace: 'nowrap' }}>
          {visibleMembers.length} {t('members')}{' '}
          <span style={{ color: tokens.online, fontWeight: 600, fontSize: 13 }}>
            · {onlineCount} {t('online')}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: font.mono,
            fontSize: 11.5,
            color: sharing ? tokens.online : tokens.inkFaint,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: sharing ? tokens.online : tokens.offline,
            }}
          />
          {sharingLabel}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {visibleMembers.map((member) => (
          <MemberChip key={member.member.deviceId} member={member} />
        ))}
      </div>
    </div>
  );
}

function MemberChip({ member }: { member: MemberView }) {
  const t = useUiStore((s) => s.t);
  const name = member.member.displayName.trim() || t('you');
  const accent = member.isSelf ? tokens.self : tokens.target;
  const statusColor = colorForStatus(member.status);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 7,
        width: 72,
        flexShrink: 0,
      }}
    >
      <div style={{ position: 'relative' }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 15,
            background: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontFamily: 'system-ui',
            fontSize: 17,
            boxShadow: `0 0 0 2.5px ${withAlpha(accent, 0.16)}`,
          }}
        >
          {[...name][0]}
        </div>
        <span
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: statusColor,
            border: '2px solid #fff',
          }}
        />
      </div>
      <div style={{ textAlign: 'center', lineHeight: 1.2 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: tokens.ink,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 72,
          }}
        >
          {member.isSelf ? t('you_short') : name}
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 10.5, color: statusColor, marginTop: 1 }}>
          {labelForStatus(member.status, t)}
        </div>
      </div>
    </div>
  );
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

function makeFallbackSelf(name: string, sharing: boolean): MemberView {
  return {
    member: {
      deviceId: 'self',
      displayName: name,
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      online: true,
      sharingLocation: sharing,
      platform: 'web',
      capabilities: {
        location: false,
        imu: false,
        compass: false,
        uwb: false,
        ble: false,
      },
    },
    location: null,
    status: sharing ? 'stale' : 'notSharing',
    isSelf: true,
  };
}
