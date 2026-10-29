import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScrollView } from '../../src/components/KeyboardAwareScrollView';
import { BajujuActionBar } from '../../src/components/BajujuActionBar';
import { GroupColorPicker, GroupColorPreview } from '../../src/components/groups/GroupColorPicker';
import { BajujuBackButton } from '../../src/components/navigation/BajujuBackButton';
import { BajujuProfileButton } from '../../src/components/navigation/BajujuProfileButton';
import { groupErrorMessage, loadMyGroupRole, saveGroupColors } from '../../src/lib/bajujuGroupBoard';
import { supabase } from '../../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../src/theme/bajujuTheme';
import { needsOutline, normalizeHexColor, resolveGroupTheme } from '../../src/utils/groupColors';

export default function GroupColorsScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const groupId = String(params.id || '').trim();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [group, setGroup] = useState<any>(null);
  const [primary, setPrimary] = useState<string | null>(null);
  const [secondary, setSecondary] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const authResult = await supabase.auth.getUser();
        const userId = authResult.data.user?.id || '';
        const [groupResult, profileResult, role] = await Promise.all([
          supabase.from('groups').select('id,name,category,city,color_primary,color_secondary').eq('id', groupId).maybeSingle(),
          userId ? supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle() : Promise.resolve({ data: null } as any),
          loadMyGroupRole(groupId).catch(() => null),
        ]);
        if (groupResult.error) throw groupResult.error;
        if (!active) return;
        setGroup(groupResult.data);
        setPrimary(normalizeHexColor(groupResult.data?.color_primary));
        setSecondary(normalizeHexColor(groupResult.data?.color_secondary));
        setAllowed(profileResult.data?.is_admin === true || role === 'owner' || role === 'admin');
      } catch (error) {
        console.log('Errore colori gruppo:', error);
        Alert.alert('Colori del gruppo', groupErrorMessage(error, 'Non sono riuscito a caricare il gruppo.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [groupId]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/group-detail' as any, params: { id: groupId } });
  }

  async function save() {
    if (saving || !allowed) return;
    setSaving(true);
    try {
      await saveGroupColors(groupId, primary, secondary);
      goBack();
    } catch (error) {
      Alert.alert('Colori non salvati', groupErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const theme = resolveGroupTheme(primary, secondary);
  const subtitle = [group?.category, group?.city].filter(Boolean).join(' · ') || 'Gruppo Bajuju';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <BajujuBackButton onPress={goBack} accessibilityLabel="Torna al gruppo" />
        <Text style={styles.title}>Colori del gruppo</Text>
        <BajujuProfileButton size={38} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={BAJUJU_COLORS.brightPink} /></View>
      ) : !allowed ? (
        <View style={styles.center}>
          <Text style={styles.notAllowed}>Solo il proprietario e gli admin del gruppo possono cambiare i colori.</Text>
        </View>
      ) : (
        <>
          <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <GroupColorPreview name={String(group?.name || '')} subtitle={subtitle} primary={primary} secondary={secondary} />
            <Text style={styles.helper}>
              Massimo due colori. Il testo sopra i colori diventa bianco o nero da solo, così si legge sempre.
            </Text>
            <GroupColorPicker
              primary={primary}
              secondary={secondary}
              onChange={(next) => {
                setPrimary(next.primary);
                setSecondary(next.secondary);
              }}
            />
          </KeyboardAwareScrollView>
          <BajujuActionBar>
            <Pressable
              style={[
                styles.saveButton,
                { backgroundColor: theme.primary },
                needsOutline(theme.primary) && styles.outline,
                saving && styles.disabled,
              ]}
              disabled={saving}
              onPress={() => { void save(); }}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator color={theme.onPrimary} />
              ) : (
                <Text style={[styles.saveText, { color: theme.onPrimary }]}>Salva colori</Text>
              )}
            </Pressable>
          </BajujuActionBar>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { flex: 1, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 22 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  notAllowed: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 15, textAlign: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  helper: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  saveButton: { flex: 1, minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: BAJUJU_FONTS.bold, fontSize: 16 },
  outline: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.14)' },
  disabled: { opacity: 0.5 },
});
