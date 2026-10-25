import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  Region,
} from 'react-native-maps';

import { BAJUJU_COLORS, BAJUJU_FONTS } from '../theme/bajujuTheme';

// Un'immagine statica evita il ritaglio delle icone vettoriali quando Android
// converte il contenuto di Marker in bitmap.
const pinkPinImage = require('../../assets/markers/pink-pin.png');

// Segnaposto viola dei locali: senza numero o con il numero di eventi in programma.
const LOCATION_PIN_IMAGES = [
  require('../../assets/markers/location-pin.png'),
  require('../../assets/markers/location-pin-1.png'),
  require('../../assets/markers/location-pin-2.png'),
  require('../../assets/markers/location-pin-3.png'),
  require('../../assets/markers/location-pin-4.png'),
  require('../../assets/markers/location-pin-5.png'),
  require('../../assets/markers/location-pin-6.png'),
  require('../../assets/markers/location-pin-7.png'),
  require('../../assets/markers/location-pin-8.png'),
  require('../../assets/markers/location-pin-9.png'),
  require('../../assets/markers/location-pin-9plus.png'),
];

const LOCATION_PURPLE = '#7B2FBE';
const LOCATION_PURPLE_SOFT = '#F3EAFC';

function locationPinImage(eventCount: number) {
  return LOCATION_PIN_IMAGES[Math.max(0, Math.min(eventCount, 10))];
}

export type BajujuMapItem = {
  id: string;
  latitude: number;
  longitude: number;
  icon: string;
  kicker: string;
  title: string;
  locationText?: string;
  dateText?: string;
  photoUrl?: string;
  ageText?: string;
};

export type BajujuMapLocation = {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  category: string;
  addressText: string;
  photoUrl?: string;
  events: { id: string; title: string; dateText: string; byLocation?: boolean }[];
};

type BajujuMapProps = {
  items: BajujuMapItem[];
  mapTitle: string;
  mapSubtitle: string;
  emptyText: string;
  previewActionText: string;
  onOpenItem: (item: BajujuMapItem) => void;
  fallbackRegion?: Region;
  preferFallbackRegion?: boolean;
  showUserLocation?: boolean;
  hideHeader?: boolean;
  viewportKey?: string;
  onInteractionChange?: (active: boolean) => void;
  fullScreen?: boolean;
  topOverlay?: React.ReactNode;
  userCoordinates?: { latitude: number; longitude: number } | null;
  locations?: BajujuMapLocation[];
  onOpenLocation?: (location: BajujuMapLocation) => void;
  onOpenLocationEvent?: (eventId: string) => void;
  onCreateEventAtLocation?: (location: BajujuMapLocation) => void;
};

const DEFAULT_REGION: Region = {
  latitude: 45.82,
  longitude: 9.5,
  latitudeDelta: 0.32,
  longitudeDelta: 0.44,
};

type DisplayMarker = {
  latitude: number;
  longitude: number;
  index: number;
  total: number;
};

function buildDisplayMarkers(items: BajujuMapItem[]) {
  const groups = new Map<string, BajujuMapItem[]>();

  items.forEach((item) => {
    const key =
      `${item.latitude.toFixed(6)}|${item.longitude.toFixed(6)}`;

    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  });

  const result = new Map<string, DisplayMarker>();

  groups.forEach((group) => {
    if (group.length === 1) {
      const item = group[0];

      result.set(item.id, {
        latitude: item.latitude,
        longitude: item.longitude,
        index: 0,
        total: 1,
      });

      return;
    }

    const baseLatitude = group[0].latitude;
    const baseLongitude = group[0].longitude;

    // Spostamento SOLO grafico di circa 20 metri.
    // Le coordinate reali dell'evento non vengono modificate.
    const radius = 0.0002;

    const longitudeScale = Math.max(
      Math.cos((baseLatitude * Math.PI) / 180),
      0.3
    );

    group.forEach((item, index) => {
      const angle =
        -Math.PI / 2 +
        (2 * Math.PI * index) / group.length;

      result.set(item.id, {
        latitude:
          baseLatitude +
          Math.cos(angle) * radius,
        longitude:
          baseLongitude +
          (Math.sin(angle) * radius) / longitudeScale,
        index,
        total: group.length,
      });
    });
  });

  return result;
}

