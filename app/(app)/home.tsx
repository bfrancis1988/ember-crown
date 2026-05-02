// app/(app)/home.tsx
// Logged-in landing screen. Drives onboarding by branching on
// profile.onboarding_step:
//   0, 1 → faction picker CTA
//   2    → commander picker CTA
//   3    → loading screen while completeOnboarding runs (auto-fires once)
//   4+   → welcome-back + Play Solo Match

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';
import { completeOnboarding } from '../../src/lib/completeOnboarding';
import { PlaySoloMatchButton } from '../../src/components/home/PlaySoloMatchButton';
import type { FactionId } from '../../src/lib/factions';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const { profile } = usePlayerProfile();
  const router = useRouter();

  const [isSigningOut, setIsSigningOut] = useState(false);

  // completeOnboarding state. We track it locally because the function is
  // imperative; the profile-step transition tells us when it has finished.
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completionAttempt, setCompletionAttempt] = useState(0);
  const isCompletingRef = useRef(false);

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

  type PrimaryCta = {
    label: string;
    href: '/onboarding/faction' | '/onboarding/commander';
  };

  const view: { title: string; subtitle: string | null; primaryCta: PrimaryCta | null } =
    step >= 4
      ? {
          title: `Welcome back, ${username}`,
          subtitle: null,
          primaryCta: null,
        }
      : step === 2
      ? {
          title: `Welcome, ${username}`,
          subtitle: `${profile?.active_faction ?? 'Your faction'} stands ready. A leader is needed.`,
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
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            {primaryCta && (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => router.push(primaryCta.href)}
              >
                <Text style={styles.primaryButtonText}>{primaryCta.label}</Text>
              </TouchableOpacity>
            )}
            {step >= 4 && (
              <>
                {profile && !profile.tutorial_completed && (
                  <TouchableOpacity
                    style={styles.tutorialButton}
                    onPress={() => router.push('/tutorial')}
                  >
                    <Text style={styles.tutorialButtonText}>📜 Begin Tutorial</Text>
                    <Text style={styles.tutorialButtonSubtitle}>
                      Learn the art of command
                    </Text>
                  </TouchableOpacity>
                )}
                <PlaySoloMatchButton />
                <TouchableOpacity
                  style={styles.guildHallButton}
                  onPress={() => router.push('/guild-hall')}
                >
                  <Text style={styles.guildHallButtonText}>🛡 Guild Hall</Text>
                  <Text style={styles.guildHallButtonSubtitle}>
                    Manage your deck
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.guildHallButton}
                  onPress={() => router.push('/summon')}
                >
                  <Text style={styles.guildHallButtonText}>✨ Summon</Text>
                  <Text style={styles.guildHallButtonSubtitle}>
                    Pull cards from banners
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.guildHallButton}
                  onPress={() => router.push('/library?mode=craft')}
                >
                  <Text style={styles.guildHallButtonText}>⚒ Craft</Text>
                  <Text style={styles.guildHallButtonSubtitle}>
                    Spend dust on specific cards
                  </Text>
                </TouchableOpacity>
              </>
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
  spinner: {
    marginBottom: 24,
  },
  guildHallButton: {
    width: '100%',
    maxWidth: 360,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  guildHallButtonText: {
    color: '#ddd',
    fontSize: 15,
    fontWeight: '600',
  },
  guildHallButtonSubtitle: {
    color: '#777',
    fontSize: 11,
    marginTop: 2,
  },
  tutorialButton: {
    width: '100%',
    maxWidth: 360,
    marginBottom: 18,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#d4a04a',
    alignItems: 'center',
  },
  tutorialButtonText: {
    color: '#111',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tutorialButtonSubtitle: {
    color: '#3a2c12',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
    letterSpacing: 0.3,
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
});
