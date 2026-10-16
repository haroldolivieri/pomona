import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

export interface AnalysingStageProps {
  photoDataUrl: string | null;
}

export const AnalysingStage: React.FC<AnalysingStageProps> = ({ photoDataUrl }) => {
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
      data-testid="stage-S3_Analysing"
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        backgroundColor: "#000000",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Background frozen image */}
      {photoDataUrl && (
        <img
          src={photoDataUrl}
          alt="Analysing produce"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.7)",
          }}
        />
      )}

      {/* Shimmer / Scanning beam overlay */}
      <div
        className="animate-pulse-beam"
        style={{
          position: "absolute",
          top: "40%",
          left: 0,
          right: 0,
          height: "8px",
          background: "linear-gradient(90deg, transparent 0%, #F5D547 50%, transparent 100%)",
          boxShadow: "0 0 24px 6px #F5D547",
          zIndex: 10,
        }}
      />

      {/* Top title */}
      <div
        style={{
          position: "absolute",
          top: "40px",
          left: "20px",
          right: "20px",
          textAlign: "center",
          zIndex: 20,
        }}
      >
        <h2
          className="font-serif"
          style={{
            fontSize: "24px",
            color: "#FFFFFF",
            marginBottom: "6px",
          }}
        >
          {t("analysing.headline")}
        </h2>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
          {t("analysing.subhead")}
        </p>
      </div>

      {/* Bottom Tips carousel */}
      <div
        style={{
          position: "absolute",
          bottom: "40px",
          left: "20px",
          right: "20px",
          padding: "16px 20px",
          backgroundColor: "rgba(0,0,0,0.7)",
          borderRadius: "16px",
          border: "1px solid rgba(255,255,255,0.15)",
          backdropFilter: "blur(8px)",
          zIndex: 20,
        }}
      >
        <span
          style={{
            display: "block",
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#F5D547",
            fontWeight: 700,
            marginBottom: "4px",
          }}
        >
          PRODUCE TIP
        </span>
        <p
          style={{
            color: "#FFFFFF",
            fontSize: "14px",
            lineHeight: "1.4",
            minHeight: "40px",
          }}
        >
          {tips[tipIndex] || "Evaluating produce freshness and quality..."}
        </p>
      </div>
    </div>
  );
};
