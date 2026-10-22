import type { AbstentionReason } from "./schemas";

/** A tie must not turn an admitted lack of grading evidence into a positive assessment. */
export function getAbstentionContradiction(reason: AbstentionReason | null | undefined, message: string | null): string | null {
  if (reason !== "assessed_tie") return null;
  if (!message) return "assessed_tie requires a message naming positive visible evidence of the shared maturity stage; otherwise use missing_evidence";
  const portuguese = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const missingPortuguese = /\b(?:ocult[ao]s?|escondid[ao]s?|encobert[ao]s?|obstruid[ao]s?|ilegivel|ilegiveis|falt(?:a|am))\b/.test(portuguese)
    || /\bnao (?:(?:esta|estao|e|sao) )?(?:visivel|visiveis|aparece|mostra)\b/.test(portuguese)
    || /\bnao (?:consigo|conseguimos|posso|podemos|e possivel|da para) (?:avaliar|determinar|julgar|ver|saber|confirmar|afirmar|identificar)\b/.test(portuguese)
    || /\bnao (?:sei|sabemos)\b/.test(portuguese);

  const positivePortuguese = /\b(?:todos?|todas?|cada|ambos|ambas|mesm[ao]s?|uniformemente)\b.{0,50}\b(?:madur[ao]s?|verdes?|passad[ao]s?|estagio de maturacao)\b/.test(portuguese)
    || /\b(?:madur[ao]s?|verdes?|passad[ao]s?|estagio de maturacao)\b.{0,50}\b(?:todos?|todas?|cada|ambos|ambas|mesm[ao]s?|uniformemente)\b/.test(portuguese);
  const missingSurface = /\b(hidden|obscur(?:e[sd]?|ing)|unreadable|missing|not visible|not shown|blocked)\b/i.test(message);
  const cannotAssess = /\b(cannot|can.t|unable to)\s+(?:confidently\s+)?(?:assess|determine|judge|evaluate|grade)\b/i.test(message)
    || /\b(?:prevents?|precludes?|makes it impossible to)\b.{0,35}\b(?:assess(?:ment)?|determine|judge|evaluate|grade)\b/i.test(message);
  const positiveMaturityEvidence = /\b(?:all|each|both|same|uniformly)\b.{0,35}\b(?:ripe|underripe|overripe|almost[- ]ripe|maturity stage|ripeness stage)\b/i.test(message)
    || /\b(?:ripe|underripe|overripe|almost[- ]ripe|maturity stage|ripeness stage)\b.{0,35}\b(?:all|each|both|same|uniformly)\b/i.test(message);
  if (missingSurface || missingPortuguese || cannotAssess || !(positiveMaturityEvidence || positivePortuguese)) {
    return "assessed_tie requires a message naming positive visible evidence of the shared maturity stage; otherwise use missing_evidence";
  }
  return null;
}

/** Keep abstention conservative when a tie claim lacks visible maturity evidence. */
export function resolveAbstentionReason(reason: AbstentionReason | null | undefined, message: string | null): AbstentionReason {
  if (reason === "assessed_tie" && getAbstentionContradiction(reason, message)) return "missing_evidence";
  return reason ?? "missing_evidence";
}
