// src/components/match/MatchCompleteOverlay.tsx
// Full-screen modal overlay shown when session.status === 'game_over'.
// Two states:
//   - pre-claim:  show VICTORY/DEFEAT/DRAW + VP, "Claim Rewards" CTA
//   - post-claim: show coins/shards earned, "Return to Home" CTA
// onClaim returns the callable's result so we can render the actual numbers.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { MatchSession, Side } from '../../types/match';
import type { ClaimMatchRewardsResult } from '../../types/matchActions';

type CompleteTutorialResult = {
  success: true;
  coins_earned: number;
  shards_earned: number;
  skipped: boolean;
};

type Props = {
  session: MatchSession;
  viewerSide: Side;
  onClaim: () => Promise<ClaimMatchRewardsResult>;
  onCompleteTutorial?: () => Promise<CompleteTutorialResult>;
  onReturnHome: () => void;
};

export function MatchCompleteOverlay({
  session,
  viewerSide,
  onClaim,
  onCompleteTutorial,
  onReturnHome,
}: Props) {
  const [hasClaimed, setHasClaimed] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<
    { coins_earned: number; shards_earned: number } | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const isTutorial = session.mode === 'tutorial';

  const myWins = viewerSide === 'player_a' ? session.player_a_wins : session.player_b_wins;
  const oppWins = viewerSide === 'player_a' ? session.player_b_wins : session.player_a_wins;

  // Tutorial doesn't classify W/L — it's a teaching match.
  const result: 'VICTORY' | 'DEFEAT' | 'DRAW' | 'TUTORIAL' = isTutorial
    ? 'TUTORIAL'
    : myWins > oppWins ? 'VICTORY' : myWins < oppWins ? 'DEFEAT' : 'DRAW';
  const resultColor =
    result === 'VICTORY' ? '#5cd35c'
    : result === 'DEFEAT' ? '#e05a5a'
    : result === 'TUTORIAL' ? '#d4a04a'
    : '#bbb';

  const headerLabel = isTutorial ? 'Tutorial Complete' : 'Match Complete';

  const alreadyClaimedFlag =
    viewerSide === 'player_a' ? session.player_a_claimed : session.player_b_claimed;

  const handleClaimTap = async () => {
    setIsClaiming(true);
    setError(null);
    try {
      if (isTutorial) {
        if (!onCompleteTutorial) {
          throw new Error('Tutorial complete handler missing.');
        }
        const r = await onCompleteTutorial();
        setClaimResult({ coins_earned: r.coins_earned, shards_earned: r.shards_earned });
      } else {
        const r = await onClaim();
        setClaimResult({ coins_earned: r.coins_earned, shards_earned: r.shards_earned });
      }
      setHasClaimed(true);
    } catch (err: any) {
      setError(err?.message ?? 'Claim failed.');
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <View style={styles.backdrop}>
      <View style={styles.modal}>
        <Text style={styles.header}>{headerLabel}</Text>
        {isTutorial ? (
          <Text style={[styles.result, { color: resultColor }]}>WELL DONE</Text>
        ) : (
          <>
            <Text style={[styles.result, { color: resultColor }]}>{result}</Text>
            <Text style={styles.score}>
              {myWins} <Text style={styles.scoreDash}>—</Text> {oppWins}
            </Text>
          </>
        )}
        {isTutorial && !hasClaimed ? (
          <Text style={styles.tutorialBlurb}>
            Claim your starting rewards and begin your campaign.
          </Text>
        ) : null}

        {hasClaimed && claimResult ? (
          <>
            <View style={styles.rewards}>
              <Text style={styles.rewardLine}>
                <Text style={styles.rewardLabel}>Coins  </Text>
                <Text style={styles.rewardValue}>+{claimResult.coins_earned}</Text>
              </Text>
              <Text style={styles.rewardLine}>
                <Text style={styles.rewardLabel}>Shards </Text>
                <Text style={styles.rewardValue}>+{claimResult.shards_earned}</Text>
              </Text>
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={onReturnHome}>
              <Text style={styles.primaryButtonText}>
                {isTutorial ? 'Continue to Home' : 'Return to Home'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryButton, isClaiming && styles.disabled]}
              onPress={handleClaimTap}
              disabled={isClaiming}
            >
              {isClaiming ? (
                <ActivityIndicator color="#111" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isTutorial
                    ? 'Complete Tutorial'
                    : alreadyClaimedFlag ? 'Continue' : 'Claim Rewards'}
                </Text>
              )}
            </TouchableOpacity>
            {!isTutorial && (
              <TouchableOpacity style={styles.secondaryButton} onPress={onReturnHome}>
                <Text style={styles.secondaryButtonText}>Return to Home</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    paddingHorizontal: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#181818',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a2c12',
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  header: {
    color: '#888',
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  result: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 8,
  },
  score: {
    color: '#f5e7c2',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 24,
  },
  scoreDash: {
    color: '#666',
  },
  rewards: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#0e0e0e',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 20,
    alignItems: 'center',
  },
  rewardLine: {
    fontSize: 16,
    marginVertical: 2,
  },
  rewardLabel: {
    color: '#888',
    fontWeight: '600',
  },
  rewardValue: {
    color: '#d4a04a',
    fontWeight: '800',
  },
  primaryButton: {
    width: '100%',
    height: 50,
    borderRadius: 8,
    backgroundColor: '#d4a04a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#111',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 12,
    marginTop: 8,
  },
  secondaryButtonText: {
    color: '#888',
    fontSize: 13,
  },
  tutorialBlurb: {
    color: '#bbb',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 8,
    lineHeight: 21,
  },
  disabled: {
    opacity: 0.6,
  },
  error: {
    color: '#e05a5a',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
});
