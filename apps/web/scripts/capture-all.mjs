import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const OUTPUT_DIR = "/Users/olivieri.cezar/.gemini/antigravity/brain/3d10fd55-a3aa-4756-a214-9c1f5a8fcf04/comparison";
const WATERMELON_JPG = "/Users/olivieri.cezar/Development/pomona/.superpowers/brainstorm/34780-1792182706/content/watermelon-pile.jpg";

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function capture() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--ignore-certificate-errors",
    ],
  });

  // 1. CAPTURE MOCKUP SCREENS
  console.log("Capturing mockup screens...");
  const mockupPage = await browser.newPage({
    viewport: { width: 1400, height: 2400 },
    deviceScaleFactor: 2,
  });

  await mockupPage.goto("http://localhost:8088/full-7-state-freehand-draw.html", { waitUntil: "networkidle" });
  await mockupPage.waitForTimeout(1000);

  const steps7 = await mockupPage.$$(".grid .step");
  const mockNames7 = [
    "mockup-1-live-camera.png",
    "mockup-2-draw-focus-area.png",
    "mockup-3-analysing.png",
    "mockup-4-initial-result.png",
    "mockup-5a-flip-runner-up.png",
    "mockup-5b2-runner-up-leads.png",
    "mockup-6-flip-first-pick.png",
  ];

  for (let i = 0; i < steps7.length && i < mockNames7.length; i++) {
    const phone = await steps7[i].$(".phone");
    if (phone) {
      await phone.screenshot({ path: path.join(OUTPUT_DIR, mockNames7[i]) });
      console.log(`Saved ${mockNames7[i]}`);
    }
  }

  // Mockup for 5B-1, 7A, 7B from complete-state-map-light.html
  await mockupPage.goto("http://localhost:8088/complete-state-map-light.html", { waitUntil: "networkidle" });
  await mockupPage.waitForTimeout(1000);

  const allSteps = await mockupPage.$$(".step");
  for (const step of allSteps) {
    const h3Text = await step.$eval("h3", (el) => el.textContent || "");
    const phone = await step.$(".phone");
    if (!phone) continue;

    if (h3Text.includes("State 5B-1")) {
      await phone.screenshot({ path: path.join(OUTPUT_DIR, "mockup-5b1-runner-up-beaten.png") });
      console.log("Saved mockup-5b1-runner-up-beaten.png");
    } else if (h3Text.includes("State 7A")) {
      await phone.screenshot({ path: path.join(OUTPUT_DIR, "mockup-7a-first-pick-won.png") });
      console.log("Saved mockup-7a-first-pick-won.png");
    } else if (h3Text.includes("State 7B")) {
      await phone.screenshot({ path: path.join(OUTPUT_DIR, "mockup-7b-first-pick-lost.png") });
      console.log("Saved mockup-7b-first-pick-lost.png");
    }
  }

  await mockupPage.close();

  // 2. CAPTURE LIVE APP IMPLEMENTATION SCREENS
  console.log("Capturing live implementation screens...");
  const appPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
  });

  await appPage.addInitScript(() => {
    localStorage.setItem("pomona-mock-mode", "true");
    localStorage.setItem("pomona-theme", "light");
  });

  await appPage.goto("https://localhost:5173/", { waitUntil: "networkidle" });
  await appPage.waitForTimeout(1000);

  // Screen 1: Live Camera
  await appPage.screenshot({ path: path.join(OUTPUT_DIR, "impl-1-live-camera.png") });
  console.log("Saved impl-1-live-camera.png");

  // Upload watermelon image
  const fileInput = await appPage.$('[data-testid="file-fallback-input"]');
  if (fileInput) {
    await fileInput.setInputFiles(WATERMELON_JPG);
  }

  // Screen 2: Draw Focus Area
  await appPage.waitForSelector('[data-testid="stage-S2_DrawFocusArea"]');
  await appPage.waitForTimeout(500);

  // Draw loop
  const drawStage = await appPage.$('[data-testid="stage-S2_DrawFocusArea"]');
  const box = await drawStage.boundingBox();
  if (box) {
    const startX = box.x + box.width * 0.22;
    const startY = box.y + box.height * 0.22;
    const drawWidth = box.width * 0.55;
    const drawHeight = box.height * 0.42;

    await appPage.mouse.move(startX, startY);
    await appPage.mouse.down();
    await appPage.mouse.move(startX + drawWidth, startY, { steps: 12 });
    await appPage.mouse.move(startX + drawWidth, startY + drawHeight, { steps: 12 });
    await appPage.mouse.move(startX, startY + drawHeight, { steps: 12 });
    await appPage.mouse.move(startX, startY, { steps: 12 });
    await appPage.mouse.up();
  }
  await appPage.waitForTimeout(600);
  await appPage.screenshot({ path: path.join(OUTPUT_DIR, "impl-2-draw-focus-area.png") });
  console.log("Saved impl-2-draw-focus-area.png");

  // Screen 3: Analysing
  const analyseDrawnBtn = await appPage.$('[data-testid="analyse-drawn-button"]');
  await analyseDrawnBtn.click();
  await appPage.waitForSelector('[data-testid="stage-S3_Analysing"]');
  // Capture mid-scan
  await appPage.waitForTimeout(200);
  await appPage.screenshot({ path: path.join(OUTPUT_DIR, "impl-3-analysing.png") });
  console.log("Saved impl-3-analysing.png");

  // Screen 4: Initial Result
  await appPage.waitForSelector('[data-testid="stage-S4_InitialResult"]', { timeout: 15000 });
  await appPage.waitForTimeout(800);
  await appPage.screenshot({ path: path.join(OUTPUT_DIR, "impl-4-initial-result.png") });
  console.log("Saved impl-4-initial-result.png");

  // Screen 5A: Flip Runner-Up Camera
  const compareBtn = await appPage.$('[data-testid="cta-compare-runner-up"]');
  await compareBtn.click();
  await appPage.waitForSelector('[data-testid="stage-S5A_FlipRunnerUpCamera"]');
  await appPage.waitForTimeout(800);
  await appPage.screenshot({ path: path.join(OUTPUT_DIR, "impl-5a-flip-runner-up.png") });
  console.log("Saved impl-5a-flip-runner-up.png");

  // Tap shutter on Flip Runner-Up -> Reaches S5B-2
  const flipShutter1 = await appPage.$('[data-testid="flip-shutter-button"]');
  await flipShutter1.click();

  await appPage.waitForSelector('[data-testid="stage-S5B2_RunnerUpTookLead"]', { timeout: 15000 });
  await appPage.waitForTimeout(800);
  await appPage.screenshot({ path: path.join(OUTPUT_DIR, "impl-5b2-runner-up-leads.png") });
  console.log("Saved impl-5b2-runner-up-leads.png");

  // Screen 6: Flip 1st Pick Camera
  const finalCheckBtn = await appPage.$('[data-testid="cta-final-check-first-pick"]');
  await finalCheckBtn.click();
  await appPage.waitForSelector('[data-testid="stage-S6_FlipFirstPickCamera"]');
  await appPage.waitForTimeout(800);
  await appPage.screenshot({ path: path.join(OUTPUT_DIR, "impl-6-flip-first-pick.png") });
  console.log("Saved impl-6-flip-first-pick.png");

  // Tap shutter on Flip 1st Pick -> Reaches S7A
  const flipShutter2 = await appPage.$('[data-testid="flip-shutter-button"]');
  await flipShutter2.click();

  await appPage.waitForSelector('[data-testid="stage-S7A_FirstPickWonFinal"]', { timeout: 15000 });
  await appPage.waitForTimeout(800);
  await appPage.screenshot({ path: path.join(OUTPUT_DIR, "impl-7a-first-pick-won.png") });
  console.log("Saved impl-7a-first-pick-won.png");

  await appPage.close();
  await browser.close();
  console.log("All screenshots successfully captured!");
}

capture().catch((err) => {
  console.error("Capture script error:", err);
  process.exit(1);
});
