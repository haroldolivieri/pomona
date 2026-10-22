import { expect, it } from "vitest";
import { shortVisibilityPrompt, minimalVisibilityPrompt } from "../scripts/short-visibility-prompt";
import { buildVisibilityGateInput, resolveVisibilityGate } from "@pomona/proxy";

it("the experimental prompt preserves image payload and response keys without changing the application prompt", () => {
  const baseline = buildVisibilityGateInput({ imageBase64: "test", imageMimeType: "image/jpeg", focusPolygon: null });
  const candidate = shortVisibilityPrompt(baseline);
  expect(candidate.images).toEqual(baseline.images);
  expect(candidate.model).toBe(baseline.model);
  expect(Object.keys(candidate.questions)).toEqual(Object.keys(baseline.questions));
  expect(candidate.state).toContain("black masking");
  expect(candidate.state).toContain("Varieties of one species");
  expect(candidate.state).toContain("If uncertain, answer no");
  expect(baseline.questions.no_produce.instructions).toBe("Is there no real fresh produce in the foreground?");
  expect(resolveVisibilityGate({ answers: {
    no_produce: { type: "noul", noul: 0.1 }, unclear_photo: { type: "noul", noul: 0.1 },
    multiple_types: { type: "noul", noul: 0.1 },
  }, usage: { input_tokens: 100, output_tokens: 0 } }).status).toBeNull();
});

it("the third contender keeps gate questions and abstention rules while reducing prompt size", () => {
  const baseline = buildVisibilityGateInput({ imageBase64: "test", imageMimeType: "image/jpeg", focusPolygon: null });
  const short = shortVisibilityPrompt(baseline);
  const minimal = minimalVisibilityPrompt(baseline);
  expect(minimal.images).toEqual(baseline.images);
  expect(Object.keys(minimal.questions)).toEqual(Object.keys(baseline.questions));
  expect(Object.values(minimal.questions).every(question => question.type === "noul")).toBe(true);
  expect(minimal.state).toContain("If unsure, answer no");
  expect(minimal.state).toContain("black mask");
  expect(minimal.state).toContain("same-species varieties");
  expect(JSON.stringify({ state: minimal.state, questions: minimal.questions }).length)
    .toBeLessThan(JSON.stringify({ state: short.state, questions: short.questions }).length);
});
