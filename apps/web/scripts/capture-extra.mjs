import { chromium } from "@playwright/test";
import path from "node:path";

const OUTPUT_DIR = "/Users/olivieri.cezar/.gemini/antigravity/brain/3d10fd55-a3aa-4756-a214-9c1f5a8fcf04/comparison";
const WATERMELON_JPG = "/Users/olivieri.cezar/Development/pomona/.superpowers/brainstorm/34780-1792182706/content/watermelon-pile.jpg";

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--ignore-certificate-errors"],
  });

  // Test S5B1 (Runner-Up Beaten)
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
    await page.addInitScript(() => {
      localStorage.setItem("pomona-mock-mode", "false");
      localStorage.setItem("pomona-theme", "light");
    });

    let call = 0;
    await page.route("**/api/v1/scan", async (route) => {
      call++;
      if (call === 1) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            remainingScans: 9,
            response: {
              schemaVersion: "1.0", promptVersion: "v1", modelId: "test", round: 1, status: "ok", message: null,
              produce: { type: "watermelon", displayName: "Watermelon", variety: null },
              candidates: [
                { id: "c1", box: [360, 240, 680, 560], score: 8.6, ripeness: "ripe", traits: ["Yellow field spot", "Matte rind", "Even form"], flipSummary: null },
                { id: "c2", box: [320, 580, 660, 900], score: 8.1, ripeness: "almost_ripe", traits: ["Even shape"], flipSummary: null },
              ],
              verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy it." },
              followUp: { targetCandidateId: "c2", targetRole: "runner_up", bannerText: "The blue one could be sweeter. Flip it and snap.", flipHeadline: "Flip the Watermelon over", instruction: "Turn over to inspect underside." },
              afterPurchase: { readyInDays: { min: 0, max: 0 }, eatWithinDays: { min: 3, max: 5 }, eatWithinLabel: "3–5 days", storage: { beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep out of direct sunlight" }, afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap tightly" } } }
            }
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            remainingScans: 8,
            response: {
              schemaVersion: "1.0", promptVersion: "v1", modelId: "test", round: 2, status: "ok", message: null,
              produce: { type: "watermelon", displayName: "Watermelon", variety: null },
              candidates: [
                { id: "c2", box: [150, 150, 850, 850], score: 7.2, ripeness: "ripe", traits: ["Pale underside"], flipSummary: "pale underside" }
              ],
              verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st pick." },
              followUp: null,
              afterPurchase: { readyInDays: { min: 0, max: 0 }, eatWithinDays: { min: 3, max: 5 }, eatWithinLabel: "3–5 days", storage: { beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep out of direct sunlight" }, afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap tightly" } } }
            }
          })
        });
      }
    });

    await page.goto("https://localhost:5173/");
    const fileInput = await page.$('[data-testid="file-fallback-input"]');
    if (fileInput) await fileInput.setInputFiles(WATERMELON_JPG);
    await page.waitForSelector('[data-testid="stage-S2_DrawFocusArea"]');
    await page.click('[data-testid="whole-photo-button"]');
    await page.waitForSelector('[data-testid="stage-S4_InitialResult"]');
    await page.click('[data-testid="cta-compare-runner-up"]');
    await page.waitForSelector('[data-testid="stage-S5A_FlipRunnerUpCamera"]');
    await page.click('[data-testid="flip-shutter-button"]');
    await page.waitForSelector('[data-testid="stage-S5B1_RunnerUpBeaten"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "impl-5b1-runner-up-beaten.png") });
    console.log("Saved impl-5b1-runner-up-beaten.png");
    await page.close();
  }

  // Test S7B (1st Pick Lost Final Flip)
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
    await page.addInitScript(() => {
      localStorage.setItem("pomona-mock-mode", "false");
      localStorage.setItem("pomona-theme", "light");
    });

    let call = 0;
    await page.route("**/api/v1/scan", async (route) => {
      call++;
      if (call === 1) {
        await route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({
            remainingScans: 9,
            response: {
              schemaVersion: "1.0", promptVersion: "v1", modelId: "test", round: 1, status: "ok", message: null,
              produce: { type: "watermelon", displayName: "Watermelon", variety: null },
              candidates: [
                { id: "c1", box: [360, 240, 680, 560], score: 8.6, ripeness: "ripe", traits: ["Yellow field spot", "Matte rind", "Even form"], flipSummary: null },
                { id: "c2", box: [320, 580, 660, 900], score: 8.1, ripeness: "almost_ripe", traits: ["Even shape"], flipSummary: null },
              ],
              verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy it." },
              followUp: { targetCandidateId: "c2", targetRole: "runner_up", bannerText: "The blue one could be sweeter. Flip it and snap.", flipHeadline: "Flip the Watermelon over", instruction: "Turn over to inspect underside." },
              afterPurchase: { readyInDays: { min: 0, max: 0 }, eatWithinDays: { min: 3, max: 5 }, eatWithinLabel: "3–5 days", storage: { beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" }, afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap tightly" } } }
            }
          })
        });
      } else if (call === 2) {
        await route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({
            remainingScans: 8,
            response: {
              schemaVersion: "1.0", promptVersion: "v1", modelId: "test", round: 2, status: "ok", message: null,
              produce: { type: "watermelon", displayName: "Watermelon", variety: null },
              candidates: [
                { id: "c2", box: [150, 150, 850, 850], score: 9.0, ripeness: "ripe", traits: ["Deep creamy spot", "Rich webbing", "Matte rind"], flipSummary: "deep creamy field spot" }
              ],
              verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high", headline: "Buy this one." },
              followUp: { targetCandidateId: "c1", targetRole: "first_pick", bannerText: "1st Pick was only graded from top.", flipHeadline: "Flip your 1st pick over", instruction: "Turn over." },
              afterPurchase: { readyInDays: { min: 0, max: 0 }, eatWithinDays: { min: 3, max: 5 }, eatWithinLabel: "3–5 days", storage: { beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" }, afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap tightly" } } }
            }
          })
        });
      } else {
        await route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({
            remainingScans: 7,
            response: {
              schemaVersion: "1.0", promptVersion: "v1", modelId: "test", round: 3, status: "ok", message: null,
              produce: { type: "watermelon", displayName: "Watermelon", variety: null },
              candidates: [
                { id: "c1", box: [150, 150, 850, 850], score: 8.4, ripeness: "ripe", traits: ["Matte rind"], flipSummary: "matte rind" }
              ],
              verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high", headline: "Buy the new winner." },
              followUp: null,
              afterPurchase: { readyInDays: { min: 0, max: 0 }, eatWithinDays: { min: 3, max: 5 }, eatWithinLabel: "3–5 days", storage: { beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" }, afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap tightly" } } }
            }
          })
        });
      }
    });

    await page.goto("https://localhost:5173/");
    const fileInput = await page.$('[data-testid="file-fallback-input"]');
    if (fileInput) await fileInput.setInputFiles(WATERMELON_JPG);
    await page.waitForSelector('[data-testid="stage-S2_DrawFocusArea"]');
    await page.click('[data-testid="whole-photo-button"]');
    await page.waitForSelector('[data-testid="stage-S4_InitialResult"]');
    await page.click('[data-testid="cta-compare-runner-up"]');
    await page.waitForSelector('[data-testid="stage-S5A_FlipRunnerUpCamera"]');
    await page.click('[data-testid="flip-shutter-button"]');
    await page.waitForSelector('[data-testid="stage-S5B2_RunnerUpTookLead"]');
    await page.click('[data-testid="cta-final-check-first-pick"]');
    await page.waitForSelector('[data-testid="stage-S6_FlipFirstPickCamera"]');
    await page.click('[data-testid="flip-shutter-button"]');
    await page.waitForSelector('[data-testid="stage-S7B_FirstPickLostFinal"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "impl-7b-first-pick-lost.png") });
    console.log("Saved impl-7b-first-pick-lost.png");
    await page.close();
  }

  await browser.close();
  console.log("Extra captures finished!");
}

run().catch(console.error);
