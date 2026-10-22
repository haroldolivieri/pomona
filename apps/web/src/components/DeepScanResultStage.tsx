import React from "react";
import { uiCopy } from "../i18n/copy";
import type { DeepScanResponse } from "@pomona/contract";

export interface DeepScanResultStageProps {
  response: DeepScanResponse | null;
  errorMessage?: string | null;
  onNewScan: () => void;
}

const STATE_LABEL_KEYS: Record<string, string> = {
  unripe: "deepScan.state.unripe",
  nearly_ripe: "deepScan.state.nearly_ripe",
  ripe: "deepScan.state.ripe",
  overripe: "deepScan.state.overripe",
  spoiled: "deepScan.state.spoiled",
  unknown: "deepScan.state.unknown",
};

const STATE_EMOJI: Record<string, string> = {
  unripe: "🌱",
  nearly_ripe: "🌾",
  ripe: "✅",
  overripe: "⏳",
  spoiled: "🗑️",
  unknown: "❔",
};

const RECOMMENDATION_KEYS: Record<string, string> = {
  today_or_tomorrow: "deepScan.recommendation.today_or_tomorrow",
  in_a_few_days: "deepScan.recommendation.in_a_few_days",
  avoid: "deepScan.recommendation.avoid",
};

const ConfidentVerdictMaxPct = 0.8;

export const DeepScanResultStage: React.FC<DeepScanResultStageProps> = ({
  response,
  errorMessage,
  onNewScan,
}) => {
  const confidentVerdict =
    response !== null &&
    response.status === "ok" &&
    response.ripeness.state !== "unknown" &&
    response.quality.sufficientVisualEvidence;

  const showManualChecks =
    response !== null &&
    Boolean(response.manualChecks?.length) &&
    !confidentVerdict;

  return (
    <div
      data-testid="stage-S_DS_Result"
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        background: "radial-gradient(circle at 50% 30%, #1C3524 0%, #080E09 100%)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 16px",
      }}
    >
      {confidentVerdict && response ? (
        <div
          data-testid="ds-verdict-card"
          style={{
            width: "min(92vw, 380px)",
            background: "#FBFAF6",
            color: "#132418",
            borderRadius: "18px",
            padding: "18px",
            fontFamily: "Inter, system-ui, sans-serif",
            boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 700, opacity: 0.7 }}>
            {uiCopy("deepScan.outcomeVerdictHeader")}
          </div>
          <div style={{ fontSize: "22px", fontWeight: 800, marginTop: "4px" }}>
            {STATE_EMOJI[response.ripeness.state]} {uiCopy(STATE_LABEL_KEYS[response.ripeness.state])}
          </div>
          <div style={{ fontSize: "14px", marginTop: "2px" }}>
            {response.produce.displayName}
            {response.produce.variety ? ` · ${response.produce.variety}` : ""}
          </div>
          <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "6px" }}>
            {Math.round(response.ripeness.confidence * 100)}% {uiCopy("deepScan.confidenceLabel")}
          </div>
          {response.evidence.length > 0 && (
            <ul style={{ margin: "10px 0 0", paddingLeft: "18px", fontSize: "12px", lineHeight: 1.5 }}>
              {response.evidence.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          {response.recommendation?.eatWhen ? (
            <div style={{ fontSize: "12px", marginTop: "10px", fontWeight: 600 }}>
              {uiCopy("deepScan.recommendationLabel")}{" "}
              {uiCopy(RECOMMENDATION_KEYS[response.recommendation.eatWhen])}
            </div>
          ) : null}
        </div>
      ) : null}

      {response !== null && !confidentVerdict ? (
        <div
          data-testid="ds-not-enough-card"
          style={{
            width: "min(92vw, 380px)",
            background: "#FBFAF6",
            color: "#132418",
            borderRadius: "18px",
            padding: "18px",
            fontFamily: "Inter, system-ui, sans-serif",
            boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ fontSize: "18px", fontWeight: 800 }}>
            {uiCopy("deepScan.outcomeNotEnoughTitle")}
          </div>
          {response.message ? (
            <div style={{ fontSize: "13px", marginTop: "8px" }}>{response.message}</div>
          ) : null}
          {showManualChecks && response.manualChecks ? (
            <div
              data-testid="ds-manual-checks"
              style={{
                marginTop: "12px",
                background: "var(--surface-hint-ok, #EFF7EF)",
                border: "1px solid var(--surface-hint-ok-border, #BFD9BF)",
                borderRadius: "12px",
                padding: "10px 12px",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700 }}>
                {uiCopy("deepScan.manualChecksHeader")}
              </div>
              <ul style={{ margin: "6px 0 0", paddingLeft: "16px", fontSize: "12px", lineHeight: 1.5 }}>
                {response.manualChecks.map((check, i) => (
                  <li key={i}>
                    <strong>{check.trait}:</strong> {check.how} — {check.whatItMeans}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {response === null ? (
        <div
          data-testid="ds-failure-card"
          style={{
            width: "min(92vw, 380px)",
            background: "#FBFAF6",
            color: "#132418",
            borderRadius: "18px",
            padding: "18px",
            fontFamily: "Inter, system-ui, sans-serif",
            boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "30px" }}>⚠️</div>
          <div style={{ fontSize: "16px", fontWeight: 700, marginTop: "6px" }}>
            {uiCopy("deepScan.failureTitle")}
          </div>
          {errorMessage ? (
            <div style={{ fontSize: "13px", marginTop: "8px" }}>{errorMessage}</div>
          ) : null}
        </div>
      ) : null}

      <button
        data-testid="ds-new-scan-cta"
        onClick={onNewScan}
        style={{
          position: "absolute",
          bottom: "calc(max(20px, env(safe-area-inset-bottom)) + 16px)",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(84vw, 340px)",
          padding: "14px 12px",
          borderRadius: "14px",
          border: "none",
          backgroundColor: "var(--cta-primary, #2F5D34)",
          color: "#FFFFFF",
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 700,
          fontSize: "15px",
          cursor: "pointer",
        }}
      >
        {uiCopy("deepScan.startNewScan")}
      </button>
    </div>
  );
};
