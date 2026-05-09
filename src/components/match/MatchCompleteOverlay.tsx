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
import { showRewardedAd } from '../../lib/admob';
import { Analytics } from '../../lib/analytics';
import type { MatchSession, Side } from '../../types/match';
import type { CampaignStage } from '../../types/campaign';
import type {
  ClaimMatchRewardsResult,
  ClaimMatchRewardsWithAdResult,
  RecordCampaignWinResult,
} from '../../types/matchActions';
import { FactionUnlockCelebration } from '../campaign/FactionUnlockCelebration';

type CompleteTutorialResult = {
  success: true;
  coins_earned: number;
  shards_earned: number;
  keys_earned: number;
  skipped: boolean;
};

type Props = {
  session: MatchSession;
  viewerSide: Side;
  onClaim: () => Promise<ClaimMatchRewardsResult>;
  onCompleteTutorial?: () => Promise<CompleteTutorialResult>;
  onClaimCampaign?: () => Promise<RecordCampaignWinResult>;
  onClaimWithAd?: () => Promise<ClaimMatchRewardsWithAdResult>;
  onReturnHome: () => void;
  onReturnToCampaign?: () => void;
  // Phase 9.4.5C: Battle Mode CTAs. "Return to Hub" goes to the Battle
  // landing page; "Battle Again" re-enters the Battle Mode flow. Both
  // optional — the overlay falls back to onReturnHome if missing.
  onReturnToBattleHub?: () => void;
  onBattleAgain?: () => void;
};

