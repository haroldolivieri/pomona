import type { ScanRequest } from "@pomona/contract";
import { renderPrompt } from "./render";

export function buildRoundOneSystemPrompt(request?: ScanRequest): string {
  const system = renderPrompt("roundOneSystem");
  if (!request?.focusPolygon || request.focusPolygon.length < 3) return system;
  return system + renderPrompt("roundOneSelection", {
    polygon: JSON.stringify(request.focusPolygon),
    bounds: describeSelectionBounds(request.focusPolygon),
    xmin: Math.min(...request.focusPolygon.map(([x]) => x)),
    xmax: Math.max(...request.focusPolygon.map(([x]) => x)),
    ymin: Math.min(...request.focusPolygon.map(([, y]) => y)),
    ymax: Math.max(...request.focusPolygon.map(([, y]) => y)),
  });
}

function describeSelectionBounds(polygon: [number, number][]): string {
  return renderPrompt("roundOneBounds", {
    xmin: Math.min(...polygon.map(([x]) => x)),
    xmax: Math.max(...polygon.map(([x]) => x)),
    ymin: Math.min(...polygon.map(([, y]) => y)),
    ymax: Math.max(...polygon.map(([, y]) => y)),
  });
}

export function buildRoundOneUserPrompt(request: ScanRequest, repairErrors?: string[]): string {
  const polygon = request.focusPolygon;
  const bounds = polygon?.length
    ? describeSelectionBounds(polygon)
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
