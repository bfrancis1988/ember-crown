// src/components/auth/BattleModeGateModal.tsx
// Hard gate shown when an anonymous user attempts to enter Battle Mode.
// Battle Mode requires durable identity so opponent matchmaking is fair
// (no UID churn) and so wins/losses are protected against device loss.
//
// Two CTAs: "Create Account" routes the user into the SaveProgressModal
// flow (caller decides how, since this component is navigation-agnostic);
// "Back" lets them retreat to wherever they came from. No "play anyway"
// option — this is intentionally an absolute block.

import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type BattleModeGateModalProps = {
  visible: boolean;
  onCreateAccount: () => void;
  onBack: () => void;
};

export function BattleModeGateModal({
  visible,
  onCreateAccount,
  onBack,
}: BattleModeGateModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onBack}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Battle Mode requires an account</Text>
          <Text style={styles.body}>
            Battle Mode matches you against decks built by other players. To
            ensure fair matchmaking and protect your progress, you need an
            account.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
            onPress={onCreateAccount}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Create Account</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
            onPress={onBack}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
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
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
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
  primaryButton: {
    height: 48,
    borderRadius: 8,
    backgroundColor: '#4a7a2a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
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
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#bbb',
    fontSize: 14,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.7,
  },
});

export default BattleModeGateModal;
