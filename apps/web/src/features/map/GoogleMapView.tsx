import { useEffect, useMemo, useRef, useState } from 'react';
import type { LiveLocation } from '@zhinzen/shared-types';
import { color as tokens, font, withAlpha } from '@zhinzen/shared-ui';

import { isMapsConfigured } from '../../lib/env';
import { loadGoogleMaps } from '../../lib/googleMaps';
import type { MemberView, MemberViewStatus } from '../../state/membersStore';
import { useUiStore } from '../../state/uiStore';

interface GoogleMapViewProps {
  members: MemberView[];
  ownLocation: LiveLocation | null;
  ownDisplayName: string;
  ownDeviceId: string;
  recenterSignal: number;
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
  recenterSignal,
}: GoogleMapViewProps) {
  const t = useUiStore((s) => s.t);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const initializedRef = useRef(false);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const pins = useMemo(
    () => buildPins(members, ownLocation, ownDisplayName, ownDeviceId),
    [members, ownDeviceId, ownDisplayName, ownLocation],
  );

  const focusLocation = pins.find((pin) => pin.isSelf)?.location ?? pins[0]?.location ?? null;

  useEffect(() => {
    if (!mapEl.current || !isMapsConfigured()) return;

    let cancelled = false;
    setLoadState('loading');

    void loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !mapEl.current) return;

        mapRef.current = new maps.Map(mapEl.current, {
          center: toLatLng(focusLocation) ?? DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          disableDefaultUI: true,
          clickableIcons: false,
          keyboardShortcuts: false,
          gestureHandling: 'greedy',
          styles: MAP_STYLES,
        });
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });

    return () => {
      cancelled = true;
      clearMarkers(markersRef.current);
      markersRef.current.clear();
      mapRef.current = null;
      initializedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    syncMarkers(map, markersRef.current, pins);

    if (!initializedRef.current) {
      initializedRef.current = true;
      fitMapToPins(map, pins);
    }
  }, [pins]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusLocation) return;

    map.panTo(toLatLng(focusLocation)!);
    if ((map.getZoom() ?? 0) < DEFAULT_ZOOM) map.setZoom(DEFAULT_ZOOM);
  }, [focusLocation, recenterSignal]);

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
      existing.setIcon(markerIcon(pin));
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
        icon: markerIcon(pin),
        label: markerLabel(title),
        opacity: opacityForStatus(pin.status),
        zIndex: pin.isSelf ? 20 : 10,
      }),
    );
  }
}

function markerIcon(pin: MapPin): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: pin.isSelf ? 12 : 10,
    fillColor: pin.isSelf ? PIN_COLORS.self : PIN_COLORS[pin.status],
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeOpacity: 1,
    strokeWeight: pin.isSelf ? 4 : 3,
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

function fitMapToPins(map: google.maps.Map, pins: MapPin[]): void {
  if (pins.length === 0) {
    map.setCenter(DEFAULT_CENTER);
    map.setZoom(DEFAULT_ZOOM);
    return;
  }

  if (pins.length === 1) {
    map.setCenter(toLatLng(pins[0].location)!);
    map.setZoom(DEFAULT_ZOOM);
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  for (const pin of pins) bounds.extend(toLatLng(pin.location)!);
  map.fitBounds(bounds, 80);
}

function clearMarkers(markers: Map<string, google.maps.Marker>): void {
  for (const marker of markers.values()) marker.setMap(null);
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
