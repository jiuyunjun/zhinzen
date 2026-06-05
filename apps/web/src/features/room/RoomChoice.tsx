import { useState, type ReactNode } from 'react';
import { color as tokens, withAlpha } from '@zhinzen/shared-ui';
import { useDeviceStore } from '../../state/deviceStore';
import { useRoomStore } from '../../state/roomStore';
import { useUiStore } from '../../state/uiStore';
import { Wordmark } from '../../components/Wordmark';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LangToggle } from '../../components/LangToggle';
import { Icon, type IconName } from '../../components/Icon';
import { formatRoomCode } from '../../lib/roomCode';
import { getRoomHistory, removeRoomFromHistory } from '../../lib/roomHistory';

/**
 * Room choice — create a new room or join one via invite link / code
 * (design.md §4.2, §4.3). Skeleton: actions only set local room state; backend
 * room records arrive in Phase 2.
 */
export function RoomChoice({ onEnterRoom }: { onEnterRoom: () => void }) {
  const t = useUiStore((s) => s.t);
  const displayName = useDeviceStore((s) => s.displayName);
  const setDisplayName = useDeviceStore((s) => s.setDisplayName);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const createRoom = useRoomStore((s) => s.createRoom);
  const joinRoom = useRoomStore((s) => s.joinRoom);
  const pendingJoinCode = useRoomStore((s) => s.pendingJoinCode);
  const busy = useRoomStore((s) => s.busy);
  const error = useRoomStore((s) => s.error);
  const clearError = useRoomStore((s) => s.clearError);
  const [code, setCode] = useState(pendingJoinCode ?? '');
  const [history, setHistory] = useState(getRoomHistory);

  const onCreate = async () => {
    if (busy) return;
    const roomId = await createRoom();
    if (roomId) onEnterRoom();
  };
  const onJoin = async () => {
    if (busy) return;
    const roomId = await joinRoom(code);
    if (roomId) onEnterRoom();
  };

  const onJoinFromHistory = async (roomId: string) => {
    if (busy) return;
    const joined = await joinRoom(roomId);
    if (joined) onEnterRoom();
  };

  const onRemoveHistory = (roomId: string) => {
    setHistory(removeRoomFromHistory(roomId));
  };

  const startEditingName = () => {
    setNameDraft(displayName);
    setEditingName(true);
  };
  const saveName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed) setDisplayName(trimmed);
    setEditingName(false);
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
          {editingName ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '18px 0 4px' }}>
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                placeholder={t('namePh')}
                autoFocus
                autoComplete="off"
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 44,
                  boxSizing: 'border-box',
                  padding: '0 14px',
                  fontSize: 20,
                  fontWeight: 700,
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
                onClick={saveName}
                disabled={!nameDraft.trim()}
                style={{
                  height: 44,
                  padding: '0 16px',
                  borderRadius: 12,
                  border: 'none',
                  cursor: nameDraft.trim() ? 'pointer' : 'default',
                  background: nameDraft.trim() ? tokens.self : withAlpha(tokens.offline, 0.2),
                  color: nameDraft.trim() ? '#fff' : tokens.inkFaint,
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {t('save')}
              </button>
            </div>
          ) : (
            <h1
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: tokens.ink,
                margin: '18px 0 4px',
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('hi', { name: displayName || t('you') })}
              </span>
              <button
                type="button"
                onClick={startEditingName}
                aria-label={t('editName')}
                style={{
                  flexShrink: 0,
                  height: 30,
                  padding: '0 10px',
                  borderRadius: 9,
                  border: `1px solid ${tokens.line}`,
                  background: '#fff',
                  color: tokens.inkSoft,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                {t('editName')}
              </button>
            </h1>
          )}
          <p style={{ fontSize: 15, color: tokens.inkSoft, margin: 0 }}>{t('pickAction')}</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28 }}>
          <ChoiceCard
            icon="share"
            title={t('createRoom')}
            sub={t('createRoomSub')}
            color={tokens.self}
            onClick={onCreate}
            disabled={busy}
            loadingLabel={busy ? t('creatingRoom') : null}
          />
          <ChoiceCard
            icon="people"
            title={t('joinRoom')}
            sub={t('joinRoomSub')}
            color={tokens.target}
            onClick={onJoin}
            disabled={busy || !code.trim()}
            loadingLabel={busy ? t('joiningRoom') : null}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) clearError();
              }}
              placeholder={t('joinPh')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onJoin();
              }}
              disabled={busy}
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
              disabled={busy || !code.trim()}
              color={tokens.target}
              style={{ width: 84, height: 50 }}
            >
              {busy ? '...' : t('join')}
            </PrimaryButton>
          </div>
          {error && (
            <div
              role="status"
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                background: withAlpha(tokens.danger, 0.08),
                color: tokens.danger,
                fontSize: 13.5,
                lineHeight: 1.45,
              }}
            >
              {roomErrorText(error, t)}
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: tokens.inkFaint,
                letterSpacing: '0.02em',
                marginBottom: 10,
              }}
            >
              {t('recentRooms')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((entry) => (
                <div key={entry.roomId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => onJoinFromHistory(entry.roomId)}
                    disabled={busy}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      background: '#fff',
                      border: `1.5px solid ${tokens.line}`,
                      borderRadius: 14,
                      cursor: busy ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {entry.members && entry.members.length > 0 ? (
                      <MemberAvatars names={entry.members} />
                    ) : (
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 11,
                          background: withAlpha(tokens.target, 0.14),
                          color: tokens.target,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon name="people" size={18} />
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontFamily: 'var(--zz-font-mono)',
                          fontSize: 14,
                          fontWeight: 700,
                          color: tokens.ink,
                          letterSpacing: '0.06em',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatRoomCode(entry.roomId)}
                      </div>
                      <div style={{ fontSize: 11.5, color: tokens.inkFaint, marginTop: 2 }}>
                        {formatJoinedAgo(entry.lastJoinedAt)}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveHistory(entry.roomId)}
                    aria-label={t('removeRoom')}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 11,
                      border: `1.5px solid ${tokens.line}`,
                      background: '#fff',
                      color: tokens.inkFaint,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Overlapping initial avatars of members seen in a room (history preview). */
function MemberAvatars({ names }: { names: string[] }) {
  const shown = names.slice(0, 4);
  const extra = names.length - shown.length;
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      {shown.map((name, i) => (
        <div
          key={`${name}-${i}`}
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: tokens.target,
            color: '#fff',
            border: '2px solid #fff',
            marginLeft: i === 0 ? 0 : -9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12.5,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {(name || '?').slice(0, 1).toUpperCase()}
        </div>
      ))}
      {extra > 0 && (
        <div style={{ marginLeft: 5, fontSize: 12, color: tokens.inkFaint, fontWeight: 600 }}>
          +{extra}
        </div>
      )}
    </div>
  );
}

function formatJoinedAgo(ts: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function ChoiceCard({
  icon,
  title,
  sub,
  color,
  onClick,
  disabled = false,
  loadingLabel,
}: {
  icon: IconName;
  title: ReactNode;
  sub: ReactNode;
  color: string;
  onClick: () => void;
  disabled?: boolean;
  loadingLabel?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit',
        opacity: disabled ? 0.72 : 1,
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
        <div style={{ fontWeight: 650, fontSize: 17, color: tokens.ink }}>
          {loadingLabel ?? title}
        </div>
        <div style={{ fontSize: 13, color: tokens.inkFaint, marginTop: 2 }}>{sub}</div>
      </div>
      <Icon name="chevron" size={18} color={tokens.inkFaint} />
    </button>
  );
}

function roomErrorText(
  code: NonNullable<ReturnType<typeof useRoomStore.getState>['error']>,
  t: ReturnType<typeof useUiStore.getState>['t'],
): string {
  switch (code) {
    case 'not-found':
      return t('roomErrorNotFound');
    case 'failed-precondition':
      return t('roomErrorExpired');
    case 'resource-exhausted':
      return t('roomErrorFull');
    case 'permission-denied':
      return t('roomErrorSession');
    case 'invalid-argument':
      return t('roomErrorInvalid');
    case 'unavailable':
      return t('roomErrorNetwork');
    case 'unknown':
    default:
      return t('roomErrorUnknown');
  }
}
