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
      'Each match plays out over 3 rounds. In every round, you and your ' +
      'opponent contest 3 lanes — Melee, Ranged, and Siege. The lane with ' +
      'the highest Power earns 1 Victory Point.\n\n' +
      'After 3 rounds, the player with the most Victory Points wins. Total ' +
      'lanes won across the whole match is what counts.\n\n' +
      'Drag a card from your hand to a lane to play it. Each card has Power, ' +
      'and Lane Power = sum of all your cards there. Highest Power per lane ' +
      'wins that lane.',
  },
  first_card_played: {
    title: 'Lane Power',
    body:
      'Lane Power tells the story of each lane.\n\n' +
      'Cards have a base Power, but it can change:\n' +
      '• +2 if played in their optimal lane (their preferred terrain)\n' +
      '• +1 per card if your commander is active in this lane\n' +
      '• −2 if the lane is cursed\n\n' +
      'Watch the colors: green = buffed, red = debuffed, gold = default.',
  },
  first_optimal_lane_bonus: {
    title: 'Optimal Lane',
    body:
      'That card just got +2 Power because you played it in its optimal lane.\n\n' +
      'Every Unit has a preferred lane: Melee, Ranged, or Siege. Playing them ' +
      'where they belong is one of your biggest power swings. Always check the ' +
      "card's optimal lane before placing.",
  },
  first_round_ended: {
    title: 'Round End',
    body:
      'Round 1 over. Lanes you won earn Victory Points (VP). The board clears, ' +
      'debuffs clear, and you draw 2 new cards.\n\n' +
      "Two more rounds to go. Plan ahead — cards you save now are cards " +
      "you'll have for the next round.",
  },
  commander_activate_hint: {
    title: 'Your Commander',
    body:
      'Your commander has a passive ability and an active ability.\n\n' +
      "The active ability buffs one specific lane (your commander's specialty) " +
      'with +1 Power per card you have there. It lasts the rest of the match ' +
      'and can only be used once.\n\n' +
      'Time it carefully — activating early gives more value, but in the wrong ' +
      "lane it's wasted.",
  },
  first_pass: {
    title: 'Passing',
    body:
      "Passing means you're done for this round. Once both players pass, the " +
      'round ends.\n\n' +
      "Strategy: pass early if you've sealed a lead and want to save cards for " +
      "next round. Pass late to maximize lanes you've won. Passing isn't giving " +
      "up — it's a tactical choice.",
  },
  curse_hint: {
    title: 'Curses',
    body:
      'Curses are spell cards that weaken an enemy lane (−2 Power to all their ' +
      'cards there) for the rest of the round.\n\n' +
      "Use them on the enemy's strongest lane to flip the lead. The debuff " +
      'clears at round end.',
  },
  cleanse_hint: {
    title: 'Cleanses',
    body:
      'Cleanses remove a curse from one of your lanes — restoring your Power.\n\n' +
      "Save them for when an enemy curse is hurting you. Don't waste them on " +
      'undebuffed lanes.',
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
