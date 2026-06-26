import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function HiddenRedirectScreen() {
  useEffect(() => {
    router.replace('/');
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.box}>
        <ActivityIndicator color="#e43f98" />
        <Text style={styles.text}>Apro Bajuju...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff8fb',
  },
  box: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  text: {
    marginTop: 12,
    color: '#e43f98',
    fontSize: 15,
    fontWeight: '900',
  },
});