export function MatchCompleteOverlay({
  session,
  viewerSide,
  onClaim,
  onCompleteTutorial,
  onClaimCampaign,
  onClaimWithAd,
  onReturnHome,
  onReturnToCampaign,
  onReturnToBattleHub,
  onBattleAgain,
}: Props) {
  const [hasClaimed, setHasClaimed] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<
    { coins_earned: number; shards_earned: number; keys_earned?: number } | null
  >(null);
  const [campaignClaimResult, setCampaignClaimResult] =
    useState<RecordCampaignWinResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Phase 9.4 — rewarded-ad bonus claim. When set, render switches to a
  // unified post-ad-claim view (handled near the top of the render below).
  const [adClaimResult, setAdClaimResult] =
    useState<ClaimMatchRewardsWithAdResult | null>(null);
  const [isShowingAd, setIsShowingAd] = useState(false);
  const [adError, setAdError] = useState<string | null>(null);

  const [stage, setStage] = useState<CampaignStage | null>(null);

  const isTutorial = session.mode === 'tutorial';
  const isCampaign = session.mode === 'campaign';
  const isBattleMode = session.mode === 'battle_mode';

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
      setClaimResult({
        coins_earned: r.coins_earned,
        shards_earned: r.shards_earned,
        keys_earned: r.keys_earned,
      });
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

  const handleWatchAd = async () => {
    if (!onClaimWithAd) {
      setAdError('Ad rewards unavailable.');
      return;
    }
    setIsShowingAd(true);
    setAdError(null);
    try {
      const earned = await showRewardedAd();
      if (!earned) {
        setAdError('Ad not completed. Try again?');
        return;
      }
      const r = await onClaimWithAd();
      Analytics.adWatched(r.is_win ? 'win' : 'loss', session.mode);
      setAdClaimResult(r);
      setHasClaimed(true);
    } catch (err: any) {
      setAdError(err?.message ?? 'Could not claim ad reward.');
    } finally {
      setIsShowingAd(false);
    }
  };

  // Per-match cap: only show the Watch Ad CTA when nothing has been claimed
  // yet (regular OR ad). Tutorial and missing-handler cases also gate it out.
  const adCtaAvailable =
    !!onClaimWithAd &&
    !isTutorial &&
    !alreadyClaimedFlag &&
    !session.ad_reward_claimed &&
    !hasClaimed;

  // ─── Post-ad-claim (unified across solo/campaign, win/loss) ───────────
  // When the ad bonus has been granted, render a single summary view. For
  // campaign first-wins that unlocked factions, the celebration takes over.
  if (adClaimResult) {
    const handleReturnToCampaign = onReturnToCampaign ?? onReturnHome;
    if (isCampaign && adClaimResult.factions_unlocked.length > 0) {
      return (
        <FactionUnlockCelebration
          factionsUnlocked={adClaimResult.factions_unlocked}
          onContinue={handleReturnToCampaign}
        />
      );
    }

    const isWin = adClaimResult.is_win;
    const headerColor = isWin ? '#5cd35c' : '#e05a5a';
    const headerLabel = isWin ? 'VICTORY' : 'DEFEAT';
    const subtitle = isWin
      ? 'Watched ad — rewards doubled!'
      : 'Watched ad — bonus claimed!';
    const onReturn = isCampaign ? handleReturnToCampaign : onReturnHome;
    const returnLabel = isCampaign ? 'Return to Campaign' : 'Return Home';

    return (
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.header}>Match Complete</Text>
          <Animated.Text style={[styles.result, { color: headerColor }, headerAnimStyle]}>
            {headerLabel}
          </Animated.Text>
          <Text style={styles.adClaimSubtitle}>{subtitle}</Text>
          <Animated.View style={[styles.rewards, rewardsAnimStyle]}>
            <Text style={styles.rewardsHeader}>Rewards</Text>
            <Text style={styles.rewardLine}>
              <Text style={styles.rewardLabel}>Coins  </Text>
              <Text style={styles.rewardValue}>+{adClaimResult.coins_earned}</Text>
            </Text>
            <Text style={styles.rewardLine}>
              <Text style={styles.rewardLabel}>Shards </Text>
              <Text style={styles.rewardValue}>+{adClaimResult.shards_earned}</Text>
            </Text>
            {adClaimResult.keys_earned > 0 ? (
              <Text style={styles.rewardLine}>
                <Text style={styles.rewardLabel}>Keys   </Text>
                <Text style={styles.rewardValue}>+{adClaimResult.keys_earned}</Text>
              </Text>
            ) : null}
          </Animated.View>
          <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
            <TouchableOpacity style={styles.primaryButton} onPress={onReturn}>
              <Text style={styles.primaryButtonText}>{returnLabel}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    );
  }

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
            {adError ? <Text style={styles.error}>{adError}</Text> : null}
            <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
              <TouchableOpacity
                style={[styles.primaryButton, isShowingAd && styles.disabled]}
                onPress={handleReturnToCampaign}
                disabled={isShowingAd}
              >
                <Text style={styles.primaryButtonText}>Return to Campaign</Text>
              </TouchableOpacity>
            </Animated.View>
            {adCtaAvailable ? (
              <TouchableOpacity
                style={[styles.adButton, isShowingAd && styles.disabled]}
                onPress={handleWatchAd}
                disabled={isShowingAd}
              >
                {isShowingAd ? (
                  <ActivityIndicator color="#d4a04a" />
                ) : (
                  <Text style={styles.adButtonText}>▶ Watch Ad to Bonus Rewards</Text>
                )}
              </TouchableOpacity>
            ) : null}
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
            {adError ? <Text style={styles.error}>{adError}</Text> : null}
            <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
              <TouchableOpacity
                style={[styles.primaryButton, (isClaiming || isShowingAd) && styles.disabled]}
                onPress={handleCampaignClaim}
                disabled={isClaiming || isShowingAd}
              >
                {isClaiming ? (
                  <ActivityIndicator color="#111" />
                ) : (
                  <Text style={styles.primaryButtonText}>Claim Rewards</Text>
                )}
              </TouchableOpacity>
            </Animated.View>
            {adCtaAvailable ? (
              <TouchableOpacity
                style={[styles.adButton, (isClaiming || isShowingAd) && styles.disabled]}
                onPress={handleWatchAd}
                disabled={isClaiming || isShowingAd}
              >
                {isShowingAd ? (
                  <ActivityIndicator color="#d4a04a" />
                ) : (
                  <Text style={styles.adButtonText}>▶ Watch Ad to Double Rewards</Text>
                )}
              </TouchableOpacity>
            ) : null}
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

  // ─── Battle Mode branch ───────────────────────────────────────────────
  // Mirrors the solo flow (same rewards, same claim callable) but the
  // post-match panel surfaces the opponent name + deck composition the
  // player faced. Two CTAs: Battle Again (find a new opponent) and
  // Return to Hub (back to /battle).
  if (isBattleMode) {
    const isWin = myWins > oppWins;
    const isDraw = myWins === oppWins;
    const battleResultText = isWin ? 'VICTORY' : isDraw ? 'DRAW' : 'DEFEAT';
    const battleResultColor = isWin ? '#5cd35c' : isDraw ? '#bbb' : '#e05a5a';
    const handleHub = onReturnToBattleHub ?? onReturnHome;
    const handleAgain = onBattleAgain ?? handleHub;

    const opponentName = session.battle_opponent_display_name ?? 'Opposing Commander';
    const opponentPower = session.battle_opponent_power_score;
    const opponentCardCount = session.battle_opponent_card_ids?.length ?? 0;

    const renderOpponentPanel = () => (
      <Animated.View style={[styles.rewards, rewardsAnimStyle]}>
        <Text style={styles.rewardsHeader}>Opponent's Deck</Text>
        <Text style={styles.opponentName}>{opponentName}</Text>
        {opponentPower != null && (
          <Text style={styles.opponentMeta}>
            ⚡ {opponentPower} · {opponentCardCount} cards
          </Text>
        )}
      </Animated.View>
    );

    const renderHubButtons = () => (
      <>
        <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
          <TouchableOpacity
            style={[styles.primaryButton, (isClaiming || isShowingAd) && styles.disabled]}
            onPress={handleAgain}
            disabled={isClaiming || isShowingAd}
          >
            <Text style={styles.primaryButtonText}>Battle Again</Text>
          </TouchableOpacity>
        </Animated.View>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleHub}>
          <Text style={styles.secondaryButtonText}>Return to Hub</Text>
        </TouchableOpacity>
      </>
    );

    // Reopened-after-claim guard.
    if (alreadyClaimedFlag && !claimResult) {
      return (
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.header}>Battle Complete</Text>
            <Animated.Text style={[styles.result, { color: '#d4a04a' }, headerAnimStyle]}>
              {battleResultText}
            </Animated.Text>
            <Text style={styles.stageSubtitle}>Battle Mode</Text>
            <Text style={styles.stageSubtitle}>Rewards already claimed.</Text>
            {renderOpponentPanel()}
            {renderHubButtons()}
          </View>
        </View>
      );
    }

    // Post-claim.
    if (hasClaimed && claimResult) {
      return (
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.header}>Battle Complete</Text>
            <Animated.Text style={[styles.result, { color: battleResultColor }, headerAnimStyle]}>
              {battleResultText}
            </Animated.Text>
            <Text style={styles.stageSubtitle}>Battle Mode</Text>
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
            {renderOpponentPanel()}
            {renderHubButtons()}
          </View>
        </View>
      );
    }

    // Pre-claim.
    const adCopy = isWin ? '▶ Watch Ad to Double Rewards' : '▶ Watch Ad to Bonus Rewards';
    return (
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.header}>Battle Complete</Text>
          <Animated.Text style={[styles.result, { color: battleResultColor }, headerAnimStyle]}>
            {battleResultText}
          </Animated.Text>
          <Text style={styles.stageSubtitle}>Battle Mode</Text>
          <Text style={styles.score}>
            {myWins} <Text style={styles.scoreDash}>—</Text> {oppWins}
          </Text>
          {renderOpponentPanel()}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {adError ? <Text style={styles.error}>{adError}</Text> : null}
          <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
            <TouchableOpacity
              style={[styles.primaryButton, (isClaiming || isShowingAd) && styles.disabled]}
              onPress={handleSoloClaim}
              disabled={isClaiming || isShowingAd}
            >
              {isClaiming ? (
                <ActivityIndicator color="#111" />
              ) : (
                <Text style={styles.primaryButtonText}>Claim Rewards</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
          {adCtaAvailable ? (
            <TouchableOpacity
              style={[styles.adButton, (isClaiming || isShowingAd) && styles.disabled]}
              onPress={handleWatchAd}
              disabled={isClaiming || isShowingAd}
            >
              {isShowingAd ? (
                <ActivityIndicator color="#d4a04a" />
              ) : (
                <Text style={styles.adButtonText}>{adCopy}</Text>
              )}
            </TouchableOpacity>
          ) : null}
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
    const adCopy = isWin ? '▶ Watch Ad to Double Rewards' : '▶ Watch Ad to Bonus Rewards';
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
          {adError ? <Text style={styles.error}>{adError}</Text> : null}
          <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
            <TouchableOpacity
              style={[styles.primaryButton, (isClaiming || isShowingAd) && styles.disabled]}
              onPress={handleSoloClaim}
              disabled={isClaiming || isShowingAd}
            >
              {isClaiming ? (
                <ActivityIndicator color="#111" />
              ) : (
                <Text style={styles.primaryButtonText}>Claim Rewards</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
          {adCtaAvailable ? (
            <TouchableOpacity
              style={[styles.adButton, (isClaiming || isShowingAd) && styles.disabled]}
              onPress={handleWatchAd}
              disabled={isClaiming || isShowingAd}
            >
              {isShowingAd ? (
                <ActivityIndicator color="#d4a04a" />
              ) : (
                <Text style={styles.adButtonText}>{adCopy}</Text>
              )}
            </TouchableOpacity>
          ) : null}
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
              {claimResult.keys_earned && claimResult.keys_earned > 0 ? (
                <Text style={styles.rewardLine}>
                  <Text style={styles.rewardLabel}>Keys   </Text>
                  <Text style={styles.rewardValue}>+{claimResult.keys_earned}</Text>
                </Text>
              ) : null}
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
  adClaimSubtitle: {
    color: '#d4a04a',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  adButton: {
    width: '100%',
    paddingVertical: 12,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a2c12',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adButtonText: {
    color: '#d4a04a',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
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
  opponentName: {
    color: '#f5e7c2',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  opponentMeta: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
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
