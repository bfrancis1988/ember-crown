// app/(app)/how-to-play.tsx
// Static reference screen explaining the rules of Ember Crown.
// Reachable from the home screen ("How to Play" link) and the tutorial intro.

import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const ACCENT = '#d4a04a';

export default function HowToPlayScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>How to Play</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Section title="The Goal">
          <Para>
            Each match has 3 rounds. Each round, 3 lanes are contested —
            Melee, Ranged, and Siege. Winning a lane (highest Power) earns 1
            Victory Point.
          </Para>
          <Para>
            After 3 rounds, the player with the most Victory Points wins the
            match. There are 9 lanes total (3 per round × 3 rounds), and you
            win by winning more lanes overall — even if you trail in a single
            round on the way.
          </Para>
        </Section>

        <Section title="Lanes">
          <Para>
            Each match has 3 lanes: Melee, Ranged, Siege. They mirror across the
            front line — your Melee lane faces the enemy's Melee lane.
          </Para>
        </Section>

        <Section title="Cards">
          <Bullet>
            <Bold>Units</Bold> are creatures with Power. Drag from hand to a
            lane to deploy.
          </Bullet>
          <Bullet>
            <Bold>Spells</Bold> are one-time effects. Curses weaken enemy lanes;
            Cleanses remove debuffs from yours.
          </Bullet>
        </Section>

        <Section title="Power">
          <Para>A card's Power can change:</Para>
          <Bullet>+2 in optimal lane</Bullet>
          <Bullet>+1 per card if your commander is active in this lane</Bullet>
          <Bullet>−2 in a cursed lane</Bullet>
        </Section>

        <Section title="Rounds & VP">
          <Para>
            A round ends when both players pass. After all 3 rounds finish,
            the player with the most Victory Points wins.
          </Para>
          <Para>
            Between rounds, the board clears, debuffs lift, and you draw 2 new
            cards. Plan ahead — cards you save now are cards you'll have for
            the next round.
          </Para>
        </Section>

        <Section title="Commander">
          <Para>
            Your commander has a passive (always on) and an active ability
            (one-time).
          </Para>
          <Para>
            Activate strategically — the lane buff lasts the whole match.
          </Para>
        </Section>

        <Section title="Curses & Cleanses">
          <Para>
            Curses weaken an enemy lane (−2 to all their Power there) until
            round end.
          </Para>
          <Para>Cleanses remove a curse from one of your lanes.</Para>
        </Section>

        <Section title="Deck Building">
          <Para>
            Your deck is exactly 15 cards. You can have up to 3 copies of any
            card in your deck (4 owned max, but only 3 can be deck-active).
          </Para>
          <Para>Build for synergy with your commander's lane.</Para>
        </Section>

        <Section title="Faction Unlocks">
          <Para>
            You start with Vanguard. Defeat each faction's boss in Campaign to
            unlock the next tier.
          </Para>
          <Para>
            Some factions are parallel (Arborea & Ashen unlock together).
          </Para>
        </Section>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeader}>{title}</Text>
      {children}
    </View>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paraText}>{children}</Text>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function Bold({ children }: { children: React.ReactNode }) {
  return <Text style={styles.bold}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  topBarTitle: {
    color: '#f5e7c2',
    fontSize: 17,
    fontWeight: '700',
  },
  backButton: {
    minWidth: 64,
  },
  backText: {
    color: ACCENT,
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 22,
  },
  sectionHeader: {
    color: ACCENT,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  paraText: {
    color: '#cfcfcf',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    paddingLeft: 4,
  },
  bulletDot: {
    color: ACCENT,
    fontSize: 15,
    lineHeight: 22,
    marginRight: 8,
  },
  bulletText: {
    color: '#cfcfcf',
    fontSize: 15,
    lineHeight: 22,
    flex: 1,
  },
  bold: {
    color: '#f5e7c2',
    fontWeight: '700',
  },
  bottomSpacer: {
    height: 24,
  },
});
