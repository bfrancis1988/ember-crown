// src/components/auth/SaveProgressModal.tsx
// Prompts an anonymous user to convert their guest session into a permanent
// email/password account. Uses Firebase's linkWithCredential under the hood
// (via AuthContext.upgradeAnonymousAccount) so the existing UID is preserved
// and all progress — wallet, inventory, decks, campaign — survives the link.

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';

export type SaveProgressTrigger =
  | 'tutorial_complete'
  | 'first_win'
  | 'day_three'
  | 'manual';

type SaveProgressModalProps = {
  visible: boolean;
  onClose: () => void;
  onUpgradeSuccess?: () => void;
  trigger: SaveProgressTrigger;
};

type ErrorState =
  | { kind: 'none' }
  | { kind: 'message'; text: string }
  | { kind: 'email_in_use' }
  | { kind: 'google_in_use' };

export function SaveProgressModal({
  visible,
  onClose,
  onUpgradeSuccess,
  trigger,
}: SaveProgressModalProps) {
  const { upgradeAnonymousAccount, upgradeAnonymousWithGoogle, signOut } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<ErrorState>({ kind: 'none' });

  // trigger is accepted for analytics attribution but doesn't drive UI yet.
  // Phase 4 will fire analytics events keyed on this prop.
  void trigger;

  const resetState = () => {
    setEmail('');
    setPassword('');
    setIsSubmitting(false);
    setError({ kind: 'none' });
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetState();
    onClose();
  };

  const handleCreateAccount = async () => {
    if (!email.trim() || !password) {
      setError({ kind: 'message', text: 'Please enter both email and password.' });
      return;
    }
    setIsSubmitting(true);
    setError({ kind: 'none' });
    try {
      await upgradeAnonymousAccount(email.trim(), password);
      resetState();
      onUpgradeSuccess?.();
      onClose();
    } catch (err: unknown) {
      setError(mapFirebaseError(err));
      setIsSubmitting(false);
    }
  };

  const handleGoogleUpgrade = async () => {
    setIsSubmitting(true);
    setError({ kind: 'none' });
    try {
      const { cancelled } = await upgradeAnonymousWithGoogle();
      if (cancelled) {
        setIsSubmitting(false);
        return;
      }
      resetState();
      onUpgradeSuccess?.();
      onClose();
    } catch (err: unknown) {
      setError(mapFirebaseError(err));
      setIsSubmitting(false);
    }
  };

  const handleSwitchToSignIn = async () => {
    setIsSubmitting(true);
    try {
      await signOut();
      resetState();
      onClose();
      router.replace('/login');
    } catch {
      // If signOut fails the user is still anonymous; let them retry.
      setIsSubmitting(false);
    }
  };

  const credentialInUse =
    error.kind === 'email_in_use' || error.kind === 'google_in_use';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <ScrollView
            contentContainerStyle={styles.cardScroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>Save Your Progress</Text>
            <Text style={styles.body}>
              Your progress is currently saved to this device only. Create an
              account to keep it forever and access it from any device.
            </Text>

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

            {error.kind === 'message' && (
              <Text style={styles.errorText}>{error.text}</Text>
            )}
            {error.kind === 'email_in_use' && (
              <View style={styles.errorBlock}>
                <Text style={styles.errorText}>
                  An account with this email already exists. You can sign in
                  to it instead — note that doing so will end this guest
                  session and your guest progress will be lost.
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.pressed,
                    isSubmitting && styles.disabledButton,
                  ]}
                  onPress={handleSwitchToSignIn}
                  disabled={isSubmitting}
                >
                  <Text style={styles.secondaryButtonText}>
                    Sign Out & Sign In
                  </Text>
                </Pressable>
              </View>
            )}
            {error.kind === 'google_in_use' && (
              <View style={styles.errorBlock}>
                <Text style={styles.errorText}>
                  This Google account is already linked to another account. You
                  can sign in with it instead — note that doing so will end this
                  guest session and your guest progress will be lost.
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.pressed,
                    isSubmitting && styles.disabledButton,
                  ]}
                  onPress={handleSwitchToSignIn}
                  disabled={isSubmitting}
                >
                  <Text style={styles.secondaryButtonText}>
                    Sign Out & Sign In
                  </Text>
                </Pressable>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                (isSubmitting || credentialInUse) && styles.disabledButton,
                pressed && styles.pressed,
              ]}
              onPress={handleCreateAccount}
              disabled={isSubmitting || credentialInUse}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Create Account</Text>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.googleButton,
                (isSubmitting || credentialInUse) && styles.disabledButton,
                pressed && styles.pressed,
              ]}
              onPress={handleGoogleUpgrade}
              disabled={isSubmitting || credentialInUse}
            >
              <Text style={styles.googleButtonText}>Save with Google</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.tertiaryButton,
                pressed && styles.pressed,
              ]}
              onPress={handleClose}
              disabled={isSubmitting}
            >
              <Text style={styles.tertiaryButtonText}>Maybe Later</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function mapFirebaseError(err: unknown): ErrorState {
  const code = getFirebaseErrorCode(err);
  switch (code) {
    case 'auth/email-already-in-use':
      return { kind: 'email_in_use' };
    case 'auth/credential-already-in-use':
      return { kind: 'google_in_use' };
    case 'auth/weak-password':
      return {
        kind: 'message',
        text: 'Password is too weak. Please use at least 6 characters.',
      };
    case 'auth/invalid-email':
      return {
        kind: 'message',
        text: "That email address doesn't look right. Please check and try again.",
      };
    default:
      return {
        kind: 'message',
        text: 'Something went wrong. Please try again.',
      };
  }
}

function getFirebaseErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    maxHeight: '90%',
  },
  cardScroll: {
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: '#bbb',
    lineHeight: 20,
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    color: '#fff',
    backgroundColor: '#0f0f0f',
  },
  errorBlock: {
    marginTop: 4,
    marginBottom: 12,
  },
  errorText: {
    color: '#ff8080',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 18,
  },
  primaryButton: {
    height: 48,
    borderRadius: 8,
    backgroundColor: '#4a7a2a',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  googleButton: {
    height: 48,
    borderRadius: 8,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  googleButtonText: {
    color: '#1f1f1f',
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4a7a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#9bca6e',
    fontSize: 14,
    fontWeight: '500',
  },
  tertiaryButton: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  tertiaryButtonText: {
    color: '#888',
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});

export default SaveProgressModal;
