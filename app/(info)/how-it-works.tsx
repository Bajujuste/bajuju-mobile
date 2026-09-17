import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BajujuBottomNav } from '../../src/components/navigation/BajujuBottomNav';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../../src/theme/bajujuTheme';

type GuideItem = {
  emoji: string;
  title: string;
  text: string;
};

const ITEMS: GuideItem[] = [
  {
    emoji: '🎉',
    title: 'Cos’è Bajuju',
    text: 'Un’app per organizzare e vivere esperienze dal vivo: aperitivi, cene, cinema, trekking, bici, vacanze e molto altro.',
  },
  {
    emoji: '🆓',
    title: 'È gratis',
    text: 'Creare un evento non costa nulla. Chi partecipa non ha abbonamenti, commissioni o limiti a pagamento.',
  },
  {
    emoji: '🔎',
    title: 'Trova o crea',
    text: 'Dalla Home puoi cercare esperienze già pubblicate oppure crearne una tua, scegliendo luogo, data e partecipanti.',
  },
  {
    emoji: '👥',
    title: 'Crea il tuo gruppo',
    text: 'Tutti possono proporre un gruppo per interesse o città. Bajuju lo controlla e, dopo l’approvazione, gli utenti possono iscriversi e seguirne gli eventi.',
  },
  {
    emoji: '📸',
    title: 'Foto e ricordi',
    text: 'Chi partecipa può aggiungere fino a 3 foto all’album dell’evento. I ricordi restano disponibili per 60 giorni.',
  },
  {
    emoji: '🤝',
    title: 'Resta in contatto',
    text: 'Dopo un evento puoi usare Interagisci per proporre lo scambio di telefono o Telegram. L’altra persona decide sempre se accettare.',
  },
  {
    emoji: '🍝',
    title: 'Invita a cena',
    text: 'Se vi siete trovati particolarmente bene, puoi inviare un invito personale. Anche questo può essere accettato o rifiutato.',
  },
  {
    emoji: '🛡️',
    title: 'Blocca quando vuoi',
    text: 'Puoi bloccare un utente in qualsiasi momento. Da quel momento non potrà più contattarti su Bajuju.',
  },
  {
    emoji: '📅',
    title: 'I tuoi eventi',
    text: 'In I miei eventi ritrovi subito quelli in corso, i prossimi e quelli già vissuti, con accesso rapido alla scheda e alla chat.',
  },
  {
    emoji: '💬',
    title: 'Scrivi a Bajuju',
    text: 'Dal Profilo puoi usare Messaggi Bajuju per parlare direttamente con l’amministratore dell’app.',
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
          <Text style={styles.eyebrow}>BAJUJU IN 1 MINUTO</Text>
          <Text style={styles.title}>Come funziona</Text>
          <Text style={styles.subtitle}>
            Poche cose da sapere per iniziare subito.
          </Text>
        </View>

        <View style={styles.list}>
          {ITEMS.map((item) => (
            <View key={item.title} style={styles.card}>
              <View style={styles.iconBox}>
                <Text style={styles.emoji}>{item.emoji}</Text>
              </View>
              <View style={styles.copy}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardText}>{item.text}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.finalCard}>
          <Text style={styles.finalTitle}>Dal vivo è meglio.</Text>
          <Text style={styles.finalText}>
            Il resto si impara usandola. 🙂
          </Text>
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
    padding: 22,
    marginBottom: 14,
    borderRadius: 29,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: '#fff',
    ...BAJUJU_SHADOW,
  },
  eyebrow: {
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 11,
    letterSpacing: 1,
  },
  title: {
    marginTop: 3,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 34,
    letterSpacing: -0.7,
  },
  subtitle: {
    marginTop: 5,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 14,
  },
  list: {
    gap: 10,
  },
  card: {
    minHeight: 94,
    padding: 14,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 19,
    backgroundColor: BAJUJU_COLORS.softPink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 25,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 17,
  },
  cardText: {
    marginTop: 3,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  finalCard: {
    marginTop: 14,
    padding: 20,
    borderRadius: 24,
    alignItems: 'center',
    backgroundColor: BAJUJU_COLORS.softPink,
  },
  finalTitle: {
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 20,
  },
  finalText: {
    marginTop: 4,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 13,
  },
});
