// app/(app)/profile.tsx
// Live profile screen. Subscribes to Firestore via onSnapshot — edits made
// here OR from the Firebase Console will update the UI in real time.

import React, { useEffect, useState } from 'react';
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
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '../../src/contexts/AuthContext';
import { db } from '../../src/lib/firebase';

type PlayerProfile = {
  player_id: string;
  username: string;
  onboarding_step: number;
  // created_at / updated_at exist in Firestore as Timestamps but we don't
  // render them, so we don't need to type them here.
};

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) return;

    const profileRef = doc(db, 'player_profiles', user.uid);

    const unsubscribe = onSnapshot(
      profileRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          // First-ever read for this user. Create the default doc.
          // The setDoc itself triggers another snapshot event, so we don't
          // need to setProfile here — let the next callback do it.
          try {
            await setDoc(profileRef, {
              player_id: user.uid,
              username: 'Guest_Commander',
              onboarding_step: 0,
              created_at: serverTimestamp(),
              updated_at: serverTimestamp(),
            });
          } catch (err: any) {
            Alert.alert('Profile init failed', err?.message ?? 'Unknown error');
            setIsLoading(false);
          }
          return;
        }

        const data = snapshot.data() as PlayerProfile;
        setProfile(data);
        // Only seed the input on first load — don't clobber what the user is typing.
        setUsernameDraft((current) => (current === '' ? data.username : current));
        setIsLoading(false);
      },
      (err) => {
        Alert.alert('Profile subscription failed', err.message);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
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
      await updateDoc(doc(db, 'player_profiles', user.uid), {
        username: trimmed,
        updated_at: serverTimestamp(),
      });
      // The onSnapshot callback will update local state automatically.
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Unknown error');
    } finally {
      setIsSaving(false);
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    backgroundColor: '#111',
  },
  containerCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
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
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});