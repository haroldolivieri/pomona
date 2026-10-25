import React, { useState, useCallback } from "react";
import { uiCopy, currentDisplayLocale } from "../i18n/copy";
import {
  InteractiveResultBottomSheet,
  SheetEyebrow,
  SheetHeadline,
  PrimaryCta,
  SecondaryCta,
  type SheetDragHandlers,
} from "./CameraCaptureUi";
import {
  StorageCardsRow,
  SeasonalityPanelCard,
  TraitChips,
  ResultTopBar,
  CircularScoreMeter,
  TactileChecksCard,
} from "./ResultCards";
import { resolveTactileChecks, type DeepScanResponse, type DeepScanLocalRejectReason } from "@pomona/contract";

// Defensive: the supplier-facing evidence may still name the composite position that
// surfaced a trait ("Tile 3: blue-black skin"); surface only the trait part.
const VIEW_FREE_PREFIX = /^\s*\b(?:tiles?|views?|frames?)\s*#?\s*\d+\s*:\s*(.*)$/i;

export interface DeepScanResultStageProps {
  response: DeepScanResponse | null;
  errorMessage?: string | null;
  localRejectReason?: DeepScanLocalRejectReason | null;
  backgroundPhotoUrl?: string | null;
  onNewScan: () => void;
  onRetry?: () => void;
}

function stateLabel(state: string): string {
  switch (state) {
    case "unripe": return uiCopy("deepScan.state.unripe");
    case "nearly_ripe": return uiCopy("deepScan.state.nearly_ripe");
    case "ripe": return uiCopy("deepScan.state.ripe");
    case "overripe": return uiCopy("deepScan.state.overripe");
    case "spoiled": return uiCopy("deepScan.state.spoiled");
    default: return uiCopy("deepScan.state.unknown");
  }
}

function recommendationLabel(eatWhen: string): string {
  switch (eatWhen) {
    case "today_or_tomorrow": return uiCopy("deepScan.recommendation.today_or_tomorrow");
    case "in_a_few_days": return uiCopy("deepScan.recommendation.in_a_few_days");
    case "avoid": return uiCopy("deepScan.recommendation.avoid");
    default: return "";
  }
}

export function resolvePeakRipeness(response: DeepScanResponse | null): string | null {
  if (!response) return null;

  if (
    response.ripeness.state === "overripe" ||
    response.ripeness.state === "spoiled" ||
    response.recommendation?.eatWhen === "avoid"
  ) {
    return uiCopy("deepScan.peakRipeness.pastPeak");
  }

  const readyIn = response.afterPurchase?.readyInDays;
  if (readyIn) {
    const { min, max } = readyIn;
    if (min === 0 && max === 0) {
      return uiCopy("deepScan.peakRipeness.readyNow");
    }
    if (min === 0 && max === 1) {
      return uiCopy("deepScan.peakRipeness.todayOrTomorrow");
    }
    if (min === max) {
      return uiCopy("deepScan.peakRipeness.inDays", { count: min });
    }
    return uiCopy("deepScan.peakRipeness.inRange", { min, max });
  }

  if (response.recommendation?.eatWhen === "today_or_tomorrow") {
    return uiCopy("deepScan.peakRipeness.todayOrTomorrow");
  }
  if (response.recommendation?.eatWhen === "in_a_few_days") {
    return uiCopy("deepScan.peakRipeness.inAFewDays");
  }

  if (response.ripeness.state === "ripe") {
    return uiCopy("deepScan.peakRipeness.readyNow");
  }
  if (response.ripeness.state === "nearly_ripe") {
    return uiCopy("deepScan.peakRipeness.todayOrTomorrow");
  }
  if (response.ripeness.state === "unripe") {
    return uiCopy("deepScan.peakRipeness.inAFewDays");
  }

  return null;
}

function isNoProduceOutcome(response: DeepScanResponse): boolean {
  if (response.status === "no_produce") return true;
  if (!response.message) return false;
  const msg = response.message.toLowerCase();
  return (
    msg.includes("no fresh produce") ||
    msg.includes("no produce") ||
    msg.includes("não há frutas") ||
    msg.includes("nenhum produto") ||
    msg.includes("não consegui identificar")
  );
}

