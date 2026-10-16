import type { ScanRequest } from "@pomona/contract";

export interface PromptConfig {
  readonly version: string;
  buildSystemPrompt(request: ScanRequest): string;
  buildUserPrompt(request: ScanRequest, repairErrors?: string[]): string;
  buildRepairPrompt?(request: ScanRequest, repairErrors: string[]): string;
}

export function buildV1SystemPrompt(request: ScanRequest): string {
  const polygonInfo =
    request.focusPolygon && request.focusPolygon.length >= 3
      ? `focusPolygon active: ${JSON.stringify(request.focusPolygon)}. Only detect candidates inside this focusPolygon.`
      : `focusPolygon: none provided. Detect all prominent produce items in the view.`;

  return `You are Pomona, an expert grocery produce selection vision model.
Your task is to analyze grocery produce photos, identify individual fruits/vegetables, assign ripeness scores, bounding boxes, traits, and storage advice.

BOUNDING BOX FORMAT:
- Express all candidate boxes as normalized integer coordinates in [ymin, xmin, ymax, xmax] format (0 to 1000 scale).
- Minimum width and height for any bounding box is 20 units. Ensure ymin < ymax and xmin < xmax.
- Bounding boxes must tightly bound each individual produce item.

FOCUS POLYGON CONSTRAINT:
- ${polygonInfo}
- When a focusPolygon is provided, any candidate whose center point [(xmin+xmax)/2, (ymin+ymax)/2] falls outside the focusPolygon will be rejected by our semantic verifier. Restrict candidate detection strictly to items inside the focusPolygon.

MULTI-ROUND FLIP WORKFLOW:
- Round 1: Identify produce type and displayName. Score all visible candidates (e.g. c1, c2). The highest scoring candidate is the winner. If a second candidate exists, designate it as runnerUpId and offer a followUp flip comparison to inspect its underside/stem. If only 1 item exists, runnerUpId and followUp must be null.
- Round 2: Close-up inspection of the runner-up candidate after being turned or flipped. Inspect the newly visible angle, provide flipSummary, update score and traits. Compare with previousWinner.
- Round 3: Final check inspection of the 1st pick candidate. Re-evaluate score and traits with flipSummary. Hard ceiling: followUp MUST be null on Round 3.

PARAMETERIZED COPY & FORBIDDING HARDCODED PRODUCE NAMES:
- NEVER hardcode fruit or produce names. For instance, if the detected produce is Pineapple or Avocado, NEVER refer to "melon", "watermelon", "field spot", or unrelated produce traits.
- All advice, headlines, traits, and followUp text MUST be strictly parameterized to the detected produce.displayName.
- bannerText, flipHeadline, and instruction in followUp MUST directly incorporate the produce displayName.

STORAGE & SHELF-LIFE GUIDANCE:
- You must provide explicit afterPurchase storage advice split into two distinct stages:
  1. beforeCut: storage before cutting (e.g. where: "counter" | "fridge" | "pantry" | "cool_dark", whereLabel, summary, tip).
  2. afterCut: storage after cutting (e.g. where: "counter" | "fridge" | "pantry" | "cool_dark", whereLabel, summary, tip).
- Specify readyInDays (min <= max, >= 0) and eatWithinDays (min <= max, 1 to 60) along with eatWithinLabel (e.g. "3–5 days").

STATUS HANDLING:
- If no produce is visible: status = "no_produce".
- If the image is too blurry or unreadable: status = "unclear_photo".
- If multiple distinct types of produce are mixed: status = "multiple_types".
- Otherwise: status = "ok".`;
}

export function buildV1UserPrompt(request: ScanRequest, repairErrors?: string[]): string {
  let prompt = `Analyze this grocery produce image for Round ${request.round} (locale: ${request.locale}).`;

  if (request.round === 1) {
    if (request.focusPolygon && request.focusPolygon.length >= 3) {
      prompt += `\nUser drew a focusPolygon: ${JSON.stringify(request.focusPolygon)}. Focus only on produce inside this area.`;
    } else {
      prompt += `\nEvaluate the produce in the image (pile or single item).`;
    }
  } else if (request.round === 2 && request.followUpContext) {
    const ctx = request.followUpContext;
    prompt += `\nRound 2 close-up inspection:
Inspecting candidate ${ctx.targetCandidateId} (${ctx.produceDisplayName}, role: ${ctx.targetRole}).
Requested instruction: "${ctx.requestedInstruction}".
Previous 1st pick candidate ${ctx.previousWinner.id} scored ${ctx.previousWinner.score} (${ctx.previousWinner.ripeness}).
Previous runner-up candidate ${ctx.previousRunnerUp.id} scored ${ctx.previousRunnerUp.score}.
Evaluate this runner-up candidate from the new angle, record flipSummary, update score, and compare against previous 1st pick.`;
  } else if (request.round === 3 && request.followUpContext) {
    const ctx = request.followUpContext;
    prompt += `\nRound 3 final check inspection:
Inspecting candidate ${ctx.targetCandidateId} (${ctx.produceDisplayName}, role: ${ctx.targetRole}).
Requested instruction: "${ctx.requestedInstruction}".
Previous winner candidate ${ctx.previousWinner.id} scored ${ctx.previousWinner.score}.
Record flipSummary, update score, and compare against previous winner. Hard ceiling: followUp must be null.`;
  }

  if (repairErrors && repairErrors.length > 0) {
    prompt += `\n\nCRITICAL CORRECTION REQUIRED (Repair Attempt):
Your previous response failed deterministic validation with these errors:
${repairErrors.map((e) => `- ${e}`).join("\n")}
You must fix all errors listed above and return a fully compliant JSON response.`;
  }

  return prompt;
}

export function buildV1RepairPrompt(request: ScanRequest, repairErrors: string[]): string {
  return buildV1UserPrompt(request, repairErrors);
}

export const v1PromptConfig: PromptConfig = {
  version: "v1",
  buildSystemPrompt: buildV1SystemPrompt,
  buildUserPrompt: buildV1UserPrompt,
  buildRepairPrompt: buildV1RepairPrompt,
};
