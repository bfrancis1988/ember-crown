// app/(auth)/login.tsx
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
  Pressable,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { Analytics } from '../../src/lib/analytics';

export default function LoginScreen() {
  const { signInWithEmail, signUpWithEmail } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Missing info', 'Please enter both email and password.');
      return;
    }
    setIsSubmitting(true);
    try {
      await signInWithEmail(email.trim(), password);
      router.replace('/home');
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
      Analytics.signup('email');
      router.replace('/home');
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

      <View style={styles.passwordRow}>
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholder="Password"
          placeholderTextColor="#888"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={!passwordVisible}
          value={password}
          onChangeText={setPassword}
          editable={!isSubmitting}
        />
        <Pressable
          onPress={() => setPasswordVisible((v) => !v)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [styles.passwordToggle, pressed && styles.passwordTogglePressed]}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
        >
          {passwordVisible ? (
            <EyeOff size={20} color="#bbb" />
          ) : (
            <Eye size={20} color="#bbb" />
          )}
        </Pressable>
      </View>

      <TouchableOpacity
        onPress={() =>
          router.push({
            pathname: '/forgot-password',
            params: email.trim() ? { email: email.trim() } : {},
          })
        }
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        disabled={isSubmitting}
        style={styles.forgotLink}
      >
        <Text style={styles.forgotLinkText}>Forgot password?</Text>
      </TouchableOpacity>

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
    backgroundColor: 'transparent',
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  passwordInput: {
    flex: 1,
  },
  passwordToggle: {
    width: 48,
    height: 48,
    marginLeft: 8,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  passwordTogglePressed: {
    opacity: 0.7,
  },
  forgotLink: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  forgotLinkText: {
    color: '#888',
    fontSize: 13,
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