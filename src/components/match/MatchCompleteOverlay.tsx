// src/components/match/MatchCompleteOverlay.tsx
// Full-screen modal overlay shown when session.status === 'game_over'.
// Mode-discriminated rendering:
//   - tutorial: existing teaching-match flow (calls completeTutorial)
//   - solo:     existing W/L + claim flow (calls claimMatchRewards)
//   - campaign: stage-aware flow (calls recordCampaignWin); supports loss,
//               first-win, replay, and faction-unlock celebration paths.
//
// onClaim / onCompleteTutorial / onClaimCampaign each return the callable's
// typed result so we can render the actual numbers.

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { MatchSession, Side } from '../../types/match';
import type { CampaignStage } from '../../types/campaign';
import type {
  ClaimMatchRewardsResult,
  RecordCampaignWinResult,
} from '../../types/matchActions';
import { FactionUnlockCelebration } from '../campaign/FactionUnlockCelebration';

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
  onClaimCampaign?: () => Promise<RecordCampaignWinResult>;
  onReturnHome: () => void;
  onReturnToCampaign?: () => void;
};

export function MatchCompleteOverlay({
  session,
  viewerSide,
  onClaim,
  onCompleteTutorial,
  onClaimCampaign,
  onReturnHome,
  onReturnToCampaign,
}: Props) {
  const [hasClaimed, setHasClaimed] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<
    { coins_earned: number; shards_earned: number } | null
  >(null);
  const [campaignClaimResult, setCampaignClaimResult] =
    useState<RecordCampaignWinResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [stage, setStage] = useState<CampaignStage | null>(null);

  const isTutorial = session.mode === 'tutorial';
  const isCampaign = session.mode === 'campaign';

  // Entrance animations: header scales in, rewards card fades in shortly
  // after the header lands, and the CTA pulses gently on a continuous loop.
  // Total entrance ≈ 600ms (200ms header opacity + 300ms scale + 400ms
  // delayed rewards fade overlap). Pulse is ambient — it stops when the
  // overlay unmounts because the loop is tied to the animated value's
  // lifetime.
  const headerScale = useRef(new Animated.Value(0.7)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const rewardsOpacity = useRef(new Animated.Value(0)).current;
  const ctaPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerScale, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(rewardsOpacity, {
        toValue: 1,
        duration: 200,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(ctaPulse, {
          toValue: 1.05,
          duration: 750,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ctaPulse, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => {
      pulse.stop();
    };
  }, [headerScale, headerOpacity, rewardsOpacity, ctaPulse]);

  const headerAnimStyle = {
    opacity: headerOpacity,
    transform: [{ scale: headerScale }],
  };
  const rewardsAnimStyle = { opacity: rewardsOpacity };
  const ctaAnimStyle = { transform: [{ scale: ctaPulse }] };

  // Load stage data for campaign matches (one-shot — stages are static).
  useEffect(() => {
    if (!isCampaign || !session.stage_id) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'campaign_stages', session.stage_id!));
        if (!cancelled && snap.exists()) {
          setStage(snap.data() as CampaignStage);
        }
      } catch (err) {
        // Stage data is decorative; failure here just means the overlay
        // shows generic copy. Don't surface to user.
        console.warn('MatchCompleteOverlay: stage load failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCampaign, session.stage_id]);

  const myWins = viewerSide === 'player_a' ? session.player_a_wins : session.player_b_wins;
  const oppWins = viewerSide === 'player_a' ? session.player_b_wins : session.player_a_wins;

  const isLoss = isCampaign && myWins <= oppWins;

  const alreadyClaimedFlag =
    viewerSide === 'player_a' ? session.player_a_claimed : session.player_b_claimed;

  // ─── Claim handlers ───────────────────────────────────────────────────
  const handleSoloClaim = async () => {
    setIsClaiming(true);
    setError(null);
    try {
      const r = await onClaim();
      setClaimResult({ coins_earned: r.coins_earned, shards_earned: r.shards_earned });
      setHasClaimed(true);
    } catch (err: any) {
      setError(err?.message ?? 'Claim failed.');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleTutorialClaim = async () => {
    setIsClaiming(true);
    setError(null);
    try {
      if (!onCompleteTutorial) throw new Error('Tutorial complete handler missing.');
      const r = await onCompleteTutorial();
      setClaimResult({ coins_earned: r.coins_earned, shards_earned: r.shards_earned });
      setHasClaimed(true);
    } catch (err: any) {
      setError(err?.message ?? 'Claim failed.');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleCampaignClaim = async () => {
    setIsClaiming(true);
    setError(null);
    try {
      if (!onClaimCampaign) throw new Error('Campaign claim handler missing.');
      const r = await onClaimCampaign();
      setCampaignClaimResult(r);
      setHasClaimed(true);
    } catch (err: any) {
      setError(err?.message ?? 'Claim failed.');
    } finally {
      setIsClaiming(false);
    }
  };

  // ─── Campaign branch ──────────────────────────────────────────────────
  if (isCampaign) {
    const handleReturnToCampaign = onReturnToCampaign ?? onReturnHome;
    const stageHeader = stage
      ? `Stage ${stage.stage_number}: ${stage.title}`
      : 'Campaign Match';

    if (isLoss) {
      return (
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.header}>Match Complete</Text>
            <Animated.Text style={[styles.result, { color: '#e05a5a' }, headerAnimStyle]}>
              DEFEAT
            </Animated.Text>
            <Text style={styles.stageTitle}>{stageHeader}</Text>
            {stage ? (
              <Text style={styles.stageSubtitle}>
                {stage.opponent_name} held the line.
              </Text>
            ) : null}
            <Text style={styles.score}>
              {myWins} <Text style={styles.scoreDash}>—</Text> {oppWins}
            </Text>
            <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
              <TouchableOpacity style={styles.primaryButton} onPress={handleReturnToCampaign}>
                <Text style={styles.primaryButtonText}>Return to Campaign</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      );
    }

    // Win path
    if (!hasClaimed && !alreadyClaimedFlag) {
      // Pre-claim: show stage info + optimistic full rewards. The function
      // returns actual values (full or 50%) on completion.
      const previewCoins = stage?.rewards.coins ?? 0;
      const previewShards = stage?.rewards.shards ?? 0;
      const previewKeys = stage?.rewards.keys ?? 0;
      return (
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.header}>Match Complete</Text>
            <Animated.Text style={[styles.result, { color: '#5cd35c' }, headerAnimStyle]}>
              VICTORY
            </Animated.Text>
            <Text style={styles.stageTitle}>{stageHeader} cleared</Text>
            <Text style={styles.score}>
              {myWins} <Text style={styles.scoreDash}>—</Text> {oppWins}
            </Text>
            {stage ? (
              <Animated.View style={[styles.rewards, rewardsAnimStyle]}>
                <Text style={styles.rewardsHeader}>Rewards (preview)</Text>
                <Text style={styles.rewardLine}>
                  <Text style={styles.rewardLabel}>Coins  </Text>
                  <Text style={styles.rewardValue}>+{previewCoins}</Text>
                </Text>
                <Text style={styles.rewardLine}>
                  <Text style={styles.rewardLabel}>Shards </Text>
                  <Text style={styles.rewardValue}>+{previewShards}</Text>
                </Text>
                {previewKeys > 0 ? (
                  <Text style={styles.rewardLine}>
                    <Text style={styles.rewardLabel}>Keys   </Text>
                    <Text style={styles.rewardValue}>+{previewKeys}</Text>
                  </Text>
                ) : null}
              </Animated.View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
              <TouchableOpacity
                style={[styles.primaryButton, isClaiming && styles.disabled]}
                onPress={handleCampaignClaim}
                disabled={isClaiming}
              >
                {isClaiming ? (
                  <ActivityIndicator color="#111" />
                ) : (
                  <Text style={styles.primaryButtonText}>Claim Rewards</Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      );
    }

    // Reopened-after-claim guard: if the match was already claimed in a
    // previous session (no in-memory claim result), show a minimal summary
    // without misleading +0 reward numbers.
    if (alreadyClaimedFlag && !campaignClaimResult) {
      return (
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.header}>Match Complete</Text>
            <Animated.Text style={[styles.result, { color: '#d4a04a' }, headerAnimStyle]}>
              VICTORY
            </Animated.Text>
            <Text style={styles.stageTitle}>{stageHeader}</Text>
            <Text style={styles.stageSubtitle}>
              Rewards already claimed.
            </Text>
            <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
              <TouchableOpacity style={styles.primaryButton} onPress={handleReturnToCampaign}>
                <Text style={styles.primaryButtonText}>Return to Campaign</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      );
    }

    // Post-claim — faction unlock celebration replaces the summary when the
    // claim returned newly-unlocked factions. Continue from the celebration
    // takes the player to the campaign hub so they can see their new options.
    if (
      campaignClaimResult &&
      campaignClaimResult.factions_unlocked.length > 0
    ) {
      return (
        <FactionUnlockCelebration
          factionsUnlocked={campaignClaimResult.factions_unlocked}
          onContinue={handleReturnToCampaign}
        />
      );
    }

    const headerText = campaignClaimResult?.is_first_win === false
      ? 'Replay Complete'
      : 'Victory!';
    const headerColor = '#d4a04a';
    const c = campaignClaimResult?.coins_earned ?? 0;
    const s = campaignClaimResult?.shards_earned ?? 0;
    const k = campaignClaimResult?.keys_earned ?? 0;
    return (
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.header}>Match Complete</Text>
          <Animated.Text style={[styles.result, { color: headerColor }, headerAnimStyle]}>
            {headerText}
          </Animated.Text>
          <Text style={styles.stageTitle}>{stageHeader}</Text>
          <Animated.View style={[styles.rewards, rewardsAnimStyle]}>
            <Text style={styles.rewardLine}>
              <Text style={styles.rewardLabel}>Coins  </Text>
              <Text style={styles.rewardValue}>+{c}</Text>
            </Text>
            <Text style={styles.rewardLine}>
              <Text style={styles.rewardLabel}>Shards </Text>
              <Text style={styles.rewardValue}>+{s}</Text>
            </Text>
            {k > 0 ? (
              <Text style={styles.rewardLine}>
                <Text style={styles.rewardLabel}>Keys   </Text>
                <Text style={styles.rewardValue}>+{k}</Text>
              </Text>
            ) : null}
          </Animated.View>
          <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
            <TouchableOpacity style={styles.primaryButton} onPress={handleReturnToCampaign}>
              <Text style={styles.primaryButtonText}>Return to Campaign</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    );
  }

  // ─── Solo branch ──────────────────────────────────────────────────────
  // Mirrors the campaign branch shell (header → result → score → rewards
  // card → primary CTA). Solo rewards are server-computed, so pre-claim
  // shows a placeholder instead of a number — post-claim renders the actual
  // values returned by claimMatchRewards.
  if (session.mode === 'solo') {
    const isWin = myWins > oppWins;
    const isDraw = myWins === oppWins;
    const soloResultText = isWin ? 'VICTORY' : isDraw ? 'DRAW' : 'DEFEAT';
    const soloResultColor = isWin ? '#5cd35c' : isDraw ? '#bbb' : '#e05a5a';

    // Reopened-after-claim guard (mirrors campaign branch L229-245): the
    // match was already claimed in a previous session and we have no in-
    // memory reward result, so don't show misleading +0 numbers.
    if (alreadyClaimedFlag && !claimResult) {
      return (
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.header}>Match Complete</Text>
            <Animated.Text style={[styles.result, { color: '#d4a04a' }, headerAnimStyle]}>
              {soloResultText}
            </Animated.Text>
            <Text style={styles.stageSubtitle}>Solo Match</Text>
            <Text style={styles.stageSubtitle}>Rewards already claimed.</Text>
            <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
              <TouchableOpacity style={styles.primaryButton} onPress={onReturnHome}>
                <Text style={styles.primaryButtonText}>Return Home</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      );
    }

    // Post-claim: VICTORY/DEFEAT color persists, rewards card shows real
    // server-returned amounts.
    if (hasClaimed && claimResult) {
      return (
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.header}>Match Complete</Text>
            <Animated.Text style={[styles.result, { color: soloResultColor }, headerAnimStyle]}>
              {soloResultText}
            </Animated.Text>
            <Text style={styles.stageSubtitle}>Solo Match</Text>
            <Text style={styles.score}>
              {myWins} <Text style={styles.scoreDash}>—</Text> {oppWins}
            </Text>
            <Animated.View style={[styles.rewards, rewardsAnimStyle]}>
              <Text style={styles.rewardsHeader}>Rewards</Text>
              <Text style={styles.rewardLine}>
                <Text style={styles.rewardLabel}>Coins  </Text>
                <Text style={styles.rewardValue}>+{claimResult.coins_earned}</Text>
              </Text>
              <Text style={styles.rewardLine}>
                <Text style={styles.rewardLabel}>Shards </Text>
                <Text style={styles.rewardValue}>+{claimResult.shards_earned}</Text>
              </Text>
            </Animated.View>
            <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
              <TouchableOpacity style={styles.primaryButton} onPress={onReturnHome}>
                <Text style={styles.primaryButtonText}>Return Home</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      );
    }

    // Pre-claim
    return (
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.header}>Match Complete</Text>
          <Animated.Text style={[styles.result, { color: soloResultColor }, headerAnimStyle]}>
            {soloResultText}
          </Animated.Text>
          <Text style={styles.stageSubtitle}>Solo Match</Text>
          <Text style={styles.score}>
            {myWins} <Text style={styles.scoreDash}>—</Text> {oppWins}
          </Text>
          <Animated.View style={[styles.rewards, rewardsAnimStyle]}>
            <Text style={styles.rewardsHeader}>Rewards (preview)</Text>
            <Text style={styles.rewardsHint}>Tap Claim Rewards to collect.</Text>
          </Animated.View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
            <TouchableOpacity
              style={[styles.primaryButton, isClaiming && styles.disabled]}
              onPress={handleSoloClaim}
              disabled={isClaiming}
            >
              {isClaiming ? (
                <ActivityIndicator color="#111" />
              ) : (
                <Text style={styles.primaryButtonText}>Claim Rewards</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    );
  }

  // ─── Tutorial branch (unchanged behavior) ─────────────────────────────
  const result: 'VICTORY' | 'DEFEAT' | 'DRAW' | 'TUTORIAL' = isTutorial
    ? 'TUTORIAL'
    : myWins > oppWins ? 'VICTORY' : myWins < oppWins ? 'DEFEAT' : 'DRAW';
  const resultColor =
    result === 'VICTORY' ? '#5cd35c'
    : result === 'DEFEAT' ? '#e05a5a'
    : result === 'TUTORIAL' ? '#d4a04a'
    : '#bbb';
  const headerLabel = isTutorial ? 'Tutorial Complete' : 'Match Complete';

  const handleClaimTap = isTutorial ? handleTutorialClaim : handleSoloClaim;

  return (
    <View style={styles.backdrop}>
      <View style={styles.modal}>
        <Text style={styles.header}>{headerLabel}</Text>
        {isTutorial ? (
          <Animated.Text style={[styles.result, { color: resultColor }, headerAnimStyle]}>
            WELL DONE
          </Animated.Text>
        ) : (
          <>
            <Animated.Text style={[styles.result, { color: resultColor }, headerAnimStyle]}>
              {result}
            </Animated.Text>
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
            <Animated.View style={[styles.rewards, rewardsAnimStyle]}>
              <Text style={styles.rewardLine}>
                <Text style={styles.rewardLabel}>Coins  </Text>
                <Text style={styles.rewardValue}>+{claimResult.coins_earned}</Text>
              </Text>
              <Text style={styles.rewardLine}>
                <Text style={styles.rewardLabel}>Shards </Text>
                <Text style={styles.rewardValue}>+{claimResult.shards_earned}</Text>
              </Text>
            </Animated.View>
            <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
              <TouchableOpacity style={styles.primaryButton} onPress={onReturnHome}>
                <Text style={styles.primaryButtonText}>
                  {isTutorial ? 'Continue to Home' : 'Return to Home'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </>
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
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
            </Animated.View>
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
  stageTitle: {
    color: '#f5e7c2',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  stageSubtitle: {
    color: '#bbb',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 12,
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
  rewardsHeader: {
    color: '#888',
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  rewardsHint: {
    color: '#bbb',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 8,
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
  ctaWrap: {
    width: '100%',
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
