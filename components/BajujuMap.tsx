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
};

const DEFAULT_REGION: Region = {
  latitude: 45.82,
  longitude: 9.5,
  latitudeDelta: 0.32,
  longitudeDelta: 0.44,
};

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
}: BajujuMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const initialRegion = useMemo(
    () => (items.length > 0 ? buildInitialRegion(items) : fallbackRegion || DEFAULT_REGION),
    [fallbackRegion, items]
  );

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? null;

  useEffect(() => {
    if (selectedItemId && !items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(null);
    }
  }, [items, selectedItemId]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

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
  }, [fallbackRegion, items, mapReady]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{mapTitle}</Text>
          <Text style={styles.subtitle}>{mapSubtitle}</Text>
        </View>

        <Text style={styles.count}>{items.length}</Text>
      </View>

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
          zoomControlEnabled
          toolbarEnabled={false}
          moveOnMarkerPress={false}
          onPress={() => setSelectedItemId(null)}
        >
          {items.map((item) => {
            const selected = selectedItemId === item.id;

            return (
              <Marker
                key={item.id}
                coordinate={{
                  latitude: item.latitude,
                  longitude: item.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                image={require('../assets/map-marker-bajuju.png')}
                tracksViewChanges={false}
                opacity={selected ? 1 : 0.9}
                onPress={(event) => {
                  event.stopPropagation();
                  setSelectedItemId(item.id);
                }}
              />
            );
          })}
        </MapView>

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

const styles = StyleSheet.create({
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
