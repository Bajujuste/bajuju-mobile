import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BajujuBottomNav } from '../../src/components/navigation/BajujuBottomNav';
import { BajujuProfileButton } from '../../src/components/navigation/BajujuProfileButton';
import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../src/theme/bajujuTheme';

type GuideItem = {
  emoji?: string;
  title: string;
  text: string;
};

type GuideSection = {
  label: string;
  numbered?: boolean;
  items: GuideItem[];
};

const HIGHLIGHTS = ['🆓 Sempre gratis', '🎉 Ci si incontra davvero', '🛡️ Decidi tu'];

const SECTIONS: GuideSection[] = [
  {
    label: 'Come si inizia',
    numbered: true,
    items: [
      {
        title: 'Trova o crea',
        text: 'Dalla Home cerchi un’esperienza o ne crei una tua: luogo, data e partecipanti.',
      },
      {
        title: 'Partecipa',
        text: 'La ritrovi in I miei eventi, con scheda e chat a portata di mano.',
      },
      {
        title: 'Conserva i ricordi',
        text: 'Fino a 3 foto a testa nell’album dell’evento, visibili per 60 giorni.',
      },
    ],
  },
  {
    label: 'Dopo l’evento',
    items: [
      {
        emoji: '🤝',
        title: 'Resta in contatto',
        text: 'Con Interagisci proponi lo scambio di telefono o Telegram.',
      },
      {
        emoji: '🍝',
        title: 'Invita a cena',
        text: 'Un invito personale a chi ti è piaciuto conoscere.',
      },
    ],
  },
  {
    label: 'Sei tu a decidere',
    items: [
      {
        emoji: '✅',
        title: 'Serve sempre un sì',
        text: 'Contatti e inviti arrivano solo se l’altra persona accetta.',
      },
      {
        emoji: '🛡️',
        title: 'Blocca quando vuoi',
        text: 'Non vi vedrete più, né voi né gli eventi a cui partecipa l’altro.',
      },
    ],
  },
  {
    label: 'Altro',
    items: [
      {
        emoji: '👥',
        title: 'Crea un gruppo',
        text: 'Proponi un gruppo per interesse o città. Dopo l’approvazione chiunque può iscriversi.',
      },
      {
        emoji: '💬',
        title: 'Scrivi a Bajuju',
        text: 'Dal Profilo, in Messaggi Bajuju.',
      },
    ],
  },
];

export default function HowItWorksScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Come funziona</Text>
            <Text style={styles.subtitle}>Bajuju in un minuto</Text>
          </View>
          <BajujuProfileButton />
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Esperienze dal vivo, gratis</Text>
          <Text style={styles.heroText}>
            Aperitivi, cene, cinema, trekking, bici, vacanze e molto altro. Nessun abbonamento, nessuna commissione.
          </Text>
          <View style={styles.chips}>
            {HIGHLIGHTS.map((label) => (
              <View key={label} style={styles.chip}>
                <Text style={styles.chipText}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {SECTIONS.map((section) => (
          <View key={section.label}>
            <Text style={styles.sectionLabel}>{section.label.toUpperCase()}</Text>
            <View style={styles.group}>
              {section.items.map((item, index) => (
                <View
                  key={item.title}
                  style={[styles.row, index > 0 && styles.rowDivider]}
                >
                  {section.numbered ? (
                    <View style={styles.number}>
                      <Text style={styles.numberText}>{index + 1}</Text>
                    </View>
                  ) : (
                    <View style={styles.iconBox}>
                      <Text style={styles.emoji}>{item.emoji}</Text>
                    </View>
                  )}
                  <View style={styles.copy}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowText}>{item.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.final}>
          <Text style={styles.finalTitle}>Dal vivo è meglio.</Text>
          <Text style={styles.finalText}>Il resto si impara usandola 🙂</Text>
        </View>
      </ScrollView>

      <BajujuBottomNav active="how" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BAJUJU_COLORS.background,
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 142,
  },
  header: {
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 28,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 2,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 14,
  },
  hero: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: BAJUJU_COLORS.pink,
  },
  heroTitle: {
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 19,
  },
  heroText: {
    marginTop: 4,
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  chips: {
    marginTop: 11,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  chipText: {
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 12,
  },
  sectionLabel: {
    marginTop: 20,
    marginBottom: 7,
    marginHorizontal: 4,
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 12,
    letterSpacing: 1,
  },
  group: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.white,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: BAJUJU_COLORS.softPink,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: BAJUJU_COLORS.softPink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontFamily: 'FredokaRegular',
    fontSize: 17,
  },
  number: {
    width: 30,
    height: 30,
    marginTop: 1,
    borderRadius: 15,
    backgroundColor: BAJUJU_COLORS.plum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 14,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 16,
  },
  rowText: {
    marginTop: 2,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  final: {
    marginTop: 20,
    alignItems: 'center',
  },
  finalTitle: {
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 18,
  },
  finalText: {
    marginTop: 2,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 13,
  },
});
