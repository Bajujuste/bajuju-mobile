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

const HOW_IT_WORKS_PINK = '#F32189';
const MY_EVENTS_YELLOW = '#D6A100';

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
        const color = item.key === 'how'
          ? selected
            ? BAJUJU_COLORS.white
            : HOW_IT_WORKS_PINK
          : item.key === 'myEvents'
            ? MY_EVENTS_YELLOW
            : selected
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
              item.key === 'how' && styles.howNavItem,
              item.key === 'how' && selected && styles.howNavItemActive,
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
                item.key === 'how' && styles.howLabel,
                item.key === 'myEvents' && styles.myEventsLabel,
                selected && item.key !== 'how' && item.key !== 'myEvents' && styles.navLabelActive,
                selected && item.key === 'how' && styles.howLabelActive,
                selected && item.key === 'myEvents' && styles.myEventsLabelActive,
              ]}
            >
              {item.label}
            </Text>
            {selected ? (
              <View
                style={[
                  styles.activeIndicator,
                  item.key === 'how' && styles.howActiveIndicator,
                  item.key === 'myEvents' && styles.myEventsActiveIndicator,
                ]}
              />
            ) : null}
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
  howNavItem: {
    height: 68,
    marginHorizontal: 3,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: '#F4A7CA',
    backgroundColor: '#FFE8F3',
    shadowColor: '#C91B70',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  howNavItemActive: {
    borderColor: HOW_IT_WORKS_PINK,
    backgroundColor: HOW_IT_WORKS_PINK,
  },
  howLabel: {
    color: HOW_IT_WORKS_PINK,
    fontFamily: BAJUJU_FONTS.semiBold,
  },
  howLabelActive: {
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.bold,
  },
  myEventsLabel: {
    color: MY_EVENTS_YELLOW,
    fontFamily: BAJUJU_FONTS.semiBold,
  },
  myEventsLabelActive: {
    color: MY_EVENTS_YELLOW,
    fontFamily: BAJUJU_FONTS.bold,
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
  howActiveIndicator: {
    backgroundColor: BAJUJU_COLORS.white,
  },
  myEventsActiveIndicator: {
    backgroundColor: MY_EVENTS_YELLOW,
  },
  pressed: {
    opacity: 0.72,
  },
});