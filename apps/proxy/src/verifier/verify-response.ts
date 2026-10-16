import {
  ScanResponseModelSchema,
  ScanResponseSchema,
  type ScanRequest,
  type ScanResponse,
  type Candidate,
  type Verdict,
  type FollowUp,
} from "@pomona/contract";
import { isPointInPolygon, isValidBoundingBox } from "./geometry";

const KNOWN_PRODUCE_NAMES = [
  "watermelon",
  "cantaloupe",
  "honeydew",
  "melon",
  "avocado",
  "pineapple",
  "banana",
  "tomato",
  "mango",
  "papaya",
  "peach",
  "plum",
  "apple",
  "orange",
  "pear",
  "lemon",
  "lime",
  "grapefruit",
  "strawberry",
  "blueberry",
  "raspberry",
  "blackberry",
  "kiwi",
  "grape",
  "cherry",
  "apricot",
  "fig",
  "pomegranate",
  "coconut",
  "guava",
  "persimmon",
  "cucumber",
  "eggplant",
  "squash",
  "pumpkin",
  "zucchini",
];

function getAllowedProduceTokens(produce: {
  type: string;
  displayName: string;
  variety: string | null;
}): Set<string> {
  const allowedTokens = new Set<string>();
  const text = `${produce.displayName} ${produce.type} ${produce.variety ?? ""}`.toLowerCase();
  const tokens = text.split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    allowedTokens.add(token);
    if (token.endsWith("s") && token.length > 3) {
      allowedTokens.add(token.slice(0, -1));
    }
  }
  return allowedTokens;
}

/**
 * Deterministic 2-stage verifier and multi-round score resolution engine.
 *
 * Stage 1: Syntactic validation using ScanResponseModelSchema.
 * Stage 2: Semantic invariants:
 *   - produce, verdict, afterPurchase non-null when status === "ok"
 *   - bounding box validity & min dimensions
 *   - focusPolygon containment & candidate stripping on Round 1
 *   - winner & runner-up score ranking & multi-round promotion rules
 *   - shelf-life min/max sanity
 *   - parameterized copy verification (rejecting mismatched produce names)
 */
