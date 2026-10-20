import {
  ErrorMessageSchema,
  ScanResponseModelSchema,
  ScanResponseSchema,
  type ScanRequest,
  type ScanResponse,
  type Candidate,
  type Verdict,
  type FollowUp,
} from "@pomona/contract";
import { isPointInPolygon, isBoxInPolygon, isValidBoundingBox } from "./geometry";

/**
 * Deterministic 2-stage verifier and multi-round score resolution engine.
 *
 * Stage 1: Self-healing normalization + syntactic validation using ScanResponseModelSchema.
 * Stage 2: Semantic invariants:
 *   - produce, verdict, afterPurchase non-null when status === "ok"
 *   - bounding box validity & min dimensions
 *   - focusPolygon containment & candidate stripping on Round 1
 *   - winner & runner-up score ranking & multi-round promotion rules
 *   - shelf-life min/max sanity
 */
function trimMax(val: string, maxLen: number): string;
function trimMax(val: unknown, maxLen: number): unknown;
function trimMax(val: unknown, maxLen: number): unknown {
  if (typeof val !== "string" || val.length <= maxLen) return val;
  return val.slice(0, Math.max(1, maxLen - 1)).trimEnd() + "…";
}

function normalizeRawModelOutput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj: Record<string, any> = { ...(raw as Record<string, any>) };

  if (typeof obj.message === "string") {
    if (!ErrorMessageSchema.safeParse(obj.message).success) {
      const descriptions: Record<string, string> = {
        insufficient_evidence: "I cannot confidently choose from this view. Turn the produce to show the underside or stem.",
        unclear_photo: "The produce is obscured. Retake a clear photo with its surface visible.",
        no_produce: "No produce found. Take a photo of the fruit or vegetables you want to compare.",
        multiple_types: "Several produce types are visible. Draw around one type to compare it.",
      };
      obj.message = descriptions[obj.status] ?? "Analysis could not finish. Please take another photo and try again.";
    }
  }

  if (Array.isArray(obj.candidates)) {
    obj.candidates = obj.candidates.map((c: any) => {
      if (!c || typeof c !== "object") return c;
      const cand = { ...c };
      if (Array.isArray(cand.box) && cand.box.length > 4) {
        cand.box = cand.box.slice(0, 4);
      }
      if (typeof cand.score === "number" && cand.score > 10 && cand.score <= 100) {
        cand.score = Number((cand.score / 10).toFixed(1));
      }
      if (Array.isArray(cand.traits)) {
        cand.traits = cand.traits.slice(0, 4).map((t: any) => trimMax(t, 28));
      }
      if (typeof cand.flipSummary === "string") {
        cand.flipSummary = trimMax(cand.flipSummary, 80);
      }
      return cand;
    });
  }

  if (obj.verdict && typeof obj.verdict === "object") {
    obj.verdict = {
      ...obj.verdict,
      headline: trimMax(obj.verdict.headline, 32),
    };
  }

  if (obj.followUp && typeof obj.followUp === "object") {
    obj.followUp = {
      ...obj.followUp,
      bannerText: trimMax(obj.followUp.bannerText, 110),
      flipHeadline: trimMax(obj.followUp.flipHeadline, 48),
      instruction: trimMax(obj.followUp.instruction, 120),
    };
  }

  if (obj.afterPurchase && typeof obj.afterPurchase === "object") {
    const ap = { ...obj.afterPurchase };
    ap.eatWithinLabel = trimMax(ap.eatWithinLabel, 28);
    if (ap.storage && typeof ap.storage === "object") {
      const st = { ...ap.storage };
      if (st.beforeCut && typeof st.beforeCut === "object") {
        st.beforeCut = {
          ...st.beforeCut,
          whereLabel: trimMax(st.beforeCut.whereLabel, 24),
          summary: trimMax(st.beforeCut.summary, 32),
          tip: trimMax(st.beforeCut.tip, 90),
        };
      }
      if (st.afterCut && typeof st.afterCut === "object") {
        st.afterCut = {
          ...st.afterCut,
          whereLabel: trimMax(st.afterCut.whereLabel, 24),
          summary: trimMax(st.afterCut.summary, 32),
          tip: trimMax(st.afterCut.tip, 90),
        };
      }
      ap.storage = st;
    }
    obj.afterPurchase = ap;
  }

  return obj;
}

