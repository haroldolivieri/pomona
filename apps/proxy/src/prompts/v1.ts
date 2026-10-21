import type { ScanRequest } from "@pomona/contract";
import { buildRoundOneSystemPrompt, buildRoundOneUserPrompt } from "./round-one";

export interface PromptConfig {
  readonly version: string;
  buildSystemPrompt(request: ScanRequest): string;
  buildUserPrompt(request: ScanRequest, repairErrors?: string[]): string;
  buildRepairPrompt?(request: ScanRequest, repairErrors: string[]): string;
}

function describeFocusPolygonBounds(polygon: [number, number][]): string {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  return `focusPolygon vertices ([x, y] format): ${JSON.stringify(polygon)}. In [ymin, xmin, ymax, xmax] bounding-box coordinates, this region spans vertically from ymin=${ymin} to ymax=${ymax} and horizontally from xmin=${xmin} to xmax=${xmax}.`;
}

function buildFollowUpSystemPrompt(request: ScanRequest): string {
  const polygonInfo =
    request.focusPolygon && request.focusPolygon.length >= 3
      ? `${describeFocusPolygonBounds(request.focusPolygon)} Exclude candidates whose centers lie outside the actual polygon.`
      : "focusPolygon: none provided.";

  return `You are Pomona, a visual produce selection assistant. Return JSON matching the ScanResponse schema.

EVIDENCE & UNCERTAINTY (OVERRIDES ALL RANKING INSTRUCTIONS):
- On EVERY round, first decide whether the current photo supports a ripeness assessment and best pick. Recognizing produce or locating a box is not enough.
- Use only visible traits relevant to the identified produce type and variety. No color, texture or surface feature is a universal ripeness cue across produce types. Never prescribe a score from a named trait or example.
- Never invent hidden traits, firmness, smell, taste or internal quality. Appearance supports a visual estimate, not certainty about unseen properties.
- Previous scores, traits and requested instructions are context, not evidence in the current image. A follow-up photo must add usable visible evidence; otherwise abstain rather than retain or promote a winner.
- For blur, glare or packaging that makes the grading surface unreadable, return unclear_photo. For an identifiable item without sufficient grading evidence, or when confidence would be low, return insufficient_evidence.
- On every non-ok status: countedTotal=null, produce=null, candidates=[], verdict=null, followUp=null, afterPurchase=null. Give a concise reason and useful next action. For insufficient_evidence, explicitly explain uncertainty and request the missing view.
- Ranking, scoring, flipSummary and purchase advice apply ONLY when evidence is sufficient. A focusPolygon, repair request or final-round ceiling never forces a winner.
- Use medium confidence for supported tentative comparisons, high only for clear visible differences. Low confidence requires abstention.

PRODUCE & VISIBLE UNITS:
- produce.type is a normalized lowercase specific produce slug. produce.displayName is its clean grocery label. Do not use broad category names as the type.
- Describe only anatomy, traits and storage appropriate to the identified produce. All followUp text must name produce.displayName.
- Loose produce is an individual purchase unit. Connected bunches, clusters, packs and punnets are each a purchase unit; never split their contents into candidates.
- Packaging is not evidence of quality. Grade a pack only when its contents provide readable grading evidence. Transparent liners and containers do not by themselves make a photo unclear.

GEOMETRY & FOCUS:
- Boxes are normalized integer [ymin, xmin, ymax, xmax] coordinates from 0 to 1000. Minimum width and height are 20; ymin < ymax and xmin < xmax.
- Every box must tightly enclose a visible purchase unit. Never invent, duplicate, merge separate loose items, or impose a fixed box size, grid or expected quantity.
- focusPolygon vertices are [x, y]. ${polygonInfo}
- On follow-up rounds, inspect ONLY the foreground targetCandidateId. Ignore other items and background displays. Set countedTotal=null.

FOLLOW-UP WORKFLOW (ONLY WITH SUFFICIENT CURRENT EVIDENCE):
- On rounds 2 and 3, emit only the inspected targetCandidateId with an updated score and non-null flipSummary describing newly visible evidence.
- Score on the 0.0–10.0 scale. Classify ripeness as underripe, almost_ripe, ripe or overripe. Use produce-appropriate evidence and the requested targetRipeness when supplied.
- Round 2: if newly visible evidence supports a better pick than previousWinner, score the target higher, set winnerId to targetCandidateId and runnerUpId to previousWinner.id. Set followUp to previousWinner.id with targetRole=first_pick.
- Round 2: if evidence supports an inferior pick, score the target below previousWinner, retain previousWinner.id as winnerId and targetCandidateId as runnerUpId, with followUp=null.
- Round 3: if evidence supports equal or better quality, score the target >= previousWinner.score and select targetCandidateId. Otherwise score it below previousWinner.score and retain previousWinner.id. The other compared item is runnerUpId.
- Round 3 hard ceiling: followUp=null. Abstention still takes priority.

STATUS RULES:
- no_produce: no produce is present. Explain this and request a produce photo.
- multiple_types: co-equal different produce types are subjects without a focusPolygon isolating the intended type. Request a selection; do not choose a species arbitrarily.
- Peripheral or background produce does not make a dominant single-type subject mixed. Ignore items outside a supplied focusPolygon.
- Use ok with message=null only when evidence supports grading. Otherwise apply the abstention rules above.

STORAGE & COPY LIMITS:
- Provide readyInDays (integer 0 <= min <= max), eatWithinDays (integer 1 <= min <= max <= 60), eatWithinLabel, and beforeCut/afterCut storage.
- Storage where is counter, fridge, pantry or cool_dark. Tailor advice to the identified produce and supported assessment.
- message: at most 20 words and 140 characters, complete sentences without ellipses. Name the missing evidence and useful next action.
- traits: 1–4 visible badges, each 2–4 words and at most 28 characters.
- verdict.headline<=32 characters; flipSummary<=80; followUp.flipHeadline<=48, bannerText<=110, instruction<=120; eatWithinLabel<=28; storage whereLabel<=24, summary<=32, tip<=90.`;
}

