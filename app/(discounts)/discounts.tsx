import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { KeyboardAwareScrollView } from '../../src/components/KeyboardAwareScrollView';
import { BajujuBackButton } from '../../src/components/navigation/BajujuBackButton';
import { BajujuBottomNav } from '../../src/components/navigation/BajujuBottomNav';
import { BajujuProfileButton } from '../../src/components/navigation/BajujuProfileButton';
import { type BajujuDiscount, loadBajujuDiscounts, openDiscountInMaps } from '../../src/lib/bajujuDiscounts';
import { supabase } from '../../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../../src/theme/bajujuTheme';

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export default function DiscountsScreen() {
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [discounts, setDiscounts] = useState<BajujuDiscount[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState('');

  // Si ricarica a ogni ritorno, così un negozio appena aggiunto o modificato si vede subito.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const [list, admin] = await Promise.all([
            loadBajujuDiscounts(),
            supabase.rpc('is_current_user_admin' as any).then((result) => !result.error && result.data === true, () => false),
          ]);
          if (!active) return;
          setDiscounts(list);
          setIsAdmin(admin);
          setErrorText('');
        } catch {
          if (active) setErrorText('Non riesco a caricare gli sconti. Riprova tra poco.');
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  // Cerca per nome del negozio (più parole: devono esserci tutte).
  const visibleDiscounts = useMemo(() => {
    const words = normalize(search).split(/\s+/).filter(Boolean);
    if (words.length === 0) return discounts;
    return discounts.filter((item) => {
      const name = normalize(item.name);
      return words.every((word) => name.includes(word));
    });
  }, [discounts, search]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <BajujuBackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
          <Text style={styles.title}>Sconti</Text>
          <BajujuProfileButton />
        </View>

        <Text style={styles.subtitle}>Mostra l’app Bajuju in questi negozi per avere lo sconto.</Text>

        {isAdmin ? (
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            onPress={() => router.push('/edit-discount' as any)}
            accessibilityRole="button"
            accessibilityLabel="Aggiungi negozio"
          >
            <Ionicons name="add" size={20} color={BAJUJU_COLORS.white} />
            <Text style={styles.addButtonText}>Aggiungi negozio</Text>
          </Pressable>
        ) : null}

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={BAJUJU_COLORS.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cerca negozio per nome"
            placeholderTextColor={BAJUJU_COLORS.muted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Cancella ricerca">
              <Ionicons name="close-circle" size={18} color={BAJUJU_COLORS.muted} />
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={BAJUJU_COLORS.pink} />
          </View>
        ) : errorText ? (
          <Text style={styles.emptyText}>{errorText}</Text>
        ) : visibleDiscounts.length === 0 ? (
          <Text style={styles.emptyText}>
            {discounts.length === 0 ? 'Ancora nessun negozio.' : 'Nessun negozio con questo nome.'}
          </Text>
        ) : (
          visibleDiscounts.map((item) => (
            <View key={item.id} style={styles.card}>
              {item.photoUrl ? (
                <Image source={{ uri: item.photoUrl }} style={styles.photo} resizeMode="cover" />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]}>
                  <Ionicons name="pricetag-outline" size={34} color={BAJUJU_COLORS.pink} />
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.name}>{item.name}</Text>
                <View style={styles.discountPill}>
                  <Ionicons name="pricetag" size={15} color={BAJUJU_COLORS.pink} />
                  <Text style={styles.discountText}>{item.discountText}</Text>
                </View>
                {item.formattedAddress || item.city ? (
                  <Pressable
                    style={({ pressed }) => [styles.addressBox, pressed && styles.pressed]}
                    onPress={() => openDiscountInMaps(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Apri ${item.name} in Maps`}
                  >
                    <Ionicons name="location-outline" size={20} color={BAJUJU_COLORS.pink} />
                    <View style={styles.addressCopy}>
                      <Text style={styles.addressText}>{item.formattedAddress || item.city}</Text>
                      <Text style={styles.addressAction}>Apri in Maps</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={BAJUJU_COLORS.pink} />
                  </Pressable>
                ) : null}
                {isAdmin ? (
                  <Pressable
                    style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
                    onPress={() => router.push({ pathname: '/edit-discount' as any, params: { id: item.id } })}
                    accessibilityRole="button"
                  >
                    <Text style={styles.editButtonText}>Modifica</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))
        )}
      </KeyboardAwareScrollView>
      <BajujuBottomNav active="home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  container: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 130 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 26 },
  subtitle: { marginTop: 10, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 15, lineHeight: 21 },
  addButton: {
    marginTop: 14,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: BAJUJU_COLORS.pink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addButtonText: { color: BAJUJU_COLORS.white, fontFamily: BAJUJU_FONTS.bold, fontSize: 16 },
  searchBox: {
    marginTop: 14,
    marginBottom: 6,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.white,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 16, paddingVertical: 10 },
  center: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { marginTop: 30, textAlign: 'center', color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 15, lineHeight: 21 },
  card: {
    marginTop: 14,
    borderRadius: 22,
    backgroundColor: BAJUJU_COLORS.white,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.line,
    overflow: 'hidden',
    ...BAJUJU_SHADOW,
  },
  photo: { width: '100%', aspectRatio: 16 / 9, backgroundColor: BAJUJU_COLORS.softPink },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 14, gap: 10 },
  name: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 20 },
  discountPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: BAJUJU_COLORS.softPink,
    maxWidth: '100%',
  },
  discountText: { flexShrink: 1, color: BAJUJU_COLORS.pink, fontFamily: BAJUJU_FONTS.bold, fontSize: 16 },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.backgroundSoft,
  },
  addressCopy: { flex: 1 },
  addressText: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 19 },
  addressAction: { marginTop: 2, color: BAJUJU_COLORS.pink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13 },
  editButton: {
    minHeight: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: { color: BAJUJU_COLORS.pink, fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  pressed: { opacity: 0.75 },
});
