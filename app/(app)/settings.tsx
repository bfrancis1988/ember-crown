// app/(app)/settings.tsx
// Phase 9.5A3: production Settings screen. Replaces /profile as the player-
// facing entry. /profile remains __DEV__-gated for raw debug fields.
//
// Sections:
//   Account     — username (display + edit), email (read-only)
//   Preferences — Battle Mode deck-sharing toggle
//   Legal       — Privacy Policy, Terms of Service (Phase 9.5C1 wires routes)
//   About       — version + build number
//   Account Actions — Logout, Delete Account (Phase 9.5C3 wires the modal)

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../../src/contexts/AuthContext';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { profile, isLoading, updateProfile } = usePlayerProfile();

  const [usernameModalOpen, setUsernameModalOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [isTogglingShare, setIsTogglingShare] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const lastSeenUsernameRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!profile) return;
    if (lastSeenUsernameRef.current !== profile.username) {
      setUsernameDraft(profile.username);
      lastSeenUsernameRef.current = profile.username;
    }
  }, [profile?.username]);

  const handleOpenUsernameModal = () => {
    setUsernameDraft(profile?.username ?? '');
    setUsernameModalOpen(true);
  };

  const handleSaveUsername = async () => {
    const trimmed = usernameDraft.trim();
    if (!trimmed) {
      Alert.alert('Username required', 'Please enter a username.');
      return;
    }
    if (trimmed === profile?.username) {
      setUsernameModalOpen(false);
      return;
    }
    setIsSavingUsername(true);
    try {
      await updateProfile({ username: trimmed });
      setUsernameModalOpen(false);
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Unknown error');
    } finally {
      setIsSavingUsername(false);
    }
  };

  const handleToggleShare = async (next: boolean) => {
    setIsTogglingShare(true);
    try {
      await updateProfile({ battle_mode_decks_shareable: next });
    } catch (err: any) {
      Alert.alert('Update failed', err?.message ?? 'Unknown error');
    } finally {
      setIsTogglingShare(false);
    }
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

  const handleDeleteAccount = () => {
    // Phase 9.5C3 wires the full reauth+delete modal. Stub for 9.5A.
    Alert.alert(
      'Coming soon',
      'Delete account flow ships in Phase 9.5C.',
    );
  };

  if (isLoading || !profile) {
    return (
      <View style={styles.containerCentered}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  // Default to true if the field is unset (matches the Phase 9.4.5 spec that
  // sharing is opt-out by default).
  const shareable = profile.battle_mode_decks_shareable ?? true;
  const version = (Constants.expoConfig?.version ?? '—') as string;
  const runtimeVersion =
    typeof Constants.expoConfig?.runtimeVersion === 'string'
      ? Constants.expoConfig.runtimeVersion
      : '—';

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>⚙ Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Account */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Username</Text>
              <Text style={styles.rowValue}>{profile.username}</Text>
            </View>
            <TouchableOpacity onPress={handleOpenUsernameModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.rowAction}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowValue}>{user?.email ?? '—'}</Text>
            </View>
          </View>
        </View>

        {/* Preferences */}
        <Text style={styles.sectionLabel}>Preferences</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Share my decks for Battle Mode</Text>
              <Text style={styles.rowHint}>
                When on, other players can match against your saved decks.
              </Text>
            </View>
            <Switch
              value={shareable}
              onValueChange={handleToggleShare}
              disabled={isTogglingShare}
              trackColor={{ false: '#333', true: '#7a5b1f' }}
              thumbColor={shareable ? '#d4a04a' : '#888'}
            />
          </View>
        </View>

        {/* Legal */}
        <Text style={styles.sectionLabel}>Legal</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/legal/privacy')}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Privacy Policy</Text>
            </View>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/legal/terms')}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Terms of Service</Text>
            </View>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* About */}
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Version</Text>
              <Text style={styles.rowValue}>{version}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Runtime</Text>
              <Text style={styles.rowValue}>{runtimeVersion}</Text>
            </View>
          </View>
        </View>

        {/* Account Actions / danger zone */}
        <Text style={[styles.sectionLabel, styles.dangerLabel]}>Account Actions</Text>
        <View style={[styles.card, styles.dangerCard]}>
          <TouchableOpacity
            style={[styles.row, isSigningOut && styles.disabled]}
            onPress={handleSignOut}
            disabled={isSigningOut}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>{isSigningOut ? 'Signing out…' : 'Logout'}</Text>
            </View>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={handleDeleteAccount}>
            <View style={styles.rowMain}>
              <Text style={[styles.rowLabel, styles.dangerText]}>Delete Account</Text>
              <Text style={styles.rowHint}>Permanent. Cannot be undone.</Text>
            </View>
            <Text style={[styles.rowChevron, styles.dangerText]}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Username edit modal */}
      <Modal
        visible={usernameModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setUsernameModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Username</Text>
            <TextInput
              style={styles.modalInput}
              value={usernameDraft}
              onChangeText={setUsernameDraft}
              placeholder="Username"
              placeholderTextColor="#888"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSavingUsername}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSecondary}
                onPress={() => setUsernameModalOpen(false)}
                disabled={isSavingUsername}
              >
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimary, isSavingUsername && styles.disabled]}
                onPress={handleSaveUsername}
                disabled={isSavingUsername}
              >
                <Text style={styles.modalPrimaryText}>
                  {isSavingUsername ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  containerCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '500',
    minWidth: 60,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: { minWidth: 60 },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  sectionLabel: {
    color: '#888',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
    paddingLeft: 4,
  },
  dangerLabel: {
    color: '#a85a5a',
    marginTop: 24,
  },
  card: {
    backgroundColor: 'rgba(20, 20, 26, 0.85)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#222',
    overflow: 'hidden',
  },
  dangerCard: {
    borderColor: '#3a1f1f',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowMain: { flex: 1 },
  rowLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  rowValue: {
    color: '#aaa',
    fontSize: 13,
    marginTop: 2,
  },
  rowHint: {
    color: '#777',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  rowAction: {
    color: '#d4a04a',
    fontSize: 14,
    fontWeight: '600',
  },
  rowChevron: {
    color: '#666',
    fontSize: 22,
    fontWeight: '300',
    marginLeft: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#222',
    marginLeft: 14,
  },
  dangerText: {
    color: '#e05a5a',
  },
  disabled: { opacity: 0.5 },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#15151b',
    borderRadius: 14,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a32',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#fff',
    backgroundColor: '#1a1a1a',
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalSecondaryText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '600',
  },
  modalPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#d4a04a',
  },
  modalPrimaryText: {
    color: '#111',
    fontSize: 15,
    fontWeight: '700',
  },
});