function isUnclearPhotoOutcome(response: DeepScanResponse): boolean {
  if (response.status === "unclear_photo") return true;
  if (!response.message) return false;
  const msg = response.message.toLowerCase();
  return (
    msg.includes("obscured") ||
    msg.includes("blurry") ||
    msg.includes("não é possível ver bem") ||
    msg.includes("desfocada") ||
    msg.includes("não está nítida")
  );
}

function resolveOutcomeHeadline(
  response: DeepScanResponse | null,
  localRejectReason?: DeepScanLocalRejectReason | null
): string {
  if (localRejectReason === "all_blurry" || localRejectReason === "too_dark_or_bright") {
    return uiCopy("errors.unclearPhotoTitle");
  }
  if (localRejectReason === "not_rotated") {
    return uiCopy("deepScan.outcomeNotEnoughTitle");
  }
  if (!response) {
    return uiCopy("deepScan.failureTitle");
  }
  if (response.status === "no_produce" || isNoProduceOutcome(response)) {
    return uiCopy("errors.noProduceTitle");
  }
  if (response.status === "unclear_photo" || isUnclearPhotoOutcome(response)) {
    return uiCopy("errors.unclearPhotoTitle");
  }
  if (response.status === "multiple_types") {
    return uiCopy("errors.multipleTypesTitle");
  }
  if (response.status === "rate_limited") {
    return uiCopy("copy.scanLimitReached");
  }
  if (response.status === "analysis_failed") {
    return uiCopy("errors.analysisFailedTitle");
  }
  return uiCopy("deepScan.outcomeNotEnoughTitle");
}

function resolveErrorIcon(
  response: DeepScanResponse | null,
  localRejectReason?: DeepScanLocalRejectReason | null
): string {
  if (localRejectReason === "all_blurry" || localRejectReason === "too_dark_or_bright") {
    return "📷";
  }
  if (localRejectReason === "not_rotated") {
    return "🔄";
  }
  if (!response) return "⚠️";
  if (response.status === "no_produce" || isNoProduceOutcome(response)) return "🍎";
  if (response.status === "unclear_photo" || isUnclearPhotoOutcome(response)) return "📷";
  if (response.status === "multiple_types") return "🧺";
  if (response.status === "rate_limited") return "⏳";
  if (response.status === "insufficient_evidence") return "🔎";
  if (response.status === "analysis_failed") return "⚠️";
  return "🔎";
}

function resolveErrorEyebrow(
  response: DeepScanResponse | null,
  localRejectReason?: DeepScanLocalRejectReason | null
): string {
  if (localRejectReason === "not_rotated") {
    return uiCopy("copy.anotherLookNeeded");
  }
  if (localRejectReason === "all_blurry" || localRejectReason === "too_dark_or_bright") {
    return uiCopy("copy.cameraAdjustment");
  }
  if (!response) return uiCopy("copy.notice");
  if (response.status === "no_produce" || isNoProduceOutcome(response)) return uiCopy("copy.subjectNotFound");
  if (response.status === "unclear_photo" || isUnclearPhotoOutcome(response)) return uiCopy("copy.cameraAdjustment");
  if (response.status === "multiple_types") return uiCopy("copy.multipleItems");
  if (response.status === "rate_limited") return uiCopy("copy.notice");
  if (response.status === "insufficient_evidence") return uiCopy("copy.anotherLookNeeded");
  return uiCopy("copy.notice");
}

function resolveErrorTip(
  response: DeepScanResponse | null,
  localRejectReason?: DeepScanLocalRejectReason | null
): string {
  if (localRejectReason === "not_rotated") {
    return uiCopy("deepScan.insufficientEvidenceTip");
  }
  if (localRejectReason === "all_blurry" || localRejectReason === "too_dark_or_bright") {
    return uiCopy("errors.unclearPhotoTip");
  }
  if (!response) return uiCopy("errors.analysisFailedTip");
  if (response.status === "no_produce" || isNoProduceOutcome(response)) return uiCopy("errors.noProduceTip");
  if (response.status === "unclear_photo" || isUnclearPhotoOutcome(response)) return uiCopy("errors.unclearPhotoTip");
  if (response.status === "multiple_types") return uiCopy("errors.multipleTypesTip");
  if (response.status === "rate_limited") return uiCopy("errors.rateLimitedTip");
  if (response.status === "insufficient_evidence") return uiCopy("deepScan.insufficientEvidenceTip");
  return uiCopy("errors.analysisFailedTip");
}

