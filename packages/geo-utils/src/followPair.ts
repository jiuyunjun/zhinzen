/** Course-up framing in normalized Web Mercator coordinates; mirrored on Android. */
export interface PairPoint { lat: number; lng: number }
export interface PairCamera extends PairPoint { zoom: number }

export function fitFollowPair(
  self: PairPoint,
  target: PairPoint,
  width: number,
  height: number,
  bearing: number,
  maxZoom = 17.5,
): PairCamera {
  const projectY = (lat: number) => {
    const phi = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
    return (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2;
  };
  const y1 = projectY(self.lat);
  const y2 = projectY(target.lat);
  const dx = ((target.lng - self.lng + 540) % 360 - 180) / 360;
  const dy = y2 - y1;
  const angle = bearing * Math.PI / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Scale insets down on short/landscape viewports instead of creating an inverted rect.
  const left = Math.min(40, width * 0.1);
  const top = Math.min(170, height * 0.28);
  const bottom = Math.min(220, height * 0.32);
  const usableW = Math.max(1, width - 2 * left);
  const usableH = Math.max(1, height - top - bottom);
  const spanX = Math.abs(dx * c + dy * s);
  const spanY = Math.abs(-dx * s + dy * c);
  const scale = Math.min(usableW / Math.max(spanX, 1e-12), usableH / Math.max(spanY, 1e-12));
  const zoom = Math.max(0, Math.min(maxZoom, Math.log2(scale / 256)));
  const worldScale = 256 * 2 ** zoom;
  const screenOffsetY = (top - bottom) / 2;
  const centerX = self.lng / 360 + 0.5 + dx / 2 + screenOffsetY * s / worldScale;
  const centerY = (y1 + y2) / 2 - screenOffsetY * c / worldScale;
  return {
    lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * centerY))) * 180 / Math.PI,
    lng: ((centerX * 360 - 180 + 540) % 360) - 180,
    zoom,
  };
}
