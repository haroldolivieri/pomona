// Fixed candidates for the packaged-produce regression experiment. No app change.
export function obscurityVisibilityPrompt<T extends Record<string, unknown>>(input: T, variant: "direct" | "inspectability") {
  return {
    ...input,
    state: "Inspect selected foreground only. Ignore black mask and background. " +
      "Printed pictures are not produce. Same-species varieties count as one. " +
      "Missing underside views are OK. Do not grade ripeness. If unsure, answer no.",
    questions: {
      no_produce: { type: "noul", instructions: "Is there no real fresh produce in the foreground?" },
      unclear_photo: { type: "noul", instructions: variant === "direct"
        ? "Do blur, glare, or packaging hide most produce surfaces?"
        : "Would blur, glare, or packaging prevent reliable visual inspection of individual produce items?" },
      multiple_types: { type: "noul", instructions: "Are two or more produce species selected together?" },
    },
  };
}
