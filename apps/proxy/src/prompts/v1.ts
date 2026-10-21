import type { ScanRequest } from "@pomona/contract";
import { buildRoundOneSystemPrompt, buildRoundOneUserPrompt } from "./round-one";
import { renderPrompt } from "./render";

export interface PromptConfig {
  readonly version: string;
  buildSystemPrompt(request: ScanRequest): string;
  buildUserPrompt(request: ScanRequest, repairErrors?: string[]): string;
  buildRepairPrompt?(request: ScanRequest, repairErrors: string[]): string;
}

function describeFocusPolygonBounds(polygon: [number, number][]): string {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  return renderPrompt("polygonBounds", {
    polygon: JSON.stringify(polygon),
    xmin: Math.min(...xs),
    xmax: Math.max(...xs),
    ymin: Math.min(...ys),
    ymax: Math.max(...ys),
  });
}

function buildFollowUpSystemPrompt(request: ScanRequest): string {
  const polygonInfo =
    request.focusPolygon && request.focusPolygon.length >= 3
      ? renderPrompt("followUpPolygon", { bounds: describeFocusPolygonBounds(request.focusPolygon) })
      : renderPrompt("noPolygon");
  return renderPrompt("followUpSystem", { polygonInfo });
}

function buildFollowUpUserPrompt(request: ScanRequest, repairErrors?: string[]): string {
  let prompt = renderPrompt("followUpUser", { round: request.round, locale: request.locale });
  const ctx = request.followUpContext;
  if (ctx) {
    prompt += renderPrompt("followUpContext", {
      targetCandidateId: ctx.targetCandidateId,
      produceDisplayName: ctx.produceDisplayName,
      targetRole: ctx.targetRole,
      requestedInstruction: ctx.requestedInstruction,
      previousWinnerId: ctx.previousWinner.id,
      previousWinnerScore: ctx.previousWinner.score,
      previousWinnerRipeness: ctx.previousWinner.ripeness,
      previousWinnerTraits: JSON.stringify(ctx.previousWinner.traits),
      previousRunnerUpId: ctx.previousRunnerUp.id,
      previousRunnerUpScore: ctx.previousRunnerUp.score,
      previousRunnerUpRipeness: ctx.previousRunnerUp.ripeness,
      previousRunnerUpTraits: JSON.stringify(ctx.previousRunnerUp.traits),
      targetWindow: ctx.targetRipeness
        ? renderPrompt("targetWindow", { targetRipeness: ctx.targetRipeness })
        : renderPrompt("defaultTargetWindow"),
    });
  }
  if (request.round === 3) prompt += renderPrompt("finalRound");
  prompt += renderPrompt("followUpEvidence");
  if (repairErrors?.length) {
    prompt += renderPrompt("repair", { errors: repairErrors.map((error) => `- ${error}`).join("\n") });
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
