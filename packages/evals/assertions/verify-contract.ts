import { verifyAndResolveScanResponse } from "@pomona/proxy";
import { ErrorMessageSchema, resolveAbstentionReason } from "@pomona/contract";
import type { BoundingBox, ScanRequest, ScanResponse } from "@pomona/contract";

export interface VerifyPromptfooOutputResult {
  pass: boolean;
  score: number;
  reason: string;
}

/**
 * Computes Intersection over Union (IoU) between two [ymin, xmin, ymax, xmax] bounding boxes.
 */
export function computeBoxIoU(boxA: BoundingBox, boxB: BoundingBox): number {
  const [yA1, xA1, yA2, xA2] = boxA;
  const [yB1, xB1, yB2, xB2] = boxB;

  const interY1 = Math.max(yA1, yB1);
  const interX1 = Math.max(xA1, xB1);
  const interY2 = Math.min(yA2, yB2);
  const interX2 = Math.min(xA2, xB2);

  const interWidth = Math.max(0, interX2 - interX1);
  const interHeight = Math.max(0, interY2 - interY1);
  const interArea = interWidth * interHeight;

  if (interArea === 0) return 0;

  const areaA = Math.max(0, xA2 - xA1) * Math.max(0, yA2 - yA1);
  const areaB = Math.max(0, xB2 - xB1) * Math.max(0, yB2 - yB1);
  const unionArea = areaA + areaB - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

/**
 * Checks if the center point of boxA falls within boxB (useful when model tightens or loosens boxes).
 */
export function isBoxCenterInside(candidateBox: BoundingBox, groundTruthBox: BoundingBox): boolean {
  const [ymin, xmin, ymax, xmax] = candidateBox;
  const cy = (ymin + ymax) / 2;
  const cx = (xmin + xmax) / 2;
  const [gtYmin, gtXmin, gtYmax, gtXmax] = groundTruthBox;
  return cy >= gtYmin && cy <= gtYmax && cx >= gtXmin && cx <= gtXmax;
}

/** Match independent image annotations one-to-one; repeated boxes cannot stand in for coverage. */
export function verifyInventory(candidates: { box: BoundingBox; ripeness?: string }[], inventory: {
  required: { id: string; box: BoundingBox; ripeness?: string[] }[];
  optional?: { id: string; box: BoundingBox; ripeness?: string[] }[];
}): string | null {
  const units = [...inventory.required, ...(inventory.optional ?? [])];
  const owners = candidates.map(() => -1);
  const assign = (unit: number, visited: Set<number>): boolean => {
    for (let i = 0; i < candidates.length; i++) {
      if (visited.has(i) || computeBoxIoU(candidates[i].box, units[unit].box) < 0.5 ||
          !isBoxCenterInside(candidates[i].box, units[unit].box)) continue;
      visited.add(i);
      if (owners[i] === -1 || assign(owners[i], visited)) {
        owners[i] = unit;
        return true;
      }
    }
    return false;
  };
  for (let i = 0; i < units.length; i++) {
    if (!assign(i, new Set()) && i < inventory.required.length) {
      return `Inventory coverage: missing annotated purchase unit ${units[i].id} (IoU >= 0.5 required)`;
    }
  }
  const unmatched = owners.filter((owner) => owner === -1).length;
  if (unmatched) return `Inventory coverage: ${unmatched} candidate(s) do not match distinct annotated purchase units`;
  for (let i = 0; i < candidates.length; i++) {
    const unit = units[owners[i]];
    if (unit.ripeness && !unit.ripeness.includes(candidates[i].ripeness ?? "")) {
      return `Inventory grading: ${unit.id} must be ${unit.ripeness.join(" or ")}, received ${candidates[i].ripeness}`;
    }
  }
  return null;
}

export function verifyPromptfooOutput(
  output: string,
  context: { vars: Record<string, any> }
): VerifyPromptfooOutputResult {
  let parsedJson: unknown;
  try {
    parsedJson = typeof output === "string" ? JSON.parse(output) : output;
  } catch (err: any) {
    return {
      pass: false,
      score: 0,
      reason: `Failed to parse JSON output: ${err?.message || String(err)}`,
    };
  }

  // Grade the model's output before count, geometry or ranking can change it.
  const raw = parsedJson as Record<string, any> | null;
  const vars = context.vars ?? {};
  const round = Number(vars.round ?? 1);
  if (round === 1 && raw?.status === "ok" && !Number.isInteger(raw.countedTotal)) {
    return { pass: false, score: 0, reason: "Round 1 ok responses require an integer countedTotal equal to candidates.length" };
  }
  if (raw?.status !== "insufficient_evidence" && raw?.abstentionReason != null) {
    return { pass: false, score: 0, reason: "abstentionReason must be null outside insufficient_evidence" };
  }
  // Check the model's inventory before filtering or normalization can change it.
  if (typeof raw?.countedTotal === "number" && (
    !Array.isArray(raw.candidates) || raw.countedTotal !== raw.candidates.length
  )) {
    return { pass: false, score: 0, reason: "Count mismatch: countedTotal must equal the raw candidates.length" };
  }
  if (typeof raw?.message === "string" && !ErrorMessageSchema.safeParse(raw.message).success) {
    return { pass: false, score: 0, reason: "Error description exceeds 20 words or 140 characters" };
  }
  if ((raw?.status === "unclear_photo" || raw?.status === "insufficient_evidence") && (
    raw.produce != null || !Array.isArray(raw.candidates) || raw.candidates.length > 0 ||
    raw.verdict != null || raw.followUp != null || raw.afterPurchase != null || raw.countedTotal != null
  )) {
    return { pass: false, score: 0, reason: "Uncertain photos must abstain without scores, a verdict, follow-up, or purchase advice" };
  }
  if (raw?.status === "ok" && raw.verdict?.confidence === "low") {
    return { pass: false, score: 0, reason: "Low-confidence selection must abstain with insufficient_evidence" };
  }

  // Message checks apply to domain errors too; abstention must not bypass hallucination checks.
  if (Array.isArray(vars.forbiddenWordsInCopy)) {
    const copy = JSON.stringify({ message: raw?.message, candidates: raw?.candidates, verdict: raw?.verdict,
      followUp: raw?.followUp, afterPurchase: raw?.afterPurchase }).toLowerCase();
    for (const term of vars.forbiddenWordsInCopy) {
      if (copy.includes(String(term).toLowerCase())) {
        return { pass: false, score: 0, reason: `Hallucinated forbidden term "${term}" in response copy` };
      }
    }
  }
  const scanRequest: ScanRequest = {
    schemaVersion: "1.0",
    sessionId: "00000000-0000-0000-0000-000000000000",
    round: (round === 2 ? 2 : round === 3 ? 3 : 1) as 1 | 2 | 3,
    locale: vars.locale ?? "en-GB",
    imageBase64: "dummy",
    imageMimeType: "image/webp",
    focusPolygon: vars.focusPolygon ?? null,
    followUpContext: vars.followUpContext ?? null,
  };

  const result = verifyAndResolveScanResponse(parsedJson, {
    request: scanRequest,
    promptVersion: vars.promptVersion ?? "v1",
    modelId: vars.modelId ?? "promptfoo-eval",
  });

  if (!result.ok) {
    return {
      pass: false,
      score: 0,
      reason: `Verification failed:\n${result.errors.join("\n")}`,
    };
  }

  const response: ScanResponse = result.response;

  if (Array.isArray(vars.expectedStatuses) && !vars.expectedStatuses.includes(response.status)) {
    return { pass: false, score: 0.2, reason: `Expected one of ${JSON.stringify(vars.expectedStatuses)} but received "${response.status}"` };
  }

  // 1. Expected Status Check (e.g. "ok", "unclear_photo", "no_produce", "multiple_types")
  if (vars.expectedStatus && response.status !== vars.expectedStatus) {
    return {
      pass: false,
      score: 0.2,
      reason: `Expected status "${vars.expectedStatus}" but received "${response.status}"`,
    };
  }

  if (response.status === "insufficient_evidence") {
    const expectedReasons = Array.isArray(vars.expectedAbstentionReasons)
      ? vars.expectedAbstentionReasons
      : vars.expectedAbstentionReason ? [vars.expectedAbstentionReason] : [];
    const resolvedReason = resolveAbstentionReason(raw?.abstentionReason, typeof raw?.message === "string" ? raw.message : null);
    if (expectedReasons.length && (
      !expectedReasons.includes(resolvedReason) || response.abstentionReason !== resolvedReason
    )) {
      return { pass: false, score: 0, reason: `Expected abstentionReason ${JSON.stringify(expectedReasons)} but resolved to "${response.abstentionReason}"` };
    }
    const message = response.message ?? "";
    const explainsUncertainty = /(cannot|can.t|not enough|insufficient|unsure|uncertain|unable|more|need|hidden|not visible|not shown|missing|sealed|packaging|obscur(?:e[sd]?|ing)|do not establish|(?:similar|uniform|indistinguishable|equally).{0,40}(?:ripe|matur)|same.{0,40}(?:ripe|matur)|no useful maturity difference|no visible basis)/i.test(message);
    const requestsNewView = /\b(turn|flip|rotate|retake|closer|show|display|selection|contrast|(?:provide|take|capture).{0,60}(?:view|angle|photo|display|selection|contrast))\b/i.test(message);
    if (!explainsUncertainty || !requestsNewView) {
      return { pass: false, score: 0, reason: "Insufficient evidence must explain uncertainty and request a useful new view" };
    }
  }

  // If expectedStatus is non-ok and matches, verify message is provided and return pass
  if (response.status !== "ok") {
    if (!response.message || response.message.trim().length < 5) {
      return {
        pass: false,
        score: 0.5,
        reason: `Non-ok status "${response.status}" must include a descriptive user-facing message`,
      };
    }
    return {
      pass: true,
      score: 1.0,
      reason: `Correctly returned domain error status "${response.status}" with message: "${response.message}"`,
    };
  }

  // 2. Expected Produce Type Check (normalized for casing & singular/plural variations)
  if (vars.expectedProduceType && response.produce) {
    const normalizeSlug = (s: string) =>
      s
        .toLowerCase()
        .trim()
        .replace(/^(british|fresh|loose|organic|whole)\s+/i, "")
        .replace(/ies$/, "y")
        .replace(/es$/, "")
        .replace(/s$/, "");

    const actual = normalizeSlug(response.produce.type);
    const expected = normalizeSlug(vars.expectedProduceType);

    if (actual !== expected && !response.produce.type.toLowerCase().includes(expected)) {
      return {
        pass: false,
        score: 0.5,
        reason: `Expected produce type "${vars.expectedProduceType}" but received "${response.produce.type}"`,
      };
    }
  }

  // 3. Candidate Count Bounds Check (e.g. ensuring polygon isolation stripped outside items)
  if (
    typeof vars.expectedCandidateCountMin === "number" &&
    response.candidates.length < vars.expectedCandidateCountMin
  ) {
    return {
      pass: false,
      score: 0.4,
      reason: `Expected at least ${vars.expectedCandidateCountMin} candidates, but got ${response.candidates.length}`,
    };
  }
  if (
    typeof vars.expectedCandidateCountMax === "number" &&
    response.candidates.length > vars.expectedCandidateCountMax
  ) {
    return {
      pass: false,
      score: 0.4,
      reason: `Expected at most ${vars.expectedCandidateCountMax} candidates (outside items should be excluded), but got ${response.candidates.length}`,
    };
  }

  if (vars.expectedInventory) {
    const error = verifyInventory(response.candidates, vars.expectedInventory);
    if (error) return { pass: false, score: 0, reason: error };
  }

  if (vars.expectedRipenessComparison) {
    const { ripeBox, lessRipeBox } = vars.expectedRipenessComparison as {
      ripeBox: BoundingBox; lessRipeBox: BoundingBox; ripeClass?: string; lessRipeClass?: string;
    };
    const ripeClass = vars.expectedRipenessComparison.ripeClass ?? "ripe";
    const lessRipeClass = vars.expectedRipenessComparison.lessRipeClass ?? "underripe";
    const matchRegion = (box: BoundingBox) => response.candidates
      .map((candidate) => ({ candidate, iou: computeBoxIoU(candidate.box, box) }))
      .filter(({ candidate, iou }) => iou >= 0.2 && isBoxCenterInside(candidate.box, box))
      .sort((a, b) => b.iou - a.iou)[0]?.candidate;
    const better = matchRegion(ripeBox);
    const worse = matchRegion(lessRipeBox);
    if (!better || !worse || better.id === worse.id) {
      return { pass: false, score: 0.4, reason: "Expected separate candidates in the visibly ripe and less-ripe regions" };
    }
    if (better.ripeness !== ripeClass || worse.ripeness !== lessRipeClass) {
      return { pass: false, score: 0.4, reason: `Expected the comparison regions to be ${ripeClass} and ${lessRipeClass}` };
    }
    if (better.score <= worse.score || response.verdict?.winnerId === worse.id) {
      return { pass: false, score: 0.4, reason: "The less-ripe unit must rank below the ripe unit and must not win for ready_now" };
    }
  }

  // 4. Expected Winner ID & Runner-Up ID Check
  if (
    vars.expectedWinnerId &&
    response.verdict &&
    response.verdict.winnerId !== vars.expectedWinnerId
  ) {
    return {
      pass: false,
      score: 0.5,
      reason: `Expected winnerId "${vars.expectedWinnerId}" but received "${response.verdict.winnerId}"`,
    };
  }

  if (
    "expectedRunnerUpId" in vars &&
    vars.expectedRunnerUpId !== undefined &&
    response.verdict &&
    response.verdict.runnerUpId !== vars.expectedRunnerUpId
  ) {
    return {
      pass: false,
      score: 0.5,
      reason: `Expected runnerUpId ${JSON.stringify(vars.expectedRunnerUpId)} but received ${JSON.stringify(response.verdict.runnerUpId)}`,
    };
  }

  // 4b. Multi-Round Follow-Up Presence & Target Role Check
  if (vars.expectedFollowUpNull === true && response.followUp !== null) {
    return {
      pass: false,
      score: 0.4,
      reason: `Expected followUp to be null on this branch/round, but received followUp targeting "${response.followUp.targetCandidateId}"`,
    };
  }
  if (vars.expectedFollowUpNull === false && response.followUp === null) {
    return {
      pass: false,
      score: 0.4,
      reason: `Expected non-null followUp on this branch/round, but received null`,
    };
  }
  if (
    vars.expectedFollowUpTargetId &&
    response.followUp?.targetCandidateId !== vars.expectedFollowUpTargetId
  ) {
    return {
      pass: false,
      score: 0.5,
      reason: `Expected followUp.targetCandidateId "${vars.expectedFollowUpTargetId}" but received "${response.followUp?.targetCandidateId}"`,
    };
  }
  if (
    vars.expectedFollowUpTargetRole &&
    response.followUp?.targetRole !== vars.expectedFollowUpTargetRole
  ) {
    return {
      pass: false,
      score: 0.5,
      reason: `Expected followUp.targetRole "${vars.expectedFollowUpTargetRole}" but received "${response.followUp?.targetRole}"`,
    };
  }

  // 5. Spatial Ground-Truth Check for Winner Bounding Box (or Inspected Candidate Box on Round 2/3)
  if (vars.expectedWinnerBox && response.verdict?.winnerId) {
    const winner = response.candidates.find((c) => c.id === response.verdict?.winnerId);
    if (!winner) {
      return {
        pass: false,
        score: 0.3,
        reason: `Winner candidate "${response.verdict.winnerId}" not found in candidates list`,
      };
    }
    const gtBox = vars.expectedWinnerBox as BoundingBox;
    const iou = computeBoxIoU(winner.box, gtBox);
    const centerInside = isBoxCenterInside(winner.box, gtBox);
    const minIoU = typeof vars.minWinnerIoU === "number" ? vars.minWinnerIoU : 0.35;

    if (iou < minIoU && !centerInside) {
      return {
        pass: false,
        score: 0.4,
        reason: `Winner box [${winner.box.join(", ")}] did not match ground-truth winner region [${gtBox.join(", ")}] (IoU=${iou.toFixed(2)}, centerInside=${centerInside})`,
      };
    }
  }

  if (vars.expectedInspectedBox && response.candidates.length > 0) {
    const inspected = response.candidates[0];
    const gtBox = vars.expectedInspectedBox as BoundingBox;
    const iou = computeBoxIoU(inspected.box, gtBox);
    const centerInside = isBoxCenterInside(inspected.box, gtBox);
    const minIoU = typeof vars.minWinnerIoU === "number" ? vars.minWinnerIoU : 0.35;

    if (iou < minIoU && !centerInside) {
      return {
        pass: false,
        score: 0.4,
        reason: `Inspected candidate box [${inspected.box.join(", ")}] did not match ground-truth close-up region [${gtBox.join(", ")}] (IoU=${iou.toFixed(2)}, centerInside=${centerInside})`,
      };
    }
  }

  // 6. Spatial Ground-Truth Check for Runner-Up Bounding Box
  if (vars.expectedRunnerUpBox && response.verdict?.runnerUpId) {
    const runnerUp = response.candidates.find((c) => c.id === response.verdict?.runnerUpId);
    if (!runnerUp) {
      return {
        pass: false,
        score: 0.4,
        reason: `Runner-up candidate "${response.verdict.runnerUpId}" not found in candidates list`,
      };
    }
    const gtRunnerBox = vars.expectedRunnerUpBox as BoundingBox;
    const iou = computeBoxIoU(runnerUp.box, gtRunnerBox);
    const centerInside = isBoxCenterInside(runnerUp.box, gtRunnerBox);
    const minIoU = typeof vars.minRunnerUpIoU === "number" ? vars.minRunnerUpIoU : 0.35;

    if (iou < minIoU && !centerInside) {
      return {
        pass: false,
        score: 0.5,
        reason: `Runner-Up box [${runnerUp.box.join(", ")}] did not match ground-truth runner-up region [${gtRunnerBox.join(", ")}] (IoU=${iou.toFixed(2)}, centerInside=${centerInside})`,
      };
    }
  }

  // 7. Round 2/3 flipSummary Requirement
  if (vars.requireFlipSummaryNonNull) {
    const hasFlipSummary = response.candidates.some(
      (c) => typeof c.flipSummary === "string" && c.flipSummary.trim().length > 0
    );
    if (!hasFlipSummary) {
      return {
        pass: false,
        score: 0.6,
        reason: `Expected non-null flipSummary on close-up flip round ${round}, but all candidates had null/empty flipSummary`,
      };
    }
  }


  return {
    pass: true,
    score: 1.0,
    reason: "Passed ScanResponse schema, verifier invariants, and spatial ground-truth expectations",
  };
}
