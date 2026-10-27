import { test, expect, type Page } from "@playwright/test";

const mockConfidentDeepScan = {
  schemaVersion: "1.0",
  promptVersion: "deep_scan_v1",
  modelId: "gemini-2.5-flash",
  status: "ok",
  abstentionReason: null,
  message: null,
  produce: { type: "avocado", displayName: "Hass Avocado", variety: "Hass" },
  ripeness: { state: "nearly_ripe", confidence: 0.88 },
  evidence: ["Dark pebbled skin", "Slight give at stem shoulder"],
  quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
  manualChecks: null,
  recommendation: { eatWhen: "in_a_few_days" },
  afterPurchase: {
    readyInDays: { min: 1, max: 2 },
    eatWithinDays: { min: 3, max: 4 },
    eatWithinLabel: "3-4 days",
    storage: {
      beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter: whole", tip: "Softens daily" },
      afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge: wrapped", tip: "Spritz with lime" },
    },
  },
  seasonality: {
    produceSlug: "avocado",
    month: 10,
    shopperCountry: "US",
    shopperZone: "MIDWEST",
    status: "peak",
    peakWindowLabel: "Oct-Jan",
    badgeText: "Peak season",
    noteText: "Best value right now",
    origins: [],
  },
};

const mockAbstentionDeepScan = {
  schemaVersion: "1.0",
  promptVersion: "deep_scan_v1",
  modelId: "gemini-2.5-flash",
  status: "insufficient_evidence",
  abstentionReason: "same_side_only",
  message: "Most of the fruit sides were not captured. Please slowly rotate the fruit to show different sides.",
  produce: { type: "avocado", displayName: "Avocado", variety: null },
  ripeness: { state: "unknown", confidence: 0 },
  evidence: [],
  quality: { sufficientVisualEvidence: false, viewCoverage: "poor", reason: "same_side_only" },
  manualChecks: [
    { trait: "Gentle thumb press", how: "Press gently near stem", whatItMeans: "Slight give indicates ready" },
  ],
  recommendation: null,
  afterPurchase: null,
  seasonality: null,
};

const mockNoProduceDeepScan = {
  schemaVersion: "1.0",
  promptVersion: "deep_scan_v1",
  modelId: "@cf/cloudflare/clef-flash",
  status: "no_produce",
  abstentionReason: null,
  message: "No fresh produce detected. Please photograph fruit or vegetables.",
  produce: { type: "unknown", displayName: "Unknown", variety: null },
  ripeness: { state: "unknown", confidence: 0 },
  evidence: [],
  quality: { sufficientVisualEvidence: false, viewCoverage: "poor", reason: null },
  manualChecks: null,
  recommendation: null,
  afterPurchase: null,
  seasonality: null,
};

const mockSingleProduceCompare = {
  schemaVersion: "1.0",
  promptVersion: "v1",
  modelId: "@cf/cloudflare/clef-flash",
  round: 1,
  status: "single_produce",
  message: "Only one piece of produce is visible. Use inspect mode for a thorough single-fruit check.",
  abstentionReason: null,
  countedTotal: 1,
  produce: null,
  candidates: [],
  verdict: null,
  followUp: null,
  afterPurchase: null,
};

async function waitForVideo(page: Page) {
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.videoWidth > 0 && v.readyState >= 2;
  }, { timeout: 10000 }).catch(() => {});
}