export function verifyAndResolveScanResponse(
  rawModelOutput: unknown,
  ctx: {
    request: ScanRequest;
    promptVersion: string;
    modelId: string;
  }
): { ok: true; response: ScanResponse } | { ok: false; errors: string[] } {
  // Stage 1: Syntactic Check
  const parseResult = ScanResponseModelSchema.safeParse(rawModelOutput);
  if (!parseResult.success) {
    return {
      ok: false,
      errors: parseResult.error.errors.map(
        (err) => `${err.path.join(".") || "root"}: ${err.message}`
      ),
    };
  }

  const data = parseResult.data;

  // For non-ok model statuses, construct response without candidates/verdict requirements
  if (data.status !== "ok") {
    const fallbackResponse: ScanResponse = {
      schemaVersion: "1.0",
      promptVersion: ctx.promptVersion,
      modelId: ctx.modelId,
      round: ctx.request.round,
      status: data.status,
      message: data.message,
      produce: data.produce,
      candidates: data.candidates,
      verdict: data.verdict,
      followUp: data.followUp,
      afterPurchase: data.afterPurchase,
    };
    const finalCheck = ScanResponseSchema.safeParse(fallbackResponse);
    if (!finalCheck.success) {
      return {
        ok: false,
        errors: finalCheck.error.errors.map(
          (e) => `${e.path.join(".") || "root"}: ${e.message}`
        ),
      };
    }
    return { ok: true, response: finalCheck.data };
  }

  // Stage 2: Semantic Invariant Verifier
  const errors: string[] = [];

  if (!data.produce) {
    errors.push("produce must not be null when status is ok");
  }
  if (!data.verdict) {
    errors.push("verdict must not be null when status is ok");
  }
  if (!data.afterPurchase) {
    errors.push("afterPurchase must not be null when status is ok");
  }

  // Shelf-Life Sanity
  if (data.afterPurchase) {
    if (data.afterPurchase.readyInDays.min > data.afterPurchase.readyInDays.max) {
      errors.push(
        `readyInDays.min (${data.afterPurchase.readyInDays.min}) must be <= readyInDays.max (${data.afterPurchase.readyInDays.max})`
      );
    }
    if (data.afterPurchase.eatWithinDays.min > data.afterPurchase.eatWithinDays.max) {
      errors.push(
        `eatWithinDays.min (${data.afterPurchase.eatWithinDays.min}) must be <= eatWithinDays.max (${data.afterPurchase.eatWithinDays.max})`
      );
    }
  }

  // Parameterized Copy Check
  if (data.followUp && data.produce) {
    const combinedFollowUp = [
      data.followUp.bannerText,
      data.followUp.flipHeadline,
      data.followUp.instruction,
    ]
      .join(" ")
      .toLowerCase();

    const allowedTokens = getAllowedProduceTokens(data.produce);
    const detectedMismatches = new Set<string>();

    for (const produceName of KNOWN_PRODUCE_NAMES) {
      const regex = new RegExp(`\\b${produceName}(?:s|es)?\\b`, "i");
      if (regex.test(combinedFollowUp)) {
        const singular =
          produceName.endsWith("s") && produceName.length > 3
            ? produceName.slice(0, -1)
            : produceName;
        if (!allowedTokens.has(produceName) && !allowedTokens.has(singular)) {
          detectedMismatches.add(produceName);
        }
      }
    }

    for (const mismatch of detectedMismatches) {
      errors.push(
        `followUp copy mentions conflicting produce name "${mismatch}" when produce is "${data.produce.displayName}"`
      );
    }
  }

  // Candidate Bounding Box & Polygon Containment Filtering
  let candidates: Candidate[] = data.candidates.filter((c) =>
    isValidBoundingBox(c.box)
  );

  if (
    ctx.request.round === 1 &&
    ctx.request.focusPolygon &&
    ctx.request.focusPolygon.length >= 3
  ) {
    const polygon = ctx.request.focusPolygon;
    candidates = candidates.filter((c) => {
      // Box is [ymin, xmin, ymax, xmax] -> Center is [x, y]
      const centerX = Math.round((c.box[1] + c.box[3]) / 2);
      const centerY = Math.round((c.box[0] + c.box[2]) / 2);
      return isPointInPolygon([centerX, centerY], polygon);
    });
  }

  if (candidates.length < 1) {
    errors.push("candidates must contain at least 1 valid candidate");
  }

  if (errors.length > 0 || !data.verdict) {
    return { ok: false, errors };
  }

  // Multi-Round Winner, Runner-Up & Follow-Up Resolution
  let resolvedVerdict: Verdict = { ...data.verdict };
  let resolvedFollowUp: FollowUp | null = data.followUp
    ? { ...data.followUp }
    : null;

  if (ctx.request.round === 1) {
    // Round 1: Sort candidates descending by score
    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0];
    const runnerUp = candidates.length > 1 ? candidates[1] : null;

    resolvedVerdict.winnerId = winner.id;
    resolvedVerdict.runnerUpId = runnerUp ? runnerUp.id : null;

    if (runnerUp) {
      if (resolvedFollowUp) {
        resolvedFollowUp.targetCandidateId = runnerUp.id;
        resolvedFollowUp.targetRole = "runner_up";
      } else {
        errors.push(
          "followUp must not be null on Round 1 when runnerUpId is present"
        );
      }
    } else {
      resolvedVerdict.runnerUpId = null;
      resolvedFollowUp = null;
    }
  } else if (ctx.request.round === 2) {
    // Round 2: Compare Runner-Up against previousWinner
    const followUpContext = ctx.request.followUpContext;
    if (!followUpContext) {
      errors.push("followUpContext is required for round 2");
      return { ok: false, errors };
    }

    const targetId = followUpContext.targetCandidateId;
    const runnerUpCandidate =
      candidates.find((c) => c.id === targetId) ?? candidates[0];

    if (!runnerUpCandidate) {
      errors.push(`Runner-up candidate "${targetId}" not found in candidates`);
      return { ok: false, errors };
    }

    const prevWinner = followUpContext.previousWinner;
    if (runnerUpCandidate.score > prevWinner.score) {
      // Runner-Up beat previous winner: promote Runner-Up and offer Round 3 on 1st Pick
      resolvedVerdict.winnerId = runnerUpCandidate.id;
      resolvedVerdict.runnerUpId = prevWinner.id;
      if (resolvedFollowUp) {
        resolvedFollowUp.targetCandidateId = prevWinner.id;
        resolvedFollowUp.targetRole = "first_pick";
      }
    } else {
      // Runner-Up lost or tied: keep 1st Pick as winner and force followUp to null
      resolvedVerdict.winnerId = prevWinner.id;
      resolvedVerdict.runnerUpId = runnerUpCandidate.id;
      resolvedFollowUp = null;
    }
  } else if (ctx.request.round === 3) {
    // Round 3: Update 1st Pick score, resolve winner, force followUp to null (hard ceiling)
    const followUpContext = ctx.request.followUpContext;
    if (!followUpContext) {
      errors.push("followUpContext is required for round 3");
      return { ok: false, errors };
    }

    const targetId = followUpContext.targetCandidateId;
    const firstPickCandidate =
      candidates.find((c) => c.id === targetId) ?? candidates[0];

    if (!firstPickCandidate) {
      errors.push(`First-pick candidate "${targetId}" not found in candidates`);
      return { ok: false, errors };
    }

    const prevWinner = followUpContext.previousWinner;
    if (firstPickCandidate.score > prevWinner.score) {
      resolvedVerdict.winnerId = firstPickCandidate.id;
      resolvedVerdict.runnerUpId = prevWinner.id;
    } else {
      resolvedVerdict.winnerId = prevWinner.id;
      resolvedVerdict.runnerUpId = firstPickCandidate.id;
    }

    resolvedFollowUp = null;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const fullResponse: ScanResponse = {
    schemaVersion: "1.0",
    promptVersion: ctx.promptVersion,
    modelId: ctx.modelId,
    round: ctx.request.round,
    status: data.status,
    message: data.message,
    produce: data.produce,
    candidates,
    verdict: resolvedVerdict,
    followUp: resolvedFollowUp,
    afterPurchase: data.afterPurchase,
  };

  const finalCheck = ScanResponseSchema.safeParse(fullResponse);
  if (!finalCheck.success) {
    return {
      ok: false,
      errors: finalCheck.error.errors.map(
        (e) => `${e.path.join(".") || "root"}: ${e.message}`
      ),
    };
  }

  return { ok: true, response: finalCheck.data };
}
