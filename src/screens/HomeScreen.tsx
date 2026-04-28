// src/screens/HomeScreen.tsx
// Minimal logged-in landing screen. Shows the current user's UID and a logout button.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (err: any) {
      Alert.alert('Sign out failed', err?.message ?? 'Unknown error');
      setIsSigningOut(false);
    }
    // Note: no setIsSigningOut(false) on success — the auth state change will
    // unmount this screen entirely, so the cleanup happens automatically.
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ember Crown</Text>

      <Text style={styles.label}>Logged in as:</Text>
      <Text style={styles.uid} selectable>
        {user?.uid ?? '(no user)'}
      </Text>

      <TouchableOpacity
        style={[styles.button, isSigningOut && styles.buttonDisabled]}
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
  label: {
    color: '#888',
    fontSize: 14,
    marginBottom: 4,
  },
  uid: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'monospace',
    marginBottom: 32,
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