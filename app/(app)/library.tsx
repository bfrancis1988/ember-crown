// app/(app)/library.tsx
// Phase 4.5: Card Library browser. Phase 6 added ?mode=craft. Phase 9
// Session 2: extracted body into CraftTab so /forge can render the same
// content. This route stays live for backwards compat — same UX whether
// reached directly or as a deep link.

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWalletAndCanSummon } from '../../src/hooks/useWalletAndCanSummon';
import { CraftTab } from '../../src/components/forge/CraftTab';

export default function CardLibraryScreen() {
  const router = useRouter();
  const { mode: rawMode } = useLocalSearchParams<{ mode?: string }>();
  const mode: 'browse' | 'craft' = rawMode === 'craft' ? 'craft' : 'browse';
  const { wallet } = useWalletAndCanSummon();

  const dustAvailable = wallet?.dust ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>{mode === 'craft' ? 'Craft' : 'Card Library'}</Text>
        {mode === 'craft' ? (
          <View style={styles.dustPill}>
            <Text style={styles.dustPillText}>✨ {dustAvailable}</Text>
          </View>
        ) : (
          <View style={styles.topBarRightSpacer} />
        )}
      </View>

      <CraftTab mode={mode} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  backButton: { paddingHorizontal: 8, paddingVertical: 4 },
  backText: { color: '#ddd', fontSize: 22, fontWeight: '500' },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  topBarRightSpacer: { width: 40 },
  dustPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#d4a04a',
  },
  dustPillText: { color: '#d4a04a', fontSize: 13, fontWeight: '700' },
});
