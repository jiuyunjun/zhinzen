import { useEffect, useMemo, useRef, useState } from 'react';
import type { LiveLocation, RallyPoint, TrackPoint } from '@zhinzen/shared-types';
import { buildTrackSegments } from '@zhinzen/geo-utils';
import { color as tokens, font, withAlpha } from '@zhinzen/shared-ui';

import { isMapsConfigured, mapsMapId } from '../../lib/env';
import { loadGoogleMaps } from '../../lib/googleMaps';
import type { MemberView, MemberViewStatus } from '../../state/membersStore';
import { useUiStore } from '../../state/uiStore';

type FollowMode = 'self' | 'free' | 'track';

interface GoogleMapViewProps {
  members: MemberView[];
  ownLocation: LiveLocation | null;
  ownDisplayName: string;
  ownDeviceId: string;
  /** Camera behavior: follow self, free pan, or frame self + tracked member. */
  followMode: FollowMode;
  recenterSignal: number;
  /** Bump to frame every visible member (the "show everyone" button). */
  fitAllSignal: number;
  /** When true, rotate the map so the device's compass heading points up. */
  headingUp: boolean;
  /** Latest device compass heading (degrees, 0 = north), or null. */
  deviceHeading: number | null;
  selectedDeviceId: string | null;
  trackPoints: TrackPoint[];
  rallyPoints: RallyPoint[];
  selectedRallyId: string | null;
  onSelectMember: (deviceId: string) => void;
  onSelectRally: (id: string) => void;
  /** Long-press (or right-click) on the map to drop a rally point here. */
  onLongPress: (lat: number, lng: number) => void;
  /** Fired when the user drags the map, so the parent can drop follow mode. */
  onUserPan: () => void;
  /** Reports the map's current heading (degrees) so the parent can draw the compass. */
  onHeadingChange: (heading: number) => void;
}

interface MapPin {
  id: string;
  name: string;
  location: LiveLocation;
  status: MemberViewStatus;
  isSelf: boolean;
}

const DEFAULT_CENTER = { lat: 35.681236, lng: 139.767125 };
const DEFAULT_ZOOM = 15;

const PIN_COLORS: Record<MemberViewStatus | 'self', string> = {
  self: '#2563eb',
  online: '#16a34a',
  stale: '#d97706',
  offline: '#94a3b8',
  notSharing: '#94a3b8',
};

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ saturation: -35 }, { lightness: 20 }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c7e7f4' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#eef3e8' }] },
];

