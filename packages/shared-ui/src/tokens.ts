/**
 * Design tokens — single source of truth for color, type and map theming.
 * Ported from the Claude Design prototype (docs/ui/prototype) and design.md §9.
 *
 * Colors are authored in `oklch()` for perceptually even hues. `withAlpha` adds a
 * transparency channel to any opaque `oklch(L C H)` string the same way the
 * prototype does, so soft fills stay in sync with their base color.
 */

/** Append an alpha channel to an opaque `oklch(L C H)` color string. */
export function withAlpha(oklchColor: string, alpha: number): string {
  return oklchColor.replace(')', ` / ${alpha})`);
}

/** Semantic palette (design.md §9.2). */
export const color = {
  /** 自己 — self */
  self: 'oklch(0.60 0.15 255)',
  /** 选中目标 — highlighted target */
  target: 'oklch(0.56 0.19 300)',
  /** 在线 — online */
  online: 'oklch(0.68 0.16 150)',
  /** 位置过期 — location stale (warning) */
  stale: 'oklch(0.74 0.14 75)',
  /** 离线 — offline */
  offline: 'oklch(0.68 0.02 250)',
  /** 危险 — danger */
  danger: 'oklch(0.60 0.20 25)',
  ink: 'oklch(0.22 0.015 260)',
  inkSoft: 'oklch(0.50 0.02 260)',
  inkFaint: 'oklch(0.66 0.015 260)',
  line: 'oklch(0.90 0.008 260)',
} as const;

/** Per-person avatar colors — shared chroma/lightness, varied hue. */
export const peopleColors: readonly string[] = [200, 150, 30, 320, 95, 265].map(
  (h) => `oklch(0.70 0.12 ${h})`,
);

/** Accent choices offered to the user for their own marker (app.jsx ACCENTS). */
export const accentChoices: readonly string[] = [
  'oklch(0.60 0.15 255)', // blue
  'oklch(0.62 0.12 200)', // teal
  'oklch(0.55 0.16 280)', // indigo
  'oklch(0.64 0.13 160)', // green
];

/** Font stacks — Latin/numeric display + a monospace face for data readouts. */
export const font = {
  sans:
    "'Hanken Grotesk', -apple-system, 'PingFang SC', 'Hiragino Sans GB', " +
    "'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif",
  mono: "'DM Mono', 'PingFang SC', 'Microsoft YaHei', ui-monospace, monospace",
} as const;

export interface MapTheme {
  paper: string;
  road: string;
  casing: string;
  block: string;
  blockB: string;
  park: string;
  water: string;
  label: string;
}

/** Stylized map theming for light/dark (mockmap.jsx MAP_THEMES). */
export const mapThemes: Record<'light' | 'dark', MapTheme> = {
  light: {
    paper: 'oklch(0.955 0.006 140)',
    road: 'oklch(0.995 0 0)',
    casing: 'oklch(0.905 0.006 140)',
    block: 'oklch(0.918 0.008 90)',
    blockB: 'oklch(0.895 0.01 70)',
    park: 'oklch(0.885 0.055 150)',
    water: 'oklch(0.865 0.05 232)',
    label: 'oklch(0.60 0.02 250)',
  },
  dark: {
    paper: 'oklch(0.205 0.012 255)',
    road: 'oklch(0.305 0.012 255)',
    casing: 'oklch(0.255 0.012 255)',
    block: 'oklch(0.245 0.014 255)',
    blockB: 'oklch(0.275 0.016 255)',
    park: 'oklch(0.305 0.04 155)',
    water: 'oklch(0.315 0.05 236)',
    label: 'oklch(0.62 0.02 255)',
  },
};

import type { MemberStatus } from '@zhinzen/shared-types';

/** Map a derived member status to its status-dot color. */
export function statusColor(status: MemberStatus): string {
  switch (status) {
    case 'offline':
      return color.offline;
    case 'stale':
      return color.stale;
    case 'notSharing':
      return color.inkFaint;
    default:
      return color.online; // online | moving | locating
  }
}
