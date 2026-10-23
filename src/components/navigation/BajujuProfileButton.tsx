import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';

import { supabase } from '../../lib/supabase';
import { BAJUJU_COLORS } from '../../theme/bajujuTheme';
import { BajujuIcon } from '../icons/BajujuIcon';

// Foto condivisa tra tutte le schermate: il pallino compare subito senza aspettare la query.
let cachedPhotoUrl = '';
let cachedSignedIn = false;
let pendingLoad: Promise<string> | null = null;

async function loadProfilePhoto() {
  if (!pendingLoad) {
    pendingLoad = (async () => {
      try {
        const sessionResult = await supabase.auth.getSession();
        const userId = sessionResult.data.session?.user?.id;
        cachedSignedIn = Boolean(userId);
        if (!userId) {
          cachedPhotoUrl = '';
          return '';
        }

        // Il profilo salva sempre la foto anche in avatar_url (vedi profile.tsx).
        const result = await supabase.from('profiles').select('avatar_url').eq('id', userId).maybeSingle();
        if (result.error) return cachedPhotoUrl;

        cachedPhotoUrl = String(result.data?.avatar_url || '').trim();
        return cachedPhotoUrl;
      } catch {
        return cachedPhotoUrl;
      } finally {
        pendingLoad = null;
      }
    })();
  }

  return pendingLoad;
}

type BajujuProfileButtonProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function BajujuProfileButton({ size = 42, style }: BajujuProfileButtonProps) {
  const [photoUrl, setPhotoUrl] = useState(cachedPhotoUrl);
  const [signedIn, setSignedIn] = useState(cachedSignedIn);

  // Si ricarica a ogni ritorno sulla schermata, così una foto cambiata nel Profilo si vede subito.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadProfilePhoto().then((url) => {
        if (!active) return;
        setPhotoUrl(url);
        setSignedIn(cachedSignedIn);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  // Regole e privacy si aprono anche prima dell'accesso: lì il pallino non serve.
  if (!signedIn) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Apri il profilo"
      hitSlop={6}
      onPress={() => router.push('/profile' as any)}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && styles.pressed,
        style,
      ]}
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} resizeMode="cover" style={styles.photo} />
      ) : (
        <BajujuIcon name="person" size={Math.round(size * 0.5)} color={BAJUJU_COLORS.pink} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.white,
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.pink,
  },
  photo: {
    width: '100%',
    height: '100%',
    backgroundColor: BAJUJU_COLORS.softPink,
  },
  pressed: {
    opacity: 0.72,
  },
});
