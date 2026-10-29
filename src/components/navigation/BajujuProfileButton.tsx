import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';

import { supabase } from '../../lib/supabase';
import { BAJUJU_COLORS } from '../../theme/bajujuTheme';
import { BajujuIcon } from '../icons/BajujuIcon';
import { BajujuAdminRing } from '../profile/BajujuAdminRing';

// Foto condivisa tra tutte le schermate: il pallino compare subito senza aspettare la query.
let cachedPhotoUrl = '';
let cachedSignedIn = false;
let cachedIsAdmin = false;
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
          cachedIsAdmin = false;
          return '';
        }

        // Il profilo salva sempre la foto anche in avatar_url (vedi profile.tsx).
        const result = await supabase.from('profiles').select('avatar_url,is_admin').eq('id', userId).maybeSingle();
        if (result.error) return cachedPhotoUrl;

        cachedIsAdmin = result.data?.is_admin === true;
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
  const [isAdmin, setIsAdmin] = useState(cachedIsAdmin);

  // Si ricarica a ogni ritorno sulla schermata, così una foto cambiata nel Profilo si vede subito.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadProfilePhoto().then((url) => {
        if (!active) return;
        setPhotoUrl(url);
        setSignedIn(cachedSignedIn);
        setIsAdmin(cachedIsAdmin);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  // Regole e privacy si aprono anche prima dell'accesso: lì il pallino non serve.
  if (!signedIn) return null;

  // Per l'admin la foto si stringe un po', così col cerchio oro non diventa enorme.
  const photoSize = isAdmin ? size - 8 : size;

  return (
    <BajujuAdminRing size={photoSize} isAdmin={isAdmin} style={isAdmin ? style : undefined}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Apri il profilo"
        hitSlop={6}
        onPress={() => router.push('/profile' as any)}
        style={({ pressed }) => [
          styles.button,
          { width: photoSize, height: photoSize, borderRadius: photoSize / 2 },
          isAdmin && styles.buttonAdmin,
          pressed && styles.pressed,
          !isAdmin && style,
        ]}
      >
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} resizeMode="cover" style={styles.photo} />
        ) : (
          <BajujuIcon name="person" size={Math.round(photoSize * 0.5)} color={BAJUJU_COLORS.pink} />
        )}
      </Pressable>
    </BajujuAdminRing>
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
  buttonAdmin: {
    borderColor: BAJUJU_COLORS.white,
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
