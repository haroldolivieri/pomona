import { describe, expect, it } from "vitest";
import { resolveCandidatesForTarget, TargetRipenessWindowSchema } from "../src";

describe("resolveCandidatesForTarget", () => {
  const sampleCandidates = [
    { id: "c1", box: [400, 100, 800, 500] as [number, number, number, number], score: 9.2, ripeness: "ripe" as const, traits: ["Deep yellow spot"], flipSummary: null },
    { id: "c2", box: [400, 500, 800, 900] as [number, number, number, number], score: 8.0, ripeness: "almost_ripe" as const, traits: ["Pale spot"], flipSummary: null },
    { id: "c3", box: [100, 300, 400, 700] as [number, number, number, number], score: 6.2, ripeness: "underripe" as const, traits: ["White spot"], flipSummary: null },
  ];

  it("ranks ripe candidate first for ready_now with original scores", () => {
    const res = resolveCandidatesForTarget(sampleCandidates, "ready_now");
    expect(res.winner?.id).toBe("c1");
    expect(res.runnerUp?.id).toBe("c2");
    expect(res.isExactMatch).toBe(true);
    expect(res.winner?.score).toBe(9.2);
    expect(res.followUpHintOverride).toBe("Check underside for sweetness before buying");
  });

  it("ranks almost_ripe candidate first for in_2_3_days and calculates suitability score", () => {
    const res = resolveCandidatesForTarget(sampleCandidates, "in_2_3_days");
    expect(res.winner?.id).toBe("c2");
    expect(res.isExactMatch).toBe(true);
    expect(res.winner?.score).toBeGreaterThanOrEqual(8.4);
    expect(res.followUpHintOverride).toBe("Check underside before storing for 2–3 days");
  });

  it("ranks underripe candidate first for later_this_week and calculates suitability score", () => {
    const res = resolveCandidatesForTarget(sampleCandidates, "later_this_week");
    expect(res.winner?.id).toBe("c3");
    expect(res.isExactMatch).toBe(true);
    expect(res.winner?.score).toBeGreaterThanOrEqual(8.3);
  });

  it("flags isExactMatch=false and gives advisory headline when no candidate matches target", () => {
    const allRipe = [sampleCandidates[0]];
    const res = resolveCandidatesForTarget(allRipe, "later_this_week");
    expect(res.isExactMatch).toBe(false);
    expect(res.mismatchReason).toBe("all_already_ripe");
    expect(res.badgeLabel).toBe("Closest match · Already ripe");
    expect(res.bannerNotice).toContain("All items in view are already ripe");
    expect(res.headline).toBe("No items will keep until later.");
    expect(res.eyebrow).toContain("CLOSEST MATCH");
  });
});
