/** Deterministic geometry fixture drawn from independent annotations, not saved model detections. */
export function annotatedOutput(vars: Record<string, any>, type = "tomato") {
  const candidates = [
    ...vars.expectedInventory.required,
    ...(vars.expectedInventory.optional ?? []),
  ].map((unit: any) => {
    const ripeness = unit.ripeness?.[0] ?? (unit.id.includes("green") ? "underripe" : "ripe");
    return { id: unit.id, box: unit.box, ripeness,
      score: ripeness === "underripe" ? 2 : ripeness === "almost_ripe" ? 6 : 8,
      traits: [ripeness === "underripe" ? "Earlier maturity" : "Visible maturity cues"], flipSummary: null };
  });
  const ranked = [...candidates].sort((a: any, b: any) => b.score - a.score || a.box[0] - b.box[0] || a.box[1] - b.box[1]);
  const displayName = type === "banana" ? "Bananas" : "Tomatoes";
  return {
    status: "ok", abstentionReason: null, message: null, countedTotal: candidates.length,
    produce: { type, displayName, variety: null }, candidates,
    verdict: { winnerId: ranked[0].id, runnerUpId: ranked[1]?.id ?? null, confidence: "medium", headline: "Compare these." },
    followUp: ranked[1] ? { targetCandidateId: ranked[1].id, targetRole: "runner_up",
      bannerText: `Inspect the ${displayName}.`, flipHeadline: `Turn the ${displayName}`,
      instruction: `Show the other side of the ${displayName}.` } : null,
    afterPurchase: { readyInDays: { min: 0, max: 0 }, eatWithinDays: { min: 3, max: 5 }, eatWithinLabel: "3–5 days",
      storage: { beforeCut: { where: "counter", whereLabel: "Counter", summary: "Whole", tip: "Keep out of sun" },
        afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Covered", tip: "Cover cut produce" } } },
  };
}