export function verifyAndResolveScanResponse(
  rawModelOutput: unknown,
  ctx: {
    request: ScanRequest;
    promptVersion: string;
    modelId: string;
  }
): { ok: true; response: ScanResponse } | { ok: false; errors: string[] } {
  // Stage 1: Deterministic Self-Healing Normalization + Syntactic Check
  const normalizedOutput = normalizeRawModelOutput(rawModelOutput);
  const parseResult = ScanResponseModelSchema.safeParse(normalizedOutput);
  if (!parseResult.success) {
    return {
      ok: false,
      errors: parseResult.error.errors.map(
        (err) => `${err.path.join(".") || "root"}: ${err.message}`
      ),
    };
  }

  const data = parseResult.data;

  // Do not let deterministic ranking turn admitted uncertainty into a purchase recommendation.
  if (data.status === "ok" && data.verdict?.confidence === "low") {
    data.status = "insufficient_evidence";
  }
  if (data.status === "insufficient_evidence") {
    data.message = data.message?.trim() || "I cannot confidently choose from this view. Turn the produce to show the underside or stem.";
    data.countedTotal = null;
    data.produce = null;
    data.candidates = [];
    data.verdict = null;
    data.followUp = null;
    data.afterPurchase = null;
  }

  // For non-ok model statuses, construct response without candidates/verdict requirements
  if (data.status !== "ok") {
    const fallbackResponse: ScanResponse = {
      schemaVersion: "1.0",
      promptVersion: ctx.promptVersion,
      modelId: ctx.modelId,
      round: ctx.request.round,
      status: data.status,
      message: data.message,
      countedTotal: data.countedTotal ?? null,
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

  // Candidate Bounding Box & Polygon Containment Filtering
  const rawCandidateCount = data.candidates.length;
  let candidates: Candidate[] = data.candidates.filter((c) =>
    isValidBoundingBox(c.box)
  );

  if (
    ctx.request.round === 1 &&
    ctx.request.focusPolygon &&
    ctx.request.focusPolygon.length >= 3
  ) {
    const polygon = ctx.request.focusPolygon;
    const beforePoly = candidates.length;
    candidates = candidates.filter((c) => {
      const inside = isBoxInPolygon(c.box, polygon, 80);
      return inside;
    });
    console.log(
      `[proxy:polygonFilter] Model returned ${rawCandidateCount} raw, ${beforePoly} valid boxes, ${candidates.length} inside polygon`
    );
  }

  // Round 1 count is defined after foreground, type, visibility, and polygon filtering.
  // Each eligible item must have exactly one valid candidate.
  if (ctx.request.round === 1 && typeof data.countedTotal === "number") {
    if (candidates.length !== data.countedTotal) {
      errors.push(
        `Count mismatch: countedTotal=${data.countedTotal} requires exactly ${data.countedTotal} valid candidates, but ${candidates.length} remain after validation`
      );
    }
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
    // Round 1: Sort candidates descending by score.
    // Deterministic tie-break for equal scores: prefer the topmost-then-leftmost box.
    // Scores within ±0.2 wobble otherwise decide ranks by noise, making the "winner"
    // unreproducible across runs; the position tie-break makes rank order stable.
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.box[0] !== b.box[0]) return a.box[0] - b.box[0];
      return a.box[1] - b.box[1];
    });
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

    runnerUpCandidate.id = targetId;
    candidates = [runnerUpCandidate];

    const prevWinner = followUpContext.previousWinner;
    if (runnerUpCandidate.score > prevWinner.score) {
      // Runner-Up beat previous winner: promote Runner-Up and offer Round 3 on 1st Pick
      resolvedVerdict.winnerId = runnerUpCandidate.id;
      resolvedVerdict.runnerUpId = prevWinner.id;
      if (resolvedFollowUp) {
        resolvedFollowUp.targetCandidateId = prevWinner.id;
        resolvedFollowUp.targetRole = "first_pick";
      } else {
        resolvedFollowUp = {
          targetCandidateId: prevWinner.id,
          targetRole: "first_pick",
          bannerText: trimMax(
            `1st Pick (${prevWinner.score}) was only graded from the top. Flip the ${followUpContext.produceDisplayName} for a final check.`,
            110
          ),
          flipHeadline: trimMax(
            `Flip your 1st pick ${followUpContext.produceDisplayName} over`,
            48
          ),
          instruction: trimMax(
            `Turn your 1st pick ${followUpContext.produceDisplayName} over to show its underside.`,
            120
          ),
        };
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

    firstPickCandidate.id = targetId;
    candidates = [firstPickCandidate];

    const prevWinner = followUpContext.previousWinner;
    if (firstPickCandidate.score >= prevWinner.score) {
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
    countedTotal: data.countedTotal ?? null,
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
