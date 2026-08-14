import { DEFAULT_FOLLOW_ANCHOR_FRAC } from '@zhinzen/geo-utils';

/**
 * Screen geometry for the follow view, shared by the camera driver and the overlay
 * so they agree on where "you" are. Kept out of both modules to avoid an import
 * cycle between them.
 */

/** Your fixed screen position in follow mode: centered, 35% up from the bottom. */
export function followAnchor(viewW: number, viewH: number): { x: number; y: number } {
  return { x: viewW / 2, y: viewH * DEFAULT_FOLLOW_ANCHOR_FRAC };
}

/**
 * Where the target is allowed to live before it becomes an edge indicator: the
 * viewport minus the HUD above and the mode buttons below.
 */
export function followSafeRect(
  viewW: number,
  viewH: number,
): { left: number; top: number; right: number; bottom: number } {
  return {
    left: 26,
    top: 150,
    right: Math.max(60, viewW - 26),
    bottom: Math.max(200, viewH - 200),
  };
}
