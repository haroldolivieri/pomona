import { uiCopy } from "../i18n/copy";
import React from "react";
import { useTranslation } from "react-i18next";
import type { AbstentionReason, ScanStatus } from "@pomona/contract";
import {
  IconBack,
  IconClose,
  IconInfo,
  IconSparkle,
  IconAlert,
  ErrorVectorIcon,
  type ErrorVisualKind,
} from "./Icons";

export interface ScanErrorStageProps {
  status: ScanStatus | "analysis_failed" | null;
  errorMessage?: string | null;
  abstentionReason?: AbstentionReason | null;
  photoDataUrl: string | null;
  onRetake: () => void;
  onDrawFocus?: () => void;
  onDeepScan?: () => void;
  isSingleProduce?: boolean;
}

export const ScanErrorStage: React.FC<ScanErrorStageProps> = ({
  status,
  abstentionReason,
  photoDataUrl,
  onRetake,
  onDrawFocus,
  onDeepScan,
  isSingleProduce = false,
}) => {
  const { t } = useTranslation();
  const similarMaturity = status === "insufficient_evidence" && abstentionReason === "assessed_tie";
  const isSingle = status === "single_produce" || isSingleProduce;

  let iconKind: ErrorVisualKind = "alert";
  let title = t("errors.analysisFailedTitle");
  let explanation = t("errors.analysisFailed");
  let tip = t("errors.analysisFailedTip");
  let primaryCtaLabel = t("errors.analysisFailedCta");
  let primaryAction = onRetake;
  let showDrawButton = false;

  switch (status) {
    case "single_produce":
      iconKind = "search";
      title = t("errors.singleProduceCompareTitle");
      explanation = t("errors.singleProduceCompare");
      tip = t("errors.singleProduceCompareTip");
      primaryCtaLabel = t("errors.insufficientEvidenceCta");
      primaryAction = onRetake;
      break;

    case "insufficient_evidence":
      if (similarMaturity) {
        iconKind = "layers";
        title = t("errors.similarMaturityTitle");
        explanation = t("errors.similarMaturity");
        tip = t("errors.similarMaturityTip");
        primaryCtaLabel = t("errors.similarMaturityCta");
        break;
      }
      if (isSingleProduce) {
        iconKind = "search";
        title = t("errors.singleProduceCompareTitle");
        explanation = t("errors.singleProduceCompare");
        tip = t("errors.singleProduceCompareTip");
        primaryCtaLabel = t("errors.insufficientEvidenceCta");
        primaryAction = onRetake;
        break;
      }
      iconKind = "search";
      title = t("errors.insufficientEvidenceTitle");
      explanation = t("errors.insufficientEvidence");
      tip = t("errors.insufficientEvidenceTip");
      primaryCtaLabel = t("errors.insufficientEvidenceCta");
      primaryAction = onRetake;
      break;

    case "unclear_photo":
      iconKind = "camera";
      title = t("errors.unclearPhotoTitle");
      explanation = t("errors.unclearPhoto");
      tip = t("errors.unclearPhotoTip");
      primaryCtaLabel = t("errors.unclearPhotoCta");
      primaryAction = onRetake;
      showDrawButton = Boolean(onDrawFocus);
      break;

    case "no_produce":
      iconKind = "produce";
      title = t("errors.noProduceTitle");
      explanation = t("errors.noProduce");
      tip = t("errors.noProduceTip");
      primaryCtaLabel = t("errors.noProduceCta");
      primaryAction = onRetake;
      break;

    case "multiple_types":
      iconKind = "layers";
      title = t("errors.multipleTypesTitle");
      explanation = t("errors.multipleTypes");
      tip = t("errors.multipleTypesTip");
      primaryCtaLabel = t("errors.multipleTypesCta");
      primaryAction = onDrawFocus || onRetake;
      showDrawButton = Boolean(onDrawFocus);
      break;

    case "rate_limited":
      iconKind = "clock";
      title = uiCopy("copy.scanLimitReached");
      explanation = t("errors.rateLimited");
      tip = t("errors.rateLimitedTip");
      primaryCtaLabel = uiCopy("copy.backToCamera");
      primaryAction = onRetake;
      break;

    default:
      iconKind = "alert";
      title = t("errors.analysisFailedTitle");
      explanation = t("errors.analysisFailed");
      tip = t("errors.analysisFailedTip");
      primaryCtaLabel = t("errors.analysisFailedCta");
      primaryAction = onRetake;
      break;
  }

  return (
    <div
      data-testid="stage-S_ScanError"
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        background: "radial-gradient(circle at 50% 30%, #1C3524 0%, #080E09 100%)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Frozen background photo with clear contrast */}
      {photoDataUrl && (
        <img
          src={photoDataUrl}
          alt={uiCopy("copy.frozenScan")}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.65) blur(2px)",
            transform: "scale(1.05)",
          }}
        />
      )}

      {/* Top bar with back and dismiss */}
      <div
        style={{
          position: "absolute",
          top: "max(16px, env(safe-area-inset-top))",
          left: "14px",
          right: "14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 20,
        }}
      >
        <button
          onClick={onRetake}
          data-testid="error-back-button"
          aria-label={uiCopy("copy.backToCamera2")}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            backgroundColor: "rgba(251, 250, 246, 0.88)",
            color: "#142117",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
            fontWeight: 700,
            cursor: "pointer",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          }}
        >
          <IconBack size={16} />
        </button>

        <div
          data-testid="error-status-pill"
          style={{
            backgroundColor: "rgba(251, 250, 246, 0.88)",
            color: similarMaturity ? "#2F5D34" : "#8B2E2E",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 700,
            fontSize: "11px",
            lineHeight: 1,
            padding: "7px 14px",
            borderRadius: "999px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          }}
        >
          {similarMaturity ? (
            <ErrorVectorIcon kind="layers" size={12} color="#2F5D34" />
          ) : (
            <IconAlert size={12} color="#8B2E2E" />
          )}
          <span>{similarMaturity ? t("errors.similarMaturityPill") : uiCopy("copy.notice")}</span>
        </div>

        <button
          onClick={onRetake}
          data-testid="error-close-button"
          aria-label={uiCopy("copy.close")}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            backgroundColor: "rgba(251, 250, 246, 0.88)",
            color: "#142117",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
            fontWeight: 700,
            cursor: "pointer",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          }}
        >
          <IconClose size={15} />
        </button>
      </div>

      {/* Floating Center Icon Graphic */}
      <div
        data-testid="error-center-icon"
        data-icon={iconKind}
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
            width: "68px",
            height: "68px",
            borderRadius: "50%",
            backgroundColor: "rgba(251, 250, 246, 0.92)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 28px rgba(0,0,0,0.32)",
            border: "2px solid rgba(255, 255, 255, 0.55)",
          }}
        >
          <ErrorVectorIcon kind={iconKind} size={28} color="#1A261D" />
        </div>
      </div>

      {/* Bottom Sheet Card */}
      <div
        data-testid="error-bottom-sheet"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "var(--surface-sheet, #FBFAF6)",
          color: "var(--text-primary, #1A261D)",
          borderRadius: "26px 26px 0 0",
          paddingTop: "20px",
          paddingLeft: "20px",
          paddingRight: "20px",
          paddingBottom: "max(28px, env(safe-area-inset-bottom))",
          boxShadow: "0 -10px 30px rgba(0, 0, 0, 0.35)",
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 700,
            fontSize: "11px",
            lineHeight: 1,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: similarMaturity ? "var(--eyebrow-accent)" : "#B45309",
          }}
        >
          {similarMaturity
            ? t("errors.similarMaturityEyebrow")
            : status === "single_produce" || (status === "insufficient_evidence" && isSingleProduce)
            ? t("errors.singleProduceCompareEyebrow")
            : status === "insufficient_evidence"
            ? uiCopy("copy.anotherLookNeeded")
            : status === "unclear_photo"
            ? uiCopy("copy.cameraAdjustment")
            : status === "no_produce"
            ? uiCopy("copy.subjectNotFound")
            : status === "multiple_types"
            ? uiCopy("copy.multipleItems")
            : uiCopy("copy.notice")}
        </div>

        {/* Title */}
        <h2
          className="font-serif"
          style={{
            fontFamily: "Fraunces, Georgia, serif",
            fontSize: "22px",
            fontWeight: 600,
            lineHeight: 1.2,
            letterSpacing: "-0.015em",
            margin: "0 0 2px",
            color: "var(--text-primary)",
          }}
        >
          {title}
        </h2>

        {/* Explanation */}
        <p
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: "13.5px",
            lineHeight: 1.4,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          {explanation}
        </p>

        {/* Helpful Tip Box */}
        <div
          style={{
            backgroundColor: "var(--surface-group, #F2EFE6)",
            borderRadius: "14px",
            padding: "10px 12px",
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            margin: "4px 0",
          }}
        >
          <IconInfo size={16} color="var(--text-muted)" style={{ marginTop: "1px" }} />
          <span
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: "12px",
              lineHeight: 1.35,
              color: "var(--text-primary)",
            }}
          >
            {tip}
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
          {isSingle && onDeepScan ? (
            <button
              onClick={onDeepScan}
              data-testid="error-deep-scan-cta"
              style={{
                flex: 1,
                padding: "14px 12px",
                borderRadius: "14px",
                border: "none",
                backgroundColor: "#F5D547",
                color: "#132418",
                fontFamily: "Inter, system-ui, sans-serif",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(245, 213, 71, 0.35)",
                textAlign: "center",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <IconSparkle size={15} color="#132418" />
              <span>{uiCopy("deepScan.inspectCloser")}</span>
            </button>
          ) : (
            <>
              {onDeepScan && status === "insufficient_evidence" && (
                <button
                  onClick={onDeepScan}
                  data-testid="error-deep-scan-cta"
                  style={{
                    flex: 1,
                    padding: "14px 12px",
                    borderRadius: "14px",
                    border: "none",
                    backgroundColor: "#F5D547",
                    color: "#132418",
                    fontFamily: "Inter, system-ui, sans-serif",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(245, 213, 71, 0.35)",
                    textAlign: "center",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  <IconSparkle size={15} color="#132418" />
                  <span>{uiCopy("deepScan.inspectCloser")}</span>
                </button>
              )}
              {showDrawButton && onDrawFocus && (
                <button
                  onClick={onDrawFocus}
                  data-testid="error-draw-button"
                  style={{
                    flex: 1,
                    padding: "14px 12px",
                    borderRadius: "14px",
                    border: "1.5px solid #d5cebe",
                    backgroundColor: "transparent",
                    color: "var(--text-primary)",
                    fontFamily: "Inter, system-ui, sans-serif",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  {uiCopy("copy.drawAroundOne")}
                </button>
              )}

              <button
                onClick={primaryAction}
                data-testid="error-primary-cta"
                style={{
                  flex: 1,
                  padding: "14px 12px",
                  borderRadius: "14px",
                  border: "none",
                  backgroundColor: "var(--cta-primary)",
                  color: "#FFFFFF",
                  fontFamily: "Inter, system-ui, sans-serif",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(47, 93, 52, 0.3)",
                  textAlign: "center",
                }}
              >
                {primaryCtaLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
