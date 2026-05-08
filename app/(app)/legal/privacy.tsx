// app/(app)/legal/privacy.tsx
// Phase 9.5C1: WebView pointing at the Termly-hosted privacy policy.
// Brad replaces the placeholder URL with the real Termly URL once the
// account is provisioned (Phase 10 final step verifies before submission).

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';

// TODO Brad (Phase 10): replace with the real Termly URL after account setup.
const PRIVACY_URL =
  'https://app.termly.io/policy-viewer/policy.html?policyUUID=00000000-0000-0000-0000-000000000000';

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Privacy Policy</Text>
        <View style={styles.spacer} />
      </View>
      <WebView
        source={{ uri: PRIVACY_URL }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color="#d4a04a" />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  backText: { color: '#888', fontSize: 15, fontWeight: '500', minWidth: 60 },
  title: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  spacer: { minWidth: 60 },
  loading: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
});
