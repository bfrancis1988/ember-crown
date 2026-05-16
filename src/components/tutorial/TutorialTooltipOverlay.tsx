// Full-screen tooltip overlay rendered when activeTrigger !== null.
// 9.3E "spotlight light" treatment: the overlay still darkens the screen
// (slightly less than before, 0.85), but the tooltip card is positioned
// in a region of the screen rather than centered, so it visually points
// at the area the trigger relates to without measured arrow anchoring.
// True cutout-spotlight + measured arrows are deferred to v1.1.

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import {
  type TooltipTrigger,
  useTutorialTooltips,
} from './TutorialTooltipProvider';

type TooltipPosition =
  | 'top'
  | 'middle'
  | 'bottom-right'
  | 'bottom-left'
  | 'left'
  | 'right';

type TooltipContent = {
  title: string;
  body: string;
  position: TooltipPosition;
};

const TOOLTIP_CONTENT: Record<TooltipTrigger, TooltipContent> = {
  match_start: {
    title: "It's your turn",
    body:
      'Tap a card in your hand to select it. You can then place it in one ' +
      'of three lanes.',
    position: 'middle',
  },
  optimal_lane_select: {
    title: 'Find the best lane',
    body:
      'The green-glowing lane is best for your card. Playing it there ' +
      'gives +2 power. Tap the lane to play.',
    position: 'top',
  },
  first_card_played: {
    title: 'Lane Power',
    body:
      'Each card in a lane adds to its Lane Power. Colors show: ' +
      'green = optimal lane, gold = commander buff, red = cursed.',
    position: 'top',
  },
  first_optimal_lane_bonus: {
    title: 'Optimal Lane',
    body:
      'That card just got +2 Power because you played it in its optimal lane.\n\n' +
      'Every Unit has a preferred lane: Melee, Ranged, or Siege. Playing them ' +
      'where they belong is one of your biggest power swings. Always check the ' +
      "card's optimal lane before placing.",
    position: 'top',
  },
  first_round_ended: {
    title: 'Round End',
    body:
      'Round 1 over. Lanes you won earn Victory Points (VP). The board clears, ' +
      'debuffs clear, and you draw 2 new cards.\n\n' +
      "Two more rounds to go. Plan ahead — cards you save now are cards " +
      "you'll have for the next round.",
    position: 'middle',
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
    position: 'bottom-left',
  },
  enemy_passed: {
    title: 'The enemy passed',
    body:
      "They're locked in for this round. Keep playing to claim more lane " +
      'wins, or tap Pass to save your hand for next round.',
    position: 'bottom-right',
  },
  curse_hint: {
    title: 'Curses',
    body:
      'Curses are spell cards that weaken an enemy lane (−2 Power to all their ' +
      'cards there) for the rest of the round.\n\n' +
      "Use them on the enemy's strongest lane to flip the lead. The debuff " +
      'clears at round end.',
    position: 'middle',
  },
  cleanse_hint: {
    title: 'Cleanses',
    body:
      'Cleanses remove a curse from one of your lanes — restoring your Power.\n\n' +
      "Save them for when an enemy curse is hurting you. Don't waste them on " +
      'undebuffed lanes.',
    position: 'middle',
  },
  tutorial_complete: {
    title: 'Tutorial Complete',
    body:
      "Well done. You're ready for real matches. Claim your starting rewards " +
      'and begin your campaign.',
    position: 'middle',
  },
};

function positionStyle(position: TooltipPosition): ViewStyle {
  switch (position) {
    case 'top':
      return { top: '12%', left: '6%', right: '6%' };
    case 'middle':
      return {
        top: '32%',
        left: '6%',
        right: '6%',
      };
    case 'bottom-right':
      return { bottom: '14%', right: '6%', left: '20%', maxWidth: 320 };
    case 'bottom-left':
      return { bottom: '14%', left: '6%', right: '20%', maxWidth: 320 };
    case 'left':
      return { top: '30%', left: '6%', right: '30%' };
    case 'right':
      return { top: '30%', right: '6%', left: '30%' };
  }
}

export function TutorialTooltipOverlay() {
  const { activeTrigger, dismissTooltip } = useTutorialTooltips();
  if (!activeTrigger) return null;

  const { title, body, position } = TOOLTIP_CONTENT[activeTrigger];

  return (
    <View style={styles.backdrop} pointerEvents="box-none">
      {/* The dim layer is its own absolute layer so the tooltip card sits
          above it. Tapping the dim layer dismisses (mirrors a "click-out"
          on the spotlight). */}
      <Pressable
        style={styles.dim}
        onPress={dismissTooltip}
        accessibilityHint="Dismiss tooltip"
      />
      <View style={[styles.modal, positionStyle(position)]} pointerEvents="auto">
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
    zIndex: 90,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  modal: {
    position: 'absolute',
    backgroundColor: '#181818',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a2c12',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  title: {
    color: '#f5e7c2',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    color: '#cfcfcf',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  button: {
    height: 44,
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
