import { verifyAndResolveScanResponse } from "@pomona/proxy";
import type { ScanRequest } from "@pomona/contract";

export interface VerifyPromptfooOutputResult {
  pass: boolean;
  score: number;
  reason: string;
}

export function verifyPromptfooOutput(
  output: string,
  context: { vars: Record<string, any> }
): VerifyPromptfooOutputResult {
  let parsedJson: unknown;
  try {
    parsedJson = typeof output === "string" ? JSON.parse(output) : output;
  } catch (err: any) {
    return {
      pass: false,
      score: 0,
      reason: `Failed to parse JSON output: ${err?.message || String(err)}`,
    };
  }

  const round = Number(context.vars?.round ?? 1);
  const scanRequest: ScanRequest = {
    schemaVersion: "1.0",
    sessionId: "00000000-0000-0000-0000-000000000000",
    round: (round === 2 ? 2 : round === 3 ? 3 : 1) as 1 | 2 | 3,
    locale: context.vars?.locale ?? "en-GB",
    imageBase64: "dummy",
    imageMimeType: "image/webp",
    focusPolygon: context.vars?.focusPolygon ?? null,
    followUpContext: context.vars?.followUpContext ?? null,
  };

  const result = verifyAndResolveScanResponse(parsedJson, {
    request: scanRequest,
    promptVersion: context.vars?.promptVersion ?? "v1",
    modelId: context.vars?.modelId ?? "promptfoo-eval",
  });

  if (!result.ok) {
    return {
      pass: false,
      score: 0,
      reason: `Verification failed:\n${result.errors.join("\n")}`,
    };
  }

  const response = result.response;

  // Additional checks against expected variables if specified
  if (
    context.vars?.expectedProduceType &&
    response.produce &&
    response.produce.type !== context.vars.expectedProduceType
  ) {
    return {
      pass: false,
      score: 0.5,
      reason: `Expected produce type "${context.vars.expectedProduceType}" but received "${response.produce.type}"`,
    };
  }

  if (
    context.vars?.expectedWinnerId &&
    response.verdict &&
    response.verdict.winnerId !== context.vars.expectedWinnerId
  ) {
    return {
      pass: false,
      score: 0.5,
      reason: `Expected winnerId "${context.vars.expectedWinnerId}" but received "${response.verdict.winnerId}"`,
    };
  }

  return {
    pass: true,
    score: 1.0,
    reason: "Passed ScanResponse schema, verifier invariants, and context expectations",
  };
}
