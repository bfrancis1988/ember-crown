// app/(app)/profile.tsx
// Live profile screen. Subscribes to player_profiles/{uid} via usePlayerProfile.
// Edits made here OR from the Firebase Console update the UI in real time.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../src/lib/firebase';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';
import { usePlayerWallet } from '../../src/hooks/usePlayerWallet';
import type { CommanderEntry } from '../../src/types/commander';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, isLoading, updateProfile } = usePlayerProfile();
  const { wallet } = usePlayerWallet();

  const [usernameDraft, setUsernameDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [commanderName, setCommanderName] = useState<string | null>(null);
  const lastSeenUsernameRef = useRef<string | undefined>(undefined);

  // Sync the draft to profile.username whenever the *server* value changes
  // (initial load and external Firestore edits). Tracking the last reflected
  // value in a ref — rather than guarding on draft contents — lets the user
  // freely clear the field without it snapping back.
  useEffect(() => {
    if (!profile) return;
    if (lastSeenUsernameRef.current !== profile.username) {
      setUsernameDraft(profile.username);
      lastSeenUsernameRef.current = profile.username;
    }
  }, [profile?.username]);

  // Resolve commander_name from commander_library on every selected_commander change.
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

  const handleSave = async () => {
    const trimmed = usernameDraft.trim();
    if (!trimmed) {
      Alert.alert('Username required', 'Please enter a username before saving.');
      return;
    }
    if (trimmed === profile?.username) {
      Alert.alert('No changes', 'Username is unchanged.');
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({ username: trimmed });
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  // TODO: Remove ping test button after Phase 5 Deliverable 2 lands.
  const handleTestPing = async () => {
    try {
      const ping = httpsCallable(functions, 'ping');
      const result = await ping({});
      Alert.alert('Pong', JSON.stringify(result.data, null, 2));
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Unknown error');
    }
  };

  if (isLoading || !profile) {
    return (
      <View style={styles.containerCentered}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.username}>{profile.username}</Text>

      <Text style={styles.label}>UID</Text>
      <Text style={styles.metaText} selectable>{profile.player_id}</Text>

      <Text style={styles.label}>Onboarding step</Text>
      <Text style={styles.metaText}>{profile.onboarding_step}</Text>

      <Text style={styles.label}>Faction</Text>
      <Text style={styles.metaText}>{profile.active_faction ?? 'None chosen'}</Text>

      <Text style={styles.label}>Commander</Text>
      <Text style={styles.metaText}>
        {profile.selected_commander
          ? commanderName ?? profile.selected_commander
          : 'None chosen'}
      </Text>

      <Text style={styles.label}>Wallet</Text>
      <View style={styles.walletRow}>
        <Text style={styles.walletItem}>Coins: {wallet ? wallet.coins : '—'}</Text>
        <Text style={styles.walletItem}>Shards: {wallet ? wallet.shards : '—'}</Text>
        <Text style={styles.walletItem}>Keys: {wallet ? wallet.keys : '—'}</Text>
      </View>

      <View style={styles.editBlock}>
        <Text style={styles.label}>Edit username</Text>
        <TextInput
          style={styles.input}
          value={usernameDraft}
          onChangeText={setUsernameDraft}
          placeholder="Username"
          placeholderTextColor="#888"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSaving}
        />
        <TouchableOpacity
          style={[styles.button, isSaving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.buttonText}>{isSaving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      {/* TODO: Remove ping test button after Phase 5 Deliverable 2 lands. */}
      <TouchableOpacity style={styles.testButton} onPress={handleTestPing}>
        <Text style={styles.buttonText}>🧪 Test Cloud Function</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    backgroundColor: 'transparent',
  },
  containerCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  backButton: {
    marginBottom: 24,
  },
  backText: {
    color: '#888',
    fontSize: 16,
  },
  username: {
    fontSize: 32,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 24,
  },
  label: {
    color: '#888',
    fontSize: 12,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 4,
  },
  metaText: {
    color: '#ccc',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  walletRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  walletItem: {
    color: '#ccc',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  editBlock: {
    marginTop: 32,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#fff',
    backgroundColor: '#1a1a1a',
    marginBottom: 8,
  },
  button: {
    height: 48,
    borderRadius: 8,
    backgroundColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  testButton: {
    height: 48,
    borderRadius: 8,
    backgroundColor: '#7a3f00',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});
