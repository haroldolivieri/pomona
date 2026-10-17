import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { FlipCameraStage } from "../../src/components/FlipCameraStage";
import { initialScanMachineState } from "../../src/state/scan-state-machine";
import "../../src/i18n";

describe("FlipCameraStage (Mockup Parity)", () => {
  it("renders rectangular corner reticle, ivory prompt card, and role-styled PiP thumbnail for State 5A", () => {
    const state = {
      ...initialScanMachineState(),
      phase: "S5A_FlipRunnerUpCamera" as const,
      round: 2 as const,
      firstPick: { id: "c1", box: [360, 240, 680, 560] as [number, number, number, number], score: 8.6, initialScore: 8.6, anglesInspected: 1, role: "first_pick" as const, ripeness: "ripe" as const, traits: [], flipSummary: null },
      runnerUp: { id: "c2", box: [320, 580, 660, 900] as [number, number, number, number], score: 8.1, initialScore: 8.1, anglesInspected: 1, role: "runner_up" as const, ripeness: "almost_ripe" as const, traits: [], flipSummary: null },
      round1PhotoDataUrl: "data:image/png;base64,mock",
      lastResponse: {
        schemaVersion: "1.0" as const, promptVersion: "v1" as const, modelId: "test", round: 1 as const, status: "ok" as const, message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        candidates: [],
        verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high" as const, headline: "Buy it." },
        followUp: { targetCandidateId: "c2", targetRole: "runner_up" as const, bannerText: "Banner", flipHeadline: "Flip the Watermelon over", instruction: "Turn over" },
        afterPurchase: { readyInDays: { min: 0, max: 0 }, eatWithinDays: { min: 3, max: 5 }, eatWithinLabel: "3-5 days", storage: { beforeCut: { where: "counter" as const, whereLabel: "Counter", summary: "Counter", tip: "" }, afterCut: { where: "fridge" as const, whereLabel: "Fridge", summary: "Fridge", tip: "" } } },
      },
    };

    render(<FlipCameraStage state={state} onCapture={vi.fn()} onBack={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId("flip-reticle-brackets")).toBeInTheDocument();
    expect(screen.getByTestId("flip-instruction-card")).toHaveStyle({ backgroundColor: "rgba(251, 250, 246, 0.95)" });
    expect(screen.getByTestId("pip-reference-thumbnail")).toHaveTextContent("Runner-Up");
    expect(screen.getByTestId("back-button")).toBeInTheDocument();
    expect(screen.getByTestId("close-button")).toBeInTheDocument();
    expect(screen.getByTestId("flip-top-chip")).toHaveTextContent("Runner-Up · Step 2");
    expect(screen.getByTestId("flip-instruction-eyebrow")).toHaveTextContent("INSPECT RUNNER-UP");
    expect(screen.getByTestId("flip-score-pill")).toHaveTextContent("Winner to beat: 8.6 / 10");
  });

  it("renders State 6 parity with 1st Pick chip, gold eyebrow, and reclaim score pill", () => {
    const state = {
      ...initialScanMachineState(),
      phase: "S6_FlipFirstPickCamera" as const,
      round: 3 as const,
      firstPick: { id: "c1", box: [360, 240, 680, 560] as [number, number, number, number], score: 8.6, initialScore: 8.6, anglesInspected: 1, role: "first_pick" as const, ripeness: "ripe" as const, traits: [], flipSummary: null },
      runnerUp: { id: "c2", box: [320, 580, 660, 900] as [number, number, number, number], score: 9.0, initialScore: 8.1, anglesInspected: 2, role: "runner_up" as const, ripeness: "ripe" as const, traits: [], flipSummary: "sweet spot" },
      round1PhotoDataUrl: "data:image/png;base64,mock",
      lastResponse: {
        schemaVersion: "1.0" as const, promptVersion: "v1" as const, modelId: "test", round: 2 as const, status: "ok" as const, message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        candidates: [],
        verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high" as const, headline: "Buy this one." },
        followUp: { targetCandidateId: "c1", targetRole: "first_pick" as const, bannerText: "Banner", flipHeadline: "Flip your 1st pick over", instruction: "Turn over" },
        afterPurchase: { readyInDays: { min: 0, max: 0 }, eatWithinDays: { min: 3, max: 5 }, eatWithinLabel: "3-5 days", storage: { beforeCut: { where: "counter" as const, whereLabel: "Counter", summary: "Counter", tip: "" }, afterCut: { where: "fridge" as const, whereLabel: "Fridge", summary: "Fridge", tip: "" } } },
      },
    };

    render(<FlipCameraStage state={state} onCapture={vi.fn()} onBack={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId("flip-reticle-brackets")).toBeInTheDocument();
    expect(screen.getByTestId("pip-reference-thumbnail")).toHaveTextContent("1st Pick");
    expect(screen.getByTestId("flip-top-chip")).toHaveTextContent("1st Pick · Final Check");
    expect(screen.getByTestId("flip-instruction-eyebrow")).toHaveTextContent("FINAL CHECK · BEAT 9.0 TO RECLAIM");
    expect(screen.getByTestId("flip-score-pill")).toHaveTextContent("Current leader: 9.0 · 1st Pick: 8.6 (top only)");
    expect(screen.getByTestId("flip-shutter-button")).toBeInTheDocument();
  });

  it("renders flip-goal-pill in top bar with target ripeness info and adapts subtitle when target is in_2_3_days", () => {
    const state = {
      ...initialScanMachineState(),
      phase: "S5A_FlipRunnerUpCamera" as const,
      round: 2 as const,
      targetRipeness: "in_2_3_days" as const,
      firstPick: { id: "c2", box: [320, 580, 660, 900] as [number, number, number, number], score: 8.8, initialScore: 8.8, anglesInspected: 1, role: "first_pick" as const, ripeness: "almost_ripe" as const, traits: [], flipSummary: null },
      runnerUp: { id: "c1", box: [360, 240, 680, 560] as [number, number, number, number], score: 8.6, initialScore: 8.6, anglesInspected: 1, role: "runner_up" as const, ripeness: "ripe" as const, traits: [], flipSummary: null },
      round1PhotoDataUrl: "data:image/png;base64,mock",
      lastResponse: {
        schemaVersion: "1.0" as const, promptVersion: "v1" as const, modelId: "test", round: 1 as const, status: "ok" as const, message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        candidates: [],
        verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high" as const, headline: "Buy this one." },
        followUp: { targetCandidateId: "c1", targetRole: "runner_up" as const, bannerText: "Banner", flipHeadline: "Flip the Watermelon over", instruction: "Turn over" },
        afterPurchase: { readyInDays: { min: 2, max: 3 }, eatWithinDays: { min: 5, max: 7 }, eatWithinLabel: "5-7 days", storage: { beforeCut: { where: "counter" as const, whereLabel: "Counter", summary: "Counter", tip: "" }, afterCut: { where: "fridge" as const, whereLabel: "Fridge", summary: "Fridge", tip: "" } } },
      },
    };

    render(<FlipCameraStage state={state} onCapture={vi.fn()} onBack={vi.fn()} onClose={vi.fn()} />);
    const goalPill = screen.getByTestId("flip-goal-pill");
    expect(goalPill).toBeInTheDocument();
    expect(goalPill).toHaveTextContent("In 2–3 days");

    // Subtitle copy tailored to storage target
    expect(screen.getByTestId("flip-instruction-card")).toHaveTextContent(/check the underside for hidden bruises or uneven ripening/i);
  });
});
