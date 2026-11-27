import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { LEGAL_VERSION, LEGAL_VERSION_LABEL, type LegalDocument } from '../../legal/legalContent';
import { BajujuBackButton } from '../navigation/BajujuBackButton';
import { BajujuProfileButton } from '../navigation/BajujuProfileButton';

type Props = {
  document: LegalDocument;
};

function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

export function LegalDocumentScreen({ document }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.topRow}>
        <BajujuBackButton onPress={goBack} accessibilityLabel="Indietro" style={{ alignSelf: 'flex-start' }} />
        <BajujuProfileButton />
      </View>

      <View style={styles.card}>
        <Text style={styles.kicker}>Bajuju</Text>
        <Text style={styles.title} accessibilityRole="header">{document.title}</Text>
        <Text style={styles.subtitle}>{document.subtitle}</Text>
        <Text style={styles.updated}>
          Ultimo aggiornamento: {LEGAL_VERSION_LABEL} · versione {LEGAL_VERSION}
        </Text>

        {document.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">{section.title}</Text>
            {section.blocks.map((block, blockIndex) =>
              Array.isArray(block) ? (
                <View key={`${section.title}-${blockIndex}`} style={styles.list}>
                  {block.map((item, itemIndex) => (
                    <View key={`${section.title}-${blockIndex}-${itemIndex}`} style={styles.listItem}>
                      <Text style={styles.bullet}>•</Text>
                      <Text style={[styles.text, styles.listText]}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text key={`${section.title}-${blockIndex}`} style={[styles.text, styles.paragraph]}>
                  {block}
                </Text>
              )
            )}
          </View>
        ))}

        <TouchableOpacity style={styles.button} onPress={goBack}>
          <Text style={styles.buttonText}>Torna indietro</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  page: {
    flexGrow: 1,
    backgroundColor: '#FFF9FC',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#F3C6DC',
  },
  kicker: {
    color: '#E43F98',
    fontFamily: 'FredokaBold',
    fontSize: 14,
    marginBottom: 8,
  },
  title: {
    color: '#E43F98',
    fontSize: 28,
    fontFamily: 'FredokaBold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#4B0C2D',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'FredokaBold',
    marginBottom: 8,
  },
  updated: {
    color: '#8a3a5a',
    fontFamily: 'FredokaRegular',
    fontSize: 13,
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#4B0C2D',
    fontSize: 17,
    fontFamily: 'FredokaBold',
    marginBottom: 8,
  },
  paragraph: {
    marginBottom: 8,
  },
  list: {
    marginBottom: 8,
    gap: 6,
  },
  listItem: {
    flexDirection: 'row',
    gap: 8,
  },
  bullet: {
    color: '#E43F98',
    fontFamily: 'FredokaBold',
    fontSize: 15,
    lineHeight: 22,
  },
  listText: {
    flex: 1,
  },
  text: {
    color: '#4B0C2D',
    fontFamily: 'FredokaRegular',
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#E43F98',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontFamily: 'FredokaBold',
  },
});
