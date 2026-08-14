import { useEffect, useMemo, useRef, useState } from 'react';
import type { LatLng, LiveLocation, RallyPoint, TrackPoint } from '@zhinzen/shared-types';
import {
  buildTrackSegments,
  calculateBearing,
  calculateDistance,
  destinationPoint,
  followRegime,
  metersPerPixel,
  normalizeAngle,
  rayExit,
  zoomForMpp,
  type FollowRegimeKey,
  DEFAULT_FOLLOW_CENTER_TAU_MS,
  DEFAULT_FOLLOW_GPS_HEADING_TAU_MS,
  DEFAULT_FOLLOW_HEADING_TAU_MS,
  DEFAULT_FOLLOW_HOLD_BOTH_M,
  DEFAULT_FOLLOW_MAX_ZOOM,
  DEFAULT_FOLLOW_MIN_ZOOM,
  DEFAULT_FOLLOW_ZOOM_EPSILON,
} from '@zhinzen/geo-utils';
import { color as tokens, font, withAlpha } from '@zhinzen/shared-ui';

import { isMapsConfigured, mapsMapId } from '../../lib/env';
import { loadGoogleMaps } from '../../lib/googleMaps';
import type { MemberView, MemberViewStatus } from '../../state/membersStore';
import { useUiStore } from '../../state/uiStore';
import { followAnchor, followSafeRect } from './followGeometry';

export type FollowTargetState = 'moving' | 'stopped' | 'stale';

/**
 * Camera behavior. `track` is follow mode (design.md §5.10) — course-up, anchored on
 * you; `trackBoth` is its north-up "view both" excursion; `trackPaused` is the same
 * session with the camera handed back to the user after they panned, so a stray
 * touch doesn't end it.
 */
export type FollowMode = 'self' | 'free' | 'track' | 'trackBoth' | 'trackPaused';

interface GoogleMapViewProps {
  members: MemberView[];
  ownLocation: LiveLocation | null;
  ownDisplayName: string;
  ownDeviceId: string;
  /** Camera behavior: follow self, free pan, or frame self + tracked member. */
  followMode: FollowMode;
  /** Where the follow-mode target is right now (member or rally), if any. */
  followTargetPoint: LatLng | null;
  followTargetState: FollowTargetState;
  /** Your own ground speed (m/s) — this, not the distance, sets the road scale. */
  ownSpeed: number;
  /** Your course over ground / compass heading, for the direction arrow marker. */
  ownHeading: number | null;
  /** Reports whether the follow target is currently off screen. */
  onFollowTargetOffScreen: (offScreen: boolean) => void;
  recenterSignal: number;
  /** Bump to frame every visible member (the "show everyone" button). */
  fitAllSignal: number;
  /** When true, rotate the map so the device's compass heading points up. */
  headingUp: boolean;
  /** Latest device compass heading (degrees, 0 = north), or null. */
  deviceHeading: number | null;
  /** True when `deviceHeading` is a GPS course (sparse) rather than the compass. */
  headingFromGps: boolean;
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
/** Street-level zoom the camera glides to when a target is selected. */
const TARGET_FOCUS_ZOOM = 17;

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
  followTargetPoint,
  followTargetState,
  ownSpeed,
  ownHeading,
  onFollowTargetOffScreen,
  recenterSignal,
  fitAllSignal,
  headingUp,
  deviceHeading,
  headingFromGps,
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
  const trackPointsRef = useRef<TrackPoint[]>(trackPoints);
  trackPointsRef.current = trackPoints;
  // True while the camera is animating (zoom in flight) — used to defer track
  // rebuilds until the map settles, so zooming stays smooth.
  const mapMovingRef = useRef(false);
  const rallyCircleRef = useRef<google.maps.Circle | null>(null);
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

