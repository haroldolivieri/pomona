import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { lookupProduceSeasonality } from "@pomona/contract";
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
            bannerText: "1st Winner (8.6) was only graded from the top. Flip it too for a fair final check, or take this one now.",
            flipHeadline: "Flip your 1st winner over",
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
      overrideQuota: vi.fn().mockResolvedValue({ success: true, deviceId: "d1", deviceLimit: 10, remainingDeviceScans: 10 }),
      submitScan: mockScan,
    };

    render(<PomonaApp apiClient={apiClient} telemetry={createNoopTelemetry()} />);

    // State 1 -> Snap photo -> State 2
    fireEvent.click(screen.getByTestId("shutter-button"));
    expect(await screen.findByTestId("stage-S2_DrawFocusArea")).toBeTruthy();

    // State 2 -> Whole Photo -> State 3 -> State 4
    fireEvent.click(screen.getByTestId("whole-photo-button"));
    expect(await screen.findByTestId("stage-S4_InitialResult")).toBeTruthy();
    // Expand bottom sheet to see headline, score meter, full storage details, and action button
    fireEvent.click(screen.getByTestId("sheet-drag-area"));
    expect(screen.getByText("Best available.")).toBeTruthy();
    expect(screen.getByTestId("circular-score-meter")).toBeTruthy();
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
    // Expand bottom sheet to access headline and final check CTA
    fireEvent.click(screen.getByTestId("sheet-drag-area"));
    expect(screen.getByText(/Beats 1st Winner \(9\.0 vs 8\.6\)/i)).toBeTruthy();
    expect(screen.getByTestId("cta-final-check-first-pick").textContent).toBe("Flip 1st Winner for Final Check");

    // State 5B-2 -> Flip 1st Winner -> State 6 -> Snap -> State 7A (1st Winner Reclaims Win)
    fireEvent.click(screen.getByTestId("cta-final-check-first-pick"));
    expect(await screen.findByTestId("stage-S6_FlipFirstPickCamera")).toBeTruthy();
    fireEvent.click(screen.getByTestId("flip-shutter-button"));
    expect(await screen.findByTestId("stage-S7A_FirstPickWonFinal")).toBeTruthy();
    // Expand bottom sheet to access verdict headline
    fireEvent.click(screen.getByTestId("sheet-drag-area"));
    expect(screen.getByText(/1st Winner Reclaims the Win \(9\.3 vs 9\.0\)/i)).toBeTruthy();
  }, 25000);

  it("transitions into S_ScanError and displays localized recovery copy when scan fails", async () => {
    const mockClient = {
      getQuota: vi.fn().mockResolvedValue({ remainingDeviceScans: 10, budgetOpen: true }),
      overrideQuota: vi.fn().mockResolvedValue({ success: true, deviceId: "d1", deviceLimit: 10, remainingDeviceScans: 10 }),
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
    expect(screen.getByText("Produce analysis could not be completed. Please try again.")).toBeTruthy();
    expect(screen.queryByText("Scan request failed (413): Request body too large")).toBeNull();
    expect(screen.getByTestId("error-primary-cta")).toBeTruthy();

    // Clicking primary CTA resets back to camera
    fireEvent.click(screen.getByTestId("error-primary-cta"));
    expect(await screen.findByTestId("stage-S1_LiveCamera")).toBeTruthy();
  });

  it("unifies top middle chip (quota vs produce name) and decrements/overrides scan counter", async () => {
    const mockScan = vi.fn().mockResolvedValue({
      remainingScans: 9,
      response: {
        schemaVersion: "1.0",
        promptVersion: "v1",
        modelId: "gemini-2.5-flash",
        round: 1,
        status: "ok",
        message: null,
        produce: { type: "mango", displayName: "Alphonso Mango", variety: "Alphonso" },
        candidates: [
          { id: "c1", box: [385, 370, 625, 655], score: 8.9, ripeness: "ripe", traits: ["Golden amber"], flipSummary: null },
        ],
        verdict: { winnerId: "c1", runnerUpId: null, confidence: "high", headline: "Buy it." },
        followUp: null,
        afterPurchase: {
          readyInDays: { min: 0, max: 0 },
          eatWithinDays: { min: 2, max: 3 },
          eatWithinLabel: "2–3 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter", tip: "" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge", tip: "" },
          },
        },
      },
    });

    const apiClient = {
      getQuota: vi.fn().mockResolvedValue({ remainingDeviceScans: 10, budgetOpen: true }),
      overrideQuota: vi.fn().mockImplementation(async (params: any) => {
        const remaining = typeof params === "number" ? params : params.remainingScans ?? 10;
        return { success: true, deviceId: "d1", deviceLimit: 10, remainingDeviceScans: remaining };
      }),
      submitScan: mockScan,
    };

    render(
      <PomonaApp
        apiClient={apiClient}
        telemetry={createNoopTelemetry()}
        initialRemainingScans={10}
      />
    );

    // State 1: Top bar has brand pill without middle quota pill
    expect(screen.getByTestId("brand-pill")).toHaveTextContent("Pomona");
    expect(screen.queryByTestId("scan-quota-pill")).toBeNull();

    // Snap photo -> State 2: Top bar keeps the remaining-scan label hidden
    fireEvent.click(screen.getByTestId("shutter-button"));
    expect(await screen.findByTestId("stage-S2_DrawFocusArea")).toBeTruthy();
    expect(screen.queryByTestId("scan-quota-pill")).toBeNull();

    // Scan whole photo -> State 4: Top middle chip shows Alphonso Mango ONLY
    fireEvent.click(screen.getByTestId("whole-photo-button"));
    expect(await screen.findByTestId("stage-S4_InitialResult")).toBeTruthy();
    expect(screen.getByTestId("produce-name-chip")).toHaveTextContent("Alphonso Mango");

    // Retake / Reset to Camera -> Returns to State 1
    fireEvent.click(screen.getByTestId("retake-button"));
    expect(await screen.findByTestId("stage-S1_LiveCamera")).toBeTruthy();

    // Five taps on the Pomona brand logo activates dev mode on this device
    const brandPill = screen.getByTestId("brand-pill");
    for (let i = 0; i < 5; i++) {
      fireEvent.click(brandPill);
    }
    const devSetScansBtn = await screen.findByTestId("dev-set-scans-button");
    expect(devSetScansBtn).toBeInTheDocument();

    // Test override mechanism via dev button
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValueOnce("3");
    fireEvent.click(devSetScansBtn);
    expect(promptSpy).toHaveBeenCalled();
    expect(await screen.findByText("⚡ 3 scans")).toBeTruthy();
  });

  it("shows the seasonality badge on S4, lets the shopper pick an origin, and clears the pick after a reset", async () => {
    const seasonality = lookupProduceSeasonality("avocado", { cfCountry: "GB" }, 11)!;
    const response = {
      schemaVersion: "1.0",
      promptVersion: "v1",
      modelId: "gemini-2.5-flash",
      round: 1,
      status: "ok",
      message: null,
      produce: { type: "avocado", displayName: "Hass Avocado", variety: "Hass" },
      candidates: [
        { id: "c1", box: [385, 370, 625, 655], score: 8.6, ripeness: "ripe", traits: ["Dark pebbled skin"], flipSummary: null },
      ],
      verdict: { winnerId: "c1", runnerUpId: null, confidence: "high", headline: "Buy it." },
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
      seasonality,
    };
    const apiClient = {
      getQuota: vi.fn().mockResolvedValue({ remainingDeviceScans: 10, budgetOpen: true }),
      submitScan: vi.fn().mockResolvedValue({ remainingScans: 9, response }),
    };

    render(<PomonaApp apiClient={apiClient as any} telemetry={createNoopTelemetry()} />);

    fireEvent.click(screen.getByTestId("shutter-button"));
    expect(await screen.findByTestId("stage-S2_DrawFocusArea")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("whole-photo-button"));
    expect(await screen.findByTestId("stage-S4_InitialResult")).toBeTruthy();

    // Expand bottom sheet to see seasonality strip
    fireEvent.click(screen.getByTestId("sheet-drag-area"));
    expect(screen.getByTestId("seasonality-badge").textContent).toContain(seasonality.badgeText);

    fireEvent.click(screen.getByTestId("origin-pill-PE"));
    expect(screen.getByTestId("origin-pill-PE").getAttribute("aria-pressed")).toBe("true");

    // Reset and scan again: nothing is pre-selected
    fireEvent.click(screen.getByTestId("close-button"));
    fireEvent.click(await screen.findByTestId("shutter-button"));
    expect(await screen.findByTestId("stage-S2_DrawFocusArea")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("whole-photo-button"));
    expect(await screen.findByTestId("stage-S4_InitialResult")).toBeTruthy();

    // Expand bottom sheet again
    fireEvent.click(screen.getByTestId("sheet-drag-area"));
    expect(screen.getByTestId("origin-pill-PE").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("seasonality-badge").textContent).toContain(seasonality.badgeText);
  });
});

