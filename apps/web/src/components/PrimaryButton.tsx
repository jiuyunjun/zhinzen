import type { CSSProperties, ReactNode } from 'react';
import { color as tokens } from '@zhinzen/shared-ui';
import { haptics } from '../lib/haptics';

interface PrimaryButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  color?: string;
  style?: CSSProperties;
}

/** Full-width primary action button (ported from ui.jsx PrimaryBtn). */
export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  color = tokens.self,
  style = {},
}: PrimaryButtonProps) {
  return (
    <button
      type="button"
      onClick={
        onClick &&
        (() => {
          haptics.tap();
          onClick();
        })
      }
      disabled={disabled}
      style={{
        width: '100%',
        height: 54,
        borderRadius: 16,
        border: 'none',
        background: disabled ? 'oklch(0.86 0.01 260)' : color,
        color: '#fff',
        fontSize: 17,
        fontWeight: 650,
        fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        letterSpacing: '0.01em',
        boxShadow: disabled ? 'none' : '0 6px 18px rgba(0,0,0,0.16)',
        transition: 'transform .12s, background .2s',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