  const selfLocation = pins.find((pin) => pin.isSelf)?.location ?? ownLocation;
  // Note the fallback to *someone else's* pin: fine for "center the map on
  // something" before our own fix arrives, but never for follow mode, which must
  // only ever anchor on us — see selfLat/selfLng below.
  const focusLocation = selfLocation ?? pins[0]?.location ?? null;
  const selectedRally = rallyPoints.find((p) => p.id === selectedRallyId) ?? null;
  // Track the moving lat/lng as primitives so follow effects re-run on movement.
  const focusLat = focusLocation?.lat ?? null;
  const focusLng = focusLocation?.lng ?? null;
  const followLat = followTargetPoint?.lat ?? null;
  const followLng = followTargetPoint?.lng ?? null;
  const selfLat = selfLocation?.lat ?? null;
  const selfLng = selfLocation?.lng ?? null;
  const bothMode = followMode === 'trackBoth';
  const followActive =
    (followMode === 'track' || bothMode) &&
    followLat !== null &&
    followLng !== null &&
    selfLat !== null &&
    selfLng !== null;
  // Everything the per-frame camera driver reads. Kept in refs so new positions and
  // compass samples never re-render this component.
  const headingTargetRef = useRef<number | null>(null);
  // "View both" is north-up: with the scale thrown away for a moment, a fixed north
  // is easier to reconcile with the map you were just reading. On a raster basemap
  // (no vector Map ID) the map physically cannot rotate, so we keep the model at
  // north too — otherwise the overlay would compute screen directions for a rotation
  // the map never performed.
  headingTargetRef.current =
    mapsMapId.length === 0 ? 0 : bothMode ? 0 : headingUp ? deviceHeading : null;
  const headingTauRef = useRef(DEFAULT_FOLLOW_HEADING_TAU_MS);
  headingTauRef.current = headingFromGps
    ? DEFAULT_FOLLOW_GPS_HEADING_TAU_MS
    : DEFAULT_FOLLOW_HEADING_TAU_MS;
  const followRef = useRef<{
    lat: number;
    lng: number;
    zoom: number;
    /** True when the point should sit dead center (view both) rather than at the anchor. */
    centered: boolean;
  } | null>(null);
  // The zoom the follow driver last wrote; null while it isn't driving. Used to tell
  // our own zoom changes apart from the user's pinch.
  const appliedZoomRef = useRef<number | null>(null);
  // Wakes the camera driver after it has parked itself. Riding with the screen on is
  // exactly the case where a permanently-running 60fps loop costs real battery, so it
  // stops once the camera settles and is nudged back awake when something moves.
  const wakeDriverRef = useRef<(() => void) | null>(null);
  const regimeRef = useRef<FollowRegimeKey | undefined>(undefined);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  // Coarse ticker (~5fps) so the heading arrow re-renders as the map rotates without
  // re-syncing markers at the compass sample rate.
  const [mapHeadingTick, setMapHeadingTick] = useState(0);
  const headingTickAtRef = useRef(0);
  // Follow visuals are native map objects — a Polyline and a rotating Marker — so
  // they are positioned by the SDK's own projection instead of geometry we compute
  // ourselves. That was the entire source of the misaligned overlay.
  const followLineRef = useRef<google.maps.Polyline | null>(null);
  const offScreenRef = useRef<boolean | null>(null);
  const onOffScreenRef = useRef(onFollowTargetOffScreen);
  onOffScreenRef.current = onFollowTargetOffScreen;

