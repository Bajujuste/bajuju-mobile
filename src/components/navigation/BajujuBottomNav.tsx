import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../theme/bajujuTheme';
import {
  BajujuIcon,
  BajujuIconName,
} from '../icons/BajujuIcon';

type NavKey = 'home' | 'find' | 'how' | 'groups' | 'create' | 'myEvents' | 'flash' | 'profile';

type BajujuBottomNavProps = {
  active: NavKey;
};

const HOW_IT_WORKS_PINK = '#F32189';
const MY_EVENTS_PETROL = '#168C9E';

const ITEMS: {
  key: Exclude<NavKey, 'flash' | 'find' | 'profile'>;
  label: string;
  icon: BajujuIconName;
  activeIcon: BajujuIconName;
  route: '/home' | '/how-it-works' | '/create-experience' | '/my-events' | '/create-group';
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
    key: 'create',
    label: 'Crea',
    icon: 'plus',
    activeIcon: 'plus',
    route: '/create-experience',
  },
  {
    key: 'myEvents',
    label: 'I miei eventi',
    icon: 'calendar',
    activeIcon: 'calendar',
    route: '/my-events',
  },
  {
    key: 'groups',
    label: 'Crea gruppo',
    icon: 'group',
    activeIcon: 'group',
    route: '/create-group',
  },
];

const NAV_HEIGHT = 80;

function navBottomOffset(insetBottom: number) {
  return Math.max(12, insetBottom + 6);
}

// Spazio occupato dalla barra di navigazione (0 con la tastiera aperta, quando è nascosta).
export function useBajujuBottomNavSpace() {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  return keyboardVisible ? 0 : navBottomOffset(insets.bottom) + NAV_HEIGHT;
}

export function BajujuBottomNav({ active }: BajujuBottomNavProps) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();

  // Con la tastiera aperta la barra coprirebbe i campi: la nascondiamo finché si scrive.
  if (keyboardVisible) return null;

  return (
    <View
      style={[
        styles.bottomNav,
        { bottom: navBottomOffset(insets.bottom) },
      ]}
    >
      {ITEMS.map((item) => {
        const selected = item.key === active;
        const color = item.key === 'how'
          ? HOW_IT_WORKS_PINK
          : item.key === 'myEvents'
            ? MY_EVENTS_PETROL
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
            style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}
          >
            {item.key === 'create' ? (
              <View style={styles.createButton}>
                <BajujuIcon name="plus" size={34} color={BAJUJU_COLORS.white} />
              </View>
            ) : (
              <>
                <BajujuIcon name={selected ? item.activeIcon : item.icon} size={25} color={color} />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={[
                    styles.navLabel,
                    item.key === 'how' && styles.howLabel,
                    item.key === 'myEvents' && styles.myEventsLabel,
                    selected && styles.navLabelActive,
                    selected && item.key !== 'how' && item.key !== 'myEvents' && { color: BAJUJU_COLORS.brightPink },
                  ]}
                >
                  {item.label}
                </Text>
                {selected ? (
                  <View
                    style={[
                      styles.activeIndicator,
                      item.key === 'myEvents' && styles.myEventsActiveIndicator,
                    ]}
                  />
                ) : null}
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    height: 80,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.white,
    shadowColor: '#761046',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -2 },
    elevation: 10,
  },
  navItem: {
    position: 'relative',
    flex: 1,
    height: 72,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  createButton: {
    width: 60,
    height: 60,
    marginTop: -28,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2FAE66',
    shadowColor: '#2FAE66',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  navLabel: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 12,
    textAlign: 'center',
  },
  howLabel: {
    color: HOW_IT_WORKS_PINK,
  },
  myEventsLabel: {
    color: MY_EVENTS_PETROL,
  },
  navLabelActive: {
    fontFamily: BAJUJU_FONTS.semiBold,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 2,
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: BAJUJU_COLORS.brightPink,
  },
  myEventsActiveIndicator: {
    backgroundColor: MY_EVENTS_PETROL,
  },
  pressed: {
    opacity: 0.72,
  },
});
