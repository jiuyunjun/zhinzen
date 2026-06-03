import { useState, type ReactNode } from 'react';
import { color as tokens, withAlpha } from '@zhinzen/shared-ui';
import { useDeviceStore } from '../../state/deviceStore';
import { useRoomStore } from '../../state/roomStore';
import { useUiStore } from '../../state/uiStore';
import { Wordmark } from '../../components/Wordmark';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LangToggle } from '../../components/LangToggle';
import { Icon, type IconName } from '../../components/Icon';

/**
 * Room choice — create a new room or join one via invite link / code
 * (design.md §4.2, §4.3). Skeleton: actions only set local room state; backend
 * room records arrive in Phase 2.
 */
export function RoomChoice({ onEnterRoom }: { onEnterRoom: () => void }) {
  const t = useUiStore((s) => s.t);
  const displayName = useDeviceStore((s) => s.displayName);
  const createRoom = useRoomStore((s) => s.createRoom);
  const joinRoom = useRoomStore((s) => s.joinRoom);
  const [code, setCode] = useState('');

  const onCreate = () => {
    createRoom();
    onEnterRoom();
  };
  const onJoin = () => {
    if (joinRoom(code)) onEnterRoom();
  };

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '0 22px',
        background: 'oklch(0.98 0.004 250)',
      }}
    >
      <div style={{ position: 'absolute', top: 'max(20px, env(safe-area-inset-top))', right: 18 }}>
        <LangToggle />
      </div>

      <div style={{ maxWidth: 440, width: '100%', margin: '0 auto' }}>
        <div style={{ paddingTop: 'max(80px, calc(env(safe-area-inset-top) + 64px))' }}>
          <Wordmark size={22} color={tokens.inkSoft} />
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: tokens.ink,
              margin: '18px 0 4px',
            }}
          >
            {t('hi', { name: displayName || t('you') })}
          </h1>
          <p style={{ fontSize: 15, color: tokens.inkSoft, margin: 0 }}>{t('pickAction')}</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28 }}>
          <ChoiceCard
            icon="share"
            title={t('createRoom')}
            sub={t('createRoomSub')}
            color={tokens.self}
            onClick={onCreate}
          />
          <ChoiceCard
            icon="people"
            title={t('joinRoom')}
            sub={t('joinRoomSub')}
            color={tokens.target}
            onClick={onJoin}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('joinPh')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onJoin();
              }}
              autoComplete="off"
              style={{
                flex: 1,
                height: 50,
                boxSizing: 'border-box',
                padding: '0 16px',
                fontSize: 15,
                fontFamily: 'var(--zz-font-mono)',
                color: tokens.ink,
                background: '#fff',
                border: `1.5px solid ${tokens.line}`,
                borderRadius: 14,
                outline: 'none',
              }}
            />
            <PrimaryButton
              onClick={onJoin}
              disabled={!code.trim()}
              color={tokens.target}
              style={{ width: 84, height: 50 }}
            >
              {t('join')}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({
  icon,
  title,
  sub,
  color,
  onClick,
}: {
  icon: IconName;
  title: ReactNode;
  sub: ReactNode;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: 18,
        background: '#fff',
        border: `1.5px solid ${tokens.line}`,
        borderRadius: 20,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: withAlpha(color, 0.14),
          color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={24} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 650, fontSize: 17, color: tokens.ink }}>{title}</div>
        <div style={{ fontSize: 13, color: tokens.inkFaint, marginTop: 2 }}>{sub}</div>
      </div>
      <Icon name="chevron" size={18} color={tokens.inkFaint} />
    </button>
  );
}
