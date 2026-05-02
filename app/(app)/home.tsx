// app/(app)/home.tsx
// Logged-in landing screen. Drives onboarding by branching on
// profile.onboarding_step:
//   0, 1 → faction picker CTA
//   2    → commander picker CTA
//   3    → loading screen while completeOnboarding runs (auto-fires once)
//   4+   → welcome-back + faction/commander summary

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../src/contexts/AuthContext';
import { db, functions } from '../../src/lib/firebase';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';
import { completeOnboarding } from '../../src/lib/completeOnboarding';
import type { FactionId } from '../../src/lib/factions';
import type { CommanderEntry } from '../../src/types/commander';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const { profile } = usePlayerProfile();
  const router = useRouter();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [commanderName, setCommanderName] = useState<string | null>(null);
  const [isStartingMatch, setIsStartingMatch] = useState(false);

  // TODO Phase 5 D9: remove this debug panel + handlers when real match board UI lands.
  const [actionPanelOpen, setActionPanelOpen] = useState(false);
  const [panelMatchId, setPanelMatchId] = useState('');
  const [panelInstanceId, setPanelInstanceId] = useState('');
  const [panelTargetLane, setPanelTargetLane] = useState<'Melee' | 'Ranged' | 'Siege'>('Melee');
  const [panelBusy, setPanelBusy] = useState(false);

  // completeOnboarding state. We track it locally because the function is
  // imperative; the profile-step transition tells us when it has finished.
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completionAttempt, setCompletionAttempt] = useState(0);
  const isCompletingRef = useRef(false);

  // Resolve commander name once whenever selected_commander changes.
  // The profile snapshot subscription means that if Firebase Console edits
  // selected_commander, this effect re-runs and the new name renders.
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

  // Auto-fire completeOnboarding when the player just picked their commander.
  // Guarded by isCompletingRef so we don't double-fire on re-renders, and by
  // completionError so a failure doesn't busy-loop. completeOnboarding is
  // idempotent (wallet existence check), so a re-run after retry is safe.
  useEffect(() => {
    if (!user) return;
    if (!profile) return;
    if (profile.onboarding_step !== 3) return;
    if (!profile.active_faction) return;
    if (isCompletingRef.current) return;
    if (completionError) return;

    isCompletingRef.current = true;
    completeOnboarding(user.uid, profile.active_faction as FactionId)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.warn('completeOnboarding failed', msg);
        setCompletionError(msg);
      })
      .finally(() => {
        isCompletingRef.current = false;
      });
  }, [user, profile, completionError, completionAttempt]);

  const handleRetry = () => {
    setCompletionError(null);
    setCompletionAttempt((n) => n + 1);
  };

  // TODO Phase 5 D9: remove this debug button when real Play Match UI lands.
  const testInitializeMatch = async () => {
    setIsStartingMatch(true);
    try {
      const fn = httpsCallable(functions, 'initializeNewMatch');
      const result = await fn({});
      const data = result.data as {
        match_id: string;
        first_turn: 'player_a' | 'player_b';
        player_a_commander_id: string;
        player_b_commander_id: string;
      };
      Alert.alert(
        'Match Initialized',
        `match_id: ${data.match_id}\n` +
          `first_turn: ${data.first_turn}\n` +
          `your commander: ${data.player_a_commander_id}\n` +
          `bot commander: ${data.player_b_commander_id}`,
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Unknown error');
    } finally {
      setIsStartingMatch(false);
    }
  };

  // TODO Phase 5 D9: remove with debug panel.
  const callMatchAction = async (
    name: 'playCardToLane' | 'passTurn' | 'activateCommander' | 'claimMatchRewards',
    payload: Record<string, unknown>,
  ) => {
    if (!panelMatchId.trim()) {
      Alert.alert('Missing matchId', 'Enter a matchId first.');
      return;
    }
    setPanelBusy(true);
    try {
      const fn = httpsCallable(functions, name);
      const result = await fn(payload);
      Alert.alert(`${name} → OK`, JSON.stringify(result.data, null, 2));
    } catch (err: any) {
      Alert.alert(`${name} → error`, `${err?.code ?? ''}\n${err?.message ?? 'Unknown error'}`);
    } finally {
      setPanelBusy(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (err: any) {
      Alert.alert('Sign out failed', err?.message ?? 'Unknown error');
      setIsSigningOut(false);
    }
  };

  const username = profile?.username ?? '...';
  const step = profile?.onboarding_step ?? 0;
  const activeFaction = profile?.active_faction;

  type PrimaryCta = {
    label: string;
    href: '/onboarding/faction' | '/onboarding/commander';
  };

  const view: { title: string; subtitle: string; primaryCta: PrimaryCta | null } =
    step >= 4
      ? {
          title: `Welcome back, ${username}`,
          subtitle: `${activeFaction ?? '...'} — ${
            commanderName ?? profile?.selected_commander ?? '...'
          }`,
          primaryCta: null,
        }
      : step === 2
      ? {
          title: `Welcome, ${username}`,
          subtitle: `${activeFaction ?? 'Your faction'} stands ready. A leader is needed.`,
          primaryCta: { label: 'Choose Your Commander', href: '/onboarding/commander' },
        }
      : step === 1
      ? {
          title: `Welcome, ${username}`,
          subtitle: 'Your forces await.',
          primaryCta: { label: 'Choose Your Faction', href: '/onboarding/faction' },
        }
      : {
          title: `Welcome, ${username}`,
          subtitle: 'Your campaign begins with a choice.',
          primaryCta: { label: 'Choose Your Faction', href: '/onboarding/faction' },
        };

  const { title, subtitle, primaryCta } = view;

  // Step-3 branch: provisioning is running (or just failed). Render its own
  // view instead of the normal CTA layout.
  const isProvisioning = step === 3 && !completionError;
  const showProvisioningError = step === 3 && completionError !== null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.logoutCorner, isSigningOut && styles.disabled]}
        onPress={handleSignOut}
        disabled={isSigningOut}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.logoutCornerText}>Logout</Text>
      </TouchableOpacity>

      <View style={styles.center}>
        <Text style={styles.brand}>Ember Crown</Text>

        {isProvisioning ? (
          <>
            <ActivityIndicator
              color="#d4a04a"
              size="large"
              style={styles.spinner}
            />
            <Text style={styles.title}>Forging your destiny…</Text>
            <Text style={styles.subtitle}>
              Assembling your starter forces and royal treasury.
            </Text>
          </>
        ) : showProvisioningError ? (
          <>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>{completionError}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={handleRetry}>
              <Text style={styles.primaryButtonText}>Try again</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            {primaryCta && (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => router.push(primaryCta.href)}
              >
                <Text style={styles.primaryButtonText}>{primaryCta.label}</Text>
              </TouchableOpacity>
            )}
            {step >= 4 && (
              <Text style={styles.comingSoon}>Guild Hall and battle coming soon.</Text>
            )}
            {step >= 4 && (
              <TouchableOpacity
                style={[styles.testButton, isStartingMatch && styles.disabled]}
                onPress={testInitializeMatch}
                disabled={isStartingMatch}
              >
                {isStartingMatch ? (
                  <ActivityIndicator color="#bbb" />
                ) : (
                  <Text style={styles.testButtonText}>🧪 Test Initialize Match</Text>
                )}
              </TouchableOpacity>
            )}
            {step >= 4 && (
              <TouchableOpacity
                style={styles.testButton}
                onPress={() => setActionPanelOpen((v) => !v)}
              >
                <Text style={styles.testButtonText}>
                  {actionPanelOpen ? '🧪 Hide Match Actions' : '🧪 Test Match Actions'}
                </Text>
              </TouchableOpacity>
            )}
            {step >= 4 && actionPanelOpen && (
              <View style={styles.panel}>
                <Text style={styles.panelLabel}>matchId</Text>
                <TextInput
                  style={styles.panelInput}
                  value={panelMatchId}
                  onChangeText={setPanelMatchId}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="e.g. 9f3c…"
                  placeholderTextColor="#555"
                />
                <Text style={styles.panelLabel}>instanceId (Play only)</Text>
                <TextInput
                  style={styles.panelInput}
                  value={panelInstanceId}
                  onChangeText={setPanelInstanceId}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="instance_id from live_board_state"
                  placeholderTextColor="#555"
                />
                <Text style={styles.panelLabel}>targetLane (Play only)</Text>
                <View style={styles.laneRow}>
                  {(['Melee', 'Ranged', 'Siege'] as const).map((lane) => (
                    <TouchableOpacity
                      key={lane}
                      style={[
                        styles.laneChip,
                        panelTargetLane === lane && styles.laneChipSelected,
                      ]}
                      onPress={() => setPanelTargetLane(lane)}
                    >
                      <Text
                        style={[
                          styles.laneChipText,
                          panelTargetLane === lane && styles.laneChipTextSelected,
                        ]}
                      >
                        {lane}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionButton, panelBusy && styles.disabled]}
                    disabled={panelBusy}
                    onPress={() =>
                      callMatchAction('playCardToLane', {
                        matchId: panelMatchId.trim(),
                        instanceId: panelInstanceId.trim(),
                        targetLane: panelTargetLane,
                      })
                    }
                  >
                    <Text style={styles.actionButtonText}>Play</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, panelBusy && styles.disabled]}
                    disabled={panelBusy}
                    onPress={() =>
                      callMatchAction('passTurn', { matchId: panelMatchId.trim() })
                    }
                  >
                    <Text style={styles.actionButtonText}>Pass</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, panelBusy && styles.disabled]}
                    disabled={panelBusy}
                    onPress={() =>
                      callMatchAction('activateCommander', { matchId: panelMatchId.trim() })
                    }
                  >
                    <Text style={styles.actionButtonText}>Activate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, panelBusy && styles.disabled]}
                    disabled={panelBusy}
                    onPress={() =>
                      callMatchAction('claimMatchRewards', { matchId: panelMatchId.trim() })
                    }
                  >
                    <Text style={styles.actionButtonText}>Claim</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
      </View>

      <TouchableOpacity
        style={styles.profileLink}
        onPress={() => router.push('/profile')}
      >
        <Text style={styles.profileLinkText}>View Profile</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    paddingHorizontal: 24,
  },
  logoutCorner: {
    position: 'absolute',
    top: 56,
    right: 24,
    zIndex: 1,
  },
  logoutCornerText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.5,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brand: {
    color: '#666',
    fontSize: 14,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 32,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    color: '#bbb',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  primaryButton: {
    height: 52,
    paddingHorizontal: 32,
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
  comingSoon: {
    color: '#666',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 16,
  },
  spinner: {
    marginBottom: 24,
  },
  testButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    backgroundColor: '#1a1a1a',
    minWidth: 220,
    alignItems: 'center',
  },
  testButtonText: {
    color: '#bbb',
    fontSize: 13,
    fontWeight: '500',
  },
  profileLink: {
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  profileLinkText: {
    color: '#888',
    fontSize: 14,
  },
  panel: {
    marginTop: 12,
    width: '100%',
    maxWidth: 360,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
  },
  panelLabel: {
    color: '#888',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    marginTop: 8,
  },
  panelInput: {
    color: '#eee',
    fontSize: 13,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#0e0e0e',
  },
  laneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  laneChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#0e0e0e',
    alignItems: 'center',
  },
  laneChipSelected: {
    borderColor: '#d4a04a',
    backgroundColor: '#3a2c12',
  },
  laneChipText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  laneChipTextSelected: {
    color: '#d4a04a',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#444',
    backgroundColor: '#222',
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#ddd',
    fontSize: 13,
    fontWeight: '600',
  },
});