  useEffect(() => {
    const el = mapEl.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewport({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    setViewport({ w: el.clientWidth, h: el.clientHeight });
    return () => observer.disconnect();
  }, []);

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
        map.addListener('heading_changed', () => {
          onHeadingChangeRef.current(map.getHeading() ?? 0);
          const now = Date.now();
          if (now - headingTickAtRef.current > 200) {
            headingTickAtRef.current = now;
            setMapHeadingTick((n) => n + 1);
          }
        });
        // Tap empty map to drop a rally point (works on mobile-web, unlike the
        // long-press `contextmenu` event). Marker taps fire the marker's own click,
        // not this, so tapping a member/rally still just selects it.
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) onLongPressRef.current(e.latLng.lat(), e.latLng.lng());
        });
        // Defer track (re)building until the camera settles: rebuilding on every
        // zoom step mid-animation made zooming janky. While moving we just let the
        // existing polylines transform; on `idle` we rebuild once at the final zoom.
        map.addListener('zoom_changed', () => {
          mapMovingRef.current = true;
          // Pinch/wheel zoom does not fire `dragstart`, so follow mode would just
          // overwrite it on the next frame and the map would feel frozen. Any zoom
          // that isn't the one we just applied is the user's: hand the camera back.
          const applied = appliedZoomRef.current;
          if (applied !== null && Math.abs((map.getZoom() ?? applied) - applied) > 0.05) {
            onUserPanRef.current();
          }
        });
        map.addListener('idle', () => {
          mapMovingRef.current = false;
          syncTrackSegments(map, trackSegmentsRef.current, trackPointsRef.current, map.getZoom() ?? 16);
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
      rallyCircleRef.current?.setMap(null);
      rallyCircleRef.current = null;
      clearTrackSegments(trackSegmentsRef.current);
      trackSegmentsRef.current = [];
      followLineRef.current?.setMap(null);
      followLineRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // While following, your own pin becomes a heading arrow. Symbol rotation is in
    // screen space, so subtracting the map heading makes it point along your course
    // whether the map is course-up or north-up.
    const arrowRotation =
      followActive && ownHeading !== null ? ownHeading - (map.getHeading() ?? 0) : null;
    syncMarkers(map, markersRef.current, pins, selectedDeviceId, onSelectMember, arrowRotation);
  }, [onSelectMember, pins, selectedDeviceId, followActive, ownHeading, mapHeadingTick]);

  // Follow connector: a native dashed Polyline between the two of you. The SDK
  // projects it, so it is correct by construction at any zoom, heading or tilt.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!followActive || selfLat === null || selfLng === null) {
      followLineRef.current?.setMap(null);
      followLineRef.current = null;
      return;
    }
    const line =
      followLineRef.current ??
      new google.maps.Polyline({
        strokeOpacity: 0,
        zIndex: 5,
        clickable: false,
        icons: [
          {
            icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.75, strokeWeight: 3, scale: 3 },
            offset: '0',
            repeat: '14px',
          },
        ],
      });
    followLineRef.current = line;
    const color = followTargetState === 'stale' ? PIN_COLORS.stale : '#7c3aed';
    line.setOptions({
      path: [
        { lat: selfLat, lng: selfLng },
        { lat: followLat!, lng: followLng! },
      ],
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 0.75,
            strokeWeight: 3,
            scale: 3,
            strokeColor: color,
          },
          offset: '0',
          repeat: '14px',
        },
      ],
    });
    if (line.getMap() !== map) line.setMap(map);
  }, [followActive, selfLat, selfLng, followLat, followLng, followTargetState]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncRallyMarkers(map, rallyMarkersRef.current, rallyPoints, selectedRallyId, (id) =>
      onSelectRallyRef.current(id),
    );

    // Show the geofence radius circle for the selected rally point.
    rallyCircleRef.current?.setMap(null);
    rallyCircleRef.current = null;
    if (selectedRally) {
      rallyCircleRef.current = new google.maps.Circle({
        map,
        center: { lat: selectedRally.lat, lng: selectedRally.lng },
        radius: selectedRally.radius ?? 100,
        strokeColor: '#7c3aed',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#7c3aed',
        fillOpacity: 0.1,
        clickable: false,
        zIndex: 3,
      });
    }
  }, [rallyPoints, selectedRallyId, selectedRally]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Render now only when the camera is settled; if it's mid-animation the `idle`
    // listener (set up at map init) will rebuild once it stops.
    if (!mapMovingRef.current) {
      syncTrackSegments(map, trackSegmentsRef.current, trackPoints, map.getZoom() ?? 16);
    }
  }, [trackPoints]);

  // Follow self: keep the camera on the user's marker as it moves.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || followMode !== 'self' || focusLat === null || focusLng === null) return;

    map.panTo({ lat: focusLat, lng: focusLng });
    if ((map.getZoom() ?? 0) < DEFAULT_ZOOM) map.setZoom(DEFAULT_ZOOM);
  }, [followMode, focusLat, focusLng]);

  // Recenter button: re-center even if the position has not changed, and in any
  // follow mode (during a paused follow it just hands the view back to you).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || recenterSignal === 0 || focusLat === null || focusLng === null) return;
    map.panTo({ lat: focusLat, lng: focusLng });
    if ((map.getZoom() ?? 0) < DEFAULT_ZOOM) map.setZoom(DEFAULT_ZOOM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterSignal]);

  // Follow mode (design.md §5.10): you are the anchor, and *your own speed* sets the
  // road scale — walking you want the next few streets, on the highway the next few
  // kilometers. The target's distance does not drive the zoom: chasing someone 2km
  // away would throw away the scale you are actually navigating at, so past
  // HOLD_BOTH_M the edge indicator takes that job instead. `fitBounds` is unusable
  // here anyway — it fits a north-aligned box and resets the heading.
  useEffect(() => {
    if (!followActive || selfLat === null || selfLng === null || viewport.w === 0) {
      followRef.current = null;
      regimeRef.current = undefined;
      return;
    }
    const me = { lat: selfLat, lng: selfLng };
    const target = { lat: followLat!, lng: followLng! };

    if (bothMode) {
      // "View both" is a live fit: centered on the midpoint, north-up, zoomed to
      // exactly hold the pair — and it keeps re-fitting as you both move. North-up
      // is what makes a plain bounding box valid here.
      const mid = { lat: (me.lat + target.lat) / 2, lng: (me.lng + target.lng) / 2 };
      const usableW = Math.max(80, viewport.w - 80);
      const usableH = Math.max(80, viewport.h - 350);
      const northM = Math.abs(me.lat - target.lat) * 111_320;
      const eastM =
        Math.abs(me.lng - target.lng) * 111_320 * Math.cos((mid.lat * Math.PI) / 180);
      const fitMpp = Math.max(northM / usableH, eastM / usableW, 0.5);
      let fitZoom = Math.min(
        DEFAULT_FOLLOW_MAX_ZOOM,
        Math.max(DEFAULT_FOLLOW_MIN_ZOOM, zoomForMpp(mid.lat, fitMpp)),
      );
      const held = followRef.current;
      if (held && Math.abs(fitZoom - held.zoom) < DEFAULT_FOLLOW_ZOOM_EPSILON) fitZoom = held.zoom;
      followRef.current = { lat: mid.lat, lng: mid.lng, zoom: fitZoom, centered: true };
      wakeDriverRef.current?.();
      return;
    }

    const anchor = followAnchor(viewport.w, viewport.h);
    const forwardPx = Math.max(80, anchor.y);
    const regime = followRegime(ownSpeed, regimeRef.current);
    regimeRef.current = regime.key;

    const baseMpp = regime.rangeM / forwardPx;
    const distance = calculateDistance(me, target);
    const heading = headingTargetRef.current ?? 0;
    const theta = (calculateBearing(me, target) - heading) * (Math.PI / 180);
    const exit = rayExit(
      anchor,
      Math.sin(theta),
      -Math.cos(theta),
      followSafeRect(viewport.w, viewport.h),
    );

    // Close enough that we can widen a little to keep them on screen for free.
    const mpp =
      distance < DEFAULT_FOLLOW_HOLD_BOTH_M
        ? Math.max(baseMpp, distance / Math.max(40, exit.distance * 0.85))
        : baseMpp;

    let zoom = Math.min(
      DEFAULT_FOLLOW_MAX_ZOOM,
      Math.max(DEFAULT_FOLLOW_MIN_ZOOM, zoomForMpp(me.lat, mpp)),
    );
    // Zoom dead zone, so the map doesn't "breathe" on every jittery fix.
    const prev = followRef.current;
    if (prev && Math.abs(zoom - prev.zoom) < DEFAULT_FOLLOW_ZOOM_EPSILON) zoom = prev.zoom;
    followRef.current = { lat: me.lat, lng: me.lng, zoom, centered: false };
    wakeDriverRef.current?.();
  }, [followActive, bothMode, selfLat, selfLng, followLat, followLng, ownSpeed, viewport]);

  // New compass/GPS heading → the camera has something to do again.
  useEffect(() => {
    wakeDriverRef.current?.();
  }, [deviceHeading]);

  // Single per-frame camera driver for heading-up rotation and follow framing. Both
  // must be applied together in one `moveCamera`: as the heading turns, the camera
  // center has to orbit around *you* to keep you pinned to the screen anchor, so the
  // offset can only be recomputed with the current heading — every frame.
  useEffect(() => {
    const map = mapRef.current;
    const el = mapEl.current;
    if (!map || !el) return;
    appliedZoomRef.current = null;
    // A paused session means the user took the camera — don't even write the
    // heading, or their pinch/rotate would keep getting corrected.
    if (followMode === 'trackPaused') return;
    if (!headingUp && !followActive) {
      if (!headingUp) map.setHeading(0);
      return;
    }

    let frame = 0;
    let last = performance.now();
    let published = 0;
    let idleFrames = 0;
    let parked = false;
    let heading = map.getHeading() ?? 0;
    let lat: number | null = null;
    let lng: number | null = null;
    let zoom = map.getZoom() ?? DEFAULT_ZOOM;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(120, now - last);
      last = now;

      const headingTarget = headingTargetRef.current;
      const headingSettled =
        !headingUp ||
        headingTarget === null ||
        Math.abs(shortestAngleDelta(headingTarget, heading)) < 0.05;
      if (headingUp && headingTarget !== null && !headingSettled) {
        const delta = shortestAngleDelta(headingTarget, heading);
        heading = normalizeAngle(heading + delta * (1 - Math.exp(-dt / headingTauRef.current)));
      } else if (headingUp && headingTarget !== null) {
        heading = headingTarget;
      }

      const follow = followRef.current;
      if (!follow) {
        lat = null;
        if (!headingSettled) map.moveCamera({ heading });
        return;
      }

      // Nothing left to converge on → stop touching the map, and after a second of
      // that, stop the loop entirely until something wakes it.
      const settled =
        headingSettled &&
        lat !== null &&
        lng !== null &&
        Math.abs(follow.lat - lat) < 1e-7 &&
        Math.abs(follow.lng - lng) < 1e-7 &&
        Math.abs(follow.zoom - zoom) < 0.002;
      if (settled) {
        idleFrames += 1;
        if (idleFrames > 60) {
          parked = true;
          cancelAnimationFrame(frame);
          frame = 0;
        }
        return;
      }
      idleFrames = 0;

      // Ease toward the newest fix so GPS packets don't arrive as visible jumps.
      const k = 1 - Math.exp(-dt / DEFAULT_FOLLOW_CENTER_TAU_MS);
      if (lat === null || lng === null) {
        lat = follow.lat;
        lng = follow.lng;
        zoom = follow.zoom;
      } else {
        lat += (follow.lat - lat) * k;
        lng += (follow.lng - lng) * k;
        zoom += (follow.zoom - zoom) * k;
      }

      // You sit below the screen center, so the camera center is that many pixels
      // *up-screen* from you — and up-screen is the current heading.
      const offsetPx = follow.centered
        ? 0
        : followAnchor(el.clientWidth, el.clientHeight).y - el.clientHeight / 2;
      const center =
        offsetPx === 0
          ? { lat, lng }
          : destinationPoint({ lat, lng }, heading, offsetPx * metersPerPixel(lat, zoom));
      map.moveCamera({ center, zoom, heading });
      appliedZoomRef.current = map.getZoom() ?? zoom;

      // Is the target still on screen? Ask the SDK for its own bounds rather than
      // reimplementing the projection.
      if (now - published > 200 && followLat !== null && followLng !== null) {
        published = now;
        const bounds = map.getBounds();
        const off = bounds ? !bounds.contains({ lat: followLat, lng: followLng }) : false;
        if (off !== offScreenRef.current) {
          offScreenRef.current = off;
          onOffScreenRef.current(off);
        }
      }
    };

    frame = requestAnimationFrame(tick);
    wakeDriverRef.current = () => {
      if (!parked) return;
      parked = false;
      idleFrames = 0;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    return () => {
      cancelAnimationFrame(frame);
      appliedZoomRef.current = null;
      wakeDriverRef.current = null;
    };
  }, [headingUp, followActive, followMode, loadState]);

  // On selecting any target — another member, a rally, or your own avatar — glide to
  // it in one smooth pan+zoom at a consistent street-level zoom. Runs once on
  // selection; for self, the follow effect above keeps tracking you afterwards.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const selectedPin = selectedDeviceId
      ? pins.find((pin) => pin.id === selectedDeviceId) ?? null
      : null;
    const focusPt =
      (selectedPin ? { lat: selectedPin.location.lat, lng: selectedPin.location.lng } : null) ??
      (selectedRally ? { lat: selectedRally.lat, lng: selectedRally.lng } : null);
    if (!focusPt) return;
    map.panTo(focusPt);
    map.setZoom(TARGET_FOCUS_ZOOM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId, selectedRallyId]);

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
  /** Screen-space rotation for your own pin while following; null = plain dot. */
  selfArrowRotation: number | null = null,
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

    const rotation = pin.isSelf ? selfArrowRotation : null;
    const icon = markerIcon(pin, pin.id === selectedDeviceId, rotation);
    // The arrow already reads as "you"; a letter on top of it just muddies it.
    const label = rotation === null ? markerLabel(title) : null;

    if (existing) {
      existing.setPosition(position);
      existing.setTitle(title);
      existing.setIcon(icon);
      existing.setOpacity(opacityForStatus(pin.status));
      existing.setLabel(label);
      continue;
    }

    markers.set(
      pin.id,
      new google.maps.Marker({
        map,
        position,
        title,
        icon,
        label,
        opacity: opacityForStatus(pin.status),
        zIndex: pin.isSelf ? 20 : 10,
      }),
    );
    markers.get(pin.id)?.addListener('click', () => onSelectMember(pin.id));
  }
}

