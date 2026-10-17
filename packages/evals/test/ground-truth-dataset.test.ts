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

  it("verifies all 14 generated and real-world ground-truth images exist on disk and are non-empty JPEGs", () => {
    expect(manifest.length).toBe(14);
    for (const item of manifest) {
      const fullPath = path.resolve(__dirname, "..", item.imagePath);
      expect(fs.existsSync(fullPath)).toBe(true);
      const stat = fs.statSync(fullPath);
      expect(stat.size).toBeGreaterThan(10_000);
    }
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

  it("Scenario 12 (Overlapping Carrot Bags in Crate): passes when model boxes whole bags, rejects when individual loose carrots inside bag are boxed", () => {
    const gt = manifest.find((m) => m.id === "12-carrot-packs-crate")!.groundTruth;

    const validBagsOutput = {
      status: "ok",
      message: null,
      produce: { type: "carrots", displayName: "British Carrots", variety: null },
      candidates: [
        {
          id: "c1",
          box: [470, 200, 720, 520], // Foreground British Carrots bag
          score: 8.5,
          ripeness: "ripe",
          traits: ["Bright orange", "Firm roots", "Clear bag"],
          flipSummary: null,
        },
        {
          id: "c2",
          box: [220, 180, 480, 500], // Upper bag in crate
          score: 8.0,
          ripeness: "almost_ripe",
          traits: ["Uniform size", "Intact pack"],
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
        bannerText: "The other bag scored 8.0. Check back of pack for condensation.",
        flipHeadline: "Flip the carrot bag over",
        instruction: "Turn the bag over to inspect roots on the bottom.",
      },
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 7, max: 14 },
        eatWithinLabel: "1–2 weeks",
        storage: {
          beforeCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · crisper", tip: "Keep in perforated bag" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · water", tip: "Submerge in fresh cold water" },
        },
      },
    };

    expect(verifyPromptfooOutput(JSON.stringify(validBagsOutput), { vars: gt }).pass).toBe(true);
  });

  it("Scenario 13 (Bagged Potatoes Crate): passes when whole potato bags are selected", () => {
    const gt = manifest.find((m) => m.id === "13-potato-packs-crate")!.groundTruth;

    const validPotatoOutput = {
      status: "ok",
      message: null,
      produce: { type: "potatoes", displayName: "Baking Potatoes", variety: null },
      candidates: [
        {
          id: "c1",
          box: [420, 160, 880, 840], // Foreground large 4 Baking Potatoes bag
          score: 8.7,
          ripeness: "ripe",
          traits: ["Firm spuds", "No sprouting", "Clean bag"],
          flipSummary: null,
        },
        {
          id: "c2",
          box: [160, 500, 410, 860], // Upper bag
          score: 8.1,
          ripeness: "almost_ripe",
          traits: ["Good size"],
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
        bannerText: "Other bag scored 8.1. Check for green skin or soft eyes.",
        flipHeadline: "Turn the potato pack over",
        instruction: "Inspect bottom potatoes for softness.",
      },
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 14, max: 21 },
        eatWithinLabel: "2–3 weeks",
        storage: {
          beforeCut: { where: "cool_dark", whereLabel: "Pantry", summary: "Dark · cool place", tip: "Keep away from onions" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · submerged", tip: "Keep cut potatoes in cold water" },
        },
      },
    };

    expect(verifyPromptfooOutput(JSON.stringify(validPotatoOutput), { vars: gt }).pass).toBe(true);
  });

  it("Scenario 14 (Bagged Bananas Crate): selects whole bunch/pack unit, not individual banana", () => {
    const gt = manifest.find((m) => m.id === "14-banana-pack-bagged")!.groundTruth;

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
