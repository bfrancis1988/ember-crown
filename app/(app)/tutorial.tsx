// app/(app)/tutorial.tsx
// Pre-tutorial intro screen. Two CTAs:
//   - "Begin Tutorial" → initializeNewMatch({mode:'tutorial'}) → /match/:id
//   - "Skip Tutorial"  → completeTutorial({skipped:true}) → /home
// Defensive: if profile.tutorial_completed === true, redirect to /home.

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../src/lib/firebase';
import { Analytics } from '../../src/lib/analytics';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';
import type { InitializeNewMatchResult } from '../../src/types/matchActions';

type CompleteTutorialResult = {
  success: true;
  coins_earned: number;
  shards_earned: number;
  skipped: boolean;
};

export default function TutorialScreen() {
  const router = useRouter();
  const { profile, isLoading } = usePlayerProfile();

  const [isInitializing, setIsInitializing] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  // Defensive: tutorial is one-time. If somehow re-entered, bounce home.
  useEffect(() => {
    if (!isLoading && profile?.tutorial_completed) {
      router.replace('/home');
    }
  }, [isLoading, profile?.tutorial_completed, router]);

  const handleBegin = async () => {
    setIsInitializing(true);
    try {
      const fn = httpsCallable<{ mode: 'tutorial' }, InitializeNewMatchResult>(
        functions,
        'initializeNewMatch',
      );
      const result = await fn({ mode: 'tutorial' });
      router.replace(`/match/${result.data.match_id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not start tutorial', msg);
      setIsInitializing(false);
    }
  };

  const confirmSkip = async () => {
    setIsSkipping(true);
    try {
      const fn = httpsCallable<{ skipped: boolean }, CompleteTutorialResult>(
        functions,
        'completeTutorial',
      );
      await fn({ skipped: true });
      Analytics.tutorialComplete();
      router.replace('/home');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not skip tutorial', msg);
      setIsSkipping(false);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Tutorial?',
      'You can still claim your starting rewards. The tutorial will not be available again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip', style: 'destructive', onPress: confirmSkip },
      ],
    );
  };

  const isBusy = isInitializing || isSkipping;

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.eyebrow}>Tutorial</Text>
        <Text style={styles.heading}>Welcome, Commander.</Text>
        <Text style={styles.body}>
          Learn the art of command in three rounds of guided combat.
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, isBusy && styles.disabled]}
          onPress={handleBegin}
          disabled={isBusy}
        >
          {isInitializing ? (
            <ActivityIndicator color="#111" />
          ) : (
            <Text style={styles.primaryButtonText}>Begin Tutorial</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, isBusy && styles.disabled]}
          onPress={handleSkip}
          disabled={isBusy}
        >
          {isSkipping ? (
            <ActivityIndicator color="#888" />
          ) : (
            <Text style={styles.secondaryButtonText}>Skip Tutorial</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.howToPlayLink}
          onPress={() => router.push('/how-to-play')}
          disabled={isBusy}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.howToPlayLinkText}>
            New to CCGs? Read the rules first.
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 24,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyebrow: {
    color: '#666',
    fontSize: 12,
    letterSpacing: 3,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: 16,
  },
  heading: {
    color: '#f5e7c2',
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 14,
  },
  body: {
    color: '#bbb',
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: 36,
    paddingHorizontal: 8,
  },
  primaryButton: {
    width: '100%',
    maxWidth: 320,
    height: 54,
    borderRadius: 10,
    backgroundColor: '#d4a04a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#111',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#888',
    fontSize: 14,
  },
  howToPlayLink: {
    marginTop: 24,
    paddingVertical: 8,
    alignItems: 'center',
  },
  howToPlayLinkText: {
    color: '#666',
    fontSize: 13,
    fontStyle: 'italic',
  },
  disabled: {
    opacity: 0.5,
  },
});
