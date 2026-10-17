import React from "react";
import { useTranslation } from "react-i18next";
import type { ScanStatus } from "@pomona/contract";

export interface ScanErrorStageProps {
  status: ScanStatus | "analysis_failed" | null;
  errorMessage?: string | null;
  photoDataUrl: string | null;
  onRetake: () => void;
  onDrawFocus?: () => void;
}

export const ScanErrorStage: React.FC<ScanErrorStageProps> = ({
  status,
  errorMessage,
  photoDataUrl,
  onRetake,
  onDrawFocus,
}) => {
  const { t } = useTranslation();

  let icon = "⚠️";
  let title = t("errors.analysisFailedTitle");
  let explanation = errorMessage || t("errors.analysisFailed");
  let tip = t("errors.analysisFailedTip");
  let primaryCtaLabel = t("errors.analysisFailedCta");
  let primaryAction = onRetake;
  let showDrawButton = false;

  switch (status) {
    case "unclear_photo":
      icon = "📷";
      title = t("errors.unclearPhotoTitle");
      explanation = errorMessage || t("errors.unclearPhoto");
      tip = t("errors.unclearPhotoTip");
      primaryCtaLabel = t("errors.unclearPhotoCta");
      primaryAction = onRetake;
      break;

    case "no_produce":
      icon = "🍎";
      title = t("errors.noProduceTitle");
      explanation = errorMessage || t("errors.noProduce");
      tip = t("errors.noProduceTip");
      primaryCtaLabel = t("errors.noProduceCta");
      primaryAction = onRetake;
      break;

    case "multiple_types":
      icon = "🧺";
      title = t("errors.multipleTypesTitle");
      explanation = errorMessage || t("errors.multipleTypes");
      tip = t("errors.multipleTypesTip");
      primaryCtaLabel = t("errors.multipleTypesCta");
      primaryAction = onDrawFocus || onRetake;
      showDrawButton = Boolean(onDrawFocus);
      break;

    case "rate_limited":
      icon = "⏳";
      title = "Scan limit reached";
      explanation = errorMessage || t("errors.rateLimited");
      tip = "You have used all daily scans for this device. Limits reset tomorrow morning.";
      primaryCtaLabel = "Back to Camera";
      primaryAction = onRetake;
      break;

    default:
      icon = "⚠️";
      title = t("errors.analysisFailedTitle");
      explanation = errorMessage || t("errors.analysisFailed");
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
          alt="Frozen scan"
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
          aria-label="Back to camera"
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
          ←
        </button>

        <div
          data-testid="error-status-pill"
          style={{
            backgroundColor: "rgba(251, 250, 246, 0.88)",
            color: "#8B2E2E",
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
          <span style={{ fontSize: "12px" }}>⚠️</span>
          <span>Notice</span>
        </div>

        <button
          onClick={onRetake}
          data-testid="error-close-button"
          aria-label="Close"
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
          ✕
        </button>
      </div>

      {/* Floating Center Icon Graphic */}
      <div
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
          {icon}
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
        {/* Grab bar */}
        <div
          style={{
            width: "36px",
            height: "4px",
            borderRadius: "4px",
            backgroundColor: "var(--text-muted)",
            opacity: 0.35,
            margin: "-6px auto 8px",
          }}
        />

        {/* Eyebrow */}
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 700,
            fontSize: "11px",
            lineHeight: 1,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#B45309",
          }}
        >
          {status === "unclear_photo"
            ? "Camera Adjustment"
            : status === "no_produce"
            ? "Subject Not Found"
            : status === "multiple_types"
            ? "Multiple Items"
            : "Notice"}
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
            backgroundColor: "var(--surface-hint-warn)",
            border: "1px solid var(--surface-hint-warn-border)",
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
            {tip}
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
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
              Draw Around One
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
        </div>
      </div>
    </div>
  );
};
