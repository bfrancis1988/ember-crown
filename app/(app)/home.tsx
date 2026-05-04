// app/(app)/home.tsx
// Phase 9 Session 2: redesigned home / landing screen. Onboarding
// branches (steps 0-3) preserved; step 4+ now renders a content-rich
// landing page (greeting, wallet, active commander preview, daily
// check-in placeholder, quick actions) instead of stacked-button list.
// Mode entries (Solo / Campaign / Tutorial / Forge / Guild) move to
// the bottom nav bar.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Pressable,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';
import { usePlayerWallet } from '../../src/hooks/usePlayerWallet';
import { usePlayerActiveDeck } from '../../src/hooks/usePlayerActiveDeck';
import { completeOnboarding } from '../../src/lib/completeOnboarding';
import { FACTIONS } from '../../src/lib/factions';
import type { FactionId } from '../../src/lib/factions';
import type { CommanderEntry } from '../../src/types/commander';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const { profile } = usePlayerProfile();
  const router = useRouter();

  const [isSigningOut, setIsSigningOut] = useState(false);

  // completeOnboarding state (preserved from prior version).
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completionAttempt, setCompletionAttempt] = useState(0);
  const isCompletingRef = useRef(false);

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

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Sign out failed', msg);
      setIsSigningOut(false);
    }
  };

  const username = profile?.username ?? '...';
  const step = profile?.onboarding_step ?? 0;

  // Onboarding branches 0-3 (faction picker, commander picker, provisioning,
  // provisioning error). Step 4+ falls through to the full landing layout.
  if (step < 4) {
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
              <ActivityIndicator color="#d4a04a" size="large" style={styles.spinner} />
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
              <Text style={styles.title}>Welcome, {username}</Text>
              <Text style={styles.subtitle}>
                {step === 2
                  ? `${profile?.active_faction ?? 'Your faction'} stands ready. A leader is needed.`
                  : 'Your campaign begins with a choice.'}
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() =>
                  router.push(step === 2 ? '/onboarding/commander' : '/onboarding/faction')
                }
              >
                <Text style={styles.primaryButtonText}>
                  {step === 2 ? 'Choose Your Commander' : 'Choose Your Faction'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  // ─── Step 4+: full landing layout ────────────────────────────────────
  return (
    <LandingView
      username={username}
      onSignOut={handleSignOut}
      isSigningOut={isSigningOut}
    />
  );
}

// ─── LandingView ─────────────────────────────────────────────────────────

type LandingViewProps = {
  username: string;
  onSignOut: () => void;
  isSigningOut: boolean;
};