export function GoogleMapView({
  members,
  ownLocation,
  ownDisplayName,
  ownDeviceId,
  followMode,
  recenterSignal,
  fitAllSignal,
  headingUp,
  deviceHeading,
  selectedDeviceId,
  trackPoints,
  rallyPoints,
  selectedRallyId,
  onSelectMember,
  onSelectRally,
  onLongPress,
  onUserPan,
  onHeadingChange,
}: GoogleMapViewProps) {
  const t = useUiStore((s) => s.t);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const rallyMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const trackSegmentsRef = useRef<google.maps.Polyline[]>([]);
  const onUserPanRef = useRef(onUserPan);
  const onLongPressRef = useRef(onLongPress);
  const onSelectRallyRef = useRef(onSelectRally);
  onLongPressRef.current = onLongPress;
  onSelectRallyRef.current = onSelectRally;
  onUserPanRef.current = onUserPan;
  const onHeadingChangeRef = useRef(onHeadingChange);
  onHeadingChangeRef.current = onHeadingChange;
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const pins = useMemo(
    () => buildPins(members, ownLocation, ownDisplayName, ownDeviceId),
    [members, ownDeviceId, ownDisplayName, ownLocation],
  );

  const selfLocation = pins.find((pin) => pin.isSelf)?.location ?? null;
  const focusLocation = selfLocation ?? pins[0]?.location ?? null;
  const selectedRally = rallyPoints.find((p) => p.id === selectedRallyId) ?? null;
  const targetLocation =
    pins.find((pin) => !pin.isSelf && pin.id === selectedDeviceId)?.location ?? null;
  // The thing the camera frames with self in track mode: selected member or rally.
  const targetLatLng: google.maps.LatLngLiteral | null =
    toLatLng(targetLocation) ?? (selectedRally ? { lat: selectedRally.lat, lng: selectedRally.lng } : null);
  // Track the moving lat/lng as primitives so follow effects re-run on movement.
  const focusLat = focusLocation?.lat ?? null;
  const focusLng = focusLocation?.lng ?? null;

  useEffect(() => {
    if (!mapEl.current || !isMapsConfigured()) return;

    let cancelled = false;
    setLoadState('loading');

    void loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !mapEl.current) return;

        // A vector Map ID unlocks rotation/heading; without it we fall back to a
        // raster map with inline styles (no rotation). Vector maps are styled in
        // the cloud, so `styles` is omitted when a mapId is present.
        const rotatable = mapsMapId.length > 0;
        const options: google.maps.MapOptions = {
          center: toLatLng(focusLocation) ?? DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          disableDefaultUI: true,
          clickableIcons: false,
          keyboardShortcuts: false,
          gestureHandling: 'greedy',
        };
        if (rotatable) {
          options.mapId = mapsMapId;
          options.rotateControl = true;
          (options as { headingInteractionEnabled?: boolean }).headingInteractionEnabled = true;
        } else {
          options.styles = MAP_STYLES;
        }

        const map = new maps.Map(mapEl.current, options);
        // Only a user gesture fires `dragstart` (programmatic panTo/fitBounds do
        // not), so this cleanly drops follow mode when the user moves the map.
        map.addListener('dragstart', () => onUserPanRef.current());
        map.addListener('heading_changed', () => onHeadingChangeRef.current(map.getHeading() ?? 0));
        // Long-press (touch) / right-click (desktop) drops a rally point.
        map.addListener('contextmenu', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) onLongPressRef.current(e.latLng.lat(), e.latLng.lng());
        });
        mapRef.current = map;
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });

    return () => {
      cancelled = true;
      clearMarkers(markersRef.current);
      markersRef.current.clear();
      clearMarkers(rallyMarkersRef.current);
      rallyMarkersRef.current.clear();
      clearTrackSegments(trackSegmentsRef.current);
      trackSegmentsRef.current = [];
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    syncMarkers(map, markersRef.current, pins, selectedDeviceId, onSelectMember);
  }, [onSelectMember, pins, selectedDeviceId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncRallyMarkers(map, rallyMarkersRef.current, rallyPoints, selectedRallyId, (id) =>
      onSelectRallyRef.current(id),
    );
  }, [rallyPoints, selectedRallyId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const render = () =>
      syncTrackSegments(map, trackSegmentsRef.current, trackPoints, map.getZoom() ?? 16);
    render();

    // Re-thin/re-color when the zoom changes, debounced so a pinch doesn't rebuild
    // on every frame.
    let timer: number | undefined;
    const listener = map.addListener('zoom_changed', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(render, 150);
    });
    return () => {
      window.clearTimeout(timer);
      listener.remove();
    };
  }, [trackPoints]);

  // Follow self: keep the camera on the user's marker as it moves. `recenterSignal`
  // forces a re-center even if the position has not changed (the recenter button).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || followMode !== 'self' || focusLat === null || focusLng === null) return;

    map.panTo({ lat: focusLat, lng: focusLng });
    if ((map.getZoom() ?? 0) < DEFAULT_ZOOM) map.setZoom(DEFAULT_ZOOM);
  }, [followMode, focusLat, focusLng, recenterSignal]);

  // Track mode: frame self + the selected member once on selection (not on every
  // position tick, to avoid jitter). Extra bottom padding keeps both pins above
  // the bottom sheet. `recenterSignal` lets the recenter button re-fit.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || followMode !== 'track') return;

    const self = toLatLng(focusLocation);
    const target = targetLatLng;
    if (self && target) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(self);
      bounds.extend(target);
      map.fitBounds(bounds, { top: 110, right: 64, bottom: 320, left: 64 });
    } else if (target) {
      map.panTo(target);
    } else if (self) {
      map.panTo(self);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followMode, selectedDeviceId, selectedRallyId, recenterSignal]);

  // Heading-up: rotate the map to match the device compass; off → snap to north.
  // No-op on raster maps (no Map ID), where setHeading has no visible effect.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (headingUp && deviceHeading !== null) {
      map.setHeading(deviceHeading);
    } else if (!headingUp) {
      map.setHeading(0);
    }
  }, [headingUp, deviceHeading]);

  // Show everyone: frame all visible pins with padding for the bottom sheet.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitAllSignal === 0) return;
    fitToPins(map, pins, { top: 110, right: 64, bottom: 320, left: 64 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitAllSignal]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={mapEl} style={{ position: 'absolute', inset: 0 }} />

      {!isMapsConfigured() && <MapNotice>{t('mapMissingKey')}</MapNotice>}
      {isMapsConfigured() && loadState === 'loading' && <MapNotice>{t('mapLoading')}</MapNotice>}
      {loadState === 'error' && <MapNotice>{t('mapLoadError')}</MapNotice>}
    </div>
  );
}

