import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { uiCopy } from "../i18n/copy";

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

  const ovalLayout: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "min(72vw, 300px)",
    height: "min(96vw, 400px)",
    transform: "translate(-50%, -54%)",
  };

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

      <div
        data-testid="ds-analysing-oval"
        style={{
          ...ovalLayout,
          borderRadius: "50%",
          overflow: "hidden",
          boxShadow: "0 0 0 9999px rgba(8, 14, 9, 0.72)",
          pointerEvents: "none",
        }}
      >
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
              filter: "brightness(0.75)",
            }}
          />
        ) : null}
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

      <div data-testid="ds-analysing-oval-outline" style={{ ...ovalLayout, border: "3px solid rgba(251, 250, 246, 0.9)", borderRadius: "50%", pointerEvents: "none", zIndex: 10 }} />

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
            padding: "8px 14px",
            borderRadius: "999px",
            border: "1px solid rgba(251,250,246,0.4)",
            backgroundColor: "rgba(8,14,9,0.5)",
            color: "#FBFAF6",
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {uiCopy("copy.cancelAnalysis")}
        </button>
      </div>

      <div
        data-testid="ds-analysing-sheet"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          boxShadow: "0 -10px 30px rgba(0, 0, 0, 0.25)",
          backgroundColor: "var(--surface-sheet, #FBFAF6)",
          color: "var(--text-primary, #1A261D)",
          borderRadius: "26px 26px 0 0",
          paddingTop: "16px",
          paddingLeft: "20px",
          paddingRight: "20px",
          paddingBottom: "max(28px, env(safe-area-inset-bottom))",
          zIndex: 20,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: "36px",
            height: "4px",
            borderRadius: "4px",
            backgroundColor: "var(--text-muted, #6B7268)",
            opacity: 0.35,
            margin: "-4px auto 12px",
          }}
        />
        <div style={{ fontSize: "13px", fontWeight: 600 }}>
          {tips[tipIndex]}
        </div>
      </div>
    </div>
  );
};