function markerIcon(
  pin: MapPin,
  selected: boolean,
  arrowRotation: number | null,
): google.maps.Symbol {
  if (arrowRotation !== null) {
    // Native arrow head pointing along your course — the SDK rotates and places it.
    return {
      path: 'M 0,-11 L 8,9 L 0,4 L -8,9 Z',
      rotation: arrowRotation,
      scale: 1.4,
      fillColor: PIN_COLORS.self,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeOpacity: 1,
      strokeWeight: 2.5,
    };
  }
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
  const ordered = points
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .sort((a, b) => a.createdAt - b.createdAt);

  // Simplify by zoom + merge same-color runs (one polyline per run instead of
  // one per point).
  const built = buildTrackSegments(ordered, zoom);

  // Reuse existing polyline overlays in place (setOptions) instead of destroying
  // and recreating them every refresh — overlay churn was the rendering bottleneck.
  for (let i = 0; i < built.length; i++) {
    const seg = built[i];
    let poly = segments[i];
    if (!poly) {
      poly = new google.maps.Polyline({
        geodesic: true,
        strokeOpacity: 0.82,
        strokeWeight: 6,
        zIndex: 6,
      });
      segments[i] = poly;
    }
    poly.setOptions({ path: seg.path, strokeColor: seg.colorHex });
    if (poly.getMap() !== map) poly.setMap(map);
  }
  // Detach any leftover overlays from a previously longer track.
  for (let i = built.length; i < segments.length; i++) segments[i].setMap(null);
  segments.length = built.length;
}

function clearTrackSegments(segments: google.maps.Polyline[]): void {
  for (const segment of segments) segment.setMap(null);
}

/** Shortest signed angular distance from `current` to `target`, in (-180, 180]. */
function shortestAngleDelta(target: number, current: number): number {
  return ((target - current + 540) % 360) - 180;
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
