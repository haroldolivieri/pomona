import type { ScanRequest } from "@pomona/contract";
import { renderPrompt } from "./render";

export function buildRoundOneSystemPrompt(): string {
  return renderPrompt("roundOneSystem");
}

export function buildRoundOneUserPrompt(request: ScanRequest, repairErrors?: string[]): string {
  const polygon = request.focusPolygon;
  const bounds = polygon?.length
    ? renderPrompt("roundOneBounds", {
        xmin: Math.min(...polygon.map(([x]) => x)),
        xmax: Math.max(...polygon.map(([x]) => x)),
        ymin: Math.min(...polygon.map(([, y]) => y)),
        ymax: Math.max(...polygon.map(([, y]) => y)),
      })
    : "";
  let prompt = renderPrompt("roundOneUser", {
    locale: request.locale,
    polygon: JSON.stringify(polygon),
    selection: renderPrompt(polygon ? "insidePolygon" : "fullDisplay"),
    bounds,
  });
  if (repairErrors?.length) {
    prompt += renderPrompt("repair", { errors: repairErrors.map((error) => `- ${error}`).join("\n") });
  }
  return prompt;
}
