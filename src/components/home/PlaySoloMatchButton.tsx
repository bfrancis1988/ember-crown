// src/components/home/PlaySoloMatchButton.tsx
// Home-screen "Play Solo Match" section. Reads the player's profile + active
// deck via useCanStartMatch, renders a status block and a primary button that
// kicks off initializeNewMatch and navigates into the match board on success.

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { Analytics, fireOnceAnalyticsEvent } from '../../lib/analytics';
import { useAuth } from '../../contexts/AuthContext';
import { FACTIONS } from '../../lib/factions';
import { useCanStartMatch } from '../../hooks/useCanStartMatch';
import type { CommanderEntry } from '../../types/commander';
import type { InitializeNewMatchResult } from '../../types/matchActions';

const DEFAULT_ACCENT = '#d4a04a';

export function PlaySoloMatchButton() {
  const router = useRouter();
  const { user } = useAuth();
  const { readiness, profile, deckSize } = useCanStartMatch();
  const [commanderName, setCommanderName] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // One-time read of the commander's display name. Mirrors home.tsx's
  // approach so a Phase-4 useCommander hook can later replace both.
  useEffect(() => {
    const id = profile?.selected_commander;
    if (!id) {
      setCommanderName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'commander_library', id));
        if (cancelled) return;
        if (snap.exists()) {
          setCommanderName((snap.data() as CommanderEntry).name);
        } else {
          setCommanderName(id);
        }
      } catch {
        if (!cancelled) setCommanderName(id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.selected_commander]);

  const factionMeta = profile?.active_faction
    ? FACTIONS.find((f) => f.id === profile.active_faction)
    : undefined;
  const accent = factionMeta?.color ?? DEFAULT_ACCENT;

  async function handleStartMatch() {
    setIsStarting(true);
    try {
      const fn = httpsCallable<Record<string, never>, InitializeNewMatchResult>(
        functions,
        'initializeNewMatch'
      );
      const result = await fn({});
      if (user) {
        fireOnceAnalyticsEvent(user.uid, 'first_match:solo', () =>
          Analytics.firstMatch('solo'),
        ).catch(() => {/* best-effort */});
      }
      router.push(`/match/${result.data.match_id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not start match', msg);
    } finally {
      setIsStarting(false);
    }
  }

  const isReady = readiness.ready;
  const buttonDisabled = !isReady || isStarting;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Solo Match</Text>

      <View style={styles.statusBlock}>
        {readiness.ready ? (
          <>
            <Text style={[styles.statusLine, { color: accent }]}>
              ✓ {factionMeta?.name ?? profile?.active_faction}
            </Text>
            <Text style={styles.statusSub}>
              {commanderName ?? profile?.selected_commander ?? '...'} commanding
            </Text>
            <Text style={styles.statusSub}>{deckSize} / 15 cards ready</Text>
          </>
        ) : readiness.reason === 'loading' ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#888" size="small" />
            <Text style={styles.statusSub}>Loading...</Text>
          </View>
        ) : (
          <>
            <Text style={styles.unavailableHeader}>Match unavailable</Text>
            <Text style={styles.statusSub}>{readinessCopy(readiness)}</Text>
          </>
        )}
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: isReady ? accent : '#2a2a2a' },
          pressed && isReady && styles.primaryButtonPressed,
          buttonDisabled && styles.primaryButtonDisabled,
        ]}
        onPress={handleStartMatch}
        disabled={buttonDisabled}
      >
        {isStarting ? (
          <ActivityIndicator color="#111" />
        ) : (
          <Text
            style={[
              styles.primaryButtonText,
              { color: isReady ? '#111' : '#666' },
            ]}
          >
            ⚔ Play Solo Match
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function readinessCopy(
  r: Exclude<ReturnType<typeof useCanStartMatch>['readiness'], { ready: true } | { reason: 'loading' }>
): string {
  switch (r.reason) {
    case 'no_faction':
      return 'Choose a faction to begin.';
    case 'no_commander':
      return 'Choose a commander to begin.';
    case 'incomplete_onboarding':
      return 'Complete onboarding first.';
    case 'wrong_deck_size':
      return `Build a 15-card deck. Currently ${r.current}/15. Deck builder coming soon.`;
  }
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'stretch',
    marginTop: 16,
  },
  sectionTitle: {
    color: '#666',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    textAlign: 'center',
  },
  statusBlock: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
    alignItems: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusLine: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  statusSub: {
    color: '#bbb',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  unavailableHeader: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  primaryButton: {
    height: 52,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