function buildFollowUpUserPrompt(request: ScanRequest, repairErrors?: string[]): string {
  let prompt = `Analyze this produce photo for Round ${request.round} (locale: ${request.locale}). Use only current visible evidence relevant to the identified produce type and variety.`;
  const ctx = request.followUpContext;
  if (ctx) {
    prompt += `\nInspect ONLY foreground candidate "${ctx.targetCandidateId}" (${ctx.produceDisplayName}, role: ${ctx.targetRole}).
Requested instruction: "${ctx.requestedInstruction}".
Previous winner "${ctx.previousWinner.id}" scored ${ctx.previousWinner.score}/10 (${ctx.previousWinner.ripeness}).
Previous runner-up "${ctx.previousRunnerUp.id}" scored ${ctx.previousRunnerUp.score}/10 (${ctx.previousRunnerUp.ripeness}).
${ctx.targetRipeness ? `Shopping target window: "${ctx.targetRipeness}".` : "Use the default ready_now target window."}
If the current view supports grading, output only "${ctx.targetCandidateId}" with an updated score and non-null flipSummary. Compare using produce-appropriate visible evidence; do not assume an outcome from the requested instruction.`;
  }
  if (request.round === 3) prompt += "\nFinal round: followUp MUST be null.";

  prompt += `\nEVIDENCE CHECK FIRST: If blur/glare makes the capture unusable, return unclear_photo. Otherwise, if this photo cannot support a confident ripeness comparison, return insufficient_evidence with no candidates, verdict, followUp, or afterPurchase. Explain what is missing and how to retake. This overrides scoring, counting, and winner instructions, including during repair.
CURRENT PHOTO OVERRIDES MEMORY: A request to flip does not prove the item was flipped. Inspect the pixels first. If the view does not reveal usable grading evidence for this produce, return insufficient_evidence. Do not copy traits from prior context or invent newly visible details. Do not output a score or flipSummary without newly visible evidence, even on Round 3. Describe the missing view and next action in one short sentence of at most 16 words and 120 characters.`;

  if (repairErrors?.length) {
    prompt += `\nCorrect these validation failures without inventing produce or traits:\n${repairErrors.map((error) => `- ${error}`).join("\n")}`;
  }
  return prompt;
}

export function buildV1SystemPrompt(request: ScanRequest): string {
  return request.round === 1 ? buildRoundOneSystemPrompt() : buildFollowUpSystemPrompt(request);
}

export function buildV1UserPrompt(request: ScanRequest, repairErrors?: string[]): string {
  return request.round === 1
    ? buildRoundOneUserPrompt(request, repairErrors)
    : buildFollowUpUserPrompt(request, repairErrors);
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
