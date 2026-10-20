import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { verifyPromptfooOutput, computeBoxIoU } from "../assertions/verify-contract";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(__dirname, "../dataset/ground-truth.json");

describe("Offline Ground-Truth & Adversarial Eval Suite", () => {
  const manifest: Array<{
    id: string;
    filename: string;
    imagePath: string;
    description: string;
    groundTruth: Record<string, any>;
  }> = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));

  it("verifies all ground-truth image references exist on disk and are non-empty JPEGs", () => {
    expect(manifest.length).toBe(17);
    for (const item of manifest) {
      const fullPath = path.resolve(__dirname, "..", item.imagePath);
      expect(fs.existsSync(fullPath)).toBe(true);
      const stat = fs.statSync(fullPath);
      expect(stat.size).toBeGreaterThan(10_000);
    }
  });

  it("Scenario 16 (Roma Tomatoes Bulk Pile): requires one candidate per eligible counted item with no cap", () => {
      const gt = manifest.find((m) => m.id === "16-roma-tomatoes-bulk-pile")!.groundTruth;

      const mkCandidate = (i: number, size = 110) => ({
        id: `c${i + 1}`,
        box: [20 + (i % 8) * size, 20 + Math.floor(i / 8) * size, 90 + (i % 8) * size, 90 + Math.floor(i / 8) * size],
        score: +(8.0 + (i % 3) * 0.5).toFixed(1),
        ripeness: "ripe",
        traits: ["Deep red", "Firm skin"],
        flipSummary: null,
      });
      const baseOutput = {
        status: "ok",
        message: null,
        produce: { type: "tomato", displayName: "Roma Tomatoes", variety: "Roma" },
        candidates: [] as any[],
        countedTotal: 48,
        verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st pick." },
        followUp: {
          targetCandidateId: "c2",
          targetRole: "runner_up",
          bannerText: "Compare firmness with candidate c2.",
          flipHeadline: "Flip the Roma Tomato",
          instruction: "Inspect underside for soft spots.",
        },
        afterPurchase: {
          readyInDays: { min: 0, max: 0 },
          eatWithinDays: { min: 3, max: 5 },
          eatWithinLabel: "3–5 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · room temp", tip: "Store stem side down" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · container", tip: "Cover cut half" },
          },
        },
      };

      // 1. Valid high-density output: all 48 eligible items have one candidate.
      const validOutput = { ...baseOutput, candidates: Array.from({ length: 48 }, (_, i) => mkCandidate(i)) };
      expect(verifyPromptfooOutput(JSON.stringify(validOutput), { vars: gt }).pass).toBe(true);

      // 2. Count mismatch: declared total exceeds candidate list and must fail.
      const underCoverageOutput = { ...baseOutput, candidates: Array.from({ length: 30 }, (_, i) => mkCandidate(i)) };
      const failCoverage = verifyPromptfooOutput(JSON.stringify(underCoverageOutput), { vars: gt });
      expect(failCoverage.pass).toBe(false);
      expect(failCoverage.reason).toContain("Count mismatch");

      // 3. Too sparse (no countedTotal honesty): 3 candidates fail the expected minimum.
      const sparseOutput = { ...baseOutput, countedTotal: null, candidates: Array.from({ length: 3 }, (_, i) => mkCandidate(i)) };
      const failRes = verifyPromptfooOutput(JSON.stringify(sparseOutput), { vars: gt });
      expect(failRes.pass).toBe(false);
      expect(failRes.reason).toContain("Expected at least 31 candidates");
  });

  it("Scenario 17 (Roma Bulk Pile Focus-Polygon): requires one candidate per eligible in-polygon item", () => {
    const gt = manifest.find((m) => m.id === "17-roma-bulk-pile-focus-polygon")!.groundTruth;

    // 1. Valid polygon output with boxes inside the drawn loop
    const validPolygonOutput = {
      status: "ok",
      message: null,
      produce: { type: "tomato", displayName: "Roma Tomatoes", variety: "Roma" },
      countedTotal: 34,
      candidates: Array.from({ length: 34 }, (_, i) => {
        const y = 230 + Math.floor(i / 8) * 130;
        const x = 120 + (i % 8) * 100;
        return {
          id: `c${i + 1}`,
          box: [y, x, y + 120, x + 90],
          score: +(8.0 + (i % 3) * 0.5).toFixed(1),
          ripeness: "ripe",
          traits: ["Deep red", "Firm skin"],
          flipSummary: null,
        };
      }),
      verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st pick." },
      followUp: {
        targetCandidateId: "c2",
        targetRole: "runner_up",
        bannerText: "Compare firmness with candidate c2.",
        flipHeadline: "Flip the Roma Tomato",
        instruction: "Inspect underside for soft spots.",
      },
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 3, max: 5 },
        eatWithinLabel: "3–5 days",
        storage: {
          beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · room temp", tip: "Store stem side down" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · container", tip: "Cover cut half" },
        },
      },
    };

    expect(verifyPromptfooOutput(JSON.stringify(validPolygonOutput), { vars: gt }).pass).toBe(true);

    // 2. Adversarial: a declared total larger than the emitted list fails exact count matching.
    const underCoverageOutput = {
      ...validPolygonOutput,
      countedTotal: 48,
      candidates: validPolygonOutput.candidates.slice(0, 30),
    };
    const failCoverage = verifyPromptfooOutput(JSON.stringify(underCoverageOutput), { vars: gt });
    expect(failCoverage.pass).toBe(false);
    expect(failCoverage.reason).toContain("Count mismatch");

    // 3. Adversarial failure: polygon path emits only a handful of candidates for a dense heap
    const collapsedOutput = {
      ...validPolygonOutput,
      countedTotal: null,
      candidates: validPolygonOutput.candidates.slice(0, 5),
    };
    const failRes = verifyPromptfooOutput(JSON.stringify(collapsedOutput), { vars: gt });
    expect(failRes.pass).toBe(false);
    expect(failRes.reason).toContain("Expected at least 31 candidates");
  });

  it("Scenario 01 (Watermelon Crate): passes when model picks bottom-left ripe winner [415,150,780,520] and bottom-right runner-up [430,545,775,880], and FAILS if model swaps them", () => {
    const gt = manifest.find((m) => m.id === "01-watermelon-crate-clear-winner")!.groundTruth;

    const validModelOutput = {
      status: "ok",
      message: null,
      produce: { type: "watermelon", displayName: "Watermelon", variety: null },
      candidates: [
        {
          id: "c1",
          box: [420, 155, 775, 515], // Matches bottom-left winner
          score: 9.1,
          ripeness: "ripe",
          traits: ["Creamy yellow field spot", "Heavy sugar webbing", "Matte dark rind"],
          flipSummary: null,
        },
        {
          id: "c2",
          box: [435, 550, 770, 875], // Matches bottom-right runner-up
          score: 8.0,
          ripeness: "almost_ripe",
          traits: ["Pale field spot", "Even stripes"],
          flipSummary: null,
        },
        {
          id: "c3",
          box: [250, 410, 495, 650], // Top-center underripe
          score: 6.2,
          ripeness: "underripe",
          traits: ["Glossy bright green", "White spot"],
          flipSummary: null,
        },
      ],
      verdict: {
        winnerId: "c1",
        runnerUpId: "c2",
        confidence: "high",
        headline: "Buy it.",
      },
      followUp: {
        targetCandidateId: "c2",
        targetRole: "runner_up",
        bannerText: "The blue-marked Watermelon could be sweeter. Flip it and snap.",
        flipHeadline: "Flip the Watermelon over",
        instruction: "Turn the blue-marked Watermelon to inspect its underside.",
      },
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 4, max: 6 },
        eatWithinLabel: "4–6 days",
        storage: {
          beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep whole at room temp" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap tightly in plastic" },
        },
      },
    };

    const passRes = verifyPromptfooOutput(JSON.stringify(validModelOutput), { vars: gt });
    expect(passRes.pass).toBe(true);

    // Adversarial failure check: if the model mistakenly picks the top-center underripe melon (c3) as the highest score winner
    const wrongWinnerOutput = {
      ...validModelOutput,
      candidates: [
        { ...validModelOutput.candidates[2], score: 9.5 }, // c3 top-center given highest score!
        validModelOutput.candidates[0],
        validModelOutput.candidates[1],
      ],
      verdict: { winnerId: "c3", runnerUpId: "c1", confidence: "high", headline: "Buy it." },
    };

    const failRes = verifyPromptfooOutput(JSON.stringify(wrongWinnerOutput), { vars: gt });
    expect(failRes.pass).toBe(false);
    expect(failRes.reason).toContain("did not match ground-truth winner region");
  });

  it("Scenario 02 (Avocado Polygon Isolation): strips top-left outside avocado and verifies bottom-left winner [495,105,915,475]", () => {
    const gt = manifest.find((m) => m.id === "02-avocado-polygon-isolation")!.groundTruth;

    // Even if model outputs the top-left avocado (c_outside at [80,125,440,540]), our verifier strips it
    // and promotes c_inside_winner ([495,105,915,475])
    const outputWithOutsideCandidate = {
      status: "ok",
      message: null,
      produce: { type: "avocado", displayName: "Hass Avocado", variety: "Hass" },
      candidates: [
        {
          id: "c_outside",
          box: [80, 125, 440, 540], // Outside focusPolygon! (center y=260 < 460)
          score: 9.4,
          ripeness: "ripe",
          traits: ["Dark pebbled skin"],
          flipSummary: null,
        },
        {
          id: "c_inside1",
          box: [500, 110, 910, 470], // Inside polygon - Ripe winner
          score: 8.8,
          ripeness: "ripe",
          traits: ["Pebbled dark skin", "Intact brown stem"],
          flipSummary: null,
        },
        {
          id: "c_inside2",
          box: [470, 555, 880, 900], // Inside polygon - Green runner-up
          score: 7.1,
          ripeness: "underripe",
          traits: ["Bright green skin", "Firm"],
          flipSummary: null,
        },
      ],
      verdict: {
        winnerId: "c_outside",
        runnerUpId: "c_inside1",
        confidence: "high",
        headline: "Buy it.",
      },
      followUp: {
        targetCandidateId: "c_inside2",
        targetRole: "runner_up",
        bannerText: "Check the second Hass Avocado stem.",
        flipHeadline: "Flip the Hass Avocado",
        instruction: "Show the stem of the Hass Avocado.",
      },
      afterPurchase: {
        readyInDays: { min: 0, max: 1 },
        eatWithinDays: { min: 2, max: 3 },
        eatWithinLabel: "2–3 days",
        storage: {
          beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Ripen on counter" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · sealed", tip: "Keep pit in and wrap" },
        },
      },
    };

    const res = verifyPromptfooOutput(JSON.stringify(outputWithOutsideCandidate), { vars: gt });
    expect(res.pass).toBe(true);

    // Adversarial failure check: if model hallucinates "watermelon" or "field spot" when grading avocados
    const hallucinatedCopyOutput = {
      ...outputWithOutsideCandidate,
      candidates: [
        {
          ...outputWithOutsideCandidate.candidates[1],
          traits: ["Yellow field spot", "Dark pebbled skin"],
        },
        outputWithOutsideCandidate.candidates[2],
      ],
    };
    const failHallucination = verifyPromptfooOutput(JSON.stringify(hallucinatedCopyOutput), { vars: gt });
    expect(failHallucination.pass).toBe(false);
    expect(failHallucination.reason).toContain("field spot");
  });

  it("Scenarios 03, 04, 05 (Adversarial Domain Errors): enforces unclear_photo, no_produce, and multiple_types with descriptive messages", () => {
    const gtUnclear = manifest.find((m) => m.id === "03-unclear-blurry-photo")!.groundTruth;
    const gtNoProduce = manifest.find((m) => m.id === "04-no-produce-cereal-box")!.groundTruth;
    const gtMulti = manifest.find((m) => m.id === "05-multiple-types-mixed")!.groundTruth;

    expect(
      verifyPromptfooOutput(
        JSON.stringify({
          status: "unclear_photo",
          message: "Image is too blurry and dark to inspect produce traits.",
          produce: null,
          candidates: [],
          verdict: null,
          followUp: null,
          afterPurchase: null,
        }),
        { vars: gtUnclear }
      ).pass
    ).toBe(true);

    // Fails if model tries to guess "ok" on a blurry photo
    expect(
      verifyPromptfooOutput(
        JSON.stringify({
          status: "no_produce",
          message: "No produce seen.",
          produce: null,
          candidates: [],
          verdict: null,
          followUp: null,
          afterPurchase: null,
        }),
        { vars: gtUnclear }
      ).pass
    ).toBe(false);

    expect(
      verifyPromptfooOutput(
        JSON.stringify({
          status: "no_produce",
          message: "This is a boxed cereal package, not fresh produce.",
          produce: null,
          candidates: [],
          verdict: null,
          followUp: null,
          afterPurchase: null,
        }),
        { vars: gtNoProduce }
      ).pass
    ).toBe(true);

    expect(
      verifyPromptfooOutput(
        JSON.stringify({
          status: "multiple_types",
          message: "Apples, bananas, and pineapples detected. Please draw a loop around one type.",
          produce: null,
          candidates: [],
          verdict: null,
          followUp: null,
          afterPurchase: null,
        }),
        { vars: gtMulti }
      ).pass
    ).toBe(true);
  });

  it("Scenario 06 (Round 2 Flip Overtake): requires non-null flipSummary and accurate close-up box", () => {
    const gtRound2 = manifest.find((m) => m.id === "06-round2-runner-up-flip-overtakes")!.groundTruth;

    const validRound2 = {
      status: "ok",
      message: null,
      produce: { type: "watermelon", displayName: "Watermelon", variety: null },
      candidates: [
        {
          id: "c2",
          box: [145, 125, 855, 875],
          score: 9.2,
          ripeness: "ripe",
          traits: ["Deep butter-yellow spot", "Dense sugar webbing"],
          flipSummary: "Large deep butter-yellow ground spot with extensive pollination webbing",
        },
      ],
      verdict: {
        winnerId: "c2",
        runnerUpId: "c1",
        confidence: "high",
        headline: "Buy this one.",
      },
      followUp: {
        targetCandidateId: "c1",
        targetRole: "first_pick",
        bannerText: "1st Pick Watermelon was only graded from the top. Flip it for a final check.",
        flipHeadline: "Flip your 1st pick Watermelon",
        instruction: "Turn your 1st pick Watermelon over to compare its ground spot.",
      },
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 4, max: 6 },
        eatWithinLabel: "4–6 days",
        storage: {
          beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep at room temp" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap tightly" },
        },
      },
    };

    expect(verifyPromptfooOutput(JSON.stringify(validRound2), { vars: gtRound2 }).pass).toBe(true);

    // Adversarial failure check: if model forgets flipSummary on Round 2
    const missingFlipSummary = {
      ...validRound2,
      candidates: [{ ...validRound2.candidates[0], flipSummary: null }],
    };
    const failFlip = verifyPromptfooOutput(JSON.stringify(missingFlipSummary), { vars: gtRound2 });
    expect(failFlip.pass).toBe(false);
    expect(failFlip.reason).toContain("Expected non-null flipSummary");
  });

  it("Scenario 07 (Round 2 Runner-Up Loses / State 5B-1): passes when Runner-Up scores below 1st Pick (7.2 < 8.6), keeping c1 as winner and setting followUp=null", () => {
    const gtRound2Lose = manifest.find((m) => m.id === "07-round2-runner-up-loses")!.groundTruth;

    const validLose = {
      status: "ok",
      message: null,
      produce: { type: "watermelon", displayName: "Watermelon", variety: null },
      candidates: [
        {
          id: "c2",
          box: [140, 120, 700, 900],
          score: 7.2,
          ripeness: "underripe",
          traits: ["Stark white spot", "Zero webbing"],
          flipSummary: "Stark chalky-white belly spot with zero pollination webbing",
        },
      ],
      verdict: {
        winnerId: "c1",
        runnerUpId: "c2",
        confidence: "high",
        headline: "Buy your 1st pick.",
      },
      followUp: null,
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 4, max: 6 },
        eatWithinLabel: "4–6 days",
        storage: {
          beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep at room temp" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap tightly" },
        },
      },
    };

    expect(verifyPromptfooOutput(JSON.stringify(validLose), { vars: gtRound2Lose }).pass).toBe(true);

    // Fails if model mistakenly gives the chalky-white underripe runner-up a higher score than 8.6
    const wrongOvertake = {
      ...validLose,
      candidates: [{ ...validLose.candidates[0], score: 9.1 }],
    };
    const failOvertake = verifyPromptfooOutput(JSON.stringify(wrongOvertake), { vars: gtRound2Lose });
    expect(failOvertake.pass).toBe(false);
    expect(failOvertake.reason).toContain('Expected winnerId "c1"');
  });

  it("Scenario 08 (Round 3 1st Pick Reclaims Win / State 7A): passes when 1st Pick scores >= 9.0, reclaiming winnerId='c1' with hard ceiling followUp=null", () => {
    const gtRound3Reclaim = manifest.find((m) => m.id === "08-round3-first-pick-reclaims")!.groundTruth;

    const validReclaim = {
      status: "ok",
      message: null,
      produce: { type: "watermelon", displayName: "Watermelon", variety: null },
      candidates: [
        {
          id: "c1",
          box: [175, 150, 820, 840],
          score: 9.4,
          ripeness: "ripe",
          traits: ["Deep golden spot", "Heavy sugar webbing", "Dry brown tendril"],
          flipSummary: "Huge deep golden-amber field spot with dense brown sugar webbing",
        },
      ],
      verdict: {
        winnerId: "c1",
        runnerUpId: "c2",
        confidence: "high",
        headline: "Buy your 1st pick.",
      },
      followUp: null,
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 4, max: 6 },
        eatWithinLabel: "4–6 days",
        storage: {
          beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep at room temp" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap tightly" },
        },
      },
    };

    expect(verifyPromptfooOutput(JSON.stringify(validReclaim), { vars: gtRound3Reclaim }).pass).toBe(true);
  });

  it("Scenario 09 (Round 3 1st Pick Loses / State 7B): passes when 1st Pick scores < 9.0 due to pale bruised belly, keeping winnerId='c2' with followUp=null", () => {
    const gtRound3Lose = manifest.find((m) => m.id === "09-round3-first-pick-loses")!.groundTruth;

    const validLose3 = {
      status: "ok",
      message: null,
      produce: { type: "watermelon", displayName: "Watermelon", variety: null },
      candidates: [
        {
          id: "c1",
          box: [175, 200, 775, 800],
          score: 6.8,
          ripeness: "underripe",
          traits: ["Pale greenish spot", "Water-soaked bruise"],
          flipSummary: "Pale greenish-white belly with a sunken brown water-soaked bruise patch",
        },
      ],
      verdict: {
        winnerId: "c2",
        runnerUpId: "c1",
        confidence: "high",
        headline: "Buy the new winner.",
      },
      followUp: null,
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 4, max: 6 },
        eatWithinLabel: "4–6 days",
        storage: {
          beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep at room temp" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap tightly" },
        },
      },
    };

    expect(verifyPromptfooOutput(JSON.stringify(validLose3), { vars: gtRound3Lose }).pass).toBe(true);
  });

  it("Scenario 10 (Single Pineapple Solo): passes when 1 candidate is returned with runnerUpId=null and followUp=null", () => {
    const gtSolo = manifest.find((m) => m.id === "10-single-pineapple-solo")!.groundTruth;

    const validSolo = {
      status: "ok",
      message: null,
      produce: { type: "pineapple", displayName: "Pineapple", variety: null },
      candidates: [
        {
          id: "c1",
          box: [75, 360, 825, 630],
          score: 9.0,
          ripeness: "ripe",
          traits: ["Golden-yellow eyes", "Fresh green crown"],
          flipSummary: null,
        },
      ],
      verdict: {
        winnerId: "c1",
        runnerUpId: null,
        confidence: "high",
        headline: "Buy it.",
      },
      followUp: null,
      afterPurchase: {
        readyInDays: { min: 0, max: 1 },
        eatWithinDays: { min: 3, max: 5 },
        eatWithinLabel: "3–5 days",
        storage: {
          beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep at room temp" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · container", tip: "Store chunks in sealed container" },
        },
      },
    };

    expect(verifyPromptfooOutput(JSON.stringify(validSolo), { vars: gtSolo }).pass).toBe(true);
  });

  it("Scenario 11 (Pack/Bunch Grape Punnet Selection): passes when model boxes entire punnets as units of purchase, and FAILS if model boxes individual berries", () => {
    const gtPack = manifest.find((m) => m.id === "11-grape-punnet-pack-selection")!.groundTruth;

    // 1. Valid model output: 2 candidate boxes enclosing the full punnets
    const validPackOutput = {
      status: "ok",
      message: null,
      produce: { type: "grapes", displayName: "Red Seedless Grapes", variety: "Crimson" },
      candidates: [
        {
          id: "c1",
          box: [245, 55, 830, 495], // Entire left clamshell container
          score: 9.2,
          ripeness: "ripe",
          traits: ["Vibrant green stem", "Plump bloom", "No mold at bottom"],
          flipSummary: null,
        },
        {
          id: "c2",
          box: [245, 515, 830, 955], // Entire right clamshell container
          score: 8.0,
          ripeness: "almost_ripe",
          traits: ["Dry brownish stem", "Loose berries"],
          flipSummary: null,
        },
      ],
      verdict: {
        winnerId: "c1",
        runnerUpId: "c2",
        confidence: "high",
        headline: "Buy this pack.",
      },
      followUp: {
        targetCandidateId: "c2",
        targetRole: "runner_up",
        bannerText: "Runner-Up scored 8.0. Check underside of the punnet before deciding.",
        flipHeadline: "Flip the Grape punnet over",
        instruction: "Turn the punnet over to inspect bottom berries for squashed fruit or dampness.",
      },
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 5, max: 7 },
        eatWithinLabel: "5–7 days",
        storage: {
          beforeCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · ventilated", tip: "Keep in original ventilated punnet, unwashed until eating" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · container", tip: "Store separated washed grapes in airtight container with paper towel" },
        },
      },
    };

    expect(verifyPromptfooOutput(JSON.stringify(validPackOutput), { vars: gtPack }).pass).toBe(true);

    // 2. Adversarial failure: Model violates Unit of Purchase rule by boxing individual loose berries inside the pack
    const invalidPerBerryOutput = {
      ...validPackOutput,
      candidates: [
        // Tiny bounding boxes for individual berries instead of whole punnets
        { id: "c1", box: [380, 150, 440, 210], score: 9.0, ripeness: "ripe", traits: ["Single berry"], flipSummary: null },
        { id: "c2", box: [450, 220, 510, 280], score: 8.8, ripeness: "ripe", traits: ["Single berry"], flipSummary: null },
        { id: "c3", box: [520, 160, 580, 220], score: 8.5, ripeness: "ripe", traits: ["Single berry"], flipSummary: null },
        { id: "c4", box: [390, 600, 450, 660], score: 8.0, ripeness: "almost_ripe", traits: ["Single berry"], flipSummary: null },
        { id: "c5", box: [460, 670, 520, 730], score: 7.8, ripeness: "almost_ripe", traits: ["Single berry"], flipSummary: null },
      ],
      verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "medium", headline: "Buy it." },
    };

    const resFailure = verifyPromptfooOutput(JSON.stringify(invalidPerBerryOutput), { vars: gtPack });
    expect(resFailure.pass).toBe(false);
    expect(resFailure.reason).toContain("Expected at most 2 candidates");
  });

  it("Scenario 12 (Tomato Basket Polygon Selection): requires ALL clearly visible items inside the selected polygon to return candidate data (12-30)", () => {
    const gt = manifest.find((m) => m.id === "12-tomato-basket-polygon-selection")!.groundTruth;

    // 1. Valid model output: 15 eligible tomatoes remain after polygon filtering; countedTotal matches.
    const validMultiCandidateOutput = {
      status: "ok",
      message: null,
      produce: { type: "tomato", displayName: "Tomatoes", variety: "Round" },
      candidates: [
        { id: "c1", box: [370, 420, 470, 520], score: 9.2, ripeness: "ripe", traits: ["Vibrant red", "Plump form"], flipSummary: null },
        { id: "c2", box: [290, 280, 390, 460], score: 8.8, ripeness: "ripe", traits: ["Uniform color"], flipSummary: null },
        { id: "c3", box: [360, 620, 470, 780], score: 8.5, ripeness: "almost_ripe", traits: ["Firm skin"], flipSummary: null },
        { id: "c4", box: [440, 490, 510, 640], score: 8.0, ripeness: "underripe", traits: ["Firm green shoulder"], flipSummary: null },
        { id: "c5", box: [250, 480, 340, 580], score: 8.3, ripeness: "ripe", traits: ["Even red"], flipSummary: null },
        { id: "c6", box: [480, 300, 560, 400], score: 7.9, ripeness: "almost_ripe", traits: ["Slight blush"], flipSummary: null },
        { id: "c7", box: [500, 520, 590, 630], score: 8.1, ripeness: "ripe", traits: ["Smooth skin"], flipSummary: null },
        { id: "c8", box: [320, 700, 410, 800], score: 7.6, ripeness: "underripe", traits: ["Green shoulder"], flipSummary: null },
        { id: "c9", box: [560, 380, 660, 490], score: 8.2, ripeness: "ripe", traits: ["Deep red"], flipSummary: null },
        { id: "c10", box: [420, 200, 520, 310], score: 7.4, ripeness: "underripe", traits: ["Matte skin"], flipSummary: null },
        { id: "c11", box: [600, 500, 700, 620], score: 7.9, ripeness: "almost_ripe", traits: ["Orange blush"], flipSummary: null },
        { id: "c12", box: [300, 260, 400, 370], score: 7.2, ripeness: "underripe", traits: ["Pale red"], flipSummary: null },
        { id: "c13", box: [460, 200, 570, 330], score: 7.7, ripeness: "almost_ripe", traits: ["Blush"], flipSummary: null },
        { id: "c14", box: [380, 560, 480, 680], score: 8.4, ripeness: "ripe", traits: ["Glossy"], flipSummary: null },
        { id: "c15", box: [520, 180, 630, 290], score: 7.5, ripeness: "underripe", traits: ["Green tint"], flipSummary: null },
        { id: "c16", box: [280, 640, 380, 750], score: 8.0, ripeness: "ripe", traits: ["Round form"], flipSummary: null },
      ],
      countedTotal: 15,
      verdict: {
        winnerId: "c1",
        runnerUpId: "c2",
        confidence: "high",
        headline: "Buy this one.",
      },
      followUp: {
        targetCandidateId: "c2",
        targetRole: "runner_up",
        bannerText: "The second tomato could be firmer. Inspect it.",
        flipHeadline: "Flip the Tomato",
        instruction: "Turn the tomato to inspect the stem end.",
      },
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 3, max: 5 },
        eatWithinLabel: "3–5 days",
        storage: {
          beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp away from sunlight" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · container", tip: "Store cut side down" },
        },
      },
    };

    const passRes = verifyPromptfooOutput(JSON.stringify(validMultiCandidateOutput), { vars: gt });
    expect(passRes.pass).toBe(true);

    // 2. Adversarial failure: Model returns only 1 single candidate when multiple items exist in the selected area
    const invalidSingleCandidateOutput = {
      ...validMultiCandidateOutput,
      countedTotal: null,
      candidates: [validMultiCandidateOutput.candidates[0]],
      verdict: { winnerId: "c1", runnerUpId: null, confidence: "high", headline: "Buy it." },
      followUp: null,
    };

    const failSingleRes = verifyPromptfooOutput(JSON.stringify(invalidSingleCandidateOutput), { vars: gt });
    expect(failSingleRes.pass).toBe(false);
    expect(failSingleRes.reason).toContain("Expected at least 12 candidates");
  });

  it("Scenario 13 (Packaged Produce Obscurity / Glare): expects unclear_photo due to heavy printed branding and plastic glare", () => {
    const gt = manifest.find((m) => m.id === "13-carrot-packs-crate")!.groundTruth;

    // 1. Valid model output: Returns unclear_photo with descriptive message
    const validUnclearOutput = {
      status: "unclear_photo",
      message: "Produce is mostly covered by packaging. Take items out of the bag or move closer for a clear view.",
      produce: null,
      candidates: [],
      verdict: null,
      followUp: null,
      afterPurchase: null,
    };

    const passRes = verifyPromptfooOutput(JSON.stringify(validUnclearOutput), { vars: gt });
    expect(passRes.pass).toBe(true);

    const invalidOkOutput = {
      status: "ok",
      message: null,
      produce: { type: "carrots", displayName: "Carrots", variety: null },
      candidates: [
        { id: "c1", box: [100, 100, 400, 400], score: 8.0, ripeness: "ripe", traits: ["Orange"], flipSummary: null }
      ],
      verdict: { winnerId: "c1", runnerUpId: null, confidence: "low", headline: "Uncertain" },
      followUp: null,
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 5, max: 10 },
        eatWithinLabel: "5–10 days",
        storage: {
          beforeCut: { where: "fridge", whereLabel: "Fridge", summary: "Crisper", tip: "Perforated bag" },
          afterCut: { where: "fridge", whereLabel: "Water", summary: "Water", tip: "Cold water" },
        },
      },
    };

    const failOkRes = verifyPromptfooOutput(JSON.stringify(invalidOkOutput), { vars: gt });
    expect(failOkRes.pass).toBe(false);
    expect(failOkRes.reason).toContain('Expected status "unclear_photo" but received "ok"');

  });

  it("Scenario 14 (Packaged Produce Glare / Obscurity): expects unclear_photo for bagged potatoes", () => {
    const gt = manifest.find((m) => m.id === "14-potato-packs-crate")!.groundTruth;

    const validUnclearOutput = {
      status: "unclear_photo",
      message: "Produce is mostly covered by packaging. Take items out of the bag or move closer for a clear view.",
      produce: null,
      candidates: [],
      verdict: null,
      followUp: null,
      afterPurchase: null,
    };

    expect(verifyPromptfooOutput(JSON.stringify(validUnclearOutput), { vars: gt }).pass).toBe(true);

    const invalidOkOutput = {
      status: "ok",
      message: null,
      produce: { type: "potato", displayName: "Baking Potatoes", variety: null },
      candidates: [
        { id: "c1", box: [400, 160, 900, 860], score: 8.5, ripeness: "ripe", traits: ["Firm"], flipSummary: null }
      ],
      verdict: { winnerId: "c1", runnerUpId: null, confidence: "low", headline: "Uncertain" },
      followUp: null,
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 7, max: 14 },
        eatWithinLabel: "1–2 weeks",
        storage: {
          beforeCut: { where: "cool_dark", whereLabel: "Pantry", summary: "Pantry", tip: "Cool dry" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge", tip: "Water" },
        },
      },
    };

    const failOk = verifyPromptfooOutput(JSON.stringify(invalidOkOutput), { vars: gt });
    expect(failOk.pass).toBe(false);
    expect(failOk.reason).toContain('Expected status "unclear_photo" but received "ok"');

  });

  it("Scenario 15 (Bagged Bananas Crate): selects whole bunch/pack unit, not individual banana", () => {
    const gt = manifest.find((m) => m.id === "15-banana-pack-bagged")!.groundTruth;

    const validBananaOutput = {
      status: "ok",
      message: null,
      produce: { type: "banana", displayName: "Banana", variety: "Cavendish" },
      candidates: [
        {
          id: "c1",
          box: [180, 180, 520, 720], // Whole bunch / cluster in foreground
          score: 8.6,
          ripeness: "ripe",
          traits: ["Golden yellow", "Green stems", "No bruising"],
          flipSummary: null,
        },
      ],
      verdict: {
        winnerId: "c1",
        runnerUpId: null,
        confidence: "high",
        headline: "Buy this bunch.",
      },
      followUp: null,
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 3, max: 5 },
        eatWithinLabel: "3–5 days",
        storage: {
          beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · hang", tip: "Keep at room temp away from apples" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · container", tip: "Store sliced banana with lemon juice" },
        },
      },
    };

    expect(verifyPromptfooOutput(JSON.stringify(validBananaOutput), { vars: gt }).pass).toBe(true);
  });
});
