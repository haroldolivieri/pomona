import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { uiCopy } from "../i18n/copy";
import { IvoryBottomSheet, SheetEyebrow, SheetHeadline, DeepScanOval, DEEP_SCAN_OVAL_STYLE, ThreeDScanAnimation } from "./CameraCaptureUi";

export interface DeepScanAnalysingStageProps {
  backgroundUrl: string | null;
  onCancel: () => void;
}

export const DeepScanAnalysingStage: React.FC<DeepScanAnalysingStageProps> = ({
  backgroundUrl,
  onCancel,
}) => {
  const { t } = useTranslation();
  const tips: string[] = (t("analysing.tips", { returnObjects: true }) as string[]) || [];
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (tips.length <= 1) return;
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [tips.length]);

  return (
    <div
      data-testid="stage-S_DS_Analysing"
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        background: "radial-gradient(circle at 50% 30%, #1C3524 0%, #080E09 100%)",
        overflow: "hidden",
      }}
    >
      <style>
        {
          // eslint-disable-next-line i18next/no-literal-string -- Generated animation CSS, not display copy.
          `@keyframes ds-laser-sweep { 0% { top: -40px; opacity: 0.85; } 50% { top: calc(100% - 2px); opacity: 1; } 100% { top: -40px; opacity: 0.85; } }`
        }
      </style>

      {backgroundUrl ? (
        <img
          data-testid="ds-analysing-image"
          src={backgroundUrl}
          alt={uiCopy("copy.analysingProduce")}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : null}

      <div
        data-testid="ds-analysing-oval"
        style={{
          ...DEEP_SCAN_OVAL_STYLE,
          borderRadius: "24px",
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 5,
        }}
      >
        <div
          data-testid="ds-scanning-beam"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "-40px",
            height: "40px",
            animation: "ds-laser-sweep 2.4s ease-in-out infinite",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to bottom, rgba(255,242,117,0), rgba(255,242,117,0.55), rgba(245,213,71,0.9), rgba(255,242,117,0.55), rgba(255,242,117,0))",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: "-2px",
              height: "3px",
              background: "#FFF275",
              boxShadow: "0 0 10px 2px rgba(255,242,117,0.9)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: "-1px",
              height: "1px",
              background: "#FFFFFF",
            }}
          />
        </div>
      </div>

      <DeepScanOval testId="ds-analysing-oval-outline" style={{ zIndex: 10 }} />

      <div
        style={{
          position: "absolute",
          top: "max(14px, env(safe-area-inset-top))",
          left: "14px",
          right: "14px",
          display: "flex",
          justifyContent: "flex-end",
          zIndex: 20,
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          data-testid="ds-analysing-cancel"
          aria-label={uiCopy("copy.cancelAnalysis")}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            backgroundColor: "rgba(251, 250, 246, 0.85)",
            color: "var(--text-primary, #142117)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            fontWeight: 700,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
            border: "none",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      <IvoryBottomSheet testId="ds-analysing-sheet">
        <SheetEyebrow>{uiCopy("copy.pomonaVision")}</SheetEyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 0 4px" }}>
          <ThreeDScanAnimation testId="ds-analysing-3d-scan" size={22} />
          <SheetHeadline style={{ margin: 0 }}>{uiCopy("copy.checkingRipeness")}</SheetHeadline>
        </div>
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 500,
            fontSize: "12px",
            lineHeight: 1.3,
            color: "var(--text-muted)",
          }}
        >
          {uiCopy("camera.promptSubtitle")}
        </div>
        {tips.length > 0 && (
          <div
            style={{
              marginTop: "4px",
              padding: "10px 12px",
              backgroundColor: "var(--surface-chip)",
              borderRadius: "12px",
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
            }}
          >
            <span
              style={{
                fontFamily: "Inter, system-ui, sans-serif",
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#9A740A",
                fontWeight: 700,
                flexShrink: 0,
                marginTop: "1px",
              }}
            >
              {uiCopy("copy.tip")}
            </span>
            <p
              style={{
                fontFamily: "Inter, system-ui, sans-serif",
                color: "var(--text-primary)",
                fontSize: "12px",
                lineHeight: "1.35",
                margin: 0,
              }}
            >
              {tips[tipIndex] || uiCopy("copy.evaluatingProduceFreshnessAndQuality")}
            </p>
          </div>
        )}
      </IvoryBottomSheet>
    </div>
  );
};
