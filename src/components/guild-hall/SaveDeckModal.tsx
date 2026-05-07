// src/components/guild-hall/SaveDeckModal.tsx
// Phase 9.4.5B: modal that captures (slot_number, name) before persisting
// the current deck via saveDeck. Defaults the name to
// "{Faction} Deck {slot_number}" — editable inline. When updating an
// existing deck (initialSlot + initialName provided), the slot picker is
// hidden and the modal shows "Update Deck" instead.

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { SavedDeckSlotNumber } from '../../types/savedDeck';

const SLOTS: SavedDeckSlotNumber[] = [1, 2, 3];

type Props = {
  visible: boolean;
  factionName: string;
  factionColor: string;
  // Names of existing decks indexed by slot — shown inline so the player
  // sees what they'd overwrite.
  existingNamesBySlot: Record<SavedDeckSlotNumber, string | null>;
  initialSlot?: SavedDeckSlotNumber;
  initialName?: string;
  isUpdating: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (slot: SavedDeckSlotNumber, name: string) => void;
};

export function SaveDeckModal({
  visible,
  factionName,
  factionColor,
  existingNamesBySlot,
  initialSlot,
  initialName,
  isUpdating,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const [slot, setSlot] = useState<SavedDeckSlotNumber>(initialSlot ?? 1);
  const [name, setName] = useState<string>(
    initialName ?? `${factionName} Deck ${slot}`,
  );

  // Reset when (re)opened.
  useEffect(() => {
    if (visible) {
      const s = initialSlot ?? 1;
      setSlot(s);
      setName(initialName ?? `${factionName} Deck ${s}`);
    }
  }, [visible, factionName, initialSlot, initialName]);

  // When the slot changes and the user hasn't edited the default name,
  // keep the placeholder in sync.
  useEffect(() => {
    if (isUpdating) return;
    setName((prev) => {
      const looksLikeDefault = /^.* Deck [123]$/.test(prev);
      return looksLikeDefault ? `${factionName} Deck ${slot}` : prev;
    });
  }, [slot, factionName, isUpdating]);

  const trimmed = name.trim();
  const canConfirm = trimmed.length > 0 && !busy;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {isUpdating ? 'Update Deck' : 'Save Deck'}
          </Text>

          {!isUpdating && (
            <View style={styles.slotPicker}>
              <Text style={styles.label}>Slot</Text>
              <View style={styles.slotRow}>
                {SLOTS.map((s) => {
                  const filled = existingNamesBySlot[s];
                  const selected = s === slot;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setSlot(s)}
                      style={[
                        styles.slotBtn,
                        selected && {
                          borderColor: factionColor,
                          backgroundColor: '#1f1f24',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.slotBtnLabel,
                          selected && { color: factionColor },
                        ]}
                      >
                        Slot {s}
                      </Text>
                      <Text style={styles.slotBtnSub} numberOfLines={1}>
                        {filled ? `Replace: ${filled}` : 'Empty'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={`${factionName} Deck ${slot}`}
            placeholderTextColor="#555"
            maxLength={40}
            style={styles.input}
            editable={!busy}
          />

          <View style={styles.buttonRow}>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              style={[styles.btn, styles.btnSecondary]}
            >
              <Text style={styles.btnSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => canConfirm && onConfirm(slot, trimmed)}
              disabled={!canConfirm}
              style={[
                styles.btn,
                {
                  backgroundColor: canConfirm ? factionColor : '#1f1f24',
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#111" />
              ) : (
                <Text
                  style={[
                    styles.btnPrimaryText,
                    { color: canConfirm ? '#111' : '#666' },
                  ]}
                >
                  {isUpdating ? 'Update' : 'Save'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#15151a',
    borderRadius: 12,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a30',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 14,
  },
  label: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  slotPicker: {
    marginBottom: 14,
  },
  slotRow: {
    flexDirection: 'row',
    gap: 6,
  },
  slotBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2a2a30',
    backgroundColor: '#181820',
    alignItems: 'flex-start',
  },
  slotBtnLabel: {
    color: '#ddd',
    fontSize: 12,
    fontWeight: '700',
  },
  slotBtnSub: {
    color: '#666',
    fontSize: 10,
    marginTop: 2,
  },
  input: {
    backgroundColor: '#0e0e12',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a30',
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondary: {
    backgroundColor: '#222228',
  },
  btnSecondaryText: {
    color: '#bbb',
    fontWeight: '700',
  },
  btnPrimaryText: {
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
