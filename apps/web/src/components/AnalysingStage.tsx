import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Point } from "@pomona/contract";
import type { CropRect } from "../lib/image-pipeline";

export interface AnalysingStageProps {
  photoDataUrl: string | null;
  focusPolygon?: Point[] | null;
  cropRect?: CropRect | null;
}

export const AnalysingStage: React.FC<AnalysingStageProps> = ({
  photoDataUrl,
  focusPolygon,
  cropRect,
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

  // If a drawn focus area exists, bound the scanning region to its cropRect or bounding box
  // Otherwise, default to full frame (0..1000)
  const isDrawnArea = Boolean(focusPolygon && focusPolygon.length >= 3 && cropRect);
  const scanBox = isDrawnArea && cropRect
    ? {
        left: `${(cropRect.x / 1000) * 100}%`,
        top: `${(cropRect.y / 1000) * 100}%`,
        width: `${(cropRect.width / 1000) * 100}%`,
        height: `${(cropRect.height / 1000) * 100}%`,
      }
    : {
        left: "0%",
        top: "0%",
        width: "100%",
        height: "100%",
      };

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

      {/* Dim mask outside drawn focus polygon if applicable */}
      {isDrawnArea && focusPolygon && (
        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          <path
            d={`M 0 0 L 1000 0 L 1000 1000 L 0 1000 Z M ${focusPolygon
              .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p[0]} ${p[1]}`)
              .join(" ")} Z`}
            fill="rgba(0,0,0,0.6)"
            fillRule="evenodd"
          />
          {/* Glowing polygon outline */}
          <polygon
            points={focusPolygon.map((p) => `${p[0]},${p[1]}`).join(" ")}
            fill="none"
            stroke="#F5D547"
            strokeWidth="3"
            strokeDasharray="6,4"
          />
        </svg>
      )}

      {/* Bounded Laser Sweep Scanning Overlay */}
      <div
        style={{
          position: "absolute",
          left: scanBox.left,
          top: scanBox.top,
          width: scanBox.width,
          height: scanBox.height,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 10,
          border: isDrawnArea ? "1px solid rgba(245, 213, 71, 0.4)" : "none",
          borderRadius: isDrawnArea ? "8px" : "0",
        }}
      >
        <div
          className="animate-scan-laser"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, transparent 0%, #FFF275 30%, #F5D547 50%, #FFF275 70%, transparent 100%)",
            boxShadow: "0 0 20px 4px #F5D547, 0 0 6px 1px #FFFFFF",
          }}
        />
      </div>

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
