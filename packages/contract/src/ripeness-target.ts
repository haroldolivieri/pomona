import { translateShared } from "./copy";
import type { SupportedLocale } from "./locale";
import { Candidate, TargetRipenessWindow } from "./schemas";

export interface TargetResolutionResult {
  headlineKind: "buy" | "other";
  targetWindow: TargetRipenessWindow;
  rankedCandidates: Candidate[]; // candidates with score updated to window suitability score
  winner: Candidate | null;
  runnerUp: Candidate | null;
  isExactMatch: boolean;
  mismatchReason?: "all_already_ripe" | "all_underripe" | "no_match" | null;
  badgeLabel?: string | null;
  bannerNotice?: string | null;
  eyebrow: string;
  headline: string;
  subtitle: string;
  eatWithinOverride: string | null;
  followUpHintOverride: string | null;
}

function round1Decimal(val: number): number {
  return Math.round(val * 10) / 10;
}

function getSuitabilityScore(c: Candidate, targetWindow: TargetRipenessWindow): number {
  if (targetWindow === "ready_now") {
    return c.score;
  }

  if (targetWindow === "in_2_3_days") {
    switch (c.ripeness) {
      case "almost_ripe":
        return round1Decimal(Math.min(9.4, Math.max(8.4, c.score + 0.8)));
      case "underripe":
        return round1Decimal(Math.min(8.2, Math.max(7.2, c.score + 1.2)));
      case "ripe":
        return round1Decimal(Math.min(7.9, Math.max(6.8, c.score - 1.2)));
      case "overripe":
        return round1Decimal(Math.min(4.5, c.score));
    }
  }

  if (targetWindow === "later_this_week") {
    switch (c.ripeness) {
      case "underripe":
        return round1Decimal(Math.min(9.2, Math.max(8.3, c.score + 2.2)));
      case "almost_ripe":
        return round1Decimal(Math.min(8.0, Math.max(7.0, c.score - 0.2)));
      case "ripe":
        return round1Decimal(Math.min(6.5, Math.max(5.5, c.score - 2.5)));
      case "overripe":
        return round1Decimal(Math.min(3.5, c.score));
    }
  }

  return c.score;
}

function getTier(ripeness: Candidate["ripeness"], targetWindow: TargetRipenessWindow): number {
  if (targetWindow === "ready_now") {
    switch (ripeness) {
      case "ripe":
        return 1;
      case "almost_ripe":
        return 2;
      case "underripe":
        return 3;
      case "overripe":
        return 4;
    }
  }

  if (targetWindow === "in_2_3_days") {
    switch (ripeness) {
      case "almost_ripe":
        return 1;
      case "underripe":
        return 2;
      case "ripe":
        return 3;
      case "overripe":
        return 4;
    }
  }

  if (targetWindow === "later_this_week") {
    switch (ripeness) {
      case "underripe":
        return 1;
      case "almost_ripe":
        return 2;
      case "ripe":
        return 3;
      case "overripe":
        return 4;
    }
  }

  return 1;
}