function buildPins(
  members: MemberView[],
  ownLocation: LiveLocation | null,
  ownDisplayName: string,
  ownDeviceId: string,
): MapPin[] {
  const pins = members
    .filter((member) => member.location && member.status !== 'notSharing')
    .map((member) => ({
      id: member.member.deviceId,
      name: member.member.displayName,
      location: member.location!,
      status: member.status,
      isSelf: member.isSelf,
    }));

  if (ownLocation && !pins.some((pin) => pin.id === ownDeviceId)) {
    pins.unshift({
      id: ownDeviceId,
      name: ownDisplayName,
      location: ownLocation,
      status: 'online',
      isSelf: true,
    });
  }

  return pins;
}

function syncMarkers(
  map: google.maps.Map,
  markers: Map<string, google.maps.Marker>,
  pins: MapPin[],
  selectedDeviceId: string | null,
  onSelectMember: (deviceId: string) => void,
): void {
  const activeIds = new Set(pins.map((pin) => pin.id));

  for (const [id, marker] of markers) {
    if (!activeIds.has(id)) {
      marker.setMap(null);
      markers.delete(id);
    }
  }

  for (const pin of pins) {
    const position = toLatLng(pin.location)!;
    const title = pin.name || (pin.isSelf ? 'You' : pin.id);
    const existing = markers.get(pin.id);

    if (existing) {
      existing.setPosition(position);
      existing.setTitle(title);
      existing.setIcon(markerIcon(pin, pin.id === selectedDeviceId));
      existing.setOpacity(opacityForStatus(pin.status));
      existing.setLabel(markerLabel(title));
      continue;
    }

    markers.set(
      pin.id,
      new google.maps.Marker({
        map,
        position,
        title,
        icon: markerIcon(pin, pin.id === selectedDeviceId),
        label: markerLabel(title),
        opacity: opacityForStatus(pin.status),
        zIndex: pin.isSelf ? 20 : 10,
      }),
    );
    markers.get(pin.id)?.addListener('click', () => onSelectMember(pin.id));
  }
}

function markerIcon(pin: MapPin, selected: boolean): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: selected ? 14 : pin.isSelf ? 12 : 10,
    fillColor: pin.isSelf ? PIN_COLORS.self : PIN_COLORS[pin.status],
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeOpacity: 1,
    strokeWeight: selected ? 5 : pin.isSelf ? 4 : 3,
  };
}

