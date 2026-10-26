import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Mock payloads matching Pomona contract schema
const mockRound1Response = {
  schemaVersion: "1.0",
  promptVersion: "v1",
  modelId: "gemini-2.5-flash",
  round: 1,
  status: "ok",
  message: null,
  produce: { type: "avocado", displayName: "Hass Avocado", variety: "Hass" },
  candidates: [
    {
      id: "c1",
      box: [385, 370, 625, 655],
      score: 8.6,
      ripeness: "ripe",
      traits: ["Dark pebbled skin", "Intact stem"],
      flipSummary: null,
    },
    {
      id: "c2",
      box: [380, 645, 590, 925],
      score: 8.1,
      ripeness: "almost_ripe",
      traits: ["Even shape"],
      flipSummary: null,
    },
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
};

// Round 2 - Runner-Up Beaten (score 7.8 <= 8.6)
const mockRound2RunnerUpBeaten = {
  ...mockRound1Response,
  round: 2,
  candidates: [
    {
      id: "c2",
      box: [200, 200, 800, 800],
      score: 7.8,
      ripeness: "ripe",
      traits: ["Small bruise under label"],
      flipSummary: "slight bruise underside",
    },
  ],
  verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st winner." },
  followUp: null,
};

// Round 2 - Runner-Up Takes Lead (score 9.0 > 8.6)
const mockRound2RunnerUpTookLead = {
  ...mockRound1Response,
  round: 2,
  candidates: [
    {
      id: "c2",
      box: [200, 200, 800, 800],
      score: 9.0,
      ripeness: "ripe",
      traits: ["Green stem base", "No bruising"],
      flipSummary: "clean green stem base",
    },
  ],
  verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high", headline: "Buy this one." },
  followUp: {
    targetCandidateId: "c1",
    targetRole: "first_pick",
    bannerText: "1st Winner (8.6) was only graded from the top. Flip it too for a fair final check, or take this one now.",
    flipHeadline: "Flip your 1st winner over",
    instruction: "Turn the yellow-marked Hass Avocado to show its stem base.",
  },
};

// Round 3 - 1st Winner Wins Final Flip (score 9.3 >= 9.0)
const mockRound3FirstPickWon = {
  ...mockRound1Response,
  round: 3,
  candidates: [
    {
      id: "c1",
      box: [200, 200, 800, 800],
      score: 9.3,
      ripeness: "ripe",
      traits: ["Bright green stem", "Uniform give"],
      flipSummary: "bright green stem base",
    },
  ],
  verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st winner." },
  followUp: null,
};

// Round 3 - 1st Pick Loses Final Flip (score 8.4 < 9.0)
const mockRound3FirstPickLost = {
  ...mockRound1Response,
  round: 3,
  candidates: [
    {
      id: "c1",
      box: [200, 200, 800, 800],
      score: 8.4,
      ripeness: "ripe",
      traits: ["Dry stem cavity"],
      flipSummary: "dry stem base",
    },
  ],
  verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high", headline: "Buy the new winner." },
  followUp: null,
};

test.describe("Pomona E2E Journeys & WCAG 2.2 AA Accessibility Audits", () => {
  test.beforeEach(async ({ page }) => {
    // Force mock mode to false in browser so it executes against intercepted routes
    await page.addInitScript(() => {
      window.localStorage.setItem("pomona-mock-mode", "false");
      // Synthetic flat fallback frames would fail the compare pre-flight check; these journeys test later stages.
      (window as any).__POMONA_BYPASS_LOCAL_REJECT = true;
    });

    // Intercept quota endpoint
    await page.route("**/api/v1/quota", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ remainingDeviceScans: 10, budgetOpen: true }),
      });
    });
  });

  for (const reason of ["assessed_tie", "missing_evidence"] as const) {
    test(`Abstention notice: ${reason}`, async ({ page }, testInfo) => {
      await page.route("**/api/v1/scan", async (route) => {
        await route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({
            ...mockRound1Response, status: "insufficient_evidence", abstentionReason: reason,
            message: reason === "assessed_tie"
              ? "These items look similarly mature. Please show a closer individual view."
              : "The grading surface is hidden. Please turn the item to show it.",
            countedTotal: null, produce: null, candidates: [], verdict: null, followUp: null, afterPurchase: null,
          }),
        });
      });
      await page.goto("/");
      await page.getByTestId("shutter-button").click();
      await page.getByTestId("whole-photo-button").click();
      const similar = reason === "assessed_tie";
      await expect(page.getByRole("heading", { name: similar ? "No clear standout" : "Not enough evidence to choose" })).toBeVisible();
      if (similar) {
        await expect(page.getByText(/no visible ripeness advantage/)).toBeVisible();
        await expect(page.getByText(/does not confirm equal quality inside/)).toBeVisible();
        await expect(page.getByText("Another Look Needed")).not.toBeVisible();
      } else {
        await expect(page.getByText("No clear standout")).not.toBeVisible();
      }
      await testInfo.attach(reason, { body: await page.screenshot({ path: testInfo.outputPath(`${reason}.png`) }), contentType: "image/png" });
      await page.getByRole("button", { name: similar ? "Scan Another Selection" : "Try Another Angle" }).click();
      await expect(page.getByTestId("stage-S1_LiveCamera")).toBeVisible();
    });
  }

  test("Journey 1: Whole-Photo Quick Pick (S1 -> S2 -> S3 -> S4)", async ({ page }) => {
    await page.route("**/api/v1/scan", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockRound1Response ),
      });
    });

    await page.goto("/");

    // S1: Live Camera Viewfinder
    const s1Stage = page.getByTestId("stage-S1_LiveCamera");
    await expect(s1Stage).toBeVisible();
    const shutter = page.getByTestId("shutter-button");
    await expect(shutter).toBeVisible();

    // Snap photo -> S2: Draw Focus Area
    await shutter.click();
    const s2Stage = page.getByTestId("stage-S2_DrawFocusArea");
    await expect(s2Stage).toBeVisible();

    // Whole-photo button click -> S3: Analysing -> S4: Initial Result
    const wholePhotoButton = page.getByTestId("whole-photo-button");
    await expect(wholePhotoButton).toBeVisible();
    await wholePhotoButton.click();

    // S4: Initial Result
    const s4Stage = page.getByTestId("stage-S4_InitialResult");
    await expect(s4Stage).toBeVisible();

    // Expand bottom sheet to see headline, circular score meter, full storage details and action button
    await page.getByTestId("sheet-drag-area").click();
    await expect(page.getByText("Best available.")).toBeVisible();
    await expect(page.getByTestId("circular-score-meter")).toBeVisible();
    await expect(page.getByText("Counter · whole")).toBeVisible();
    await expect(page.getByText("Fridge · wrapped")).toBeVisible();
    await expect(page.getByTestId("cta-compare-runner-up")).toHaveText("Compare with Runner-Up");
  });

  test("Journey 2: Freehand Drawn Focus Area + Runner-Up Beaten (S1 -> S2 [pointer drag loop] -> S3 -> S4 -> S5A -> S5B1)", async ({ page }) => {
    let scanCount = 0;
    await page.route("**/api/v1/scan", async (route) => {
      scanCount++;
      if (scanCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRound1Response ),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRound2RunnerUpBeaten ),
        });
      }
    });

    await page.goto("/");

    // S1 -> Snap
    await page.getByTestId("shutter-button").click();
    await expect(page.getByTestId("stage-S2_DrawFocusArea")).toBeVisible();

    // Pointer drag loop to draw a focus area polygon in S2
    const drawStage = page.getByTestId("stage-S2_DrawFocusArea");
    const box = await drawStage.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      const startX = box.x + box.width * 0.2;
      const startY = box.y + box.height * 0.2;
      const drawWidth = box.width * 0.5;
      const drawHeight = box.height * 0.5;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      // Draw closed loop with significant area
      await page.mouse.move(startX + drawWidth, startY, { steps: 10 });
      await page.mouse.move(startX + drawWidth, startY + drawHeight, { steps: 10 });
      await page.mouse.move(startX, startY + drawHeight, { steps: 10 });
      await page.mouse.move(startX, startY, { steps: 10 });
      await page.mouse.up();
    }

    // Now analyse-drawn-button should be enabled
    const analyseDrawnBtn = page.getByTestId("analyse-drawn-button");
    await expect(analyseDrawnBtn).toBeEnabled();
    await analyseDrawnBtn.click();

    // Reaches S4
    await expect(page.getByTestId("stage-S4_InitialResult")).toBeVisible();

    // Expand bottom sheet to access CTA
    await page.getByTestId("sheet-drag-area").click();

    // Tap CTA -> S5A_FlipRunnerUpCamera
    const compareBtn = page.getByTestId("cta-compare-runner-up");
    await compareBtn.click();
    await expect(page.getByTestId("stage-S5A_FlipRunnerUpCamera")).toBeVisible();
    await expect(page.getByText("Flip the Hass Avocado over")).toBeVisible();
    await expect(page.getByText(/Winner to beat: 8\.6 \/ 10/)).toBeVisible();

    // Snap flipped produce -> S5B1_RunnerUpBeaten
    await page.getByTestId("flip-shutter-button").click();
    await expect(page.getByTestId("stage-S5B1_RunnerUpBeaten")).toBeVisible();

    // Expand sheet to view headline, circular score meter, confirmation banner and scan-another CTA
    await page.getByTestId("sheet-drag-area").click();
    await expect(page.getByText("Best available.")).toBeVisible();
    await expect(page.getByTestId("circular-score-meter")).toBeVisible();
    await expect(page.getByText(/Runner-Up scored 7\.8 after flip/)).toBeVisible();
    await expect(page.getByTestId("cta-scan-another")).toBeVisible();
  });

  test("Journey 3: Runner-Up Takes Lead + 1st Pick Wins Final Flip (S1 -> S2 -> S3 -> S4 -> S5A -> S5B2 -> S6 -> S7A)", async ({ page }) => {
    let scanCount = 0;
    await page.route("**/api/v1/scan", async (route) => {
      scanCount++;
      if (scanCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRound1Response ),
        });
      } else if (scanCount === 2) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRound2RunnerUpTookLead ),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRound3FirstPickWon ),
        });
      }
    });

    await page.goto("/");

    // S1 -> Snap -> S2
    await page.getByTestId("shutter-button").click();
    await expect(page.getByTestId("stage-S2_DrawFocusArea")).toBeVisible();

    // S2 -> Whole photo -> S3 -> S4
    await page.getByTestId("whole-photo-button").click();
    await expect(page.getByTestId("stage-S4_InitialResult")).toBeVisible();

    // Expand bottom sheet to access CTA
    await page.getByTestId("sheet-drag-area").click();

    // S4 -> Compare with Runner-Up -> S5A
    await page.getByTestId("cta-compare-runner-up").click();
    await expect(page.getByTestId("stage-S5A_FlipRunnerUpCamera")).toBeVisible();

    // S5A -> Snap flipped runner-up -> S5B2_RunnerUpTookLead (9.0 beats 8.6)
    await page.getByTestId("flip-shutter-button").click();
    await expect(page.getByTestId("stage-S5B2_RunnerUpTookLead")).toBeVisible();

    // Expand bottom sheet to access headline and final check CTA
    await page.getByTestId("sheet-drag-area").click();
    await expect(page.getByText(/Beats 1st Winner \(9\.0 vs 8\.6\)/i)).toBeVisible();
    const finalCheckBtn = page.getByTestId("cta-final-check-first-pick");
    await expect(finalCheckBtn).toHaveText("Flip 1st Winner for Final Check");

    // S5B2 -> Flip 1st winner -> S6_FlipFirstPickCamera
    await finalCheckBtn.click();
    await expect(page.getByTestId("stage-S6_FlipFirstPickCamera")).toBeVisible();
    await expect(page.getByText(/Current leader: 9\.0 · 1st Winner: 8\.6/)).toBeVisible();

    // S6 -> Snap flipped 1st winner -> S7A_FirstPickWonFinal (9.3 beats 9.0)
    await page.getByTestId("flip-shutter-button").click();
    await expect(page.getByTestId("stage-S7A_FirstPickWonFinal")).toBeVisible();

    // Expand bottom sheet to access verdict headline and scan-another CTA
    await page.getByTestId("sheet-drag-area").click();
    await expect(page.getByText(/1st Winner Reclaims the Win \(9\.3 vs 9\.0\)/i)).toBeVisible();
    await expect(page.getByTestId("cta-scan-another")).toBeVisible();
  });

  test("Journey 4: Runner-Up Takes Lead + 1st Pick Loses Final Flip (... -> S5B2 -> S6 -> S7B)", async ({ page }) => {
    let scanCount = 0;
    await page.route("**/api/v1/scan", async (route) => {
      scanCount++;
      if (scanCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRound1Response ),
        });
      } else if (scanCount === 2) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRound2RunnerUpTookLead ),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRound3FirstPickLost ),
        });
      }
    });

    await page.goto("/");

    // S1 -> S2 -> S4
    await page.getByTestId("shutter-button").click();
    await page.getByTestId("whole-photo-button").click();
    await expect(page.getByTestId("stage-S4_InitialResult")).toBeVisible();

    // Expand bottom sheet to access CTA
    await page.getByTestId("sheet-drag-area").click();

    // S4 -> S5A -> S5B2
    await page.getByTestId("cta-compare-runner-up").click();
    await expect(page.getByTestId("stage-S5A_FlipRunnerUpCamera")).toBeVisible();
    await page.getByTestId("flip-shutter-button").click();
    await expect(page.getByTestId("stage-S5B2_RunnerUpTookLead")).toBeVisible();

    // Expand bottom sheet to access final check CTA
    await page.getByTestId("sheet-drag-area").click();

    // S5B2 -> S6
    await page.getByTestId("cta-final-check-first-pick").click();
    await expect(page.getByTestId("stage-S6_FlipFirstPickCamera")).toBeVisible();

    // S6 -> Snap -> S7B_FirstPickLostFinal (8.4 lost to 9.0)
    await page.getByTestId("flip-shutter-button").click();
    await expect(page.getByTestId("stage-S7B_FirstPickLostFinal")).toBeVisible();

    // Expand bottom sheet to access headline and scan-another CTA
    await page.getByTestId("sheet-drag-area").click();
    await expect(page.getByText(/Runner-Up Wins \(9\.0 vs 8\.4\)/i)).toBeVisible();
    await expect(page.getByTestId("cta-scan-another")).toBeVisible();
  });

  test("Journey 5: Light and Dark theme toggle + axe WCAG 2.2 AA audit across states", async ({ page }) => {
    let scanCount = 0;
    await page.route("**/api/v1/scan", async (route) => {
      scanCount++;
      if (scanCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRound1Response ),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRound2RunnerUpTookLead ),
        });
      }
    });

    await page.goto("/");
    // Allow entrance animations (e.g. brand pill and mode switcher) to settle
    await page.waitForTimeout(1200);

    // Audit S1 in Light Theme
    let accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    let criticalOrSerious = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(criticalOrSerious).toEqual([]);

    // Switch to Dark Theme
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });

    // Verify dark theme applied
    const htmlTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    expect(htmlTheme).toBe("dark");

    // Audit S1 in Dark Theme
    accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    criticalOrSerious = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(criticalOrSerious).toEqual([]);

    // Progress S1 -> S2 (Dark Theme)
    await page.getByTestId("shutter-button").click();
    await expect(page.getByTestId("stage-S2_DrawFocusArea")).toBeVisible();

    accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    criticalOrSerious = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(criticalOrSerious).toEqual([]);

    // Progress S2 -> S4 (Dark Theme)
    await page.getByTestId("whole-photo-button").click();
    await expect(page.getByTestId("stage-S4_InitialResult")).toBeVisible();

    accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    criticalOrSerious = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(criticalOrSerious).toEqual([]);

    // Progress S4 -> S5A (Dark Theme)
    await page.getByTestId("sheet-drag-area").click();
    await page.getByTestId("cta-compare-runner-up").click();
    await expect(page.getByTestId("stage-S5A_FlipRunnerUpCamera")).toBeVisible();

    accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    criticalOrSerious = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(criticalOrSerious).toEqual([]);

    // Progress S5A -> S5B2 (Dark Theme)
    await page.getByTestId("flip-shutter-button").click();
    await expect(page.getByTestId("stage-S5B2_RunnerUpTookLead")).toBeVisible();

    accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    criticalOrSerious = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(criticalOrSerious).toEqual([]);

    // Toggle back to Light Theme to confirm theme persistence / accessibility across light mode
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
    });
    accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    criticalOrSerious = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(criticalOrSerious).toEqual([]);
  });

  test("Journey 6: Parameterized Ripeness Target 3-Way Toggle & Goal Locking (S4 toggle -> S5A goal pill -> S5B1 locked banner)", async ({ page }) => {
    let scanCount = 0;
    await page.route("**/api/v1/scan", async (route) => {
      scanCount++;
      if (scanCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRound1Response ),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockRound2RunnerUpBeaten ),
        });
      }
    });

    await page.goto("/");
    await page.getByTestId("shutter-button").click();
    await page.getByTestId("whole-photo-button").click();

    // S4: Initial Result
    const s4Stage = page.getByTestId("stage-S4_InitialResult");
    await expect(s4Stage).toBeVisible();

    // Verify 3-way switch
    const switchControl = page.getByTestId("ripeness-target-switch");
    await expect(switchControl).toBeVisible();
    const readyTab = page.getByTestId("target-tab-ready_now");
    const in23DaysTab = page.getByTestId("target-tab-in_2_3_days");
    const laterWeekTab = page.getByTestId("target-tab-later_this_week");
    await expect(readyTab).toBeVisible();
    await expect(in23DaysTab).toBeVisible();
    await expect(laterWeekTab).toBeVisible();

    // Click "In 2–3 days" tab
    await in23DaysTab.click();
    await expect(in23DaysTab).toHaveAttribute("aria-selected", "true");

    // Expand sheet to access CTA
    await page.getByTestId("sheet-drag-area").click();

    // Compare with Runner-Up -> S5A
    await page.getByTestId("cta-compare-runner-up").click();
    const s5AStage = page.getByTestId("stage-S5A_FlipRunnerUpCamera");
    await expect(s5AStage).toBeVisible();

    // Verify Goal Pill in Top Bar
    const goalPill = page.getByTestId("flip-goal-pill");
    await expect(goalPill).toBeVisible();
    await expect(goalPill).toHaveText(/In 2[\u2013-]3 days/);

    // Snap flipped photo -> S5B1
    await page.getByTestId("flip-shutter-button").click();
    const s5B1Stage = page.getByTestId("stage-S5B1_RunnerUpBeaten");
    await expect(s5B1Stage).toBeVisible();

    // Verify 3-way switch is gone and locked goal banner is displayed
    await expect(page.getByTestId("ripeness-target-switch")).not.toBeVisible();
    const lockedGoal = page.getByTestId("locked-ripeness-goal");
    await expect(lockedGoal).toBeVisible();
    await expect(lockedGoal).toHaveText(/In 2[\u2013-]3 days/);
  });
});
