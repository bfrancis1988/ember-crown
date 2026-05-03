// app/(app)/onboarding/commander.tsx
// Commander picker. Reads profile.active_faction (set in the faction picker)
// and queries commander_library for the 3 commanders of that faction.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../src/lib/firebase';
import { usePlayerProfile } from '../../../src/hooks/usePlayerProfile';
import { FACTIONS } from '../../../src/lib/factions';
import type { CommanderEntry } from '../../../src/types/commander';

export default function CommanderPickerScreen() {
  const router = useRouter();
  const { profile, updateProfile } = usePlayerProfile();
  const [commanders, setCommanders] = useState<CommanderEntry[] | null>(null);
  const [committingId, setCommittingId] = useState<string | null>(null);

  const activeFaction = profile?.active_faction ?? null;
  const factionMeta = FACTIONS.find((f) => f.id === activeFaction);

  useEffect(() => {
    if (!activeFaction) return;
    let cancelled = false;
    (async () => {
      try {
        const q = query(
          collection(db, 'commander_library'),
          where('faction', '==', activeFaction)
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        setCommanders(snap.docs.map((d) => d.data() as CommanderEntry));
      } catch (err) {
        console.warn('CommanderPicker: fetch failed', err);
        if (!cancelled) setCommanders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeFaction]);

  const handleChoose = async (commander: CommanderEntry) => {
    setCommittingId(commander.commander_id);
    try {
      await updateProfile({
        selected_commander: commander.commander_id,
        onboarding_step: 3,
      });
      router.replace('/home');
    } catch (err: any) {
      Alert.alert('Could not save commander', err?.message ?? 'Unknown error');
      setCommittingId(null);
    }
  };

  if (!activeFaction || !factionMeta) {
    return (
      <View style={styles.containerCentered}>
        <Text style={styles.errorTitle}>No faction selected</Text>
        <Text style={styles.errorBody}>
          Choose a faction first before picking a commander.
        </Text>
        <TouchableOpacity
          style={styles.returnButton}
          onPress={() => router.replace('/home')}
        >
          <Text style={styles.returnButtonText}>Return to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (commanders === null) {
    return (
      <View style={styles.containerCentered}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (commanders.length === 0) {
    return (
      <View style={styles.containerCentered}>
        <Text style={styles.errorTitle}>No commanders found</Text>
        <Text style={styles.errorBody}>
          We couldn't find any commanders for {factionMeta.name}. Please contact support.
        </Text>
        <TouchableOpacity
          style={styles.returnButton}
          onPress={() => router.replace('/home')}
        >
          <Text style={styles.returnButtonText}>Return to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.header}>Choose Your Commander</Text>
      <Text style={styles.subtitle}>
        {factionMeta.name} stands ready. Pick your leader.
      </Text>

      <View style={styles.explainerCard}>
        <Text style={styles.explainerHeader}>About your commander</Text>
        <Text style={styles.explainerBody}>
          Your commander accompanies your deck into every match.
        </Text>
        <Text style={styles.explainerBullet}>
          • Each commander specializes in one lane (Melee, Ranged, or Siege)
        </Text>
        <Text style={styles.explainerBullet}>
          • Their active ability buffs that lane with +1 Power per card, once per match
        </Text>
        <Text style={styles.explainerBullet}>
          • They have a passive that's always on
        </Text>
        <Text style={styles.explainerFooter}>
          Choose your commander based on the lane you want to dominate.
        </Text>
      </View>

      {commanders.map((commander) => {
        const isCommitting = committingId === commander.commander_id;
        const isAnyCommitting = committingId !== null;
        return (
          <View key={commander.commander_id} style={styles.card}>
            <View style={[styles.art, { backgroundColor: factionMeta.color }]}>
              <Text style={styles.artText}>{commander.name}</Text>
            </View>

            <View style={styles.cardBody}>
              <View style={styles.nameRow}>
                <Text style={styles.commanderName}>{commander.name}</Text>
                <View style={[styles.laneBadge, { borderColor: factionMeta.color }]}>
                  <Text style={[styles.laneBadgeText, { color: factionMeta.color }]}>
                    {commander.lane}
                  </Text>
                </View>
              </View>

              <Text style={styles.abilityLabel}>Passive</Text>
              <Text style={styles.abilityText}>{commander.passive.description}</Text>

              <Text style={styles.abilityLabel}>Active</Text>
              <Text style={styles.abilityText}>{commander.active.description}</Text>

              <TouchableOpacity
                style={[
                  styles.chooseButton,
                  { backgroundColor: factionMeta.color },
                  isAnyCommitting && styles.chooseButtonDisabled,
                ]}
                onPress={() => handleChoose(commander)}
                disabled={isAnyCommitting}
              >
                <Text style={styles.chooseButtonText}>
                  {isCommitting ? 'Saving…' : 'Choose'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  containerCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 64,
    paddingBottom: 32,
  },
  header: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  explainerCard: {
    backgroundColor: '#161616',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2a',
    padding: 14,
    marginBottom: 24,
  },
  explainerHeader: {
    color: '#d4a04a',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  explainerBody: {
    color: '#bbb',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  explainerBullet: {
    color: '#9a9a9a',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
    paddingLeft: 4,
  },
  explainerFooter: {
    color: '#bbb',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2a',
  },
  art: {
    width: '100%',
    aspectRatio: 5 / 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  artText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 16,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  cardBody: {
    padding: 16,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  commanderName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  laneBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  laneBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  abilityLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 4,
  },
  abilityText: {
    color: '#ddd',
    fontSize: 14,
    lineHeight: 20,
  },
  chooseButton: {
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  chooseButtonDisabled: {
    opacity: 0.5,
  },
  chooseButtonText: {
    color: '#111',
    fontSize: 16,
    fontWeight: '700',
  },
  errorTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorBody: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  returnButton: {
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  returnButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});
