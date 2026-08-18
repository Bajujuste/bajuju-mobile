import React, { useEffect, useMemo, useRef, useState } from 'react';
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

import { BAJUJU_COLORS, BAJUJU_FONTS } from '../src/theme/bajujuTheme';

export type BajujuMapItem = {
  id: string;
  latitude: number;
  longitude: number;
  icon: string;
  kicker: string;
  title: string;
  locationText?: string;
  dateText?: string;
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
}: BajujuMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const preferredRegionKeyRef = useRef("");
  const fittedViewportKeyRef = useRef("");

  const initialRegion = useMemo(
    () => (preferFallbackRegion && fallbackRegion ? fallbackRegion : items.length > 0 ? buildInitialRegion(items) : fallbackRegion || DEFAULT_REGION),
    [fallbackRegion, items, preferFallbackRegion]
  );

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? null;

  const displayMarkers = useMemo(
    () => buildDisplayMarkers(items),
    [items]
  );

  useEffect(() => {
    if (selectedItemId && !items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(null);
    }
  }, [items, selectedItemId]);

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

  return (
    <View style={styles.card}>
        {!hideHeader ? (
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{mapTitle}</Text>
              <Text style={styles.subtitle}>{mapSubtitle}</Text>
            </View>

            <Text style={styles.count}>{items.length}</Text>
          </View>
        ) : null}

      <View style={styles.mapShell}>
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
          loadingIndicatorColor="#e43f98"
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
          zoomControlEnabled
          toolbarEnabled={false}
          moveOnMarkerPress={false}
          onTouchStart={() => onInteractionChange?.(true)}
          onTouchEnd={() => onInteractionChange?.(false)}
          onTouchCancel={() => onInteractionChange?.(false)}
          onRegionChangeComplete={() => onInteractionChange?.(false)}
          onPress={() => setSelectedItemId(null)}
        >
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
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={Platform.OS === "android"}
                opacity={selected ? 1 : 0.96}
                zIndex={selected ? 20 : 1}
                onPress={(event) => {
                  event.stopPropagation();
                  setSelectedItemId(item.id);
                }}
              >
                <View
                  style={[
                    styles.mapMarker,
                    selected && styles.mapMarkerSelected,
                  ]}
                >
                  <Text style={styles.mapMarkerIcon}>
                    {item.icon}
                  </Text>

                  {displayMarker.total > 1 ? (
                    <View style={styles.duplicateBadge}>
                      <Text style={styles.duplicateBadgeText}>
                        {displayMarker.index + 1}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Marker>
            );
          })}
        </MapView>

        <View style={styles.zoomButtons}>
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
        </View>

        {selectedItem ? (
          <Pressable
            style={styles.preview}
            onPress={() => onOpenItem(selectedItem)}
          >
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

            <Text style={styles.previewAction}>
              {previewActionText}
            </Text>
          </Pressable>
        ) : null}
      </View>

        {items.length === 0 ? (
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
    borderColor: '#ffd3e6',
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
    color: '#4b1430',
    fontSize: 20,
    fontWeight: '900',
  },
  subtitle: {
    color: '#7b4960',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  count: {
    color: '#e43f98',
    fontSize: 26,
    fontWeight: '900',
  },
  emptyText: {
    color: '#7b4960',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  mapShell: {
    position: 'relative',
    height: 330,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ffd3e6',
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
    backgroundColor: '#e43f98',
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4b1430',
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
    borderColor: '#ffd3e6',
    shadowColor: '#4b1430',
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
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewIcon: {
    fontSize: 19,
  },
  previewText: {
    flex: 1,
    minWidth: 0,
  },
  previewKicker: {
    color: '#e43f98',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 2,
  },
  previewTitle: {
    color: '#4b1430',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  previewMeta: {
    color: '#7b4960',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    marginTop: 5,
  },
  previewAction: {
    color: '#e43f98',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
  },
});

void legacyStyles;

const styles = StyleSheet.create({
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
    shadowColor: '#4B1430',
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
    shadowColor: '#4B1430',
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
