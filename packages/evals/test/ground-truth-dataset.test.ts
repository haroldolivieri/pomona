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

  it("verifies all 6 generated ground-truth images exist on disk and are non-empty JPEGs", () => {
    expect(manifest.length).toBe(6);
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
});
