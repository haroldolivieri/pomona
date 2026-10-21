import type { ScanRequest } from "@pomona/contract";

// Documentation uses symbolic request values, never recorded scan data.
// Numeric placeholders are interpolated as text by the prompt builders only.
function placeholder<T>(name: string): T {
  return `{{${name}}}` as T;
}

export const templateFocusPolygon: NonNullable<ScanRequest["focusPolygon"]> = [
  [0, 0], [1000, 0], [1000, 1000], [0, 1000],
];

function context(targetRole: "runner_up" | "first_pick"): NonNullable<ScanRequest["followUpContext"]> {
  return {
    produceType: "{{produceType}}",
    produceDisplayName: "{{produceDisplayName}}",
    targetCandidateId: "{{targetCandidateId}}",
    targetRole,
    requestedInstruction: "{{requestedInstruction}}",
    previousWinner: {
      id: "{{previousWinner.id}}",
      role: "first_pick",
      score: placeholder<number>("previousWinner.score"),
      ripeness: placeholder<"ripe">("previousWinner.ripeness"),
      traits: ["{{previousWinner.traits}}"],
      anglesInspected: 1,
    },
    previousRunnerUp: {
      id: "{{previousRunnerUp.id}}",
      role: "runner_up",
      score: placeholder<number>("previousRunnerUp.score"),
      ripeness: placeholder<"ripe">("previousRunnerUp.ripeness"),
      traits: ["{{previousRunnerUp.traits}}"],
      anglesInspected: 1,
    },
  };
}

export const templateRoundTwoContext = context("runner_up");
export const templateRoundThreeContext = context("first_pick");

export function renderDocumentationTemplate(body: string): string {
  return body
    .replaceAll(JSON.stringify(templateFocusPolygon), "{{focusPolygon}}")
    .replaceAll("Selected bounds: x=0..1000, y=0..1000.", "Selected bounds: {{focusPolygon.bounds}}.");
}
