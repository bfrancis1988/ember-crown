// Full-screen tooltip overlay rendered when activeTrigger !== null.
// Visual style mirrors MatchCompleteOverlay (dark backdrop, gold accent).

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  type TooltipTrigger,
  useTutorialTooltips,
} from './TutorialTooltipProvider';

const TOOLTIP_CONTENT: Record<TooltipTrigger, { title: string; body: string }> = {
  match_start: {
    title: 'Welcome to Ember Crown',
    body:
      'Drag a card from your hand to a lane to play it. Each lane scores ' +
      'independently. Win 2 of 3 lanes to win the round.',
  },
  first_card_played: {
    title: 'Lanes & Power',
    body:
      'Cards have a Power value. Lane Power = sum of all your cards there. ' +
      'Highest power per lane wins that lane.',
  },
  first_round_ended: {
    title: 'Round End',
    body:
      'When both players pass, the round ends. The board wipes and you draw ' +
      '2 cards. Best of 3 rounds wins the match.',
  },
  commander_activate_hint: {
    title: 'Your Commander',
    body:
      'Tap your commander to activate them — they grant +1 power per card to ' +
      'one specific lane for the rest of the match. Use it wisely.',
  },
  curse_hint: {
    title: 'Curses',
    body:
      'Curses reduce the power of an enemy lane. Tap a curse, then tap the ' +
      'enemy lane you want to weaken.',
  },
  cleanse_hint: {
    title: 'Cleanses',
    body:
      'Cleanses remove debuffs from your own lanes. Tap a cleanse, then tap ' +
      'one of your debuffed lanes.',
  },
  tutorial_complete: {
    title: 'Tutorial Complete',
    body:
      "Well done. You're ready for real matches. Claim your starting rewards " +
      'and begin your campaign.',
  },
};

export function TutorialTooltipOverlay() {
  const { activeTrigger, dismissTooltip } = useTutorialTooltips();
  if (!activeTrigger) return null;

  const { title, body } = TOOLTIP_CONTENT[activeTrigger];

  return (
    <View style={styles.backdrop} pointerEvents="auto">
      <View style={styles.modal}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <TouchableOpacity style={styles.button} onPress={dismissTooltip}>
          <Text style={styles.buttonText}>Got it</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 90,
    paddingHorizontal: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#181818',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a2c12',
    paddingVertical: 24,
    paddingHorizontal: 22,
    alignItems: 'stretch',
  },
  title: {
    color: '#f5e7c2',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    color: '#cfcfcf',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  button: {
    height: 46,
    borderRadius: 8,
    backgroundColor: '#d4a04a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#111',
    fontSize: 15,
    fontWeight: '700',
  },
});
