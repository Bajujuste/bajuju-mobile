import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../theme/bajujuTheme';

type NavKey = 'home' | 'find' | 'flash' | 'profile';

type BajujuBottomNavProps = {
  active: NavKey;
};

const ITEMS: {
  key: NavKey;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  activeIcon: React.ComponentProps<typeof Ionicons>['name'];
  route: '/home' | '/experiences' | '/flash' | '/profile';
}[] = [
  {
    key: 'home',
    label: 'Home',
    icon: 'home-outline',
    activeIcon: 'home',
    route: '/home',
  },
  {
    key: 'find',
    label: 'Trova',
    icon: 'search-outline',
    activeIcon: 'search',
    route: '/experiences',
  },
  {
    key: 'flash',
    label: 'Flash',
    icon: 'flash-outline',
    activeIcon: 'flash',
    route: '/flash',
  },
  {
    key: 'profile',
    label: 'Profilo',
    icon: 'person-outline',
    activeIcon: 'person',
    route: '/profile',
  },
];

export function BajujuBottomNav({ active }: BajujuBottomNavProps) {
  return (
    <View style={styles.bottomNav}>
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
                router.replace(item.route);
              }
            }}
            style={({ pressed }) => [
              styles.navItem,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={selected ? item.activeIcon : item.icon}
              size={27}
              color={color}
            />
            <Text style={[styles.navLabel, selected && styles.navLabelActive]}>
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
