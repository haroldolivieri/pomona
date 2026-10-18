import { Candidate, TargetRipenessWindow } from "./schemas";

export interface TargetResolutionResult {
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
  targetWindow: TargetRipenessWindow
): TargetResolutionResult {
  if (candidates.length === 0) {
    return {
      targetWindow,
      rankedCandidates: [],
      winner: null,
      runnerUp: null,
      isExactMatch: false,
      eyebrow: "NO CANDIDATES",
      headline: "No produce detected.",
      subtitle: "Try scanning again with fruit clearly in view.",
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
  let eyebrow = "BEST IN VIEW";
  let headline = "Buy it.";
  let subtitle = `${candidates.length} compared in view`;
  let eatWithinOverride: string | null = null;
  let followUpHintOverride: string | null = null;

  if (targetWindow === "ready_now") {
    isExactMatch = winner?.ripeness === "ripe";
    followUpHintOverride = "Check underside for sweetness before buying";
    if (!isExactMatch && winner) {
      mismatchReason = "all_underripe";
      badgeLabel = "Closest match · Not yet ripe";
      bannerNotice = "All items in view are still underripe — showing closest to ripe";
      eyebrow = "CLOSEST MATCH · ALL ITEMS UNDERRIPE";
      headline = winner.ripeness === "almost_ripe" ? "Ripens in 1–2 days." : "Firm & underripe.";
      subtitle = "No fully ripe fruit found in view. Needs time to ripen.";
    } else {
      eyebrow = "BEST IN VIEW · READY NOW";
      headline = "Buy it.";
      subtitle = `High confidence · ${candidates.length} compared in view`;
    }
  } else if (targetWindow === "in_2_3_days") {
    isExactMatch = winner?.ripeness === "almost_ripe";
    eatWithinOverride = "Ready in 2–3d · Keeps 5–7 days";
    followUpHintOverride = "Check underside before storing for 2–3 days";
    if (isExactMatch) {
      eyebrow = "BEST IN VIEW · IN 2–3 DAYS";
      headline = "Buy this one.";
      subtitle = `Will reach peak ripeness in 2–3 days · ${candidates.length} compared`;
    } else if (winner?.ripeness === "ripe" || winner?.ripeness === "overripe") {
      mismatchReason = "all_already_ripe";
      badgeLabel = "Closest match · Already ripe";
      bannerNotice = "All items in view are already ripe — eat sooner";
      eyebrow = "CLOSEST MATCH · ALL ITEMS ALREADY RIPE";
      headline = "No items will keep 2–3 days.";
      subtitle = "All items in view are already ripe. This one is best, but eat it sooner.";
      eatWithinOverride = null;
    } else {
      mismatchReason = "all_underripe";
      badgeLabel = "Closest match · Too firm";
      bannerNotice = "All items in view are firm & underripe — will take 4+ days";
      eyebrow = "CLOSEST MATCH · FIRM & UNRIPE";
      headline = "Will take 4+ days to ripen.";
      subtitle = "No items ready in 2–3 days. This one will take longer to soften.";
    }
  } else if (targetWindow === "later_this_week") {
    isExactMatch = winner?.ripeness === "underripe";
    eatWithinOverride = "Ripens in 4–6d · Keeps 7–10 days";
    followUpHintOverride = "Check underside for bruises before long storage";
    if (isExactMatch) {
      eyebrow = "BEST IN VIEW · LATER THIS WEEK";
      headline = "Buy to store.";
      subtitle = `Firm and unbruised · will ripen later this week · ${candidates.length} compared`;
    } else if (winner?.ripeness === "ripe" || winner?.ripeness === "almost_ripe") {
      mismatchReason = "all_already_ripe";
      badgeLabel = "Closest match · Already ripe";
      bannerNotice = "All items in view are already ripe — none will keep for later";
      eyebrow = "CLOSEST MATCH · ALL ITEMS ALREADY RIPE";
      headline = "No items will keep until later.";
      subtitle = "All items in view are already ripe. Pick from a fresher batch to store.";
      eatWithinOverride = null;
    } else {
      mismatchReason = "no_match";
      badgeLabel = "Closest match";
      bannerNotice = "No items match later this week — closest match selected";
      eyebrow = "CLOSEST MATCH";
      headline = "Closest match in view.";
      subtitle = `${candidates.length} compared in view`;
    }
  }

  return {
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
