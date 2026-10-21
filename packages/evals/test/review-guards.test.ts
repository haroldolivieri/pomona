import { describe, expect, it } from "vitest";
import manifest from "../dataset/ground-truth.json";
import { verifyInventory, verifyPromptfooOutput } from "../assertions/verify-contract";
import { annotatedOutput } from "./annotated-fixture";

const scene = (prefix: string) => manifest.find((entry) => entry.id.startsWith(prefix))!.groundTruth;
const tomato = scene("20-");
const banana = scene("15-");
const evaluate = (output: unknown, vars: Record<string, any> = tomato) => verifyPromptfooOutput(JSON.stringify(output), { vars });

describe("review false-pass regressions", () => {
  it("accepts independent full annotations, not a saved model output", () => {
    expect(tomato.expectedInventory!.required).toHaveLength(0);
    expect(tomato.expectedInventory!.optional).toHaveLength(41);
    expect(evaluate(annotatedOutput(tomato)).pass).toBe(true);
    expect(evaluate(annotatedOutput(banana, "banana"), banana).pass).toBe(true);
  });

  it("accepts a partial but precise inventory in an ambiguous pile", () => {
    const annotations = tomato.expectedInventory!;
    const candidates = annotatedOutput(tomato).candidates.slice(0, 36);
    expect(verifyInventory(candidates, annotations as any)).toBeNull();
  });

  it.each([undefined, null, 1.5])("rejects missing or noninteger round-one counts: %s", (countedTotal) => {
    const result = evaluate({ ...annotatedOutput(tomato), countedTotal });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("require an integer countedTotal");
  });

  it("rejects fabricated duplicate detections despite distinct IDs and a matching total", () => {
    const output = annotatedOutput(tomato);
    output.candidates = output.candidates.map((c: any, i: number) => i < 2 ? c : { ...c, box: output.candidates[0].box });
    const result = evaluate(output);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("Duplicate detection");
  });

  it("rejects fabricated candidates that cannot map to distinct annotated units", () => {
    const annotations = tomato.expectedInventory!.optional;
    const units = [annotations[0], annotations[1]];
    const candidates = Array.from({ length: 37 }, (_, i) => {
      const unit = units[i % units.length];
      const [y1, x1, y2, x2] = unit.box;
      const scale = 0.4 + (i % 6) * 0.09;
      const cy = (y1 + y2) / 2;
      const cx = (x1 + x2) / 2;
      const h = (y2 - y1) * scale / 2;
      const w = (x2 - x1) * scale / 2;
      return { id: `fake-${i}`, box: [cy - h, cx - w, cy + h, cx + w] as [number, number, number, number], ripeness: "ripe" };
    });
    const result = verifyInventory(candidates, tomato.expectedInventory! as any);
    expect(result).toContain("candidate(s) do not match distinct annotated purchase units");
  });

  it("resolves a claimed tie that admits missing evidence to missing_evidence", () => {
    const result = evaluate({ status: "insufficient_evidence", abstentionReason: "assessed_tie", countedTotal: null,
      produce: null, candidates: [], verdict: null, followUp: null, afterPurchase: null,
      message: "Cannot assess maturity; diagnostic surfaces are hidden. Please show the underside." }, scene("16-"));
    expect(result.pass).toBe(true);
  });

  it("checks cross-produce hallucinations in abstention messages", () => {
    const result = evaluate({ status: "insufficient_evidence", abstentionReason: "assessed_tie", countedTotal: null,
      produce: null, candidates: [], verdict: null, followUp: null, afterPurchase: null,
      message: "Watermelons look uniformly ripe. Please show a closer view." }, scene("16-"));
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("Hallucinated forbidden term");
  });

  it("rejects detecting only one banana unit", () => {
    const output = annotatedOutput(banana, "banana");
    output.candidates = output.candidates.slice(0, 1);
    output.countedTotal = 1;
    output.verdict.runnerUpId = null;
    output.followUp = null;
    expect(evaluate(output, banana).pass).toBe(false);
  });

  it("rejects splitting a banded banana bunch into separate candidates", () => {
    const output = annotatedOutput(banana, "banana");
    const hand = output.candidates.find((c: any) => c.id === "middle-fifis-banded-bunch")!;
    output.candidates = output.candidates.filter((c: any) => c !== hand);
    output.candidates.push(...[0, 1, 2].map((i) => ({ ...hand, id: `finger-${i}`,
      box: [hand.box[0] + i * 70, hand.box[1], hand.box[0] + i * 70 + 60, hand.box[3]] })));
    output.countedTotal = output.candidates.length;
    const result = evaluate(output, banana);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("Inventory coverage");
  });
});