test.describe("Inspect (Deep Scan) E2E User Journeys", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => console.error("PAGE_ERROR:", err));
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error("BROWSER_LOG:", msg.text());
    });
    await page.addInitScript(() => {
      window.localStorage.setItem("pomona-mock-mode", "false");
      (window as any).__POMONA_MOCK_FRAMES = true;
      (window as any).__POMONA_BYPASS_LOCAL_REJECT = true;
    });

    await page.route("**/api/v1/quota", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ remainingDeviceScans: 10, budgetOpen: true }),
      });
    });
  });

  test("Journey 1: Mode Switcher toggles between Compare and Inspect seamlessly", async ({ page }) => {
    await page.goto("/");
    await waitForVideo(page);

    // Initially in Compare mode
    await expect(page.getByTestId("stage-S1_LiveCamera")).toBeVisible();
    await expect(page.getByTestId("mode-tab-compare")).toBeVisible();
    await expect(page.getByTestId("mode-tab-inspect")).toBeVisible();
    await expect(page.getByTestId("camera-reticle-brackets")).toBeVisible();

    // Click Inspecionar / Inspect tab
    await page.getByTestId("mode-tab-inspect").click();

    // Enters Inspect viewfinder with oval outline
    await expect(page.getByTestId("stage-S_DS_Capture")).toBeVisible();
    await expect(page.getByTestId("ds-oval")).toBeVisible();

    // Mode tab Compare returns to compare viewfinder
    await page.getByTestId("mode-tab-compare").click();
    await expect(page.getByTestId("stage-S1_LiveCamera")).toBeVisible();
    await expect(page.getByTestId("camera-reticle-brackets")).toBeVisible();
  });

  test("Journey 2: Single produce error in Compare mode provides CTA leading to Inspect mode", async ({ page }) => {
    await page.route("**/api/v1/scan", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockSingleProduceCompare),
      });
    });

    await page.goto("/");
    await waitForVideo(page);
    await page.getByTestId("shutter-button").click();
    await page.getByTestId("whole-photo-button").click();

    // Lands on single produce error screen with dedicated inspect CTA
    await expect(page.getByTestId("stage-S_ScanError")).toBeVisible();
    await expect(page.getByTestId("error-deep-scan-cta")).toBeVisible();
    await expect(page.getByTestId("error-other-angle-button")).toHaveCount(0);

    // Clicking the inspect CTA transitions directly into Inspect capture
    await page.getByTestId("error-deep-scan-cta").click();
    await expect(page.getByTestId("stage-S_DS_Capture")).toBeVisible();
    await expect(page.getByTestId("ds-oval")).toBeVisible();
  });

  test("Journey 3: Complete confident inspect flow with peak ripeness and collapsible tactile checks", async ({ page }) => {
    let deepScanRequested = false;
    await page.route("**/api/v1/deep-scan", async (route) => {
      deepScanRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "X-Pomona-Remaining-Scans": "9",
        },
        body: JSON.stringify(mockConfidentDeepScan),
      });
    });

    await page.goto("/");
    await waitForVideo(page);
    await page.getByTestId("mode-tab-inspect").click();
    await expect(page.getByTestId("stage-S_DS_Capture")).toBeVisible();

    // Set a capture delay so the guided scanning laser beam and yellow blinking dots can be verified during capture
    await page.evaluate(() => {
      (window as any).__POMONA_MOCK_CAPTURE_DELAY_MS = 800;
    });

    // Tap shutter to start guided capture: scanning laser beam, yellow blinking dots, and 3D scan card animation appear
    await page.getByTestId("ds-go-button").click();
    await expect(page.getByTestId("ds-scanning-mask-overlay")).toBeVisible();
    await expect(page.getByTestId("ds-scanning-laser-beam")).toBeVisible();
    await expect(page.getByTestId("candidate-pulse-dot").first()).toBeVisible();
    await expect(page.getByTestId("prompt-card-3d-scan")).toBeVisible();

    // Transitions to Result stage upon response
    await expect(page.getByTestId("stage-S_DS_Result")).toBeVisible({ timeout: 15000 });
    expect(deepScanRequested).toBe(true);

    // Verify produce chip, circular score meter, and peak ripeness badge
    await expect(page.getByTestId("produce-name-chip")).toHaveText("Hass Avocado");
    await expect(page.getByTestId("ds-verdict-card")).toBeVisible();
    await expect(page.getByTestId("circular-score-meter")).toBeVisible();
    await expect(page.getByTestId("ds-peak-ripeness-badge")).toBeVisible();
    await expect(page.getByTestId("ds-peak-ripeness-badge")).toHaveText(/Peak ripeness: In 1-2 days/i);

    // Expand bottom sheet to see full details
    await page.getByTestId("sheet-drag-area").click();

    // Storage and Seasonality cards
    await expect(page.getByTestId("storage-peak-ripeness-card")).toBeVisible();
    await expect(page.getByTestId("seasonality-panel")).toBeVisible();

    // Collapsible tactile checks card: initially collapsed
    const tactileCard = page.getByTestId("ds-confident-tactile-checks");
    await expect(tactileCard).toBeVisible();
    await expect(page.getByTestId("ds-visual-score-label")).toBeVisible();
    const toggleButton = page.getByTestId("ds-confident-tactile-checks-toggle");
    await expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("ds-confident-tactile-checks-subtitle")).toHaveText(/Photos assess the exterior/i);
    await expect(page.getByTestId("ds-confident-tactile-checks-list")).toHaveCount(0);

    // Click toggle button: opens tactile checks dialog with transparency disclaimer
    await toggleButton.click();
    await expect(page.getByTestId("ds-confident-tactile-checks-dialog")).toBeVisible();
    await expect(toggleButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("ds-confident-tactile-checks-disclaimer")).toHaveText(/photos alone can never be 100% sure/i);
    await expect(page.getByTestId("ds-confident-tactile-checks-list")).toBeVisible();
    await expect(page.getByTestId("ds-confident-tactile-checks-list")).toHaveText(/Gentle thumb press/i);

    // Close dialog via close button
    await page.getByTestId("ds-confident-tactile-checks-close-button").click();
    await expect(page.getByTestId("ds-confident-tactile-checks-dialog")).toHaveCount(0);
    await expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("ds-confident-tactile-checks-list")).toHaveCount(0);

    // Clicking Start a new scan CTA returns to Inspect capture viewfinder
    await page.getByTestId("ds-new-scan-cta").click();
    await expect(page.getByTestId("stage-S_DS_Capture")).toBeVisible();
  });

  test("Journey 4: Inconclusive inspect flow renders not-enough-evidence card and default-open manual checks", async ({ page }) => {
    await page.route("**/api/v1/deep-scan", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "X-Pomona-Remaining-Scans": "8",
        },
        body: JSON.stringify(mockAbstentionDeepScan),
      });
    });

    await page.goto("/");
    await waitForVideo(page);
    await page.getByTestId("mode-tab-inspect").click();
    await page.getByTestId("ds-go-button").click();

    // Result stage renders abstention UI
    await expect(page.getByTestId("stage-S_DS_Result")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("error-center-icon")).toHaveAttribute("data-icon", "search");
    await expect(page.getByTestId("produce-name-chip")).toHaveText("Avocado");
    await expect(page.getByTestId("ds-not-enough-card")).toBeVisible();
    await expect(page.getByTestId("ds-not-enough-card")).toHaveText(/Most of the fruit sides were not captured/i);
    await expect(page.getByTestId("ds-error-tip-box")).toBeVisible();

    // Tactile checks card is rendered and opens dialog on tap
    await expect(page.getByTestId("ds-manual-checks")).toBeVisible();
    await page.getByTestId("ds-manual-checks-toggle").click();
    await expect(page.getByTestId("ds-manual-checks-dialog")).toBeVisible();
    await expect(page.getByTestId("ds-manual-checks-list")).toBeVisible();
    await expect(page.getByTestId("ds-manual-checks-list")).toHaveText(/Gentle thumb press/i);
    await page.getByTestId("ds-manual-checks-close-button").click();
    await expect(page.getByTestId("ds-manual-checks-dialog")).toHaveCount(0);

    // Start a new scan returns to Inspect capture viewfinder
    await page.getByTestId("ds-new-scan-cta").click();
    await expect(page.getByTestId("stage-S_DS_Capture")).toBeVisible();
  });

  test("Journey 5: No produce detected gate error renders error state with guidance", async ({ page }) => {
    await page.route("**/api/v1/deep-scan", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "X-Pomona-Remaining-Scans": "7",
        },
        body: JSON.stringify(mockNoProduceDeepScan),
      });
    });

    await page.goto("/");
    await waitForVideo(page);
    await page.getByTestId("mode-tab-inspect").click();
    await page.getByTestId("ds-go-button").click();

    // Result stage renders no produce error
    await expect(page.getByTestId("stage-S_DS_Result")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("error-center-icon")).toHaveAttribute("data-icon", "produce");
    await expect(page.getByTestId("ds-not-enough-card")).toHaveText(/No fresh produce detected/i);
    await expect(page.getByTestId("ds-error-tip-box")).toBeVisible();
  });
});
