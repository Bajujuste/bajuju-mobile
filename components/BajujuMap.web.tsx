import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
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

export default function BajujuMap({
  items,
  mapTitle,
  mapSubtitle,
  emptyText,
  previewActionText,
  onOpenItem,
  hideHeader = false,
}: BajujuMapProps) {
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

      <View style={styles.webFallback}>
        <Text style={styles.webIcon}>🗺️</Text>
        <Text style={styles.webTitle}>Mappa disponibile nell’app Bajuju</Text>
        <Text style={styles.webText}>
          Sul web puoi comunque aprire le esperienze disponibili qui sotto.
        </Text>
      </View>

      {items.length === 0 ? (
        <Text style={styles.emptyText}>{emptyText}</Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable key={item.id} style={styles.item} onPress={() => onOpenItem(item)}>
              <Text style={styles.itemIcon}>{item.icon}</Text>
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                {item.locationText ? <Text style={styles.itemMeta}>{item.locationText}</Text> : null}
                {item.dateText ? <Text style={styles.itemMeta}>{item.dateText}</Text> : null}
                <Text style={styles.itemAction}>{previewActionText}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.palePink,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 20 },
  subtitle: { marginTop: 2, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 13, lineHeight: 18 },
  count: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 26 },
  webFallback: {
    minHeight: 210,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: BAJUJU_COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  webIcon: { fontSize: 40 },
  webTitle: { marginTop: 10, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 18, textAlign: 'center' },
  webText: { marginTop: 6, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  emptyText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 20 },
  list: { gap: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.palePink,
    borderRadius: 18,
    padding: 13,
    backgroundColor: '#fff',
  },
  itemIcon: { fontSize: 24 },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  itemMeta: { marginTop: 2, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  itemAction: { marginTop: 5, color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
});
