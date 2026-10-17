import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { PomonaApp } from "../src/App";
import { createNoopTelemetry } from "../src/lib/telemetry";
import "../src/i18n";

describe("<PomonaApp /> integration across all 10 states, themes, and parameterized copy", () => {
  it("renders S4_InitialResult with explicit Before cut & After cut storage cards and single 'Compare with Runner-Up' CTA, then transitions through S5A -> S5B-2 -> S6 -> S7A", async () => {
    const mockScan = vi
      .fn()
      // Round 1: Avocado crate (verifies parameterized produce copy, not watermelon)
      .mockResolvedValueOnce({
        remainingScans: 9,
        response: {
          schemaVersion: "1.0",
          promptVersion: "v1",
          modelId: "gemini-2.5-flash",
          round: 1,
          status: "ok",
          message: null,
          produce: { type: "avocado", displayName: "Hass Avocado", variety: "Hass" },
          candidates: [
            { id: "c1", box: [385, 370, 625, 655], score: 8.6, ripeness: "ripe", traits: ["Dark pebbled skin", "Intact stem"], flipSummary: null },
            { id: "c2", box: [380, 645, 590, 925], score: 8.1, ripeness: "almost_ripe", traits: ["Even shape"], flipSummary: null },
          ],
          verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy it." },
          followUp: {
            targetCandidateId: "c2",
            targetRole: "runner_up",
            bannerText: "The blue-marked Hass Avocado could be better. Flip it and snap.",
            flipHeadline: "Flip the Hass Avocado over",
            instruction: "Turn the blue-marked Hass Avocado to show its stem base.",
          },
          afterPurchase: {
            readyInDays: { min: 0, max: 0 },
            eatWithinDays: { min: 2, max: 3 },
            eatWithinLabel: "2–3 days",
            storage: {
              beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep at room temperature" },
              afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Spritz with lime and wrap tightly" },
            },
          },
        },
      })
      // Round 2: Runner-Up takes the lead (9.0 vs 8.6) -> S5B2_RunnerUpTookLead
      .mockResolvedValueOnce({
        remainingScans: 8,
        response: {
          schemaVersion: "1.0",
          promptVersion: "v1",
          modelId: "gemini-2.5-flash",
          round: 2,
          status: "ok",
          message: null,
          produce: { type: "avocado", displayName: "Hass Avocado", variety: "Hass" },
          candidates: [
            { id: "c2", box: [200, 200, 800, 800], score: 9.0, ripeness: "ripe", traits: ["Green stem base", "No bruising"], flipSummary: "clean green stem base" },
          ],
          verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high", headline: "Buy this one." },
          followUp: {
            targetCandidateId: "c1",
            targetRole: "first_pick",
            bannerText: "1st Pick (8.6) was only graded from the top. Flip it too for a fair final check, or take this one now.",
            flipHeadline: "Flip your 1st pick over",
            instruction: "Turn the yellow-marked Hass Avocado to show its stem base.",
          },
          afterPurchase: {
            readyInDays: { min: 0, max: 0 },
            eatWithinDays: { min: 2, max: 3 },
            eatWithinLabel: "2–3 days",
            storage: {
              beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
              afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
            },
          },
        },
      })
      // Round 3: 1st Pick wins final flip (9.3 vs 9.0) -> S7A_FirstPickWonFinal
      .mockResolvedValueOnce({
        remainingScans: 7,
        response: {
          schemaVersion: "1.0",
          promptVersion: "v1",
          modelId: "gemini-2.5-flash",
          round: 3,
          status: "ok",
          message: null,
          produce: { type: "avocado", displayName: "Hass Avocado", variety: "Hass" },
          candidates: [
            { id: "c1", box: [200, 200, 800, 800], score: 9.3, ripeness: "ripe", traits: ["Bright green stem", "Uniform give"], flipSummary: "bright green stem base" },
          ],
          verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st pick." },
          followUp: null,
          afterPurchase: {
            readyInDays: { min: 0, max: 0 },
            eatWithinDays: { min: 2, max: 3 },
            eatWithinLabel: "2–3 days",
            storage: {
              beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
              afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
            },
          },
        },
      });

    const apiClient = {
      getQuota: vi.fn().mockResolvedValue({ remainingDeviceScans: 10, budgetOpen: true }),
      submitScan: mockScan,
    };

    render(<PomonaApp apiClient={apiClient} telemetry={createNoopTelemetry()} />);

    // State 1 -> Snap photo -> State 2
    fireEvent.click(screen.getByTestId("shutter-button"));
    expect(await screen.findByTestId("stage-S2_DrawFocusArea")).toBeTruthy();

    // State 2 -> Whole Photo -> State 3 -> State 4
    fireEvent.click(screen.getByTestId("whole-photo-button"));
    expect(await screen.findByTestId("stage-S4_InitialResult")).toBeTruthy();
    expect(screen.getByText("Best available.")).toBeTruthy();
    expect(screen.getByTestId("circular-score-meter")).toBeTruthy();
    // Expand bottom sheet to see full storage details and action button
    fireEvent.click(screen.getByTestId("sheet-drag-area"));
    expect(screen.getByText("Counter · whole")).toBeTruthy();
    expect(screen.getByText("Fridge · wrapped")).toBeTruthy();
    expect(screen.getByTestId("cta-compare-runner-up").textContent).toBe("Compare with Runner-Up");

    // State 4 -> Compare with Runner-Up -> State 5A (parameterized Hass Avocado copy)
    fireEvent.click(screen.getByTestId("cta-compare-runner-up"));
    expect(await screen.findByTestId("stage-S5A_FlipRunnerUpCamera")).toBeTruthy();
    expect(screen.getByText("Flip the Hass Avocado over")).toBeTruthy();
    expect(screen.getByText(/Winner to beat: 8\.6 \/ 10/)).toBeTruthy();

    // State 5A -> Snap -> State 5B-2 (Runner-Up Took Lead)
    fireEvent.click(screen.getByTestId("flip-shutter-button"));
    expect(await screen.findByTestId("stage-S5B2_RunnerUpTookLead")).toBeTruthy();
    expect(screen.getByText(/Beats 1st Winner \(9\.0 vs 8\.6\)/i)).toBeTruthy();
    // Expand bottom sheet to access final check CTA
    fireEvent.click(screen.getByTestId("sheet-drag-area"));
    expect(screen.getByTestId("cta-final-check-first-pick").textContent).toBe("Flip 1st Winner for Final Check");

    // State 5B-2 -> Flip 1st Winner -> State 6 -> Snap -> State 7A (1st Winner Reclaims Win)
    fireEvent.click(screen.getByTestId("cta-final-check-first-pick"));
    expect(await screen.findByTestId("stage-S6_FlipFirstPickCamera")).toBeTruthy();
    fireEvent.click(screen.getByTestId("flip-shutter-button"));
    expect(await screen.findByTestId("stage-S7A_FirstPickWonFinal")).toBeTruthy();
    expect(screen.getByText(/1st Winner Reclaims the Win \(9\.3 vs 9\.0\)/i)).toBeTruthy();
  }, 25000);

  it("transitions into S_ScanError and displays detailed error message when scan fails", async () => {
    const mockClient = {
      getQuota: vi.fn().mockResolvedValue({ remainingDeviceScans: 10, budgetOpen: true }),
      submitScan: vi.fn().mockRejectedValue(new Error("Scan request failed (413): Request body too large")),
    };

    render(
      <PomonaApp
        apiClient={mockClient as any}
        telemetry={createNoopTelemetry()}
        enableDebugOverride={false}
      />
    );

    // Initial state: S1_LiveCamera -> capture
    fireEvent.click(screen.getByTestId("shutter-button"));
    expect(await screen.findByTestId("stage-S2_DrawFocusArea")).toBeTruthy();

    // S2 -> Whole Photo -> triggers scan which rejects
    fireEvent.click(screen.getByTestId("whole-photo-button"));

    // Should transition to S_ScanError with error message displayed
    expect(await screen.findByTestId("stage-S_ScanError")).toBeTruthy();
    expect(screen.getByText("Scan request failed (413): Request body too large")).toBeTruthy();
    expect(screen.getByTestId("error-primary-cta")).toBeTruthy();

    // Clicking primary CTA resets back to camera
    fireEvent.click(screen.getByTestId("error-primary-cta"));
    expect(await screen.findByTestId("stage-S1_LiveCamera")).toBeTruthy();
  });
});
