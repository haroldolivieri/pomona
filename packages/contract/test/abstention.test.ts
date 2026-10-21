import { describe, expect, it } from "vitest";
import { getAbstentionContradiction } from "../src/abstention";

describe("assessed-tie evidence", () => {
  it("accepts a stated shared maturity stage", () => {
    expect(getAbstentionContradiction("assessed_tie", "All visible items appear uniformly ripe. Please show produce with a maturity contrast."))
      .toBeNull();
  });

  it.each([
    "No useful maturity difference is visible. Please show produce with a maturity contrast.",
    "Cannot assess the hidden maturity cues. Please show another angle.",
    "Uniformly ripe appearance prevents individual maturity assessment. Show a clearer display.",
  ])("rejects tie claims without positive evidence: %s", (message) => {
    expect(getAbstentionContradiction("assessed_tie", message)).toContain("positive visible evidence");
  });
});
