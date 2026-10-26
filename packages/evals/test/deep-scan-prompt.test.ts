import { describe, expect, it } from "vitest";
import { getPromptConfig, deepScanPromptConfig, deepScanProviderSchema } from "@pomona/proxy";
import type { DeepScanRequest } from "@pomona/contract";

const request: DeepScanRequest = {
  schemaVersion: "1.0",
  sessionId: "0d0e9a64-fcbe-4a3d-a34f-a4fdf8b71d1c",
  locale: "pt-BR",
  imageBase64: "aGVsbG8=",
  imageMimeType: "image/webp",
  sampleCount: 25,
};

describe("deep_scan_v1 prompt config", () => {
  it("is registered under deep_scan_v1", () => {
    expect(getPromptConfig("deep_scan_v1")).toBe(deepScanPromptConfig);
    expect(deepScanPromptConfig.version).toBe("deep_scan_v1");
  });

  it("system prompt pins the composite framing and the guards", () => {
    const system = deepScanPromptConfig.buildSystemPrompt(request);
    for (const needle of [
      "same fruit",
      "numbered",
      "never destructive",
      "unknown",
      "poor",
      "fair",
      "good",
      "sufficientVisualEvidence",
      "0.8",
      "manualChecks",
      "insufficient_view_coverage",
      "same_side_only",
      "evidence",
    ]) {
      expect(system, `system prompt must mention "${needle}"`).toContain(needle);
    }
    expect(system).toContain("manualChecks"); // 0-3 produce-appropriate checks
    expect(system.toLowerCase()).toContain("no cutting");
  });

  it("reuse check: the DS prompt inlines the exact normal-scan storage rules from v1, not a rewritten copy", () => {
    const system = deepScanPromptConfig.buildSystemPrompt(request);
    expect(system).toContain(
      "Provide readyInDays (0 <= min <= max), eatWithinDays (1 <= min <= max <= 60), eatWithinLabel, and beforeCut/afterCut storage."
    );
    expect(system).toContain("eatWithinLabel<=28; storage whereLabel<=24, summary<=32, tip<=90");
    expect(system).toContain("afterPurchase free-text value");
    expect(system).toContain("never a substitute for a verdict: no afterPurchase value may reference tiles, views or the capture.");
  });

  it("shopper-facing language rule: evidence must name visible traits and never tiles/views/frames", () => {
    const system = deepScanPromptConfig.buildSystemPrompt(request);
    expect(system).toContain("NEVER mention tiles, views, frames, the composite or the capture process.");
  });

  it("interpolates the request locale and covers evidence limits", () => {
    const user = deepScanPromptConfig.buildUserPrompt(request);
    expect(user).toContain("pt-BR");
    expect(user).toContain("evidence");
    expect(user).toContain("tiles");
    expect(user).toContain("1");
    expect(user).toContain("6");
  });

  it("repair prompt keeps locale and lists the validation failures", () => {
    const repair = deepScanPromptConfig.buildUserPrompt(request, ["evidence must be present"]);
    expect(repair).toContain("pt-BR");
    expect(repair).toContain("evidence must be present");
    expect(repair.toLowerCase()).toContain("validation");
  });
});

describe("deepScanProviderSchema", () => {
  it("accepts a canonical deep-scan model payload", () => {
    const payload = {
      status: "ok",
      abstentionReason: null,
      message: null,
      produce: { type: "avocado", displayName: "Avocado", variety: null },
      ripeness: { state: "ripe", confidence: 0.85 },
      evidence: ["Tile 2: color shift into green-brown", "Tile 5: matte skin"],
      quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
      manualChecks: null,
      recommendation: null,
    afterPurchase: {
      readyInDays: { min: 1, max: 2 },
      eatWithinDays: { min: 3, max: 4 },
      eatWithinLabel: "3-4 days",
      storage: {
        beforeCut: { where: "counter", whereLabel: "Counter", summary: "Whole on the counter", tip: "Softens daily" },
        afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Sealed in the fridge", tip: "Keep chilled" },
      },
    },
    };
    expect(deepScanProviderSchema.safeParse(payload)).toMatchObject({ success: true });
  });
});

describe("deep_scan_v1 press cue (visible give while the shopper presses and rotates)", () => {
  const system = deepScanPromptConfig.buildSystemPrompt(request);
  const user = deepScanPromptConfig.buildUserPrompt(request);

  it("acceptance: visible dents under a fingertip support a ripe ready-now state, while a press with no dent is never firmness evidence", () => {
    expect(system).toContain("PRESS CUE");
    expect(system).toContain("thumb visibly sinks into the fruit, flattens the curved outline");
    expect(system).toContain("soft and ready to eat now");
    expect(system).toContain("with no visible dent is NOT evidence of firmness");
    expect(system).toContain("judge firmness only from colour and surface cues");
    expect(user).toContain("sinks into the fruit's outline or dimples the adjacent skin");
  });

  it("failure cases: hidden presses are ignored and never inferred, and press yield with deep creases or puffy separated skin is overripe while dark speckles on taut green skin are not", () => {
    expect(system).toContain("no finger is pressing");
    expect(system).toContain("never infer give that you cannot see");
    expect(system).toContain("deep horizontal or surface creases, folds, wrinkles, puffy/loose skin separating from the flesh");
    expect(system).toContain("classify as 'overripe' (never 'ripe')");
    expect(system).toContain("Do not mistake natural dark surface speckling or russeting on a taut, uncreased green skin for overripe decay");
  });

  it("keeps the abstention and touch guards: no smell, taste or unseen claims, no destructive checks", () => {
    expect(system).toContain("Never claim smell, taste or unseen internal quality from images");
    expect(system).toContain("claim touch only as allowed by the PRESS CUE rule");
    expect(system).toContain("Never infer hidden traits to force a verdict");
    expect(system).toContain("insufficient_evidence");
    expect(system.toLowerCase()).toContain("no cutting");
  });

  it("press evidence stays shopper-facing and never mentions tiles or the capture", () => {
    expect(system).toContain("without mentioning tiles, views or the capture");
  });
});
