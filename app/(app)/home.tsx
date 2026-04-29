// app/(app)/home.tsx
// Logged-in landing screen. Subscribes to player_profiles/{uid} so the
// username updates live when changed from the profile screen or anywhere else.

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../src/contexts/AuthContext';
import { db } from '../../src/lib/firebase';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(
      doc(db, 'player_profiles', user.uid),
      (snapshot) => {
        if (snapshot.exists()) {
          setUsername((snapshot.data().username as string) ?? null);
        }
        // If the doc doesn't exist yet, just show null. The profile screen
        // creates it on first visit; we don't need to duplicate that logic here.
      },
      (err) => {
        // Non-fatal — home still functions without the username.
        console.warn('Home username subscription failed:', err.message);
      }
    );

    return unsubscribe;
  }, [user]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (err: any) {
      Alert.alert('Sign out failed', err?.message ?? 'Unknown error');
      setIsSigningOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ember Crown</Text>

      <Text style={styles.greeting}>
        Hello, {username ?? '...'}
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push('/profile')}
      >
        <Text style={styles.buttonText}>View Profile</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.buttonSecondary, isSigningOut && styles.buttonDisabled]}
        onPress={handleSignOut}
        disabled={isSigningOut}
      >
        <Text style={styles.buttonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#111',
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 48,
  },
  greeting: {
    fontSize: 24,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 48,
  },
  button: {
    height: 48,
    borderRadius: 8,
    backgroundColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonSecondary: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444',
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