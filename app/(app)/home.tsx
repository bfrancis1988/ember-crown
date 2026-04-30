// app/(app)/home.tsx
// Logged-in landing screen. Drives onboarding by branching on
// profile.onboarding_step:
//   0, 1 → faction picker CTA
//   2    → commander picker CTA
//   3, 4 → welcome-back + faction/commander summary (no CTA in Phase 2)

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../../src/contexts/AuthContext';
import { db } from '../../src/lib/firebase';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';
import type { CommanderEntry } from '../../src/types/commander';

export default function HomeScreen() {
  const { signOut } = useAuth();
  const { profile } = usePlayerProfile();
  const router = useRouter();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [commanderName, setCommanderName] = useState<string | null>(null);

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
    step >= 3
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

        {step >= 3 && (
          <Text style={styles.comingSoon}>Guild Hall and battle coming soon.</Text>
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