export function resolveCandidatesForTarget(
  candidates: Candidate[],
  targetWindow: TargetRipenessWindow,
  displayLocale: SupportedLocale = "en-GB",
): TargetResolutionResult {
  if (candidates.length === 0) {
    return {
      headlineKind: "other",
      targetWindow,
      rankedCandidates: [],
      winner: null,
      runnerUp: null,
      isExactMatch: false,
      eyebrow: translateShared(displayLocale, "copy.noCandidates"),
      headline: translateShared(displayLocale, "copy.noProduceDetected"),
      subtitle: translateShared(displayLocale, "copy.tryScanningAgainWithFruitClearlyIn"),
      eatWithinOverride: null,
      followUpHintOverride: null,
    };
  }

  // Map each candidate to include its suitability score and sort by tier first, then raw score desc
  const mapped = candidates.map((c) => ({
    ...c,
    rawScore: c.score,
    suitabilityScore: getSuitabilityScore(c, targetWindow),
    tier: getTier(c.ripeness, targetWindow),
  }));

  mapped.sort((a, b) => {
    if (a.tier !== b.tier) {
      return a.tier - b.tier;
    }
    return b.rawScore - a.rawScore;
  });

  const rankedCandidates: Candidate[] = mapped.map(({ rawScore, suitabilityScore, tier, ...rest }) => ({
    ...rest,
    score: suitabilityScore,
  }));

  const winner = rankedCandidates[0] ?? null;
  const runnerUp = rankedCandidates[1] ?? null;

  let isExactMatch = false;
  let mismatchReason: "all_already_ripe" | "all_underripe" | "no_match" | null = null;
  let badgeLabel: string | null = null;
  let bannerNotice: string | null = null;
  let eyebrow = translateShared(displayLocale, "copy.bestInView");
  let headline = translateShared(displayLocale, "copy.buyIt");
  let subtitle = translateShared(displayLocale, "copy.comparedInView", { count: candidates.length });
  let eatWithinOverride: string | null = null;
  let followUpHintOverride: string | null = null;

  if (targetWindow === "ready_now") {
    isExactMatch = winner?.ripeness === "ripe";
    followUpHintOverride = translateShared(displayLocale, "copy.checkUndersideForSweetnessBeforeBuying");
    if (!isExactMatch && winner) {
      mismatchReason = "all_underripe";
      badgeLabel = translateShared(displayLocale, "copy.closestMatchNotYetRipe");
      bannerNotice = translateShared(displayLocale, "copy.allItemsInViewAreStillUnderripe");
      eyebrow = translateShared(displayLocale, "copy.closestMatchAllItemsUnderripe");
      headline = winner.ripeness === "almost_ripe" ? translateShared(displayLocale, "copy.ripensIn12Days") : translateShared(displayLocale, "copy.firmUnderripe");
      subtitle = translateShared(displayLocale, "copy.noFullyRipeFruitFoundInView");
    } else {
      eyebrow = translateShared(displayLocale, "copy.bestInViewReadyNow");
      headline = translateShared(displayLocale, "copy.buyIt");
      subtitle = translateShared(displayLocale, "copy.highConfidenceComparedInView", { count: candidates.length });
    }
  } else if (targetWindow === "in_2_3_days") {
    isExactMatch = winner?.ripeness === "almost_ripe";
    eatWithinOverride = translateShared(displayLocale, "copy.readyIn23dKeeps57");
    followUpHintOverride = translateShared(displayLocale, "copy.checkUndersideBeforeStoringFor23");
    if (isExactMatch) {
      eyebrow = translateShared(displayLocale, "copy.bestInViewIn23Days");
      headline = translateShared(displayLocale, "copy.buyThisOne");
      subtitle = translateShared(displayLocale, "copy.willReachPeakRipenessIn23", { count: candidates.length });
    } else if (winner?.ripeness === "ripe" || winner?.ripeness === "overripe") {
      mismatchReason = "all_already_ripe";
      badgeLabel = translateShared(displayLocale, "copy.closestMatchAlreadyRipe");
      bannerNotice = translateShared(displayLocale, "copy.allItemsInViewAreAlreadyRipe");
      eyebrow = translateShared(displayLocale, "copy.closestMatchAllItemsAlreadyRipe");
      headline = translateShared(displayLocale, "copy.noItemsWillKeep23Days");
      subtitle = translateShared(displayLocale, "copy.allItemsInViewAreAlreadyRipe2");
      eatWithinOverride = null;
    } else {
      mismatchReason = "all_underripe";
      badgeLabel = translateShared(displayLocale, "copy.closestMatchTooFirm");
      bannerNotice = translateShared(displayLocale, "copy.allItemsInViewAreFirmUnderripe");
      eyebrow = translateShared(displayLocale, "copy.closestMatchFirmUnripe");
      headline = translateShared(displayLocale, "copy.willTake4DaysToRipen");
      subtitle = translateShared(displayLocale, "copy.noItemsReadyIn23Days");
    }
  } else if (targetWindow === "later_this_week") {
    isExactMatch = winner?.ripeness === "underripe";
    eatWithinOverride = translateShared(displayLocale, "copy.ripensIn46dKeeps710");
    followUpHintOverride = translateShared(displayLocale, "copy.checkUndersideForBruisesBeforeLongStorage");
    if (isExactMatch) {
      eyebrow = translateShared(displayLocale, "copy.bestInViewLaterThisWeek");
      headline = translateShared(displayLocale, "copy.buyToStore");
      subtitle = translateShared(displayLocale, "copy.firmAndUnbruisedWillRipenLaterThis", { count: candidates.length });
    } else if (winner?.ripeness === "ripe" || winner?.ripeness === "almost_ripe") {
      mismatchReason = "all_already_ripe";
      badgeLabel = translateShared(displayLocale, "copy.closestMatchAlreadyRipe");
      bannerNotice = translateShared(displayLocale, "copy.allItemsInViewAreAlreadyRipe3");
      eyebrow = translateShared(displayLocale, "copy.closestMatchAllItemsAlreadyRipe");
      headline = translateShared(displayLocale, "copy.noItemsWillKeepUntilLater");
      subtitle = translateShared(displayLocale, "copy.allItemsInViewAreAlreadyRipe4");
      eatWithinOverride = null;
    } else {
      mismatchReason = "no_match";
      badgeLabel = translateShared(displayLocale, "copy.closestMatch");
      bannerNotice = translateShared(displayLocale, "copy.noItemsMatchLaterThisWeekClosest");
      eyebrow = translateShared(displayLocale, "copy.closestMatch2");
      headline = translateShared(displayLocale, "copy.closestMatchInView");
      subtitle = translateShared(displayLocale, "copy.comparedInView", { count: candidates.length });
    }
  }

  return {
    headlineKind: isExactMatch && targetWindow === "ready_now" ? "buy" : "other",
    targetWindow,
    rankedCandidates,
    winner,
    runnerUp,
    isExactMatch,
    mismatchReason,
    badgeLabel,
    bannerNotice,
    eyebrow,
    headline,
    subtitle,
    eatWithinOverride,
    followUpHintOverride,
  };
}
