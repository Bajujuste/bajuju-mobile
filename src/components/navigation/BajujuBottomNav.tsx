import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../theme/bajujuTheme';
import {
  BajujuIcon,
  BajujuIconName,
} from '../icons/BajujuIcon';

type NavKey = 'home' | 'find' | 'how' | 'groups' | 'myEvents' | 'flash' | 'profile';

type BajujuBottomNavProps = {
  active: NavKey;
};

const ITEMS: {
  key: Exclude<NavKey, 'flash'>;
  label: string;
  icon: BajujuIconName;
  activeIcon: BajujuIconName;
  route: '/home' | '/experiences' | '/how-it-works' | '/groups' | '/my-events' | '/profile';
}[] = [
  {
    key: 'home',
    label: 'Home',
    icon: 'home',
    activeIcon: 'home',
    route: '/home',
  },
  {
    key: 'how',
    label: 'Come funziona',
    icon: 'info',
    activeIcon: 'info',
    route: '/how-it-works',
  },
  {
    key: 'myEvents',
    label: 'I miei eventi',
    icon: 'calendar',
    activeIcon: 'calendar',
    route: '/my-events',
  },
  {
    key: 'profile',
    label: 'Profilo',
    icon: 'person',
    activeIcon: 'person',
    route: '/profile',
  },
];

export function BajujuBottomNav({ active }: BajujuBottomNavProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bottomNav,
        { bottom: Math.max(13, insets.bottom + 7) },
      ]}
    >
      {ITEMS.map((item) => {
        const selected = item.key === active;
        const color = selected
          ? BAJUJU_COLORS.brightPink
          : BAJUJU_COLORS.plum;

        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) {
                // Le typed-routes generate possono restare indietro rispetto alle nuove schermate.
                router.replace(item.route as any);
              }
            }}
            style={({ pressed }) => [
              styles.navItem,
              pressed && styles.pressed,
            ]}
          >
            <BajujuIcon
              name={selected ? item.activeIcon : item.icon}
              size={27}
              color={color}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.navLabel,
                (item.key === 'myEvents' || item.key === 'how') && styles.navLabelCompact,
                selected && styles.navLabelActive,
              ]}
            >
              {item.label}
            </Text>
            {selected ? <View style={styles.activeIndicator} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    position: 'absolute',
    left: 15,
    right: 15,
    bottom: 13,
    height: 94,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 31,
    borderWidth: 1,
    borderColor: '#F8D7E8',
    backgroundColor: BAJUJU_COLORS.white,
    shadowColor: '#761046',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  navItem: {
    position: 'relative',
    flex: 1,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  navLabel: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 13,
  },
  navLabelCompact: {
    fontSize: 11.5,
    letterSpacing: -0.15,
  },
  navLabelActive: {
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.semiBold,
  },
  activeIndicator: {
    position: 'absolute',
    left: 25,
    right: 25,
    bottom: -4,
    height: 4,
    borderRadius: 2,
    backgroundColor: BAJUJU_COLORS.brightPink,
  },
  pressed: {
    opacity: 0.72,
  },
});