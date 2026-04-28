// src/screens/LoginScreen.tsx
// Email/password authentication UI. Google button is a placeholder until
// Step 7 of the planning doc (requires a dev build, not Expo Go).

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function LoginScreen() {
  const { signInWithEmail, signUpWithEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Missing info', 'Please enter both email and password.');
      return;
    }
    setIsSubmitting(true);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (err: any) {
      Alert.alert('Sign in failed', err?.message ?? 'Unknown error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert('Missing info', 'Please enter both email and password.');
      return;
    }
    setIsSubmitting(true);
    try {
      await signUpWithEmail(email.trim(), password);
    } catch (err: any) {
      Alert.alert('Sign up failed', err?.message ?? 'Unknown error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGooglePlaceholder = () => {
    Alert.alert(
      'Coming soon',
      'Google sign-in will be wired up in a later phase (requires a dev build).'
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Ember Crown</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!isSubmitting}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!isSubmitting}
      />

      <TouchableOpacity
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleSignUp}
        disabled={isSubmitting}
      >
        <Text style={styles.buttonText}>Sign Up</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleSignIn}
        disabled={isSubmitting}
      >
        <Text style={styles.buttonText}>Log In</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.buttonGoogle]}
        onPress={handleGooglePlaceholder}
        disabled={isSubmitting}
      >
        <Text style={styles.buttonText}>Sign In with Google</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
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
    marginBottom: 32,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    color: '#fff',
    backgroundColor: '#1a1a1a',
  },
  button: {
    height: 48,
    borderRadius: 8,
    backgroundColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonGoogle: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});