function buildInitialRegion(items: BajujuMapItem[]): Region {
  if (items.length === 0) return DEFAULT_REGION;

  if (items.length === 1) {
    return {
      latitude: items[0].latitude,
      longitude: items[0].longitude,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }

  const latitudes = items.map((item) => item.latitude);
  const longitudes = items.map((item) => item.longitude);

  const minimumLatitude = Math.min(...latitudes);
  const maximumLatitude = Math.max(...latitudes);
  const minimumLongitude = Math.min(...longitudes);
  const maximumLongitude = Math.max(...longitudes);

  return {
    latitude: (minimumLatitude + maximumLatitude) / 2,
    longitude: (minimumLongitude + maximumLongitude) / 2,
    latitudeDelta: Math.max((maximumLatitude - minimumLatitude) * 1.5, 0.08),
    longitudeDelta: Math.max((maximumLongitude - minimumLongitude) * 1.5, 0.08),
  };
}

export default function BajujuMap({
  items,
  mapTitle,
  mapSubtitle,
  emptyText,
  previewActionText,
  onOpenItem,
  fallbackRegion,
  preferFallbackRegion = false,
  showUserLocation = false,
  hideHeader = false,
  viewportKey,
  onInteractionChange,
  fullScreen = false,
  topOverlay,
  userCoordinates,
  locations = [],
  onOpenLocation,
  onOpenLocationEvent,
  onCreateEventAtLocation,
}: BajujuMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [previewHeight, setPreviewHeight] = useState(230);
  // Su Android i marker personalizzati vanno ridisegnati solo quando cambiano: con
  // tracksViewChanges sempre attivo la mappa li ridisegna di continuo (fino a 500 marker).
  const [markersNeedRedraw, setMarkersNeedRedraw] = useState(true);
  const preferredRegionKeyRef = useRef("");
  const fittedViewportKeyRef = useRef("");

  const initialRegion = useMemo(
    () => (preferFallbackRegion && fallbackRegion ? fallbackRegion : items.length > 0 ? buildInitialRegion(items) : fallbackRegion || DEFAULT_REGION),
    [fallbackRegion, items, preferFallbackRegion]
  );

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? null;
  const selectedLocation =
    locations.find((location) => location.id === selectedLocationId) ?? null;
  const selectedPoint = selectedItem ?? selectedLocation;

  const displayMarkers = useMemo(
    () => buildDisplayMarkers(items),
    [items]
  );

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    setMarkersNeedRedraw(true);
    const timer = setTimeout(() => setMarkersNeedRedraw(false), 700);
    return () => clearTimeout(timer);
  }, [items, selectedItemId]);

  useEffect(() => {
    if (selectedItemId && !items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(null);
    }
  }, [items, selectedItemId]);

  useEffect(() => {
    if (selectedLocationId && !locations.some((location) => location.id === selectedLocationId)) {
      setSelectedLocationId(null);
    }
  }, [locations, selectedLocationId]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    if (preferFallbackRegion && fallbackRegion) {
      const regionKey = `${fallbackRegion.latitude}:${fallbackRegion.longitude}:${fallbackRegion.latitudeDelta}:${fallbackRegion.longitudeDelta}`;
      if (preferredRegionKeyRef.current !== regionKey) {
        preferredRegionKeyRef.current = regionKey;
        mapRef.current.animateToRegion(fallbackRegion, 350);
      }
      return;
    }

    if (viewportKey && fittedViewportKeyRef.current === viewportKey) return;

    if (items.length === 0) {
      mapRef.current.animateToRegion(
        fallbackRegion || DEFAULT_REGION,
        350
      );
      return;
    }

    if (items.length === 1) {
      mapRef.current.animateToRegion(
        {
          latitude: items[0].latitude,
          longitude: items[0].longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        },
        350
      );
      if (viewportKey) fittedViewportKeyRef.current = viewportKey;
      return;
    }

    mapRef.current.fitToCoordinates(
      items.map((item) => ({
        latitude: item.latitude,
        longitude: item.longitude,
      })),
      {
        edgePadding: {
          top: 70,
          right: 50,
          bottom: 70,
          left: 50,
        },
        animated: true,
      }
    );
    if (viewportKey) fittedViewportKeyRef.current = viewportKey;
  }, [fallbackRegion, items, mapReady, preferFallbackRegion, viewportKey]);

  const changeZoom = async (delta: number) => {
    if (!mapRef.current) return;

    try {
      const camera = await mapRef.current.getCamera();

      const currentZoom =
        typeof camera.zoom === 'number'
          ? camera.zoom
          : 12;

      const nextZoom = Math.max(
        4,
        Math.min(20, currentZoom + delta)
      );

      mapRef.current.animateCamera(
        {
          ...camera,
          zoom: nextZoom,
        },
        {
          duration: 220,
        }
      );
    } catch {
      // Il pinch zoom rimane comunque disponibile.
    }
  };

  const centerOnUser = () => {
    if (!userCoordinates) return;
    mapRef.current?.animateToRegion({ ...userCoordinates, latitudeDelta: 0.18, longitudeDelta: 0.18 }, 350);
  };

  const openGoogleMaps = (item: { latitude: number; longitude: number }, directions: boolean) => {
    const destination = `${item.latitude},${item.longitude}`;
    const url = directions
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
    void Linking.openURL(url).catch(() => console.log('Google Maps non disponibile.'));
  };

  return (
    <View style={[styles.card, fullScreen && styles.fullScreenCard]}>
        {!hideHeader ? (
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{mapTitle}</Text>
              <Text style={styles.subtitle}>{mapSubtitle}</Text>
            </View>

            <Text style={styles.count}>{items.length}</Text>
          </View>
        ) : null}

      <View style={[styles.mapShell, fullScreen && styles.fullScreenMapShell]}>
        <MapView
          ref={mapRef}
          provider={
            Platform.OS === 'android'
              ? PROVIDER_GOOGLE
              : undefined
          }
          style={styles.map}
          initialRegion={initialRegion}
          mapType="standard"
          loadingEnabled
          loadingIndicatorColor="#E43F98"
          loadingBackgroundColor="#fff8fb"
          onMapReady={() => {
            setMapReady(true);
          }}
          showsCompass
          showsScale
          showsUserLocation={showUserLocation}
          zoomEnabled={true}
          scrollEnabled={true}
          minZoomLevel={4}
          maxZoomLevel={20}
          zoomControlEnabled={!fullScreen}
          toolbarEnabled={false}
          moveOnMarkerPress={false}
          onTouchStart={() => onInteractionChange?.(true)}
          onTouchEnd={() => onInteractionChange?.(false)}
          onTouchCancel={() => onInteractionChange?.(false)}
          onRegionChangeComplete={() => onInteractionChange?.(false)}
          onPress={() => {
            setSelectedItemId(null);
            setSelectedLocationId(null);
          }}
        >
          {locations.map((location) => {
            const selected = selectedLocationId === location.id;
            return (
              <Marker
                key={`location-${location.id}`}
                coordinate={{ latitude: location.latitude, longitude: location.longitude }}
                anchor={{ x: 0.5, y: 1 }}
                image={locationPinImage(location.events.length)}
                tracksViewChanges={false}
                zIndex={selected ? 30 : 10}
                onPress={(event) => {
                  event.stopPropagation();
                  setSelectedItemId(null);
                  setSelectedLocationId(location.id);
                }}
              />
            );
          })}
          {items.map((item) => {
            const selected = selectedItemId === item.id;

            const displayMarker =
              displayMarkers.get(item.id) || {
                latitude: item.latitude,
                longitude: item.longitude,
                index: 0,
                total: 1,
              };

            return (
              <Marker
                key={item.id}
                coordinate={{
                  latitude: displayMarker.latitude,
                  longitude: displayMarker.longitude,
                }}
                anchor={{ x: 0.5, y: fullScreen ? 1 : 0.5 }}
                image={fullScreen ? pinkPinImage : undefined}
                tracksViewChanges={!fullScreen && Platform.OS === "android" && markersNeedRedraw}
                opacity={selected ? 1 : 0.96}
                zIndex={selected ? 20 : 1}
                onPress={(event) => {
                  event.stopPropagation();
                  setSelectedLocationId(null);
                  setSelectedItemId(item.id);
                }}
              >
                {!fullScreen ? (
                  <View style={[styles.mapMarker, selected && styles.mapMarkerSelected]}>
                    <Text style={styles.mapMarkerIcon}>{item.icon}</Text>
                    {displayMarker.total > 1 ? (
                      <View style={styles.duplicateBadge}>
                        <Text style={styles.duplicateBadgeText}>{displayMarker.index + 1}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </Marker>
            );
          })}
        </MapView>

        {topOverlay ? <View style={styles.topOverlay}>{topOverlay}</View> : null}

        {!fullScreen ? <View style={styles.zoomButtons}>
          <Pressable
            style={styles.zoomButton}
            onPress={() => changeZoom(1)}
          >
            <Text style={styles.zoomButtonText}>+</Text>
          </Pressable>

          <Pressable
            style={styles.zoomButton}
            onPress={() => changeZoom(-1)}
          >
            <Text style={styles.zoomButtonText}>−</Text>
          </Pressable>
        </View> : null}

        {fullScreen && userCoordinates ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Torna alla mia posizione" style={[styles.locationButton, selectedPoint && { bottom: previewHeight + 84 }]} onPress={centerOnUser}>
            <Ionicons name="locate-outline" size={25} color={BAJUJU_COLORS.plum} />
          </Pressable>
        ) : null}

        {fullScreen && selectedPoint ? (
          <View style={[styles.externalMapActions, { bottom: previewHeight + 24 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Indicazioni per raggiungere il luogo" style={styles.externalMapButton} onPress={() => openGoogleMaps(selectedPoint, true)}>
              <Ionicons name="navigate-outline" size={21} color={BAJUJU_COLORS.brightPink} />
              <Text style={styles.externalMapLabel}>Indicazioni</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Apri il luogo in Google Maps" style={styles.externalMapButton} onPress={() => openGoogleMaps(selectedPoint, false)}>
              <Ionicons name="map-outline" size={21} color={BAJUJU_COLORS.brightPink} />
              <Text style={styles.externalMapLabel}>Google Maps</Text>
            </Pressable>
          </View>
        ) : null}

        {selectedLocation ? (
          <View
            style={[styles.preview, styles.locationPreview]}
            onLayout={(event) => setPreviewHeight(event.nativeEvent.layout.height)}
          >
            <Pressable style={styles.previewHeader} onPress={() => onOpenLocation?.(selectedLocation)}>
              {selectedLocation.photoUrl ? (
                <Image source={{ uri: selectedLocation.photoUrl }} style={styles.locationPreviewPhoto} resizeMode="cover" />
              ) : (
                <View style={[styles.previewIconCircle, styles.locationIconCircle]}>
                  <Ionicons name="home" size={18} color={LOCATION_PURPLE} />
                </View>
              )}
              <View style={styles.previewText}>
                <Text style={[styles.previewKicker, styles.locationKicker]}>Location · {selectedLocation.category}</Text>
                <Text style={styles.previewTitle} numberOfLines={1}>{selectedLocation.name}</Text>
                <Text style={styles.locationAddress} numberOfLines={1}>{selectedLocation.addressText}</Text>
              </View>
            </Pressable>

            {selectedLocation.events.length > 0 ? (
              <View style={styles.locationEvents}>
                {selectedLocation.events.slice(0, 3).map((event) => (
                  <Pressable key={event.id} style={styles.locationEventRow} onPress={() => onOpenLocationEvent?.(event.id)}>
                    <View style={styles.locationEventCopy}>
                      <View style={styles.locationEventTitleRow}>
                        <Text style={styles.locationEventTitle} numberOfLines={1}>{event.title}</Text>
                        {event.byLocation ? <Text style={styles.locationEventTag}>Del locale</Text> : null}
                      </View>
                      <Text style={styles.locationEventMeta} numberOfLines={1}>{event.dateText}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={BAJUJU_COLORS.muted} />
                  </Pressable>
                ))}
                {selectedLocation.events.length > 3 ? (
                  <Text style={styles.locationMoreText}>
                    e altri {selectedLocation.events.length - 3} sulla pagina del locale
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.locationEmptyText}>Nessun evento in programma qui.</Text>
            )}

            <View style={styles.locationActions}>
              <Pressable style={styles.locationSecondaryButton} onPress={() => onOpenLocation?.(selectedLocation)}>
                <Text style={styles.locationSecondaryText}>Vedi il locale</Text>
              </Pressable>
              {selectedLocation.events.length === 0 ? (
                <Pressable style={styles.locationPrimaryButton} onPress={() => onCreateEventAtLocation?.(selectedLocation)}>
                  <Text style={styles.locationPrimaryText}>Organizza un evento qui</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {selectedItem ? (
          <Pressable
            style={styles.preview}
            onPress={() => onOpenItem(selectedItem)}
            onLayout={(event) => setPreviewHeight(event.nativeEvent.layout.height)}
          >
            {fullScreen && selectedItem.photoUrl ? <Image source={{ uri: selectedItem.photoUrl }} style={styles.previewPhoto} resizeMode="cover" /> : null}
            <View style={styles.previewHeader}>
              <View style={styles.previewIconCircle}>
                <Text style={styles.previewIcon}>{selectedItem.icon}</Text>
              </View>


              <View style={styles.previewText}>
                <Text style={styles.previewKicker}>
                  {selectedItem.kicker}
                </Text>

                <Text style={styles.previewTitle} numberOfLines={2}>
                  {selectedItem.title}
                </Text>
              </View>
            </View>

            {selectedItem.locationText ? (
              <Text style={styles.previewMeta} numberOfLines={1}>
                {selectedItem.locationText}
              </Text>
            ) : null}

            {selectedItem.dateText ? (
              <Text style={styles.previewMeta} numberOfLines={1}>
                {selectedItem.dateText}
              </Text>
            ) : null}

            {fullScreen && selectedItem.ageText ? <Text style={styles.previewMeta}>{selectedItem.ageText}</Text> : null}

            <Text style={styles.previewAction}>
              {previewActionText}
            </Text>
          </Pressable>
        ) : null}
      </View>

        {items.length === 0 && locations.every((location) => location.events.length === 0) ? (
          <Text style={styles.emptyText}>{emptyText}</Text>
        ) : null}
    </View>
  );
}

const legacyStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F3C6DC',
    gap: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#4B0C2D',
    fontSize: 20,
    fontFamily: 'FredokaBold',
  },
  subtitle: {
    color: '#8D5E77',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'FredokaBold',
    marginTop: 2,
  },
  count: {
    color: '#E43F98',
    fontSize: 26,
    fontFamily: 'FredokaBold',
  },
  emptyText: {
    color: '#8D5E77',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'FredokaBold',
  },
  mapShell: {
    position: 'relative',
    height: 330,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F3C6DC',
    backgroundColor: '#fff8fb',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  marker: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E43F98',
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4B0C2D',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 10,
  },
  markerSelected: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#c81f77',
    borderWidth: 5,
  },
  markerIcon: {
    fontFamily: 'FredokaRegular',
    fontSize: 20,
  },
  preview: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F3C6DC',
    shadowColor: '#4B0C2D',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    elevation: 12,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFF0F7',
    borderWidth: 1,
    borderColor: '#F3C6DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewIcon: {
    fontFamily: 'FredokaRegular',
    fontSize: 19,
  },
  previewText: {
    flex: 1,
    minWidth: 0,
  },
  previewKicker: {
    color: '#E43F98',
    fontSize: 12,
    fontFamily: 'FredokaBold',
    marginBottom: 2,
  },
  previewTitle: {
    color: '#4B0C2D',
    fontSize: 15,
    lineHeight: 19,
    fontFamily: 'FredokaBold',
  },
  previewMeta: {
    color: '#8D5E77',
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'FredokaBold',
    marginTop: 5,
  },
  previewAction: {
    color: '#E43F98',
    fontSize: 12,
    fontFamily: 'FredokaBold',
    marginTop: 8,
  },
});

void legacyStyles;

const styles = StyleSheet.create({
  fullScreenCard: { flex: 1, padding: 0, gap: 0, borderWidth: 0, borderRadius: 0, overflow: 'hidden' },
  fullScreenMapShell: { flex: 1, height: undefined, borderWidth: 0, borderRadius: 0 },
  topOverlay: { position: 'absolute', top: 12, left: 12, right: 12 },
  locationButton: { position: 'absolute', bottom: 18, right: 16, width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', elevation: 6, shadowColor: '#4B0C2D', shadowOpacity: 0.2, shadowRadius: 8 },
  externalMapActions: { position: 'absolute', right: 12, flexDirection: 'row', gap: 8 },
  externalMapButton: { height: 48, paddingHorizontal: 11, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F4C4DC', elevation: 5, shadowColor: '#4B0C2D', shadowOpacity: 0.16, shadowRadius: 7 },
  externalMapLabel: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
  previewPhoto: { width: '100%', height: 94, borderRadius: 14, marginBottom: 9 },
  locationPreview: { borderColor: '#D9C2F2' },
  locationPreviewPhoto: { width: 52, height: 52, borderRadius: 14 },
  locationIconCircle: { borderColor: '#D9C2F2', backgroundColor: LOCATION_PURPLE_SOFT },
  locationKicker: { color: LOCATION_PURPLE },
  locationAddress: { marginTop: 2, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  locationEvents: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#F1E6FA' },
  locationEventRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1E6FA' },
  locationEventCopy: { flex: 1, minWidth: 0 },
  locationEventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationEventTitle: { flexShrink: 1, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 14 },
  locationEventTag: {
    overflow: 'hidden',
    backgroundColor: LOCATION_PURPLE,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 1,
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 11,
  },
  locationEventMeta: { marginTop: 1, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  locationMoreText: { marginTop: 6, color: LOCATION_PURPLE, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
  locationEmptyText: { marginTop: 10, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 13 },
  locationActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  locationSecondaryButton: { flex: 1, minHeight: 42, borderRadius: 21, borderWidth: 1.5, borderColor: LOCATION_PURPLE, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  locationSecondaryText: { color: LOCATION_PURPLE, fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },
  locationPrimaryButton: { flex: 1.4, minHeight: 42, borderRadius: 21, backgroundColor: LOCATION_PURPLE, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  locationPrimaryText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },
  card: {
    padding: 22,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: '#FFFCFE',
    gap: 14,
    overflow: 'hidden',
    shadowColor: '#9B1A5B',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 21,
    lineHeight: 25,
  },
  subtitle: {
    marginTop: 3,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  count: {
    minWidth: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: BAJUJU_COLORS.brightPink,
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 23,
  },
  emptyText: {
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  mapShell: {
    position: 'relative',
    height: 430,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#F7A7CD',
    backgroundColor: BAJUJU_COLORS.mapGreen,
    shadowColor: '#9B1A5B',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.white,
    backgroundColor: BAJUJU_COLORS.brightPink,
    shadowColor: '#4B0C2D',
    shadowOpacity: 0.28,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  mapMarkerSelected: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3,
    borderColor: BAJUJU_COLORS.plum,
  },
  mapMarkerIcon: {
    fontFamily: 'FredokaRegular',
    fontSize: 15,
  },
  duplicateBadge: {
    position: 'absolute',
    top: -7,
    right: -7,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.plum,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.white,
  },
  duplicateBadgeText: {
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 10,
  },
  zoomButtons: {
    position: 'absolute',
    top: 12,
    right: 12,
    gap: 7,
  },
  zoomButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.white,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.palePink,
    shadowColor: '#4B0C2D',
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  zoomButtonText: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 25,
    lineHeight: 27,
  },
  preview: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    padding: 13,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: BAJUJU_COLORS.white,
    shadowColor: '#9B1A5B',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 7,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.softPink,
  },
  previewIcon: {
    fontFamily: 'FredokaRegular',
    fontSize: 19,
  },
  previewText: {
    flex: 1,
    minWidth: 0,
  },
  previewKicker: {
    marginBottom: 2,
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 12,
  },
  previewTitle: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 15,
    lineHeight: 19,
  },
  previewMeta: {
    marginTop: 5,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 12,
    lineHeight: 17,
  },
  previewAction: {
    marginTop: 8,
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 12,
  },
});