function markerLabel(title: string): google.maps.MarkerLabel {
  return {
    text: [...title][0] || '?',
    color: '#ffffff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '12px',
    fontWeight: '700',
  };
}

function opacityForStatus(status: MemberViewStatus): number {
  if (status === 'offline') return 0.56;
  if (status === 'stale') return 0.72;
  return 1;
}

function fitToPins(
  map: google.maps.Map,
  pins: MapPin[],
  padding: google.maps.Padding,
): void {
  if (pins.length === 0) return;
  if (pins.length === 1) {
    map.panTo(toLatLng(pins[0].location)!);
    if ((map.getZoom() ?? 0) < DEFAULT_ZOOM) map.setZoom(DEFAULT_ZOOM);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  for (const pin of pins) bounds.extend(toLatLng(pin.location)!);
  map.fitBounds(bounds, padding);
}

function clearMarkers(markers: Map<string, google.maps.Marker>): void {
  for (const marker of markers.values()) marker.setMap(null);
}

function syncRallyMarkers(
  map: google.maps.Map,
  markers: Map<string, google.maps.Marker>,
  points: RallyPoint[],
  selectedId: string | null,
  onSelect: (id: string) => void,
): void {
  const ids = new Set(points.map((p) => p.id));
  for (const [id, marker] of markers) {
    if (!ids.has(id)) {
      marker.setMap(null);
      markers.delete(id);
    }
  }
  for (const point of points) {
    const selected = point.id === selectedId;
    const icon: google.maps.Symbol = {
      path: 'M 0,-12 4,-4 12,-3 6,3 8,11 0,7 -8,11 -6,3 -12,-3 -4,-4 z', // star
      fillColor: '#7c3aed',
      fillOpacity: 1,
      strokeColor: '#fff',
      strokeWeight: selected ? 3.5 : 2,
      scale: selected ? 1.5 : 1.1,
      anchor: new google.maps.Point(0, 0),
    };
    let marker = markers.get(point.id);
    if (!marker) {
      marker = new google.maps.Marker({ map });
      marker.addListener('click', () => onSelect(point.id));
      markers.set(point.id, marker);
    }
    marker.setIcon(icon);
    marker.setZIndex(selected ? 12 : 8);
    marker.setPosition({ lat: point.lat, lng: point.lng });
    marker.setTitle(point.name);
  }
}

function syncTrackSegments(
  map: google.maps.Map,
  segments: google.maps.Polyline[],
  points: TrackPoint[],
  zoom: number,
): void {
  clearTrackSegments(segments);
  segments.length = 0;

  const ordered = points
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .sort((a, b) => a.createdAt - b.createdAt);

  // Simplify by zoom + merge same-color runs (one polyline per run instead of
  // one per point).
  for (const seg of buildTrackSegments(ordered, zoom)) {
    segments.push(
      new google.maps.Polyline({
        map,
        path: seg.path,
        geodesic: true,
        strokeColor: seg.colorHex,
        strokeOpacity: 0.82,
        strokeWeight: 6,
        zIndex: 6,
      }),
    );
  }
}

function clearTrackSegments(segments: google.maps.Polyline[]): void {
  for (const segment of segments) segment.setMap(null);
}

function toLatLng(location: LiveLocation | null): google.maps.LatLngLiteral | null {
  if (!location) return null;
  return { lat: location.lat, lng: location.lng };
}

function MapNotice({ children }: { children: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: withAlpha(tokens.self, 0.06),
        color: tokens.inkSoft,
        fontFamily: font.mono,
        fontSize: 12,
        textAlign: 'center',
      }}
    >
      <span
        style={{
          padding: '7px 12px',
          borderRadius: 10,
          background: 'rgba(255,255,255,0.84)',
          boxShadow: '0 3px 12px rgba(0,0,0,0.08)',
        }}
      >
        {children}
      </span>
    </div>
  );
}
