// Experimental candidate only; the application keeps its existing gate prompt.
export function shortVisibilityPrompt<T extends Record<string, unknown>>(input: T) {
  return {
    ...input,
    state: "Check photo suitability only, not ripeness or a winner. " +
      "Ignore artificial black masking and background produce. Printed pictures are not real produce. " +
      "Varieties of one species count as one. For an unmasked photo, judge the dominant foreground subject. " +
      "If uncertain, answer no. Missing underside views alone do not make a photo unclear.",
    questions: {
      no_produce: { type: "noul", instructions: "Is there no real fresh fruit or vegetable visible?" },
      unclear_photo: { type: "noul", instructions: "Is the visible produce too blurry, obscured, or washed out to inspect?" },
      multiple_types: { type: "noul", instructions: "Does the selected area contain multiple produce species?" },
    },
  };
}

export function minimalVisibilityPrompt<T extends Record<string, unknown>>(input: T) {
  return {
    ...input,
    state: "Inspect selected foreground only. Ignore black mask and background. " +
      "Pictures are not produce; same-species varieties are one type. " +
      "Missing underside views are OK. No ripeness judgments. If unsure, answer no.",
    questions: {
      no_produce: { type: "noul", instructions: "No real fresh produce visible?" },
      unclear_photo: { type: "noul", instructions: "Produce surfaces unreadable from blur, glare, or packaging?" },
      multiple_types: { type: "noul", instructions: "Multiple produce species selected?" },
    },
  };
}

// Frozen original contender, retained after the winning prompt ships.
export function detailedVisibilityPrompt<T extends Record<string, unknown>>(input: T, masked: boolean) {
  return {
    ...input,
    state: "Check only coarse photo suitability, never ripeness, quality, ties or a winner. " +
      (masked
        ? "Black pixels outside the drawn selection are an artificial mask, not poor lighting or obstruction. Judge only the visible selected area. "
        : "Judge the dominant foreground subject; ignore adjacent bins and background produce. ") +
      "If uncertain, answer no. Hidden grading surfaces and similar-looking fruit belong to the later grading model.",
    questions: {
      no_produce: { type: "noul", instructions: "Is there clearly no actual fresh fruit or vegetable present? Printed produce pictures do not count." },
      unclear_photo: { type: "noul", instructions: "If actual produce is present, does severe blur, glare, or opaque printed packaging clearly prevent reading its surfaces? Ignore the artificial black mask, ordinary bags, and missing underside views." },
      multiple_types: { type: "noul", instructions: "Are two or more different produce species co-equal intended subjects? Ignore background items and varieties of the same species. A selected single species is not mixed." },
    },
  };
}
