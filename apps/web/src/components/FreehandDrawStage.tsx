import React, { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Point } from "@pomona/contract";
import {
  normalizeFreehandPolygon,
  type CropRect,
} from "../lib/image-pipeline";

export interface FreehandDrawStageProps {
  photoDataUrl: string;
  onAnalyse: (focusPolygon: Point[] | null, cropRect: CropRect | null) => void;
  onRetake: () => void;
  errorMessage?: string | null;
}

export const FreehandDrawStage: React.FC<FreehandDrawStageProps> = ({
  photoDataUrl,
  onAnalyse,
  onRetake,
  errorMessage,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [canAnalyseDrawn, setCanAnalyseDrawn] = useState<boolean>(false);
  const [normalizedResult, setNormalizedResult] = useState<{
    valid: boolean;
    cropRect: CropRect;
    areaRatio: number;
    polygonInCrop: Point[];
  } | null>(null);

  const getRelativeCoords = (e: React.PointerEvent<HTMLDivElement>): Point | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1000, Math.round(((e.clientX - rect.left) / rect.width) * 1000)));
    const y = Math.max(0, Math.min(1000, Math.round(((e.clientY - rect.top) / rect.height) * 1000)));
    return [x, y];
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    const pt = getRelativeCoords(e);
    if (pt) {
      setPoints([pt]);
      setCanAnalyseDrawn(false);
      setNormalizedResult(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing) return;
    const pt = getRelativeCoords(e);
    if (pt) {
      setPoints((prev) => [...prev, pt]);
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    if (points.length >= 3) {
      const res = normalizeFreehandPolygon(points);
      if (res.valid) {
        setCanAnalyseDrawn(true);
        setNormalizedResult(res);
      } else {
        setCanAnalyseDrawn(false);
      }
    }
  };

  const handleAnalyseDrawn = () => {
    if (normalizedResult && normalizedResult.valid) {
      onAnalyse(points, normalizedResult.cropRect);
    }
  };

  const handleWholePhoto = () => {
    onAnalyse(null, { x: 0, y: 0, width: 1000, height: 1000 });
  };

  // Build SVG path
  const pathD = points.length > 0
    ? `M ${points.map((p) => `${p[0]} ${p[1]}`).join(" L ")} Z`
    : "";

  return (
    <div
      data-testid="stage-S2_DrawFocusArea"
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
      {/* Top instruction header */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 20,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)",
        }}
      >
        <button
          onClick={onRetake}
          data-testid="retake-button"
          style={{
            backgroundColor: "rgba(255,255,255,0.2)",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "16px",
            padding: "6px 14px",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          {t("draw.retake")}
        </button>

        <span
          style={{
            color: "#FFFFFF",
            fontSize: "13px",
            fontWeight: 500,
            textAlign: "center",
            maxWidth: "70%",
          }}
        >
          {t("draw.instruction")}
        </span>
      </div>

      {/* Drawing canvas / image viewport */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          flex: 1,
          width: "100%",
          position: "relative",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <img
          src={photoDataUrl}
          alt="Captured produce"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            pointerEvents: "none",
          }}
        />

        {/* SVG overlay with evenodd mask */}
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
          }}
        >
          {points.length >= 3 && (
            <path
              d={`M 0 0 L 1000 0 L 1000 1000 L 0 1000 Z ${pathD}`}
              fill="rgba(0,0,0,0.65)"
              fillRule="evenodd"
            />
          )}

          {points.length > 0 && (
            <path
              d={pathD}
              fill="none"
              stroke="#F5D547"
              strokeWidth="6"
              strokeDasharray={canAnalyseDrawn ? "none" : "8,8"}
            />
          )}
        </svg>

        {errorMessage && (
          <div
            style={{
              position: "absolute",
              top: "70px",
              left: "20px",
              right: "20px",
              padding: "12px 16px",
              backgroundColor: "rgba(220, 38, 38, 0.9)",
              color: "#FFFFFF",
              borderRadius: "8px",
              fontSize: "14px",
              textAlign: "center",
              zIndex: 30,
            }}
          >
            {errorMessage}
          </div>
        )}
      </div>

      {/* Bottom buttons */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "20px 20px 32px",
          display: "flex",
          gap: "12px",
          zIndex: 20,
          background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)",
        }}
      >
        <button
          onClick={handleAnalyseDrawn}
          disabled={!canAnalyseDrawn}
          data-testid="analyse-drawn-button"
          style={{
            flex: 1,
            padding: "14px",
            borderRadius: "12px",
            border: "none",
            backgroundColor: canAnalyseDrawn ? "var(--accent-winner)" : "rgba(255,255,255,0.2)",
            color: canAnalyseDrawn ? "#1A261D" : "rgba(255,255,255,0.4)",
            fontWeight: 700,
            fontSize: "15px",
            cursor: canAnalyseDrawn ? "pointer" : "not-allowed",
          }}
        >
          {t("draw.analyseDrawn")}
        </button>

        <button
          onClick={handleWholePhoto}
          data-testid="whole-photo-button"
          style={{
            flex: 1,
            padding: "14px",
            borderRadius: "12px",
            border: "none",
            backgroundColor: "var(--cta-primary)",
            color: "#FFFFFF",
            fontWeight: 700,
            fontSize: "15px",
            cursor: "pointer",
          }}
        >
          {t("draw.wholePhoto")}
        </button>
      </div>
    </div>
  );
};