export const DeepScanResultStage: React.FC<DeepScanResultStageProps> = ({
  response,
  errorMessage,
  localRejectReason,
  backgroundPhotoUrl,
  onNewScan,
  onRetry,
}) => {
  const confidentVerdict =
    response !== null &&
    response.status === "ok" &&
    response.ripeness.state !== "unknown" &&
    response.quality.sufficientVisualEvidence;

  const peakRipenessText = confidentVerdict ? resolvePeakRipeness(response) : null;

  const hasProduce =
    response !== null &&
    !isNoProduceOutcome(response) &&
    !isUnclearPhotoOutcome(response);

  const tactileChecks = hasProduce && response
    ? resolveTactileChecks(
        response.produce?.type || response.produce?.displayName,
        currentDisplayLocale(),
        response.manualChecks
      )
    : [];

  const showProduceChip =
    Boolean(response && hasProduce && response.produce?.displayName && response.produce?.type !== "unknown");

  const [dragHandlers, setDragHandlers] = useState<SheetDragHandlers | null>(null);
  const [sheetDragState, setSheetDragState] = useState<{
    isDragging: boolean;
    currentTranslate: number;
    defaultTranslate: number;
  }>({
    isDragging: false,
    currentTranslate: 0,
    defaultTranslate: 0,
  });

  const handleDragSync = useCallback((isDragging: boolean, currentTranslate: number, defaultTranslate: number) => {
    setSheetDragState({ isDragging, currentTranslate, defaultTranslate });
  }, []);

  const livePhotoPanY = confidentVerdict
    ? Math.round((sheetDragState.currentTranslate - sheetDragState.defaultTranslate) * 0.25)
    : 0;

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
        <div
          data-testid="ds-result-photo-viewport"
          onTouchStart={(e) => dragHandlers?.handleDragStart(e.touches[0].clientY)}
          onTouchMove={(e) => dragHandlers?.handleDragMove(e.touches[0].clientY)}
          onTouchEnd={(e) => dragHandlers?.handleDragEnd(e.changedTouches?.[0]?.clientY)}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse") dragHandlers?.handleDragStart(e.clientY);
          }}
          onPointerMove={(e) => {
            if (e.pointerType === "mouse") dragHandlers?.handleDragMove(e.clientY);
          }}
          onPointerUp={(e) => {
            if (e.pointerType === "mouse") dragHandlers?.handleDragEnd(e.clientY);
          }}
          style={{
            position: "absolute",
            top: "-40px",
            left: 0,
            right: 0,
            bottom: "-40px",
            height: "calc(100% + 80px)",
            overflow: "hidden",
            zIndex: 0,
            touchAction: "none",
            userSelect: "none",
            transform: `translate3d(0, ${livePhotoPanY}px, 0)`,
            transition: sheetDragState.isDragging
              ? "none"
              : "transform 0.32s cubic-bezier(0.2, 0.0, 0, 1.0)",
            willChange: "transform",
            cursor: confidentVerdict ? (sheetDragState.isDragging ? "grabbing" : "grab") : "default",
          }}
        >
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
              filter: confidentVerdict ? undefined : "brightness(0.65)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: confidentVerdict ? "rgba(0, 0, 0, 0.1)" : "rgba(0, 0, 0, 0.25)",
              pointerEvents: "none",
            }}
          />
        </div>
      ) : null}

      {/* Floating Center Icon Graphic on non-confident outcomes, identical to ScanErrorStage */}
      {!confidentVerdict && (
        <div
          data-testid="error-center-icon"
          style={{
            position: "absolute",
            top: "30%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              backgroundColor: "rgba(251, 250, 246, 0.95)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "36px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
              border: "3px solid #F5D547",
            }}
          >
            {resolveErrorIcon(response, localRejectReason)}
          </div>
        </div>
      )}

      {/* Contextual top bar (close, produce chip when identified, retake). */}
      <ResultTopBar
        onClose={onNewScan}
        closeAria={uiCopy("copy.resetAndScanAgain")}
        onRetake={onNewScan}
        retakeAria={uiCopy("copy.retakePhoto")}
        chip={showProduceChip && response ? (response.produce.displayName ?? null) : null}
      />

      <InteractiveResultBottomSheet
        testId="ds-result-sheet"
        coreTestId={confidentVerdict && Boolean(response) ? "ds-verdict-card" : undefined}
        isExpandable={confidentVerdict && Boolean(response)}
        onRegisterDragHandlers={setDragHandlers}
        onDragSync={handleDragSync}
        peekContent={
          confidentVerdict && response ? (
            <div>
              {/* Same header as the original scan result: eyebrow, serif headline, muted
                  subtitle and the circular score meter: never a recreated style. */}
              <SheetEyebrow style={{ color: "var(--eyebrow-accent)" }}>
                {uiCopy("deepScan.outcomeVerdictHeader")}
              </SheetEyebrow>
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
                    {stateLabel(response.ripeness.state)}
                  </h1>
                  <p style={{ fontSize: "12.5px", color: "var(--text-muted)", marginTop: "2px" }}>
                    {response.produce.displayName}
                    {response.produce.variety ? ` · ${response.produce.variety}` : ""}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <CircularScoreMeter score={Math.round(response.ripeness.confidence * 100) / 10} />
                  <span
                    data-testid="ds-visual-score-label"
                    style={{
                      fontSize: "9.5px",
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      marginTop: "3px",
                      letterSpacing: "0.03em",
                      textTransform: "uppercase",
                    }}
                  >
                    {uiCopy("deepScan.visualScoreLabel")}
                  </span>
                </div>
              </div>
              {peakRipenessText ? (
                <div
                  data-testid="ds-peak-ripeness-badge"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    marginTop: "6px",
                    marginBottom: "4px",
                    padding: "3px 9px",
                    borderRadius: "999px",
                    backgroundColor: "var(--surface-badge, rgba(0, 0, 0, 0.05))",
                    border: "1px solid var(--surface-card-border, rgba(0, 0, 0, 0.08))",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  <span aria-hidden="true">🎯</span>{" "}
                  <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                    {uiCopy("deepScan.peakRipeness.badgeLabel")}
                  </span>{" "}
                  <span>{peakRipenessText}</span>
                </div>
              ) : null}
              {/* Visible-trait chips, exactly like the original scan result. The shopper
                  experienced one continuous scan: evidence never mentions views/frames. */}
              <TraitChips
                labels={response.evidence
                  .map((line) => VIEW_FREE_PREFIX.exec(line)?.[1] ?? line)
                  .filter((trait) => !/\b(tile|view|frame|composite)s?\b/i.test(trait))}
              />
            </div>
          ) : (
            <>
              {response !== null && !confidentVerdict ? (
                <div data-testid="ds-not-enough-card" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <SheetEyebrow style={{ color: "#B45309" }}>
                    {resolveErrorEyebrow(response, localRejectReason)}
                  </SheetEyebrow>
                  <SheetHeadline>{resolveOutcomeHeadline(response, localRejectReason)}</SheetHeadline>
                  {response.message ? (
                    <p style={{ fontSize: "13.5px", lineHeight: 1.4, margin: "2px 0 0", color: "var(--text-primary)" }}>
                      {response.message}
                    </p>
                  ) : null}

                  {/* Helpful Tip Box */}
                  <div
                    data-testid="ds-error-tip-box"
                    style={{
                      backgroundColor: "var(--surface-hint-warn, #FFF4D6)",
                      border: "1px solid var(--surface-hint-warn-border, #E8D48B)",
                      borderRadius: "14px",
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      margin: "4px 0",
                    }}
                  >
                    <span style={{ fontSize: "16px", lineHeight: 1.2 }}>💡</span>
                    <span
                      style={{
                        fontFamily: "Inter, system-ui, sans-serif",
                        fontSize: "12px",
                        lineHeight: 1.35,
                        color: "var(--text-primary)",
                      }}
                    >
                      {resolveErrorTip(response, localRejectReason)}
                    </span>
                  </div>

                  {tactileChecks.length > 0 ? (
                    <TactileChecksCard
                      checks={tactileChecks}
                      defaultOpen={false}
                      testId="ds-manual-checks"
                    />
                  ) : null}
                </div>
              ) : null}

              {response === null ? (
                <div data-testid="ds-failure-card" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <SheetEyebrow style={{ color: "#B45309" }}>
                    {resolveErrorEyebrow(response, localRejectReason)}
                  </SheetEyebrow>
                  <SheetHeadline>{resolveOutcomeHeadline(response, localRejectReason)}</SheetHeadline>
                  {errorMessage ? (
                    <p style={{ fontSize: "13.5px", lineHeight: 1.4, margin: "2px 0 0", color: "var(--text-primary)" }}>
                      {errorMessage}
                    </p>
                  ) : null}
                  <div
                    data-testid="ds-error-tip-box"
                    style={{
                      backgroundColor: "var(--surface-hint-warn, #FFF4D6)",
                      border: "1px solid var(--surface-hint-warn-border, #E8D48B)",
                      borderRadius: "14px",
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      margin: "4px 0",
                    }}
                  >
                    <span style={{ fontSize: "16px", lineHeight: 1.2 }}>💡</span>
                    <span
                      style={{
                        fontFamily: "Inter, system-ui, sans-serif",
                        fontSize: "12px",
                        lineHeight: 1.35,
                        color: "var(--text-primary)",
                      }}
                    >
                      {resolveErrorTip(response, localRejectReason)}
                    </span>
                  </div>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                {response === null && onRetry ? (
                  <PrimaryCta testId="ds-retry-cta" onClick={onRetry}>
                    {uiCopy("result.tryAgain")}
                  </PrimaryCta>
                ) : null}

                {response === null && onRetry ? (
                  <SecondaryCta testId="ds-new-scan-cta" onClick={onNewScan}>
                    {confidentVerdict
                      ? uiCopy("deepScan.startNewScan")
                      : uiCopy("result.tryAgain")}
                  </SecondaryCta>
                ) : (
                  <PrimaryCta testId="ds-new-scan-cta" onClick={onNewScan}>
                    {confidentVerdict
                      ? uiCopy("deepScan.startNewScan")
                      : uiCopy("result.tryAgain")}
                  </PrimaryCta>
                )}
              </div>
            </>
          )
        }
        expandedContent={
          confidentVerdict && response ? (
            <>
              {response.seasonality ? <SeasonalityPanelCard seasonality={response.seasonality} /> : null}
              {response.afterPurchase ? (
                <StorageCardsRow
                  afterPurchase={response.afterPurchase}
                  eatWithinOverride={response.recommendation?.eatWhen === "avoid" ? uiCopy("deepScan.recommendation.avoid") : null}
                  peakRipenessText={peakRipenessText}
                />
              ) : peakRipenessText ? (
                <div
                  data-testid="ds-recommendation-card"
                  style={{
                    backgroundColor: "var(--surface-card)",
                    border: "1px solid var(--surface-card-border)",
                    borderRadius: "13px",
                    padding: "8px 12px",
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr)",
                    gap: "4px",
                    alignItems: "center",
                    marginTop: "4px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                    }}
                  >
                    {uiCopy("deepScan.peakRipeness.title")}
                  </span>
                  <strong style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {peakRipenessText}
                  </strong>
                </div>
              ) : null}
              {tactileChecks.length > 0 ? (
                <TactileChecksCard
                  checks={tactileChecks}
                  defaultOpen={false}
                  testId="ds-confident-tactile-checks"
                />
              ) : null}
              <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                <PrimaryCta testId="ds-new-scan-cta" onClick={onNewScan}>
                  {uiCopy("deepScan.startNewScan")}
                </PrimaryCta>
              </div>
            </>
          ) : null
        }
      />
    </div>
  );
};
