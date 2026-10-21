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
  it("separates supported solo grading from unsupported comparisons", () => {
    const system = v1PromptConfig.buildSystemPrompt(makeRequest());
    expect(system).toContain("assess its visible maturity without requiring a second unit");
    expect(system).toContain("abstain if those cues are missing");
    expect(system).toContain("Minor variations within one apparent maturity stage are not distinct earlier and later stages");
    expect(system).toContain("A solo unit needs supported maturity grading, not a comparison winner");
    expect(system).toContain("Survey the ENTIRE eligible region before deciding");
    expect(system).toContain("Assess the actual exposed surfaces, not the presence of plastic");
    expect(system).toContain("every unit need not have a unique stage or score");
  });

  it("requires ripeness-ordered ranking: underripe must never outrank almost_ripe/ripe", () => {
    const system = v1PromptConfig.buildSystemPrompt(makeRequest());
    const user = v1PromptConfig.buildUserPrompt(makeRequest());

    expect(system).toContain("RANKING (SCORE ORDER MUST EVIDENCE RIPENESS)");
    expect(system).toMatch(/underripe must score strictly below every candidate classified almost_ripe or ripe/i);
    expect(system).toContain("No color, texture or surface feature is a universal ripeness cue");
    expect(system).toContain("Do not prescribe a score from a named color");
    expect(`${system} ${user}`).not.toMatch(/field spot|webbing|glossy green|stark white|golden/i);
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
    const request = makeRequest({ focusPolygon: polygon });
    const user = v1PromptConfig.buildUserPrompt(request);
    const system = v1PromptConfig.buildSystemPrompt(request);
    expect(system).toContain(JSON.stringify(polygon));
    expect(system).toContain("x=80..950, y=460..950");
    expect(system).toContain("USER SELECTION OVERRIDES FULL-DISPLAY DETECTION");

    // The polygon path shares the same system prompt and user coverage audit.
    expect(user).toContain("visible evidence within the selected region, never from an expected quantity");
    expect(user).toMatch(/runner-up must be the second-highest ripeness candidate/i);
  });
});


describe("Post-merge live-eval regressions", () => {
  it("separates actual produce presence, readable contents and maturity evidence before scoring", () => {
    const system = v1PromptConfig.buildSystemPrompt(makeRequest());
    expect(system).toContain("Printed food photographs");
    expect(system).toContain("never multiple_types or insufficient_evidence for a non-produce subject");
    expect(system).toContain("count sealed packs does not establish readable quality");
    expect(system).toContain("Shape, size, uniform appearance and absence of visible damage alone do not establish ripeness");
    const user = v1PromptConfig.buildUserPrompt(makeRequest());
    expect(user.indexOf("actual fresh produce presence")).toBeLessThan(user.indexOf("FINAL COVERAGE AUDIT"));
  });

  it.each([2, 3] as const)("preserves comparison observations on round %i without using them as current-photo evidence", (round) => {
    const request = makeRequest({
      round,
      followUpContext: {
        produceType: "avocado",
        produceDisplayName: "Avocado",
        targetCandidateId: "c2",
        targetRole: "runner_up",
        requestedInstruction: "Inspect the Avocado stem end.",
        previousWinner: { id: "c1", role: "first_pick", score: 8.6, ripeness: "ripe", traits: ["Even skin", "Intact stem"], anglesInspected: 1 },
        previousRunnerUp: { id: "c2", role: "runner_up", score: 8.1, ripeness: "almost_ripe", traits: ["Uneven skin"], anglesInspected: 1 },
      },
    });
    const user = v1PromptConfig.buildUserPrompt(request);
    expect(user).toContain('Previous winner "c1" scored 8.6/10 (ripe). Recorded observations: ["Even skin","Intact stem"]');
    expect(user).toContain('Previous runner-up "c2" scored 8.1/10 (almost_ripe). Recorded observations: ["Uneven skin"]');
    const system = v1PromptConfig.buildSystemPrompt(request);
    expect(system).toContain("those observations describe the earlier view");
    expect(system).toContain("An inspected underripe target cannot outrank a previously ripe");
    expect(system).toContain("A new angle does not itself improve ripeness");
    expect(user).toContain("CURRENT PHOTO OVERRIDES MEMORY");
  });
});
