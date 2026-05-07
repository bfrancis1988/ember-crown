// app/(app)/legal/terms.tsx
// Phase 9.5A3: placeholder. Phase 9.5C1 swaps in a WebView pointed at the
// real Termly URL.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function TermsScreen() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <View style={styles.center}>
        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.subtitle}>Coming in Phase 9.5C.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, paddingTop: 56, backgroundColor: 'transparent' },
  back: { paddingVertical: 8 },
  backText: { color: '#888', fontSize: 15, fontWeight: '500' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#888', fontSize: 14 },
});
