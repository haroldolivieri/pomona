import { describe, expect, it } from "vitest";
import type { ScanRequest } from "@pomona/contract";
import { v1PromptConfig } from "@pomona/proxy";

function makeRequest(overrides: Partial<ScanRequest> = {}): ScanRequest {
  return {
    schemaVersion: "1.0",
    sessionId: "00000000-0000-0000-0000-000000000000",
    round: 1,
    locale: "en-GB",
    imageBase64: "dummy",
    imageMimeType: "image/jpeg",
    focusPolygon: null,
    followUpContext: null,
    ...overrides,
  };
}

describe("Round-one prompt regression (CI flake fixes)", () => {
  it("requires ripeness-ordered ranking: underripe must never outrank almost_ripe/ripe", () => {
    const system = v1PromptConfig.buildSystemPrompt(makeRequest());
    const user = v1PromptConfig.buildUserPrompt(makeRequest());

    expect(system).toContain("RANKING (SCORE ORDER MUST EVIDENCE RIPENESS)");
    expect(system).toMatch(/underripe must score strictly below every candidate classified almost_ripe or ripe/i);
    expect(system).toMatch(/stark white or vivid green surface is underripe visual evidence/i);
    expect(user).toMatch(/runner-up must be the second-highest ripeness candidate/i);
  });

  it("requires evidence-based dense-pile coverage scoped to loose produce only", () => {
    const system = v1PromptConfig.buildSystemPrompt(makeRequest());
    const user = v1PromptConfig.buildUserPrompt(makeRequest());

    expect(system).toContain("DENSE-PILE COVERAGE (BLOCKING AUDIT)");
    expect(system).toContain("never target a minimum or maximum count");
    expect(`${system} ${user}`).not.toMatch(/(?:fewer than|below|at least|at most) \d+ (?:candidates|items)|tens of candidates/i);
    expect(system).toMatch(/ONLY to displays of loose individual produce/i);
    // the audit must never split bunches/packs or override status rules
    expect(system).toMatch(/NEVER splits? bunches, hands, packs or punnets/i);
    expect(system).toMatch(/multiple_types, unclear_photo or insufficient_evidence always win/i);
    expect(user).toContain("never from an expected quantity");
    expect(user).toMatch(/never splits? bunches, hands, packs or punnets/i);
  });

  it("keeps status rules dominant over counting instructions", () => {
    const user = v1PromptConfig.buildUserPrompt(makeRequest());

    expect(user).toMatch(/TYPE & EVIDENCE CHECK FIRST \(STATUS RULES WIN\)/i);
    expect(user).toMatch(/co-equal different produce types with no focusPolygon, return multiple_types/i);
    expect(user).toMatch(/status rules always outrank counting or coverage instructions/i);
  });

  it("applies the dense-pile audit and ranking rules identically with a focusPolygon", () => {
    const polygon: [number, number][] = [
      [80, 460],
      [950, 460],
      [950, 950],
      [80, 950],
    ];
    const user = v1PromptConfig.buildUserPrompt(makeRequest({ focusPolygon: polygon }));

    // The polygon path shares the same system prompt and user coverage audit.
    expect(user).toContain("visible evidence within the selected region, never from an expected quantity");
    expect(user).toMatch(/runner-up must be the second-highest ripeness candidate/i);
  });
});
