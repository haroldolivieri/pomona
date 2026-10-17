import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireFromWeb = createRequire(path.resolve(__dirname, "../../../apps/web/package.json"));
const { chromium } = requireFromWeb("@playwright/test");
const DATASET_DIR = path.resolve(__dirname, "../dataset");
const IMAGES_DIR = path.join(DATASET_DIR, "images");

fs.mkdirSync(IMAGES_DIR, { recursive: true });

/**
 * Generates controlled ground-truth images at 1000x1000 px so pixel coordinates
 * directly map 1:1 to normalized [ymin, xmin, ymax, xmax] (0..1000) coordinates.
 */
const SCENARIOS = [
  {
    id: "01-watermelon-crate-clear-winner",
    filename: "01-watermelon-crate-clear-winner.jpg",
    description:
      "Round 1: 3 Watermelons in a wooden supermarket crate. Left melon (ripe, large creamy-yellow field spot, matte dark stripes, sugar webbing) is the clear winner. Right melon (almost_ripe, smaller pale spot) is the runner-up. Top-center melon is underripe (shiny bright green, white spot).",
    html: `
      <div style="width:1000px;height:1000px;background:#3a2a1d;position:relative;font-family:sans-serif;overflow:hidden;">
        <!-- Wooden crate slats -->
        <div style="position:absolute;inset:20px;border:12px solid #5c4028;background:repeating-linear-gradient(0deg, #2b1d12 0px, #2b1d12 180px, #1a110a 180px, #1a110a 195px);"></div>
        
        <!-- Candidate 3 (Top Center - Underripe: shiny, small white spot) -->
        <!-- Box: ymin=120, xmin=340, ymax=420, xmax=680 -->
        <div style="position:absolute;top:120px;left:340px;width:340px;height:300px;border-radius:50%;background:radial-gradient(circle at 35% 30%, #76c96e, #2d7a29 70%, #194d16);box-shadow:0 20px 40px rgba(0,0,0,0.6), inset 0 15px 30px rgba(255,255,255,0.45);">
          <!-- Shiny specular highlight -->
          <div style="position:absolute;top:40px;left:70px;width:120px;height:55px;border-radius:50%;background:rgba(255,255,255,0.55);transform:rotate(-15deg);filter:blur(4px);"></div>
          <!-- Pale white spot -->
          <div style="position:absolute;bottom:25px;left:130px;width:70px;height:45px;border-radius:50%;background:#f2f7f2;opacity:0.85;filter:blur(3px);"></div>
        </div>

        <!-- Candidate 1 (Bottom Left - BEST WINNER: matte dark green, large creamy-yellow field spot, heavy webbing) -->
        <!-- Box: ymin=460, xmin=80, ymax=820, xmax=490 -->
        <div style="position:absolute;top:460px;left:80px;width:410px;height:360px;border-radius:48%;background:repeating-radial-gradient(circle at 50% 50%, #1c471f 0px, #1c471f 22px, #2e6632 22px, #2e6632 42px);box-shadow:0 28px 50px rgba(0,0,0,0.75);">
          <!-- Creamy golden-yellow field spot -->
          <div style="position:absolute;bottom:35px;left:110px;width:190px;height:130px;border-radius:50%;background:radial-gradient(circle, #f5d142 0%, #e8be2c 70%, rgba(232,190,44,0) 100%);filter:blur(2px);"></div>
          <!-- Brown pollination webbing scars -->
          <svg style="position:absolute;inset:0;width:100%;height:100%;" viewBox="0 0 410 360">
            <path d="M130 240 L270 250 M160 220 L240 270 M195 200 L205 290 M150 265 L260 230" stroke="#7a5926" stroke-width="4" stroke-linecap="round"/>
          </svg>
        </div>

        <!-- Candidate 2 (Bottom Right - RUNNER UP: decent green, medium pale-yellow spot) -->
        <!-- Box: ymin=470, xmin=530, ymax=810, xmax=920 -->
        <div style="position:absolute;top:470px;left:530px;width:390px;height:340px;border-radius:48%;background:repeating-radial-gradient(circle at 50% 50%, #235927 0px, #235927 24px, #3b7d40 24px, #3b7d40 46px);box-shadow:0 25px 45px rgba(0,0,0,0.7);">
          <!-- Small pale-cream spot -->
          <div style="position:absolute;bottom:45px;left:140px;width:110px;height:75px;border-radius:50%;background:radial-gradient(circle, #f5eab8 0%, #dce3a6 75%, transparent 100%);filter:blur(2px);"></div>
        </div>
      </div>
    `,
    groundTruth: {
      round: 1,
      expectedStatus: "ok",
      expectedProduceType: "watermelon",
      focusPolygon: null,
      expectedCandidateCountMin: 2,
      expectedCandidateCountMax: 3,
      expectedWinnerBox: [460, 80, 820, 490], // Bottom-left melon
      expectedRunnerUpBox: [470, 530, 810, 920], // Bottom-right melon
      forbiddenWordsInCopy: ["avocado", "pineapple", "banana", "tomato", "mango"],
    },
  },
  {
    id: "02-avocado-polygon-isolation",
    filename: "02-avocado-polygon-isolation.jpg",
    description:
      "Round 1 Adversarial Polygon: 3 Hass Avocados on a market table. The top-left avocado is peak ripe, but the user drew a focusPolygon strictly around the two bottom avocados ([450, 150] to [950, 950]). The model MUST ignore the top-left avocado and pick the best one inside the polygon.",
    html: `
      <div style="width:1000px;height:1000px;background:#d8cfc2;position:relative;overflow:hidden;">
        <!-- Top-Left Avocado (OUTSIDE POLYGON - should be ignored!) -->
        <!-- Box: ymin=80, xmin=100, ymax=380, xmax=350 -->
        <div style="position:absolute;top:80px;left:100px;width:250px;height:300px;border-radius:45% 45% 50% 50%;background:radial-gradient(circle at 40% 40%, #2a3324, #181f14);box-shadow:0 18px 35px rgba(0,0,0,0.45);">
          <div style="position:absolute;top:12px;left:110px;width:28px;height:22px;border-radius:50%;background:#5c4827;"></div>
        </div>

        <!-- Bottom-Left Avocado (INSIDE POLYGON - WINNER: Dark pebbled skin, intact brown stem) -->
        <!-- Box: ymin=520, xmin=220, ymax=860, xmax=510 -->
        <div style="position:absolute;top:520px;left:220px;width:290px;height:340px;border-radius:44% 44% 52% 52%;background:radial-gradient(circle at 35% 35%, #2d3827, #171d14);box-shadow:0 22px 40px rgba(0,0,0,0.5);">
          <div style="position:absolute;top:10px;left:130px;width:32px;height:24px;border-radius:50%;background:#6b532d;border:3px solid #3d2f18;"></div>
        </div>

        <!-- Bottom-Right Avocado (INSIDE POLYGON - RUNNER UP: Bright grass-green underripe) -->
        <!-- Box: ymin=540, xmin=580, ymax=860, xmax=850 -->
        <div style="position:absolute;top:540px;left:580px;width:270px;height:320px;border-radius:44% 44% 52% 52%;background:radial-gradient(circle at 35% 35%, #689f38, #33691e);box-shadow:0 22px 40px rgba(0,0,0,0.45);">
          <div style="position:absolute;top:10px;left:120px;width:30px;height:22px;border-radius:50%;background:#8bc34a;"></div>
        </div>
      </div>
    `,
    groundTruth: {
      round: 1,
      expectedStatus: "ok",
      expectedProduceType: "avocado",
      // Polygon strictly covers bottom half: x in [150..920], y in [450..950]
      focusPolygon: [
        [150, 450],
        [920, 450],
        [920, 950],
        [150, 950],
      ],
      expectedCandidateCountMin: 2,
      expectedCandidateCountMax: 2,
      expectedWinnerBox: [520, 220, 860, 510], // Bottom-left dark ripe avocado
      expectedRunnerUpBox: [540, 580, 860, 850], // Bottom-right green avocado
      forbiddenWordsInCopy: ["watermelon", "melon", "cantaloupe", "field spot", "rind"],
    },
  },
  {
    id: "03-unclear-blurry-photo",
    filename: "03-unclear-blurry-photo.jpg",
    description:
      "Adversarial Error Case: Extreme motion blur and darkness where produce cannot be graded reliably. Expects status = 'unclear_photo'.",
    html: `
      <div style="width:1000px;height:1000px;background:#0a0b09;position:relative;overflow:hidden;filter:blur(42px) contrast(0.5) brightness(0.35);">
        <div style="position:absolute;top:300px;left:200px;width:500px;height:200px;background:linear-gradient(90deg, #1b2e19, #3d351b, #111);transform:rotate(25deg) scaleX(2.2);"></div>
        <div style="position:absolute;top:500px;left:400px;width:400px;height:300px;background:rgba(255,255,255,0.18);border-radius:50%;"></div>
      </div>
    `,
    groundTruth: {
      round: 1,
      expectedStatus: "unclear_photo",
      expectedProduceType: null,
      focusPolygon: null,
    },
  },
  {
    id: "04-no-produce-cereal-box",
    filename: "04-no-produce-cereal-box.jpg",
    description:
      "Adversarial Error Case: Packaged grocery item / barcode / coffee mug with zero fresh produce. Expects status = 'no_produce'.",
    html: `
      <div style="width:1000px;height:1000px;background:#e4e2dd;display:flex;align-items:center;justify-content:center;font-family:sans-serif;">
        <div style="width:460px;height:680px;background:#1e3a8a;border-radius:16px;border:8px solid #172554;box-shadow:0 25px 50px rgba(0,0,0,0.35);display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:40px;color:white;">
          <div style="font-size:54px;font-weight:900;letter-spacing:2px;text-align:center;">CRUNCHY OATS CEREAL</div>
          <div style="font-size:24px;background:#ef4444;padding:12px 28px;border-radius:999px;font-weight:700;">NET WT 500g · BOXED</div>
          <!-- Barcode -->
          <div style="width:280px;height:110px;background:white;padding:15px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <div style="width:100%;height:70px;background:repeating-linear-gradient(90deg, #000 0px, #000 6px, #fff 6px, #fff 12px, #000 12px, #000 15px, #fff 15px, #fff 24px);"></div>
            <div style="color:black;font-size:16px;font-family:monospace;margin-top:4px;">0 12345 67890 5</div>
          </div>
        </div>
      </div>
    `,
    groundTruth: {
      round: 1,
      expectedStatus: "no_produce",
      expectedProduceType: null,
      focusPolygon: null,
    },
  },
  {
    id: "05-multiple-types-mixed",
    filename: "05-multiple-types-mixed.jpg",
    description:
      "Adversarial Error Case: Mixed produce basket containing distinct fruits (Bright Yellow Bananas, Red Apples, and Purple Grapes) with no focusPolygon drawn. Expects status = 'multiple_types'.",
    html: `
      <div style="width:1000px;height:1000px;background:#f3efe6;position:relative;font-family:sans-serif;padding:40px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;height:100%;">
          <!-- Crate 1: Bright Red Apples -->
          <div style="background:#4a3525;border-radius:20px;padding:30px;display:flex;flex-wrap:wrap;gap:20px;align-items:center;justify-content:center;">
            <div style="width:170px;height:170px;border-radius:50%;background:radial-gradient(circle at 30% 30%, #ff5252, #b71c1c);box-shadow:0 10px 20px rgba(0,0,0,0.4);"></div>
            <div style="width:170px;height:170px;border-radius:50%;background:radial-gradient(circle at 30% 30%, #ff5252, #b71c1c);box-shadow:0 10px 20px rgba(0,0,0,0.4);"></div>
            <div style="color:white;font-size:32px;font-weight:bold;width:100%;text-align:center;">HONEYCRISP APPLES</div>
          </div>
          <!-- Crate 2: Yellow Bananas -->
          <div style="background:#4a3525;border-radius:20px;padding:30px;display:flex;flex-direction:column;gap:20px;align-items:center;justify-content:center;">
            <div style="width:300px;height:80px;border-radius:40px;background:linear-gradient(90deg, #fdd835, #fbc02d);transform:rotate(-12deg);box-shadow:0 10px 20px rgba(0,0,0,0.4);"></div>
            <div style="width:300px;height:80px;border-radius:40px;background:linear-gradient(90deg, #fdd835, #fbc02d);transform:rotate(-4deg);box-shadow:0 10px 20px rgba(0,0,0,0.4);"></div>
            <div style="color:white;font-size:32px;font-weight:bold;width:100%;text-align:center;margin-top:20px;">CAVENDISH BANANAS</div>
          </div>
          <!-- Crate 3: Whole Pineapples -->
          <div style="grid-column:span 2;background:#4a3525;border-radius:20px;padding:30px;display:flex;gap:40px;align-items:center;justify-content:center;">
            <div style="width:200px;height:260px;border-radius:40%;background:repeating-linear-gradient(45deg, #d97706 0, #d97706 20px, #92400e 20px, #92400e 40px);box-shadow:0 10px 20px rgba(0,0,0,0.4);"></div>
            <div style="color:white;font-size:36px;font-weight:bold;">GOLDEN PINEAPPLES</div>
          </div>
        </div>
      </div>
    `,
    groundTruth: {
      round: 1,
      expectedStatus: "multiple_types",
      expectedProduceType: null,
      focusPolygon: null,
    },
  },
  {
    id: "06-round2-runner-up-flip-overtakes",
    filename: "06-round2-runner-up-flip-overtakes.jpg",
    description:
      "Round 2 Close-Up Flip: Close-up of Runner-Up Watermelon (#c2, previously 8.1) flipped over to reveal a massive, deep butter-yellow ground spot and rich sugar webbing, overtaking 1st Pick (#c1, 8.6).",
    html: `
      <div style="width:1000px;height:1000px;background:#2b1d12;display:flex;align-items:center;justify-content:center;position:relative;">
        <!-- Close-up single watermelon filling central frame [140, 120, 860, 880] -->
        <div style="position:absolute;top:140px;left:120px;width:760px;height:720px;border-radius:48%;background:repeating-radial-gradient(circle at 50% 50%, #19421c 0px, #19421c 35px, #2b612f 35px, #2b612f 68px);box-shadow:0 35px 70px rgba(0,0,0,0.8);">
          <!-- Huge deep butter-yellow field spot on underside -->
          <div style="position:absolute;top:160px;left:170px;width:420px;height:380px;border-radius:50%;background:radial-gradient(circle, #f5cd2f 0%, #eab923 65%, rgba(234,185,35,0) 100%);"></div>
          <!-- Heavy pollination sugar webbing -->
          <svg style="position:absolute;inset:0;width:100%;height:100%;" viewBox="0 0 760 720">
            <path d="M220 350 L540 360 M260 280 L500 430 M270 430 L490 280 M380 210 L380 500" stroke="#6e4e1e" stroke-width="7" stroke-linecap="round"/>
          </svg>
        </div>
      </div>
    `,
    groundTruth: {
      round: 2,
      expectedStatus: "ok",
      expectedProduceType: "watermelon",
      focusPolygon: null,
      followUpContext: {
        produceType: "watermelon",
        produceDisplayName: "Watermelon",
        targetCandidateId: "c2",
        targetRole: "runner_up",
        requestedInstruction: "Flip the Runner-Up Watermelon over to inspect its underside ground spot.",
        previousWinner: {
          id: "c1",
          role: "first_pick",
          score: 8.6,
          ripeness: "ripe",
          traits: ["Yellow field spot", "Matte rind"],
          anglesInspected: 1,
        },
        previousRunnerUp: {
          id: "c2",
          role: "runner_up",
          score: 8.1,
          ripeness: "almost_ripe",
          traits: ["Even shape", "Dark stripes"],
          anglesInspected: 1,
        },
      },
      expectedWinnerBox: [140, 120, 860, 880],
      requireFlipSummaryNonNull: true,
      forbiddenWordsInCopy: ["avocado", "pineapple", "banana"],
    },
  },
];

async function generateDataset() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1000, height: 1000 },
    deviceScaleFactor: 1,
  });

  const manifest = [];

  for (const scenario of SCENARIOS) {
    await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;">${scenario.html}</body></html>`);
    const imagePath = path.join(IMAGES_DIR, scenario.filename);
    await page.screenshot({
      path: imagePath,
      type: "jpeg",
      quality: 90,
    });

    const base64 = fs.readFileSync(imagePath).toString("base64");

    manifest.push({
      id: scenario.id,
      filename: scenario.filename,
      imagePath: `dataset/images/${scenario.filename}`,
      imageBase64PreviewLength: base64.length,
      description: scenario.description,
      groundTruth: scenario.groundTruth,
    });

    console.log(`✓ Generated ${scenario.filename} (${Math.round(base64.length / 1024)} KB base64)`);
  }

  await browser.close();

  const manifestPath = path.join(DATASET_DIR, "ground-truth.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nSaved ground-truth manifest with ${manifest.length} scenarios to ${manifestPath}`);
}

generateDataset().catch((err) => {
  console.error(err);
  process.exit(1);
});
