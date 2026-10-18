import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { ResultStage } from "../../src/components/ResultStage";
import { initialScanMachineState } from "../../src/state/scan-state-machine";
import "../../src/i18n";

describe("ResultStage (Mockup Parity)", () => {
  const baseResponse = {
    schemaVersion: "1.0" as const,
    promptVersion: "v1",
    modelId: "test",
    round: 1 as const,
    status: "ok" as const,
    message: null,
    produce: { type: "watermelon", displayName: "Watermelon", variety: null },
    candidates: [
      { id: "c1", box: [360, 240, 680, 560] as [number, number, number, number], score: 8.6, ripeness: "ripe" as const, traits: ["Matte rind"], flipSummary: null },
      { id: "c2", box: [320, 580, 660, 900] as [number, number, number, number], score: 8.1, ripeness: "almost_ripe" as const, traits: ["Even form"], flipSummary: null },
      { id: "c3", box: [200, 200, 400, 400] as [number, number, number, number], score: 7.0, ripeness: "underripe" as const, traits: [], flipSummary: null },
    ],
    verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high" as const, headline: "Buy it." },
    followUp: {
      targetCandidateId: "c2",
      targetRole: "runner_up" as const,
      bannerText: "The blue one could be sweeter. Flip it and snap.",
      flipHeadline: "Flip over",
      instruction: "Turn over",
    },
    afterPurchase: {
      readyInDays: { min: 0, max: 0 },
      eatWithinDays: { min: 3, max: 5 },
      eatWithinLabel: "3–5 days",
      storage: {
        beforeCut: { where: "counter" as const, whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
        afterCut: { where: "fridge" as const, whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap tightly" },
      },
    },
  };

  const sampleFirstPick = {
    id: "c1",
    box: [360, 240, 680, 560] as [number, number, number, number],
    score: 8.6,
    initialScore: 8.6,
    ripeness: "ripe" as const,
    traits: ["Yellow field spot", "Matte rind"],
    flipSummary: null,
    anglesInspected: 1,
    role: "first_pick" as const,
  };

  const sampleRunnerUp = {
    id: "c2",
    box: [320, 580, 660, 900] as [number, number, number, number],
    score: 8.1,
    initialScore: 8.1,
    ripeness: "almost_ripe" as const,
    traits: ["Even form"],
    flipSummary: null,
    anglesInspected: 1,
    role: "runner_up" as const,
  };

  it("renders circular score badge on winner, produce chip in topbar, and 2-row storage cards with emoji in S4", () => {
    const onReset = vi.fn();
    const state = {
      ...initialScanMachineState(),
      phase: "S4_InitialResult" as const,
      firstPick: sampleFirstPick,
      runnerUp: sampleRunnerUp,
      lastResponse: baseResponse,
    };

    render(<ResultStage state={state} onCompareWithRunnerUp={vi.fn()} onStartFinalCheck={vi.fn()} onReset={onReset} />);

    // Topbar
    expect(screen.getByTestId("close-button")).toBeInTheDocument();
    expect(screen.getByTestId("produce-name-chip")).toHaveTextContent("Watermelon");
    const retakeBtn = screen.getByTestId("retake-button");
    expect(retakeBtn).toBeInTheDocument();
    fireEvent.click(retakeBtn);
    expect(onReset).toHaveBeenCalled();

    // Circular badge
    const badge = screen.getByTestId("winner-score-badge");
    expect(badge).toHaveTextContent("8.6");
    expect(badge).toHaveStyle({ borderRadius: "50%" });

    // Runner-Up badge / tag
    expect(screen.getByTestId("runner-up-tag")).toHaveTextContent("Runner-Up");

    // In min-height collapsed mode, only the target switch tab bar is shown; expand sheet to see details
    fireEvent.click(screen.getByTestId("sheet-drag-area"));

    // Headline & Subhead (eyebrow removed in S4 to reduce clutter)
    expect(screen.queryByText(/BEST IN VIEW/i)).not.toBeInTheDocument();
    expect(screen.getByText("Best available.")).toBeInTheDocument();
    expect(screen.getByText(/High confidence · 3 compared in view/i)).toBeInTheDocument();

    // Score meter (round score meter visible in expanded sheet)
    expect(screen.getByTestId("circular-score-meter")).toBeInTheDocument();
    expect(screen.getByTestId("circular-score-meter")).toHaveTextContent("8.6");

    // Divider 1 (Top) & Divider (Bottom before CTA)
    expect(screen.getByTestId("sheet-divider-top")).toBeInTheDocument();
    expect(screen.queryByTestId("sheet-divider-traits")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sheet-divider-middle")).not.toBeInTheDocument();
    expect(screen.getByTestId("sheet-divider-bottom")).toBeInTheDocument();

    // Storage 2-row
    expect(screen.getByText(/🗓 Eat within/i)).toBeInTheDocument();
    expect(screen.getByText("3–5 days")).toBeInTheDocument();
    expect(screen.getByText(/🧺 Before cut/i)).toBeInTheDocument();
    expect(screen.getByText("Counter · whole")).toBeInTheDocument();
    expect(screen.getByText(/❄️ After cut/i)).toBeInTheDocument();
    expect(screen.getByText("Fridge · wrapped")).toBeInTheDocument();

    // Hint box directly above CTA with flip icon
    expect(screen.getByTestId("follow-up-hint")).toHaveTextContent("The blue one could be sweeter. Flip it and snap.");
    expect(screen.getByTestId("flip-hint-icon")).toBeInTheDocument();
    expect(screen.getByTestId("cta-compare-runner-up")).toBeInTheDocument();
  });

  it("renders S5B-1 (Runner-Up Beaten) with previous mark tick and confirmation card", () => {
    const state = {
      ...initialScanMachineState(),
      phase: "S5B1_RunnerUpBeaten" as const,
      firstPick: sampleFirstPick,
      runnerUp: {
        ...sampleRunnerUp,
        score: 7.2,
        ripeness: "ripe" as const,
        traits: ["Pale spot"],
        flipSummary: "pale underside",
        anglesInspected: 2,
      },
      lastResponse: {
        ...baseResponse,
        round: 2 as const,
        verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high" as const, headline: "Buy your 1st pick." },
      },
    };

    render(<ResultStage state={state} onCompareWithRunnerUp={vi.fn()} onStartFinalCheck={vi.fn()} onReset={vi.fn()} />);

    // Expand bottom sheet to see headline and details
    fireEvent.click(screen.getByTestId("sheet-drag-area"));

    // Eyebrow & headline
    expect(screen.getByText(/✓ 1ST WINNER WINS · BEATS RUNNER-UP \(8\.6 VS 7\.2\)/i)).toBeInTheDocument();
    expect(screen.getByText("Best available.")).toBeInTheDocument();

    // Tick marker on circular score meter for previous/other candidate score (7.2)
    const tick = screen.getByTestId("score-prev-mark");
    expect(tick).toBeInTheDocument();

    // Confirmation card
    const confirmCard = screen.getByTestId("confirmation-card");
    expect(confirmCard).toHaveTextContent(/Runner-Up scored 7\.2 after flip/i);
    expect(screen.getByTestId("cta-scan-another")).toBeInTheDocument();
  });

  it("renders S5B-2 (Runner-Up Took Lead) with winner on runnerUp, 1st pick marked, and tick mark", () => {
    const state = {
      ...initialScanMachineState(),
      phase: "S5B2_RunnerUpTookLead" as const,
      firstPick: sampleFirstPick,
      runnerUp: {
        ...sampleRunnerUp,
        score: 9.0,
        ripeness: "ripe" as const,
        traits: ["Golden spot"],
        flipSummary: "deep gold spot",
        anglesInspected: 2,
      },
      lastResponse: {
        ...baseResponse,
        round: 2 as const,
        verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high" as const, headline: "Buy this one." },
        followUp: {
          targetCandidateId: "c1",
          targetRole: "first_pick" as const,
          bannerText: "1st Winner (8.6) was only graded from the top. Flip it too for a fair final check, or take this one now.",
          flipHeadline: "Flip your 1st winner over",
          instruction: "Turn over 1st winner",
        },
      },
    };

    render(<ResultStage state={state} onCompareWithRunnerUp={vi.fn()} onStartFinalCheck={vi.fn()} onReset={vi.fn()} />);

    // Expand bottom sheet to see headline and details
    fireEvent.click(screen.getByTestId("sheet-drag-area"));

    expect(screen.getByText(/★ NEW WINNER · BEATS 1ST WINNER \(9\.0 VS 8\.6\)/i)).toBeInTheDocument();
    expect(screen.getByText("Buy this Runner-Up.")).toBeInTheDocument();

    // Winner badge is 9.0
    expect(screen.getByTestId("winner-score-badge")).toHaveTextContent("9.0");
    // Runner-up box tag is 1st Winner · 8.6
    expect(screen.getByTestId("runner-up-tag")).toHaveTextContent("1st Winner · 8.6");

    // Tick marker on circular meter
    const tick = screen.getByTestId("score-prev-mark");
    expect(tick).toBeInTheDocument();

    // Hint and CTA
    expect(screen.getByTestId("follow-up-hint")).toHaveTextContent(/1st Winner \(8\.6\) was only graded from the top/i);
    expect(screen.getByTestId("cta-final-check-first-pick")).toBeInTheDocument();
  });

  it("renders S7A (First Pick Won Final) and S7B (First Pick Lost Final)", () => {
    // S7A
    const stateS7A = {
      ...initialScanMachineState(),
      phase: "S7A_FirstPickWonFinal" as const,
      firstPick: {
        ...sampleFirstPick,
        score: 9.3,
        ripeness: "ripe" as const,
        traits: [],
        flipSummary: "bright yellow spot",
        anglesInspected: 2,
      },
      runnerUp: {
        ...sampleRunnerUp,
        score: 9.0,
        ripeness: "ripe" as const,
        traits: [],
        flipSummary: "deep gold spot",
        anglesInspected: 2,
      },
      lastResponse: {
        ...baseResponse,
        round: 3 as const,
        verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high" as const, headline: "Buy your 1st pick." },
      },
    };

    const { rerender } = render(<ResultStage state={stateS7A} onCompareWithRunnerUp={vi.fn()} onStartFinalCheck={vi.fn()} onReset={vi.fn()} />);
    // Expand bottom sheet
    fireEvent.click(screen.getByTestId("sheet-drag-area"));
    expect(screen.getByText(/★ FINAL VERDICT · 1ST WINNER RECLAIMS THE WIN \(9\.3 VS 9\.0\)/i)).toBeInTheDocument();
    expect(screen.getByText("Best available.")).toBeInTheDocument();
    expect(screen.getByTestId("winner-score-badge")).toHaveTextContent("9.3");
    expect(screen.getByTestId("score-prev-mark")).toBeInTheDocument();

    // S7B
    const stateS7B = {
      ...initialScanMachineState(),
      phase: "S7B_FirstPickLostFinal" as const,
      firstPick: {
        ...sampleFirstPick,
        score: 8.4,
        ripeness: "ripe" as const,
        traits: [],
        flipSummary: "faint spot",
        anglesInspected: 2,
      },
      runnerUp: {
        ...sampleRunnerUp,
        score: 9.0,
        ripeness: "ripe" as const,
        traits: [],
        flipSummary: "deep gold spot",
        anglesInspected: 2,
      },
      lastResponse: {
        ...baseResponse,
        round: 3 as const,
        verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high" as const, headline: "Buy the new winner." },
      },
    };

    rerender(<ResultStage state={stateS7B} onCompareWithRunnerUp={vi.fn()} onStartFinalCheck={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByText(/★ FINAL VERDICT · RUNNER-UP WINS \(9\.0 VS 8\.4\)/i)).toBeInTheDocument();
    expect(screen.getByText("Buy the Runner-Up.")).toBeInTheDocument();
    expect(screen.getByTestId("winner-score-badge")).toHaveTextContent("9.0");
    expect(screen.getByTestId("runner-up-tag")).toHaveTextContent("1st Winner · 8.4");
    expect(screen.getByTestId("score-prev-mark")).toBeInTheDocument();
  });

  it("allows dragging anywhere on the bottom sheet and translates the sheet + parallax photo without shrinking the photo height", () => {
    const state = {
      ...initialScanMachineState(),
      phase: "S4_InitialResult" as const,
      firstPick: sampleFirstPick,
      runnerUp: sampleRunnerUp,
      lastResponse: baseResponse,
      round1PhotoDataUrl: "data:image/webp;base64,mock",
    };

    render(
      <ResultStage
        state={state}
        onCompareWithRunnerUp={vi.fn()}
        onStartFinalCheck={vi.fn()}
        onReset={vi.fn()}
      />
    );

    const sheet = screen.getByTestId("result-bottom-sheet");
    const photoViewport = screen.getByTestId("result-photo-viewport");

    // Initial state: photo viewport is full-bleed 100%, sheet is translated to default peek position (divider 2)
    expect(photoViewport.style.height).toBe("100%");
    expect(sheet.style.transform).toBe("translate3d(0, 160px, 0)");

    // Drag up from the grab handle / drag area
    const dragArea = screen.getByTestId("sheet-drag-area");
    fireEvent.touchStart(dragArea, { touches: [{ clientY: 500 }] });
    fireEvent.touchMove(dragArea, { touches: [{ clientY: 420 }] }); // -80px drag up: 160px - 80px = 80px

    // Live drag glides sheet up by exactly 80px
    expect(sheet.style.transform).toBe("translate3d(0, 80px, 0)");
    expect(photoViewport.style.height).toBe("100%");

    // Release snap expands sheet to 'expanded' static state (transform reaches 0, height is auto, maxHeight 92dvh)
    fireEvent.touchEnd(dragArea);
    expect(sheet.style.transform).toBe("translate3d(0, 0px, 0)");
    expect(sheet.style.maxHeight).toBe("92dvh");
    expect(screen.getByTestId("sheet-expanded-content")).toBeInTheDocument();
    expect(photoViewport.style.height).toBe("100%");
  });

  it("allows dragging directly on the photo viewport with parallax to glide both sheet and photo simultaneously", () => {
    const state = {
      ...initialScanMachineState(),
      phase: "S4_InitialResult" as const,
      firstPick: sampleFirstPick,
      runnerUp: sampleRunnerUp,
      lastResponse: baseResponse,
      round1PhotoDataUrl: "data:image/webp;base64,mock",
    };

    render(
      <ResultStage
        state={state}
        onCompareWithRunnerUp={vi.fn()}
        onStartFinalCheck={vi.fn()}
        onReset={vi.fn()}
      />
    );

    const sheet = screen.getByTestId("result-bottom-sheet");
    const photoViewport = screen.getByTestId("result-photo-viewport");

    // Starting at default translate (160px)
    expect(sheet.style.transform).toBe("translate3d(0, 160px, 0)");

    // Touch and drag directly on photo viewport downward: 50px drag down
    // With 1.6x factor, sheet moves down by 80px (160px + 80px = 240px)
    fireEvent.touchStart(photoViewport, { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(photoViewport, { touches: [{ clientY: 350 }] });

    expect(sheet.style.transform).toBe("translate3d(0, 240px, 0)");

    // Releasing after downward drag snaps to min collapsed state
    fireEvent.touchEnd(photoViewport);
    expect(sheet.style.transform).toBe("translate3d(0, 320px, 0)"); // maxTranslate min collapsed position
  });

  it("renders 3-way ripeness switch in S4_InitialResult and triggers onSetTargetRipeness", () => {
    const onSetTargetRipeness = vi.fn();
    const state = {
      ...initialScanMachineState(),
      phase: "S4_InitialResult" as const,
      firstPick: sampleFirstPick,
      runnerUp: sampleRunnerUp,
      lastResponse: baseResponse,
      targetRipeness: "ready_now" as const,
    };

    render(
      <ResultStage
        state={state}
        onCompareWithRunnerUp={vi.fn()}
        onStartFinalCheck={vi.fn()}
        onReset={vi.fn()}
        onSetTargetRipeness={onSetTargetRipeness}
      />
    );

    const switchWrap = screen.getByTestId("ripeness-target-switch");
    expect(switchWrap).toBeInTheDocument();

    const readyNowTab = screen.getByTestId("target-tab-ready_now");
    const in23DaysTab = screen.getByTestId("target-tab-in_2_3_days");
    const laterWeekTab = screen.getByTestId("target-tab-later_this_week");

    expect(readyNowTab).toBeInTheDocument();
    expect(in23DaysTab).toBeInTheDocument();
    expect(laterWeekTab).toBeInTheDocument();

    fireEvent.click(in23DaysTab);
    expect(onSetTargetRipeness).toHaveBeenCalledWith("in_2_3_days");
  });

  it("updates followUpHint and eatWithin dynamically in bottom sheet for each target tab", () => {
    const candidates = [
      { id: "c1", box: [360, 240, 680, 560] as [number, number, number, number], score: 8.6, ripeness: "ripe" as const, traits: ["Yellow field spot", "Matte rind"], flipSummary: null },
      { id: "c2", box: [320, 580, 660, 900] as [number, number, number, number], score: 8.1, ripeness: "almost_ripe" as const, traits: ["Even form"], flipSummary: null },
      { id: "c3", box: [200, 200, 400, 400] as [number, number, number, number], score: 7.0, ripeness: "underripe" as const, traits: ["Green stem"], flipSummary: null },
    ];

    const baseResp = {
      ...baseResponse,
      candidates,
    };

    // Test 1: ready_now
    const stateReadyNow = {
      ...initialScanMachineState(),
      phase: "S4_InitialResult" as const,
      firstPick: { ...candidates[0], initialScore: 8.6, anglesInspected: 1, role: "first_pick" as const },
      runnerUp: { ...candidates[1], initialScore: 8.1, anglesInspected: 1, role: "runner_up" as const },
      allCandidatesRound1: candidates,
      lastResponse: baseResp,
      targetRipeness: "ready_now" as const,
      round1FollowUp: baseResp.followUp,
    };

    const { rerender } = render(
      <ResultStage
        state={stateReadyNow}
        onCompareWithRunnerUp={vi.fn()}
        onStartFinalCheck={vi.fn()}
        onReset={vi.fn()}
      />
    );

    // Expand sheet
    fireEvent.click(screen.getByTestId("sheet-drag-area"));

    expect(screen.getByTestId("follow-up-hint")).toHaveTextContent("The blue one could be sweeter. Flip it and snap.");
    expect(screen.getByText("3–5 days")).toBeInTheDocument();
    expect(screen.getByText("Yellow field spot")).toBeInTheDocument();

    // Test 2: in_2_3_days
    const state23Days = {
      ...stateReadyNow,
      firstPick: { ...candidates[1], initialScore: 8.1, anglesInspected: 1, role: "first_pick" as const },
      runnerUp: { ...candidates[0], initialScore: 8.6, anglesInspected: 1, role: "runner_up" as const },
      targetRipeness: "in_2_3_days" as const,
    };

    rerender(
      <ResultStage
        state={state23Days}
        onCompareWithRunnerUp={vi.fn()}
        onStartFinalCheck={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByTestId("follow-up-hint")).toHaveTextContent("Check underside before storing for 2–3 days");
    expect(screen.getByText("Ready in 2–3d · Keeps 5–7 days")).toBeInTheDocument();
    expect(screen.getByText("Even form")).toBeInTheDocument();

    // Test 3: later_this_week
    const stateLater = {
      ...stateReadyNow,
      firstPick: { ...candidates[2], initialScore: 7.0, anglesInspected: 1, role: "first_pick" as const },
      runnerUp: { ...candidates[1], initialScore: 8.1, anglesInspected: 1, role: "runner_up" as const },
      targetRipeness: "later_this_week" as const,
    };

    rerender(
      <ResultStage
        state={stateLater}
        onCompareWithRunnerUp={vi.fn()}
        onStartFinalCheck={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByTestId("follow-up-hint")).toHaveTextContent("Check underside for bruises before long storage");
    expect(screen.getByText("Ripens in 4–6d · Keeps 7–10 days")).toBeInTheDocument();
    expect(screen.getByText("Green stem")).toBeInTheDocument();

    // Test 4: back to ready_now - restores initial text
    rerender(
      <ResultStage
        state={stateReadyNow}
        onCompareWithRunnerUp={vi.fn()}
        onStartFinalCheck={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByTestId("follow-up-hint")).toHaveTextContent("The blue one could be sweeter. Flip it and snap.");
    expect(screen.getByText("3–5 days")).toBeInTheDocument();
    expect(screen.getByText("Yellow field spot")).toBeInTheDocument();
  });

  it("renders locked ripeness goal banner in S5B1 and S5B2 instead of interactive switch", () => {
    const stateS5B1 = {
      ...initialScanMachineState(),
      phase: "S5B1_RunnerUpBeaten" as const,
      firstPick: sampleFirstPick,
      runnerUp: sampleRunnerUp,
      lastResponse: {
        ...baseResponse,
        round: 2 as const,
      },
      targetRipeness: "in_2_3_days" as const,
    };

    render(
      <ResultStage
        state={stateS5B1}
        onCompareWithRunnerUp={vi.fn()}
        onStartFinalCheck={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.queryByTestId("ripeness-target-switch")).not.toBeInTheDocument();
    const lockedGoal = screen.getByTestId("locked-ripeness-goal");
    expect(lockedGoal).toBeInTheDocument();
    expect(lockedGoal).toHaveTextContent("In 2–3 days");
  });

  it("auto-scrolls photo so winner is centered in visible photo area above bottom sheet", () => {
    // Winner located in bottom quadrant [700, 200, 900, 500] (center Y = 800)
    const bottomWinner = {
      ...sampleFirstPick,
      id: "c_bottom",
      box: [700, 200, 900, 500] as [number, number, number, number],
    };

    const state = {
      ...initialScanMachineState(),
      phase: "S4_InitialResult" as const,
      firstPick: bottomWinner,
      runnerUp: sampleRunnerUp,
      lastResponse: {
        ...baseResponse,
        candidates: [bottomWinner, sampleRunnerUp],
      },
      round1PhotoDataUrl: "data:image/jpeg;base64,mock",
    };

    render(
      <ResultStage
        state={state}
        onCompareWithRunnerUp={vi.fn()}
        onStartFinalCheck={vi.fn()}
        onReset={vi.fn()}
      />
    );

    const photoViewport = screen.getByTestId("result-photo-viewport");
    // Mock viewport dimensions (e.g. 400x800)
    Object.defineProperty(photoViewport, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(photoViewport, "clientHeight", { value: 800, configurable: true });

    const img = photoViewport.querySelector("img");
    expect(img).toBeInTheDocument();
    if (img) {
      Object.defineProperty(img, "naturalWidth", { value: 1000, configurable: true });
      Object.defineProperty(img, "naturalHeight", { value: 1000, configurable: true });
      fireEvent.load(img);
    }

    // After image load and coverRect computation, auto-centering runs and applies translation
    // Since winner is low in frame (Y=800), desiredPanY is negative to pull image up into view
    expect(photoViewport.style.transform).not.toBe("translate3d(0, 0px, 0)");
  });
});
