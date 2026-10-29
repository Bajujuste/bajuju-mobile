import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../theme/bajujuTheme';
import {
  colorName,
  GROUP_COLOR_PALETTE,
  GROUP_COLOR_PRESETS,
  needsOutline,
  normalizeHexColor,
  readableTextOn,
  resolveGroupTheme,
} from '../../utils/groupColors';

export function groupInitials(name: string) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'B';
  return (words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[1][0]}`).toUpperCase();
}

// Anteprima dal vivo: come apparirà l'intestazione del gruppo con i colori scelti.
export function GroupColorPreview({
  name,
  subtitle,
  primary,
  secondary,
}: {
  name: string;
  subtitle: string;
  primary: string | null;
  secondary: string | null;
}) {
  const theme = resolveGroupTheme(primary, secondary);
  const band = theme.custom ? theme.primary : BAJUJU_COLORS.softPink;
  const onBand = theme.custom ? theme.onPrimary : BAJUJU_COLORS.pink;

  return (
    <View style={styles.preview}>
      <View style={[styles.previewBand, { backgroundColor: band }]}>
        <Text style={[styles.previewBandText, { color: onBand }]} numberOfLines={1}>{subtitle.toUpperCase()}</Text>
      </View>
      <View style={[styles.previewStripe, { backgroundColor: theme.secondary }]} />
      <View style={styles.previewBody}>
        <View style={styles.previewTopRow}>
          <View style={[styles.previewLogo, { backgroundColor: theme.primary, borderColor: theme.secondary }]}>
            <Text style={[styles.previewLogoText, { color: theme.onPrimary }]}>{groupInitials(name)}</Text>
          </View>
          <View
            style={[
              styles.previewJoin,
              { backgroundColor: theme.secondary },
              needsOutline(theme.secondary) && styles.outline,
            ]}
          >
            <Text style={[styles.previewJoinText, { color: theme.onSecondary }]}>Unisciti</Text>
          </View>
        </View>
        <Text style={styles.previewName} numberOfLines={1}>{name || 'Il tuo gruppo'}</Text>
        <View style={styles.previewTabs}>
          <Text style={[styles.previewTabActive, { borderBottomColor: theme.accent }]}>Bacheca</Text>
          <Text style={styles.previewTab}>Eventi</Text>
          <Text style={styles.previewTab}>Chat</Text>
          <Text style={styles.previewTab}>Membri</Text>
        </View>
      </View>
    </View>
  );
}

type PickerProps = {
  primary: string | null;
  secondary: string | null;
  onChange: (next: { primary: string | null; secondary: string | null }) => void;
};

// Due selettori (Primario/Secondario), tavolozza di 12 colori, combinazioni pronte e colore personalizzato.
export function GroupColorPicker({ primary, secondary, onChange }: PickerProps) {
  const [slot, setSlot] = useState<'primary' | 'secondary'>('primary');
  const current = slot === 'primary' ? primary : secondary;
  const [customDraft, setCustomDraft] = useState(current || '');

  useEffect(() => {
    setCustomDraft(current || '');
  }, [current, slot]);

  function pick(hex: string | null) {
    onChange(slot === 'primary' ? { primary: hex, secondary } : { primary, secondary: hex });
  }

  const customValid = normalizeHexColor(customDraft);

  return (
    <View style={styles.picker}>
      <View style={styles.slotRow}>
        {(['primary', 'secondary'] as const).map((key) => {
          const value = key === 'primary' ? primary : secondary;
          const selected = slot === key;
          return (
            <Pressable
              key={key}
              style={[styles.slot, selected && styles.slotSelected]}
              onPress={() => setSlot(key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <View
                style={[
                  styles.slotDot,
                  { backgroundColor: value || BAJUJU_COLORS.pink },
                  (!value || needsOutline(value)) && styles.outline,
                ]}
              />
              <View style={styles.slotCopy}>
                <Text style={styles.slotLabel}>{key === 'primary' ? 'Primario' : 'Secondario'}</Text>
                <Text style={styles.slotValue} numberOfLines={1}>{colorName(value)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.palette}>
        {GROUP_COLOR_PALETTE.map((item) => {
          const selected = current === item.hex;
          return (
            <Pressable
              key={item.hex}
              style={[styles.swatch, selected && styles.swatchSelected]}
              onPress={() => pick(item.hex)}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              accessibilityState={{ selected }}
            >
              <View style={[styles.swatchDot, { backgroundColor: item.hex }, needsOutline(item.hex) && styles.outline]}>
                {selected ? (
                  <Ionicons name="checkmark" size={16} color={readableTextOn(item.hex)} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Combinazioni pronte</Text>
      <View style={styles.presets}>
        {GROUP_COLOR_PRESETS.map((preset) => {
          const selected = primary === preset.primary && secondary === preset.secondary;
          return (
            <Pressable
              key={preset.name}
              style={[styles.preset, selected && styles.presetSelected]}
              onPress={() => onChange({ primary: preset.primary, secondary: preset.secondary })}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <View style={styles.presetDots}>
                <View style={[styles.presetDot, { backgroundColor: preset.primary }, styles.outline]} />
                <View style={[styles.presetDot, styles.presetDotSecond, { backgroundColor: preset.secondary }, styles.outline]} />
              </View>
              <Text style={styles.presetText}>{preset.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Colore personalizzato ({slot === 'primary' ? 'primario' : 'secondario'})</Text>
      <View style={styles.customRow}>
        <View style={[styles.customDot, { backgroundColor: customValid || '#FFFFFF' }, styles.outline]} />
        <TextInput
          value={customDraft}
          onChangeText={(value) => setCustomDraft(value.replace(/[^#0-9a-fA-F]/g, '').slice(0, 7))}
          placeholder="#1E8FE1"
          placeholderTextColor={BAJUJU_COLORS.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.customInput}
          maxLength={7}
        />
        <Pressable
          style={[styles.customApply, !customValid && styles.disabled]}
          disabled={!customValid}
          onPress={() => pick(customValid)}
          accessibilityRole="button"
        >
          <Text style={styles.customApplyText}>Usa</Text>
        </Pressable>
      </View>
      <Text style={styles.helper}>Scrivi il codice del colore, per esempio quello della maglia o del logo.</Text>

      {primary || secondary ? (
        <Pressable
          style={styles.resetButton}
          onPress={() => onChange({ primary: null, secondary: null })}
          accessibilityRole="button"
        >
          <Text style={styles.resetText}>Usa i colori standard di Bajuju</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  outline: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.14)' },
  disabled: { opacity: 0.45 },
  preview: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: BAJUJU_COLORS.line, backgroundColor: BAJUJU_COLORS.white },
  previewBand: { height: 84, paddingHorizontal: 16, paddingTop: 12 },
  previewBandText: { fontFamily: BAJUJU_FONTS.semiBold, fontSize: 11, letterSpacing: 0.6 },
  previewStripe: { height: 7 },
  previewBody: { paddingHorizontal: 16, paddingBottom: 12 },
  previewTopRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: -30 },
  previewLogo: { width: 58, height: 58, borderRadius: 16, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  previewLogoText: { fontFamily: BAJUJU_FONTS.bold, fontSize: 18 },
  previewJoin: { marginLeft: 'auto', minHeight: 34, paddingHorizontal: 16, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  previewJoinText: { fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },
  previewName: { marginTop: 8, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 17 },
  previewTabs: { flexDirection: 'row', gap: 16, marginTop: 8 },
  previewTab: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13, paddingBottom: 5 },
  previewTabActive: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13, paddingBottom: 5, borderBottomWidth: 3 },
  picker: { gap: 12 },
  slotRow: { flexDirection: 'row', gap: 10 },
  slot: { flex: 1, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, backgroundColor: BAJUJU_COLORS.white },
  slotSelected: { borderColor: BAJUJU_COLORS.plum, borderWidth: 2 },
  slotDot: { width: 30, height: 30, borderRadius: 15 },
  slotCopy: { flex: 1, minWidth: 0 },
  slotLabel: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 11 },
  slotValue: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 14 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: '14.6%', aspectRatio: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.white, borderWidth: 1, borderColor: BAJUJU_COLORS.palePink },
  swatchSelected: { borderColor: BAJUJU_COLORS.plum, borderWidth: 2 },
  swatchDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { marginTop: 4, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 8, paddingRight: 12, borderRadius: 19, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, backgroundColor: BAJUJU_COLORS.white },
  presetSelected: { borderColor: BAJUJU_COLORS.plum },
  presetDots: { flexDirection: 'row' },
  presetDot: { width: 18, height: 18, borderRadius: 9 },
  presetDotSecond: { marginLeft: -6 },
  presetText: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customDot: { width: 36, height: 36, borderRadius: 18 },
  customInput: { flex: 1, minHeight: 48, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, color: BAJUJU_COLORS.plum, backgroundColor: BAJUJU_COLORS.white, fontFamily: BAJUJU_FONTS.medium, fontSize: 15 },
  customApply: { minHeight: 48, paddingHorizontal: 18, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  customApplyText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  helper: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  resetButton: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  resetText: { color: BAJUJU_COLORS.pink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13, textDecorationLine: 'underline' },
});