function LandingView({ username, onSignOut, isSigningOut }: LandingViewProps) {
  const router = useRouter();
  const { profile } = usePlayerProfile();
  const { wallet } = usePlayerWallet();
  const { deck } = usePlayerActiveDeck();
  const [commander, setCommander] = useState<CommanderEntry | null>(null);

  // Resolve the active commander (matches PlaySoloMatchButton's pattern).
  useEffect(() => {
    const id = profile?.selected_commander;
    if (!id) {
      setCommander(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'commander_library', id));
        if (cancelled) return;
        if (snap.exists()) {
          setCommander(snap.data() as CommanderEntry);
        }
      } catch {
        // Silent fail — preview just falls back to id below.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.selected_commander]);

  const factionMeta = profile?.active_faction
    ? FACTIONS.find((f) => f.id === profile.active_faction)
    : undefined;
  const accent = factionMeta?.color ?? '#d4a04a';

  const activeFactionDeck = deck.filter((s) => s.faction === profile?.active_faction);
  const deckSize = activeFactionDeck.length;

  return (
    <View style={styles.landingRoot}>
      <TouchableOpacity
        style={[styles.logoutCorner, isSigningOut && styles.disabled]}
        onPress={onSignOut}
        disabled={isSigningOut}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.logoutCornerText}>Logout</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.landingScroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.greeting}>Welcome back,</Text>
        <Text style={styles.greetingName}>{username}</Text>

        {wallet && (
          <View style={styles.walletStrip}>
            <Text style={styles.walletText}>
              🪙 {wallet.coins} · 💎 {wallet.shards} · 🗝️ {wallet.keys} · ✨ {wallet.dust ?? 0}
            </Text>
          </View>
        )}

        {/* Active commander preview */}
        <Pressable
          style={({ pressed }) => [
            styles.commanderCard,
            { borderLeftColor: accent },
            pressed && styles.commanderCardPressed,
          ]}
          onPress={() => router.push('/guild-hall')}
        >
          <View style={[styles.commanderArt, { backgroundColor: accent }]}>
            {commander?.image_url ? (
              <ExpoImage
                source={{ uri: commander.image_url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <Text style={styles.commanderArtFallback}>⚔</Text>
            )}
          </View>
          <View style={styles.commanderInfo}>
            <Text style={styles.commanderLabel}>Active Commander</Text>
            <Text style={styles.commanderName}>
              {commander?.name ?? profile?.selected_commander ?? '—'}
            </Text>
            <Text style={styles.commanderMeta}>
              {commander?.lane ? `${commander.lane} · ` : ''}
              {factionMeta?.name ?? profile?.active_faction ?? ''}
            </Text>
            <Text style={[styles.deckBadge, deckSize === 15 && { color: accent }]}>
              Deck: {deckSize} / 15
            </Text>
          </View>
        </Pressable>

        {/* Daily Check-In placeholder */}
        <View style={styles.dailyCard}>
          <Text style={styles.dailyHeader}>Daily Check-In</Text>
          <Text style={styles.dailySub}>Coming Soon</Text>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionLabel}>Quick Actions</Text>
        <View style={styles.quickActionsRow}>
          <QuickAction
            icon="⚔"
            label="Battle"
            onPress={() => router.push('/battle')}
          />
          <QuickAction
            icon="🗺"
            label="Campaign"
            onPress={() => router.push('/campaign')}
          />
          {profile && !profile.tutorial_completed && (
            <QuickAction
              icon="📜"
              label="Tutorial"
              accent
              onPress={() => router.push('/tutorial')}
            />
          )}
        </View>

        <TouchableOpacity
          style={styles.howToPlayLink}
          onPress={() => router.push('/how-to-play')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.howToPlayLinkText}>❓ How to Play</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Settings link — bottom right. Routes to /profile until Session 5
          ships /settings (unimplemented routes would 404). */}
      <TouchableOpacity
        style={styles.settingsLink}
        onPress={() => router.push('/profile')}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.settingsLinkText}>⚙ Settings</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── QuickAction button ──────────────────────────────────────────────────

type QuickActionProps = {
  icon: string;
  label: string;
  accent?: boolean;
  onPress: () => void;
};

function QuickAction({ icon, label, accent, onPress }: QuickActionProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.quickAction,
        accent && styles.quickActionAccent,
        pressed && styles.quickActionPressed,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.quickActionIcon, accent && styles.quickActionIconAccent]}>
        {icon}
      </Text>
      <Text style={[styles.quickActionLabel, accent && styles.quickActionLabelAccent]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // ── Onboarding states (steps 0-3) — kept compatible with prior styling
  container: {
    flex: 1,
    backgroundColor: 'transparent',
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
  disabled: { opacity: 0.5 },
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
  spinner: { marginBottom: 24 },

  // ── Step 4+ landing layout
  landingRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  landingScroll: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 96, // 72 nav + 24 buffer so Settings link clears the bar
  },
  greeting: {
    color: '#bbb',
    fontSize: 16,
    fontWeight: '500',
  },
  greetingName: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 2,
    marginBottom: 18,
  },
  walletStrip: {
    backgroundColor: 'rgba(20, 20, 26, 0.85)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#222',
  },
  walletText: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  commanderCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(20, 20, 26, 0.85)',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderColor: '#222',
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 18,
  },
  commanderCardPressed: {
    opacity: 0.85,
  },
  commanderArt: {
    width: 90,
    height: 110,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  commanderArtFallback: {
    color: '#fff',
    fontSize: 36,
    opacity: 0.7,
  },
  commanderInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  commanderLabel: {
    color: '#888',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: 4,
  },
  commanderName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  commanderMeta: {
    color: '#bbb',
    fontSize: 13,
    marginTop: 2,
  },
  deckBadge: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  dailyCard: {
    backgroundColor: 'rgba(20, 20, 26, 0.55)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1f1f24',
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 18,
    alignItems: 'center',
  },
  dailyHeader: {
    color: '#999',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dailySub: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionLabel: {
    color: '#888',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: 8,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },
  quickAction: {
    flex: 1,
    backgroundColor: 'rgba(20, 20, 26, 0.85)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#222',
    paddingVertical: 16,
    alignItems: 'center',
  },
  quickActionAccent: {
    backgroundColor: '#d4a04a',
    borderColor: '#d4a04a',
  },
  quickActionPressed: {
    opacity: 0.8,
  },
  quickActionIcon: {
    fontSize: 22,
    color: '#ddd',
  },
  quickActionIconAccent: {
    color: '#111',
  },
  quickActionLabel: {
    color: '#ddd',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  quickActionLabelAccent: {
    color: '#111',
  },
  howToPlayLink: {
    marginTop: 4,
    paddingVertical: 8,
    alignItems: 'center',
  },
  howToPlayLinkText: {
    color: '#666',
    fontSize: 13,
  },
  settingsLink: {
    position: 'absolute',
    bottom: 84, // sits above the 72px bottom nav with a 12px gap
    right: 20,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  settingsLinkText: {
    color: '#666',
    fontSize: 12,
  },
});
