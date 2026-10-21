import { describe, expect, it } from "vitest";
import { isPointInPolygon, isValidBoundingBox } from "../src/verifier/geometry";
import { verifyAndResolveScanResponse } from "../src/verifier/verify-response";

describe("geometry & semantic verifier", () => {
  const square: [number, number][] = [[200, 200], [800, 200], [800, 800], [200, 800]];

  it("checks point-in-polygon with tolerance and validates box dimensions", () => {
    expect(isPointInPolygon([500, 500], square)).toBe(true);
    expect(isPointInPolygon([50, 50], square)).toBe(false);
    expect(isValidBoundingBox([100, 100, 400, 500])).toBe(true);
    expect(isValidBoundingBox([400, 100, 100, 500])).toBe(false);
    expect(isValidBoundingBox([100, 100, 110, 115])).toBe(false); // < 20 minSize
  });

  it("rejects out-of-selection count mismatches and ranks eligible candidates", () => {
    const rawOutput = {
        status: "ok",
        message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        countedTotal: 2,
        candidates: [
          { id: "outside", box: [10, 10, 90, 90], score: 9.5, ripeness: "ripe", traits: ["Matte rind"], flipSummary: null },
          { id: "inside1", box: [300, 300, 600, 600], score: 8.6, ripeness: "ripe", traits: ["Yellow field spot"], flipSummary: null },
          { id: "inside2", box: [400, 400, 700, 700], score: 8.1, ripeness: "almost_ripe", traits: ["Even form"], flipSummary: null },
        ],
        verdict: { winnerId: "outside", runnerUpId: "inside1", confidence: "high", headline: "Buy it." },
        followUp: {
          targetCandidateId: "inside2",
          targetRole: "runner_up",
          bannerText: "Flip the Runner-Up Watermelon.",
          flipHeadline: "Flip the Watermelon over",
          instruction: "Show the underside of the Watermelon.",
        },
        afterPurchase: {
          readyInDays: { min: 0, max: 0 },
          eatWithinDays: { min: 3, max: 5 },
          eatWithinLabel: "3–5 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
          },
        },
      };
    const context: Parameters<typeof verifyAndResolveScanResponse>[1] = {
        promptVersion: "v1",
        modelId: "gemini-2.5-flash",
        request: {
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 1,
          locale: "en-GB",
          imageBase64: "abc",
          imageMimeType: "image/webp",
          focusPolygon: square,
          followUpContext: null,
        },
      };
    const outside = verifyAndResolveScanResponse(rawOutput, context);
    expect(outside.ok).toBe(false);
    const res = verifyAndResolveScanResponse({ ...rawOutput, candidates: rawOutput.candidates.slice(1) }, context);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.response.candidates.map((c) => c.id)).toEqual(["inside1", "inside2"]);
      expect(res.response.verdict?.winnerId).toBe("inside1");
      expect(res.response.verdict?.runnerUpId).toBe("inside2");
    }
    const countMismatch = verifyAndResolveScanResponse(
      { ...rawOutput, countedTotal: 3 },
      context
    );
    expect(countMismatch.ok).toBe(false);
    if (!countMismatch.ok) {
      expect(countMismatch.errors).toContain(
        "Count mismatch: countedTotal=3 requires exactly 3 valid candidates, but 2 remain after validation"
      );
    }
  });

  it("resolves Round 2 when Runner-Up beats 1st Pick (9.0 vs 8.6) by promoting Runner-Up and offering Round 3 final check on 1st Pick", () => {
    const res = verifyAndResolveScanResponse(
      {
        status: "ok",
        message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        countedTotal: null,
        candidates: [
          { id: "c2", box: [200, 200, 800, 800], score: 9.0, ripeness: "ripe", traits: ["Deep creamy spot"], flipSummary: "deep creamy spot" },
        ],
        verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high", headline: "Buy this one." },
        followUp: {
          targetCandidateId: "c1",
          targetRole: "first_pick",
          bannerText: "1st Pick (8.6) was only graded from the top. Flip it too for a fair final check, or take this one now.",
          flipHeadline: "Flip your 1st pick over",
          instruction: "Show the other side of the Watermelon.",
        },
        afterPurchase: {
          readyInDays: { min: 0, max: 0 },
          eatWithinDays: { min: 3, max: 5 },
          eatWithinLabel: "3–5 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
          },
        },
      },
      {
        promptVersion: "v1",
        modelId: "gemini-2.5-flash",
        request: {
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 2,
          locale: "en-GB",
          imageBase64: "abc",
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: {
            produceType: "watermelon",
            produceDisplayName: "Watermelon",
            targetCandidateId: "c2",
            targetRole: "runner_up",
            requestedInstruction: "Show the underside",
            previousWinner: { id: "c1", role: "first_pick", score: 8.6, ripeness: "ripe", traits: ["Yellow field spot"], anglesInspected: 1 },
            previousRunnerUp: { id: "c2", role: "runner_up", score: 8.1, ripeness: "almost_ripe", traits: ["Matte rind"], anglesInspected: 1 },
          },
        },
      }
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.response.verdict?.winnerId).toBe("c2");
      expect(res.response.followUp?.targetRole).toBe("first_pick");
      expect(res.response.followUp?.targetCandidateId).toBe("c1");
    }
  });

  it("resolves Round 2 when Runner-Up loses or ties (7.2 <= 8.6) by keeping 1st Pick as winner and setting followUp to null", () => {
    const res = verifyAndResolveScanResponse(
      {
        status: "ok",
        message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        countedTotal: null,
        candidates: [
          { id: "c2", box: [200, 200, 800, 800], score: 7.2, ripeness: "almost_ripe", traits: ["Pale spot"], flipSummary: "pale underside" },
        ],
        verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st pick." },
        followUp: null,
        afterPurchase: {
          readyInDays: { min: 0, max: 0 },
          eatWithinDays: { min: 3, max: 5 },
          eatWithinLabel: "3–5 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
          },
        },
      },
      {
        promptVersion: "v1",
        modelId: "gemini-2.5-flash",
        request: {
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 2,
          locale: "en-GB",
          imageBase64: "abc",
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: {
            produceType: "watermelon",
            produceDisplayName: "Watermelon",
            targetCandidateId: "c2",
            targetRole: "runner_up",
            requestedInstruction: "Show the underside",
            previousWinner: { id: "c1", role: "first_pick", score: 8.6, ripeness: "ripe", traits: ["Yellow field spot"], anglesInspected: 1 },
            previousRunnerUp: { id: "c2", role: "runner_up", score: 8.1, ripeness: "almost_ripe", traits: ["Matte rind"], anglesInspected: 1 },
          },
        },
      }
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.response.verdict?.winnerId).toBe("c1");
      expect(res.response.followUp).toBeNull();
    }
  });

  it("self-heals cosmetic model formatting quirks (0-100 scores, >4 box coordinates, long badge strings) and allows color descriptors like 'orange spot'", () => {
    const res = verifyAndResolveScanResponse(
      {
        status: "ok",
        message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: "Seedless" },
        countedTotal: 2,
        candidates: [
          {
            id: "c1",
            box: [200, 200, 500, 500, 5, 6],
            score: 92,
            ripeness: "ripe",
            traits: ["Deep creamy yellow ground spot with rich sugar webbing"],
            flipSummary: null,
          },
          {
            id: "c2",
            box: [500, 500, 800, 800],
            score: 80,
            ripeness: "almost_ripe",
            traits: ["Pale spot"],
            flipSummary: null,
          },
        ],
        verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy it." },
        followUp: {
          targetCandidateId: "c2",
          targetRole: "runner_up",
          bannerText: "Turn the Runner-Up Watermelon to check for a deep orange field spot.",
          flipHeadline: "Flip the Watermelon over",
          instruction: "Turn the Runner-Up Watermelon to show its underside.",
        },
        afterPurchase: {
          readyInDays: { min: 0, max: 1 },
          eatWithinDays: { min: 2, max: 4 },
          eatWithinLabel: "2–4 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
          },
        },
      },
      {
        promptVersion: "v1",
        modelId: "gemini-3.5-flash-lite",
        request: {
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 1,
          locale: "en-GB",
          imageBase64: "abc",
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: null,
        },
      }
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.response.candidates[0].score).toBe(9.2);
      expect(res.response.candidates[0].box).toEqual([200, 200, 500, 500]);
      expect(res.response.candidates[0].traits[0].length).toBeLessThanOrEqual(28);
    }
  });

  it("resolves Round 3 when 1st Pick reclaims win with higher score (9.3 > 9.0) and forces followUp to null", () => {
    const res = verifyAndResolveScanResponse(
      {
        status: "ok",
        message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        countedTotal: null,
        candidates: [
          { id: "c1", box: [200, 200, 800, 800], score: 9.3, ripeness: "ripe", traits: ["Deep creamy spot"], flipSummary: "perfect creamy spot" },
        ],
        verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st pick." },
        followUp: {
          targetCandidateId: "c2",
          targetRole: "runner_up",
          bannerText: "Extra check banner",
          flipHeadline: "Flip candidate",
          instruction: "Show other angle",
        },
        afterPurchase: {
          readyInDays: { min: 0, max: 0 },
          eatWithinDays: { min: 3, max: 5 },
          eatWithinLabel: "3–5 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
          },
        },
      },
      {
        promptVersion: "v1",
        modelId: "gemini-2.5-flash",
        request: {
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 3,
          locale: "en-GB",
          imageBase64: "abc",
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: {
            produceType: "watermelon",
            produceDisplayName: "Watermelon",
            targetCandidateId: "c1",
            targetRole: "first_pick",
            requestedInstruction: "Show the other side",
            previousWinner: { id: "c2", role: "runner_up", score: 9.0, ripeness: "ripe", traits: ["Deep creamy spot"], anglesInspected: 2 },
            previousRunnerUp: { id: "c1", role: "first_pick", score: 8.6, ripeness: "ripe", traits: ["Yellow field spot"], anglesInspected: 1 },
          },
        },
      }
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.response.verdict?.winnerId).toBe("c1");
      expect(res.response.verdict?.runnerUpId).toBe("c2");
      expect(res.response.followUp).toBeNull();
    }
  });

  it("resolves Round 3 on tie score (9.0 vs 9.0) by letting 1st Pick reclaim the win and forcing followUp to null", () => {
    const res = verifyAndResolveScanResponse(
      {
        status: "ok",
        message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        countedTotal: null,
        candidates: [
          { id: "c1", box: [200, 200, 800, 800], score: 9.0, ripeness: "ripe", traits: ["Creamy spot"], flipSummary: "creamy spot" },
        ],
        verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high", headline: "Buy this one." },
        followUp: null,
        afterPurchase: {
          readyInDays: { min: 0, max: 0 },
          eatWithinDays: { min: 3, max: 5 },
          eatWithinLabel: "3–5 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
          },
        },
      },
      {
        promptVersion: "v1",
        modelId: "gemini-2.5-flash",
        request: {
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 3,
          locale: "en-GB",
          imageBase64: "abc",
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: {
            produceType: "watermelon",
            produceDisplayName: "Watermelon",
            targetCandidateId: "c1",
            targetRole: "first_pick",
            requestedInstruction: "Show the other side",
            previousWinner: { id: "c2", role: "runner_up", score: 9.0, ripeness: "ripe", traits: ["Deep creamy spot"], anglesInspected: 2 },
            previousRunnerUp: { id: "c1", role: "first_pick", score: 8.6, ripeness: "ripe", traits: ["Yellow field spot"], anglesInspected: 1 },
          },
        },
      }
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.response.verdict?.winnerId).toBe("c1");
      expect(res.response.verdict?.runnerUpId).toBe("c2");
      expect(res.response.followUp).toBeNull();
    }
  });

  it("resolves Round 3 when Runner-Up retains win with higher score (8.4 < 9.0) and forces followUp to null", () => {
    const res = verifyAndResolveScanResponse(
      {
        status: "ok",
        message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        countedTotal: null,
        candidates: [
          { id: "c1", box: [200, 200, 800, 800], score: 8.4, ripeness: "ripe", traits: ["Faded spot"], flipSummary: "faded spot" },
        ],
        verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st pick." },
        followUp: {
          targetCandidateId: "c2",
          targetRole: "runner_up",
          bannerText: "Another check",
          flipHeadline: "Flip",
          instruction: "Turn over",
        },
        afterPurchase: {
          readyInDays: { min: 0, max: 0 },
          eatWithinDays: { min: 3, max: 5 },
          eatWithinLabel: "3–5 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
          },
        },
      },
      {
        promptVersion: "v1",
        modelId: "gemini-2.5-flash",
        request: {
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 3,
          locale: "en-GB",
          imageBase64: "abc",
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: {
            produceType: "watermelon",
            produceDisplayName: "Watermelon",
            targetCandidateId: "c1",
            targetRole: "first_pick",
            requestedInstruction: "Show the other side",
            previousWinner: { id: "c2", role: "runner_up", score: 9.0, ripeness: "ripe", traits: ["Deep creamy spot"], anglesInspected: 2 },
            previousRunnerUp: { id: "c1", role: "first_pick", score: 8.6, ripeness: "ripe", traits: ["Yellow field spot"], anglesInspected: 1 },
          },
        },
      }
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.response.verdict?.winnerId).toBe("c2");
      expect(res.response.verdict?.runnerUpId).toBe("c1");
      expect(res.response.followUp).toBeNull();
    }
  });

  it("resolves Round 2 comparison cleanly when targetRipeness is in_2_3_days", () => {
    const res = verifyAndResolveScanResponse(
      {
        status: "ok",
        message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        countedTotal: null,
        candidates: [
          { id: "c2", box: [200, 200, 800, 800], score: 8.8, ripeness: "almost_ripe", traits: ["Pale spot"], flipSummary: "clean pale spot" },
        ],
        verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high", headline: "Buy this one." },
        followUp: {
          targetCandidateId: "c1",
          targetRole: "first_pick",
          bannerText: "Final check",
          flipHeadline: "Flip",
          instruction: "Turn over",
        },
        afterPurchase: {
          readyInDays: { min: 2, max: 3 },
          eatWithinDays: { min: 5, max: 7 },
          eatWithinLabel: "5–7 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
          },
        },
      },
      {
        promptVersion: "v1",
        modelId: "gemini-2.5-flash",
        request: {
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 2,
          locale: "en-GB",
          imageBase64: "abc",
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: {
            produceType: "watermelon",
            produceDisplayName: "Watermelon",
            targetCandidateId: "c2",
            targetRole: "runner_up",
            targetRipeness: "in_2_3_days",
            requestedInstruction: "Check underside for bruises before storing 2-3 days",
            previousWinner: { id: "c1", role: "first_pick", score: 8.4, ripeness: "ripe", traits: ["Ripe melon"], anglesInspected: 1 },
            previousRunnerUp: { id: "c2", role: "runner_up", score: 8.0, ripeness: "almost_ripe", traits: ["Pale spot"], anglesInspected: 1 },
          },
        },
      }
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.response.verdict?.winnerId).toBe("c2");
      expect(res.response.verdict?.runnerUpId).toBe("c1");
    }
  });
});
