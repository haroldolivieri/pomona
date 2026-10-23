import React from "react";
import { uiCopy } from "../i18n/copy";
import { IvoryBottomSheet, SheetEyebrow, SheetHeadline } from "./CameraCaptureUi";
import {
  StorageCardsRow,
  SeasonalityPanelCard,
  TraitChips,
  ResultTopBar,
  CircularScoreMeter,
} from "./ResultCards";
import type { DeepScanResponse } from "@pomona/contract";

// Defensive: the supplier-facing evidence may still name the composite position that
// surfaced a trait ("Tile 3: blue-black skin"); surface only the trait part.
const VIEW_FREE_PREFIX = /^\s*\b(?:tiles?|views?|frames?)\s*#?\s*\d+\s*:\s*(.*)$/i;

export interface DeepScanResultStageProps {
  response: DeepScanResponse | null;
  errorMessage?: string | null;
  backgroundPhotoUrl?: string | null;
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
  backgroundPhotoUrl,
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
      }}
    >
      {backgroundPhotoUrl ? (
        <img
          data-testid="ds-result-background"
          src={backgroundPhotoUrl}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.45) saturate(0.9)",
            zIndex: 0,
          }}
        />
      ) : null}

      {/* Same contextual top bar as the original scan result (✕ close, produce chip, ↻ retake). */}
      <ResultTopBar
        onClose={onNewScan}
        closeAria={uiCopy("copy.resetAndScanAgain")}
        onRetake={onNewScan}
        retakeAria={uiCopy("copy.retakePhoto")}
        chip={response?.produce?.displayName ?? null}
      />

      <IvoryBottomSheet testId="ds-result-sheet">
        {confidentVerdict && response ? (
          <div data-testid="ds-verdict-card">
            {/* Same header as the original scan result: eyebrow, serif headline, muted
                subtitle and the circular score meter — never a recreated style. */}
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "var(--eyebrow-accent)",
                textTransform: "uppercase",
                display: "block",
                marginBottom: "4px",
              }}
            >
              {uiCopy("deepScan.outcomeVerdictHeader")}
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div>
                <h1
                  className="font-serif"
                  style={{
                    fontSize: "30px",
                    fontWeight: 700,
                    lineHeight: 1.15,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.015em",
                  }}
                >
                  {STATE_EMOJI[response.ripeness.state]} {uiCopy(STATE_LABEL_KEYS[response.ripeness.state])}
                </h1>
                <p style={{ fontSize: "12.5px", color: "var(--text-muted)", marginTop: "2px" }}>
                  {response.produce.displayName}
                  {response.produce.variety ? ` · ${response.produce.variety}` : ""}
                </p>
              </div>
              <CircularScoreMeter score={Math.round(response.ripeness.confidence * 100) / 10} />
            </div>
            {/* Visible-trait chips, exactly like the original scan result. The shopper
                experienced one continuous scan — evidence never mentions views/frames. */}
            <TraitChips
              labels={response.evidence
                .map((line) => VIEW_FREE_PREFIX.exec(line)?.[1] ?? line)
                .filter((trait) => !/\b(tile|view|frame|composite)s?\b/i.test(trait))}
              />
            {response.seasonality ? <SeasonalityPanelCard seasonality={response.seasonality} /> : null}
            {response.recommendation?.eatWhen && !response.afterPurchase ? (
              <div style={{ fontSize: "12px", marginTop: "10px", fontWeight: 600 }}>
                {uiCopy("deepScan.recommendationLabel")}{" "}
                {uiCopy(RECOMMENDATION_KEYS[response.recommendation.eatWhen])}
              </div>
            ) : null}
            {response.afterPurchase ? (
              <StorageCardsRow
                afterPurchase={response.afterPurchase}
                eatWithinOverride={response.recommendation?.eatWhen === "avoid" ? uiCopy("deepScan.recommendation.avoid") : null}
              />
            ) : null}
          </div>
        ) : null}

        {response !== null && !confidentVerdict ? (
          <div data-testid="ds-not-enough-card">
            <SheetHeadline>{uiCopy("deepScan.outcomeNotEnoughTitle")}</SheetHeadline>
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
          <div data-testid="ds-failure-card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: "30px" }}>⚠️</div>
            <SheetHeadline>{uiCopy("deepScan.failureTitle")}</SheetHeadline>
            {errorMessage ? (
              <div style={{ fontSize: "13px", marginTop: "8px" }}>{errorMessage}</div>
            ) : null}
          </div>
        ) : null}

        <button
          data-testid="ds-new-scan-cta"
          onClick={onNewScan}
          style={{
            marginTop: "6px",
            width: "100%",
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
      </IvoryBottomSheet>
    </div>
  );
};
