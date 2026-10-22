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
    };
    expect(deepScanProviderSchema.safeParse(payload)).toMatchObject({ success: true });
  });
});
