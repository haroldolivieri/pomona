import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { ManualCheckSchema, DeepScanResponseSchema, resolveDeepScanVisualScore } from "@pomona/contract";

const evalRoot = path.resolve(__dirname, "..");
const datasetRoot = path.join(evalRoot, "dataset/deep-scan");

type GroundTruthEntry = {
  id: string;
  description: string;
  perLocale: {
    locale: string;
    expectedStatus: string;
    expectedState: string | null;
    expectManualChecks: boolean;
    expectReadyNow?: boolean;
    maxReadyInDays?: number;
    maxVisualScore?: number;
  }[];
  imagePath: string;
  arm: "live" | "gate";
};

function loadManifest(): GroundTruthEntry[] {
  return JSON.parse(
    fs.readFileSync(path.join(evalRoot, "dataset/ground-truth-deep-scan.json"), "utf8")
  );
}

describe("deep-scan eval wiring (offline)", () => {
  it("commits every scripted fixture as a montage within the endpoint size contract", () => {
    const expected = [
      "ds-01-ideal-avocado.jpg",
      "ds-02-empty-oval.jpg",
      "ds-03-blurry-avocado.jpg",
      "ds-04-dark-avocado.jpg",
      "ds-05-same-side-avocado.jpg",
      "ds-06-underripe-avocado.jpg",
      "ds-07-overripe-avocado.jpg",
      "ds-08-soft-press-avocado.jpg",
      "ds-09-overripe-mandarin.jpg",
      "ds-10-overripe-puffy-mandarin.jpg",
    ] as const;
    for (const filename of expected) {
      const file = path.join(datasetRoot, filename);
      expect(fs.existsSync(file), `${filename} must exist`).toBe(true);
      const bytes = fs.statSync(file).size;
      expect(bytes, `${filename} suspiciously small`).toBeGreaterThan(2_000);
      expect(bytes, `${filename} over the 1MB endpoint budget`).toBeLessThanOrEqual(262_144);
    }
  });

  it("declares English ground-truth arms in the manifest", () => {
    const parsed = loadManifest();

    const ideal = parsed.find((row) => row.id === "ds-01-ideal-avocado");
    expect(ideal).toBeDefined();
    expect(ideal!.perLocale.map((arm) => arm.locale)).toEqual(["en-GB"]);
    expect(ideal!.perLocale.find((row) => row.locale === "en-GB")!.expectedState).toBe("ripe");

    const underripe = parsed.find((row) => row.id === "ds-06-underripe-avocado");
    expect(underripe).toBeDefined();
    expect(underripe!.arm).toBe("live");
    expect(underripe!.perLocale.find((row) => row.locale === "en-GB")!.expectedState).toBe("unripe");

    const overripe = parsed.find((row) => row.id === "ds-07-overripe-avocado");
    expect(overripe).toBeDefined();
    expect(overripe!.arm).toBe("live");
    expect(overripe!.perLocale.find((row) => row.locale === "en-GB")!.expectedState).toBe("overripe");

    const softPress = parsed.find((row) => row.id === "ds-08-soft-press-avocado");
    expect(softPress).toBeDefined();
    expect(softPress!.arm).toBe("live");
    const softPressArm = softPress!.perLocale.find((row) => row.locale === "en-GB")!;
    expect(softPressArm.expectedStatus).toBe("ok");
    expect(softPressArm.expectedState).toBe("ripe");
    expect(softPressArm.expectReadyNow).toBe(true);
    expect(softPressArm.maxReadyInDays).toBe(1);

    const overripeMandarin = parsed.find((row) => row.id === "ds-09-overripe-mandarin");
    expect(overripeMandarin).toBeDefined();
    expect(overripeMandarin!.arm).toBe("live");
    const overripeMandarinArm = overripeMandarin!.perLocale.find((row) => row.locale === "en-GB")!;
    expect(overripeMandarinArm.expectedStatus).toBe("ok");
    expect(overripeMandarinArm.expectedState).toBe("overripe");
    expect(overripeMandarinArm.maxVisualScore).toBe(4.5);

    const overripePuffyMandarin = parsed.find((row) => row.id === "ds-10-overripe-puffy-mandarin");
    expect(overripePuffyMandarin).toBeDefined();
    expect(overripePuffyMandarin!.arm).toBe("live");
    const overripePuffyMandarinArm = overripePuffyMandarin!.perLocale.find((row) => row.locale === "en-GB")!;
    expect(overripePuffyMandarinArm.expectedStatus).toBe("ok");
    expect(overripePuffyMandarinArm.expectedState).toBe("overripe");
    expect(overripePuffyMandarinArm.maxVisualScore).toBe(4.5);

    expect(resolveDeepScanVisualScore({ state: "overripe", confidence: 0.95 })).toBeLessThanOrEqual(4.5);
    expect(resolveDeepScanVisualScore({ state: "ripe", confidence: 0.95 })).toBeGreaterThanOrEqual(9.0);

    const empty = parsed.find((row) => row.id === "ds-02-empty-oval");
    expect(empty!.arm).toBe("gate");
    const blurry = parsed.find((row) => row.id === "ds-03-blurry-avocado");
    const dark = parsed.find((row) => row.id === "ds-04-dark-avocado");
    expect(empty!.perLocale[0].expectedStatus).toBe("no_produce");
    expect(blurry!.perLocale[0].expectedStatus).toBe("unclear_photo");
    expect(dark!.perLocale[0].expectedStatus).toBe("unclear_photo");
    expect(ideal!.arm).toBe("live");
  });

  it("validates a confident device reply against the deep-scan contract", () => {
    const manualCheck = ManualCheckSchema.parse({
      trait: "Squeeze test",
      how: "Press gently near the stem",
      whatItMeans: "Slight give = ready soon",
    });
    expect(manualCheck.trait).toBe("Squeeze test");

    const envelope = DeepScanResponseSchema.parse({
      schemaVersion: "1.0",
      promptVersion: "deep_scan_v1",
      modelId: "test",
      status: "ok",
      abstentionReason: null,
      message: null,
      produce: { type: "avocado", displayName: "Avocado", variety: null },
      ripeness: { state: "nearly_ripe", confidence: 0.86 },
      evidence: ["View 1: skin losing green"],
      quality: { sufficientVisualEvidence: true, viewCoverage: "good", reason: null },
      manualChecks: null,
      recommendation: { eatWhen: "in_a_few_days" },
    afterPurchase: {
      readyInDays: { min: 1, max: 2 },
      eatWithinDays: { min: 3, max: 4 },
      eatWithinLabel: "3-4 days",
      storage: {
        beforeCut: { where: "counter", whereLabel: "Counter", summary: "Whole on the counter", tip: "Softens daily" },
        afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Sealed in the fridge", tip: "Keep chilled" },
      },
    },
    });
    expect(envelope.status).toBe("ok");
  });

  it("wires the eval:ds:* scripts into the eval package", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(evalRoot, "package.json"), "utf8"));
    expect(pkg.scripts["eval:ds:live"]).toBe("npx tsx scripts/run-deep-scan-live-eval.ts");
    expect(pkg.scripts["eval:ds:gate"]).toBe("node --import tsx scripts/run-deep-scan-gate-eval.ts");
  });

  it("keeps manualChecks expectations aligned with manifest arms (true only on real abstentions)", () => {
    const parsed = loadManifest();
    for (const row of parsed) {
      for (const arm of row.perLocale) {
        expect(
          arm.expectManualChecks,
          `${row.id}/${arm.locale}`
        ).toBe(row.id === "ds-05-same-side-avocado");
      }
    }
  });
});
