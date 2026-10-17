import { verifyAndResolveScanResponse } from "@pomona/proxy";
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

  const vars = context.vars ?? {};
  const round = Number(vars.round ?? 1);
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

  // 1. Expected Status Check (e.g. "ok", "unclear_photo", "no_produce", "multiple_types")
  if (vars.expectedStatus && response.status !== vars.expectedStatus) {
    return {
      pass: false,
      score: 0.2,
      reason: `Expected status "${vars.expectedStatus}" but received "${response.status}"`,
    };
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

  // 2. Expected Produce Type Check
  if (
    vars.expectedProduceType &&
    response.produce &&
    response.produce.type !== vars.expectedProduceType
  ) {
    return {
      pass: false,
      score: 0.5,
      reason: `Expected produce type "${vars.expectedProduceType}" but received "${response.produce.type}"`,
    };
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

  // 8. Forbidden Cross-Produce Hallucination Words Check
  if (Array.isArray(vars.forbiddenWordsInCopy) && vars.forbiddenWordsInCopy.length > 0) {
    const serializedCopy = JSON.stringify({
      candidates: response.candidates.map((c) => ({ traits: c.traits, flipSummary: c.flipSummary })),
      verdict: response.verdict,
      followUp: response.followUp,
      afterPurchase: response.afterPurchase,
    }).toLowerCase();

    for (const word of vars.forbiddenWordsInCopy) {
      const lowerWord = String(word).toLowerCase();
      if (serializedCopy.includes(lowerWord)) {
        return {
          pass: false,
          score: 0.3,
          reason: `Hallucinated forbidden term "${lowerWord}" in response copy for produce "${response.produce?.displayName}"`,
        };
      }
    }
  }

  return {
    pass: true,
    score: 1.0,
    reason: "Passed ScanResponse schema, verifier invariants, and spatial ground-truth expectations",
  };
}
