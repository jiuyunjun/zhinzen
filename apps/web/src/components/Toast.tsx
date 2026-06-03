import { useCallback, useRef, useState } from 'react';
import { color as tokens } from '@zhinzen/shared-ui';

/** Imperative one-shot toast. `flash(msg)` shows it briefly. */
export function useToast(durationMs = 1900) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const flash = useCallback(
    (text: string) => {
      setMsg(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMsg(null), durationMs);
    },
    [durationMs],
  );
  return { msg, flash };
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div
      style={{
        position: 'fixed',
        top: 'max(72px, calc(env(safe-area-inset-top) + 56px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 90,
        padding: '10px 16px',
        background: tokens.ink,
        color: '#fff',
        borderRadius: 13,
        fontSize: 13.5,
        fontWeight: 600,
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        whiteSpace: 'nowrap',
        animation: 'zzToastIn .25s ease',
      }}
    >
      {msg}
    </div>
  );
}
