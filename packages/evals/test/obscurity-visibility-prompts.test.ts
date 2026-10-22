import { expect, it } from "vitest";
import { buildVisibilityGateInput } from "@pomona/proxy";
import { obscurityVisibilityPrompt } from "../scripts/obscurity-visibility-prompts";

it.each(["direct", "inspectability"] as const)("%s retains the gate contract and checks packaging visibility", variant => {
  const baseline = buildVisibilityGateInput({ imageBase64: "test", imageMimeType: "image/webp", focusPolygon: null });
  const candidate = obscurityVisibilityPrompt(baseline, variant);
  expect(candidate.images).toEqual(baseline.images);
  expect(Object.keys(candidate.questions)).toEqual(Object.keys(baseline.questions));
  expect(Object.values(candidate.questions).every(question => question.type === "noul")).toBe(true);
  expect(candidate.questions.unclear_photo.instructions).toMatch(/blur.*glare.*packaging/i);
  expect(candidate.state).toContain("Missing underside views are OK");
  expect(candidate.state).toContain("Do not grade ripeness");
  expect(candidate.state).toContain("If unsure, answer no");
});
