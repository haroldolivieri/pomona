import React, { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Point } from "@pomona/contract";
import {
  normalizeFreehandPolygon,
  computeObjectFitCoverRect,
  type CropRect,
  type RenderedCoverRect,
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
  const imgRef = useRef<HTMLImageElement>(null);
  const [coverRect, setCoverRect] = useState<RenderedCoverRect | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [canAnalyseDrawn, setCanAnalyseDrawn] = useState<boolean>(false);
  const [normalizedResult, setNormalizedResult] = useState<{
    valid: boolean;
    cropRect: CropRect;
    areaRatio: number;
    polygonInCrop: Point[];
  } | null>(null);

  const updateCoverRect = () => {
    const vp = containerRef.current;
    const img = imgRef.current;
    if (!vp || !img) return;

    const cw = vp.clientWidth;
    const ch = vp.clientHeight;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    if (cw > 0 && ch > 0 && iw > 0 && ih > 0) {
      setCoverRect(computeObjectFitCoverRect(cw, ch, iw, ih));
    }
  };

  useEffect(() => {
    updateCoverRect();
    window.addEventListener("resize", updateCoverRect);
    return () => window.removeEventListener("resize", updateCoverRect);
  }, [photoDataUrl]);

  const getRelativeCoords = (e: React.PointerEvent<HTMLDivElement>): Point | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const cLeft = coverRect ? coverRect.left : 0;
    const cTop = coverRect ? coverRect.top : 0;
    const cWidth = coverRect ? coverRect.width : rect.width;
    const cHeight = coverRect ? coverRect.height : rect.height;

    const x = Math.max(0, Math.min(1000, Math.round(((e.clientX - rect.left - cLeft) / cWidth) * 1000)));
    const y = Math.max(0, Math.min(1000, Math.round(((e.clientY - rect.top - cTop) / cHeight) * 1000)));
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
      onAnalyse(normalizedResult.polygon, normalizedResult.cropRect);
    }
  };

  const handleWholePhoto = () => {
    onAnalyse(null, { x: 0, y: 0, width: 1000, height: 1000 });
  };

  const handleResetPoints = () => {
    setPoints([]);
    setCanAnalyseDrawn(false);
    setNormalizedResult(null);
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
        height: "100dvh",
        backgroundColor: "#000000",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Top bar */}
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
          data-testid="retake-button"
          aria-label={t("draw.retake")}
          style={{
            width: "30px",
            height: "30px",
            borderRadius: "50%",
            backgroundColor: "rgba(251, 250, 246, 0.88)",
            color: "#142117",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
            fontWeight: 700,
            backdropFilter: "blur(10px)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
            cursor: "pointer",
          }}
        >
          ←
        </button>

        <div
          style={{
            backgroundColor: "rgba(251, 250, 246, 0.88)",
            color: "#142117",
            backdropFilter: "blur(10px)",
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 600,
            fontSize: "11px",
            lineHeight: 1,
            padding: "7px 12px",
            borderRadius: "999px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          }}
        >
          {t("draw.topBarChip", { defaultValue: "Draw focus area (optional)" })}
        </div>

        <button
          onClick={handleResetPoints}
          data-testid="reset-draw-button"
          aria-label="Reset drawing"
          style={{
            width: "30px",
            height: "30px",
            borderRadius: "50%",
            backgroundColor: "rgba(251, 250, 246, 0.88)",
            color: "#142117",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
            fontWeight: 700,
            backdropFilter: "blur(10px)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
            cursor: "pointer",
          }}
        >
          ↺
        </button>
      </div>

      {/* Floating prompt pill anchored above drawn path */}
      <div
        data-testid="floating-draw-pill"
        style={{
          position: "absolute",
          top: "112px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "#F5D547",
          color: "#142117",
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 700,
          fontSize: "10.5px",
          lineHeight: 1,
          padding: "6px 12px",
          borderRadius: "999px",
          whiteSpace: "nowrap",
          boxShadow: "0 3px 10px rgba(0, 0, 0, 0.3)",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        {t("draw.floatingPrompt", { defaultValue: "✍️ Draw around the area to focus on" })}
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
          ref={imgRef}
          src={photoDataUrl}
          alt="Captured produce"
          onLoad={updateCoverRect}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            pointerEvents: "none",
          }}
        />

        {/* SVG overlay with evenodd mask aligned to rendered image */}
        <div
          data-testid="draw-overlay-wrapper"
          style={{
            position: "absolute",
            left: coverRect ? `${coverRect.left}px` : 0,
            top: coverRect ? `${coverRect.top}px` : 0,
            width: coverRect ? `${coverRect.width}px` : "100%",
            height: coverRect ? `${coverRect.height}px` : "100%",
            pointerEvents: "none",
          }}
        >
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            style={{
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            {points.length >= 3 && (
              <path
                d={`M 0 0 L 1000 0 L 1000 1000 L 0 1000 Z ${pathD}`}
                fill="rgba(0,0,0,0.5)"
                fillRule="evenodd"
              />
            )}

            {points.length > 0 && (
              <path
                d={pathD}
                fill="rgba(245, 213, 71, 0.08)"
                stroke="#F5D547"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={canAnalyseDrawn ? "none" : "8,8"}
              />
            )}
          </svg>
        </div>

        {errorMessage && (
          <div
            style={{
              position: "absolute",
              top: "150px",
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

      {/* Curved ivory bottom sheet */}
      <div
        data-testid="draw-bottom-sheet"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "var(--surface-sheet)",
          color: "var(--text-primary)",
          borderRadius: "26px 26px 0 0",
          paddingTop: "16px",
          paddingLeft: "18px",
          paddingRight: "18px",
          paddingBottom: "max(24px, env(safe-area-inset-bottom))",
          boxShadow: "0 -10px 30px rgba(0, 0, 0, 0.25)",
          zIndex: 20,
        }}
      >
        {/* Drag handle */}
        <div
          className="grab"
          style={{
            width: "36px",
            height: "4px",
            borderRadius: "4px",
            backgroundColor: "var(--text-muted)",
            opacity: 0.35,
            margin: "-4px auto 12px",
          }}
        />

        {/* Eyebrow */}
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 600,
            fontSize: "10px",
            lineHeight: 1,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          {t("draw.eyebrow", { defaultValue: "Step 1 · Focus area" })}
        </div>

        {/* Headline */}
        <div
          style={{
            fontFamily: "Fraunces, Georgia, serif",
            fontSize: "24px",
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: "-0.015em",
            margin: "6px 0 4px",
            color: "var(--text-primary)",
          }}
        >
          {t("draw.headline", { defaultValue: "Draw around your picks" })}
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 500,
            fontSize: "12px",
            lineHeight: 1.3,
            color: "var(--text-muted)",
          }}
        >
          {t("draw.subtitle", {
            defaultValue:
              "Trace with your finger so the AI only grades the produce inside your loop — or skip to scan the whole photo.",
          })}
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginTop: "16px",
          }}
        >
          <button
            onClick={handleWholePhoto}
            data-testid="whole-photo-button"
            style={{
              flex: 1,
              padding: "13px 10px",
              borderRadius: "14px",
              border: "1.5px solid #d5cebe",
              backgroundColor: "transparent",
              color: "var(--text-primary)",
              fontFamily: "Inter, system-ui, sans-serif",
              fontWeight: 700,
              fontSize: "13px",
              lineHeight: 1,
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            {t("draw.wholePhoto")}
          </button>

          <button
            onClick={handleAnalyseDrawn}
            disabled={!canAnalyseDrawn}
            data-testid="analyse-drawn-button"
            style={{
              flex: 1,
              padding: "13px 10px",
              borderRadius: "14px",
              border: "none",
              backgroundColor: "var(--cta-primary)",
              color: "#FFFFFF",
              fontFamily: "Inter, system-ui, sans-serif",
              fontWeight: 700,
              fontSize: "13px",
              lineHeight: 1,
              cursor: canAnalyseDrawn ? "pointer" : "not-allowed",
              opacity: canAnalyseDrawn ? 1 : 0.45,
              textAlign: "center",
            }}
          >
            {t("draw.analyseDrawn")}
          </button>
        </div>
      </div>
    </div>
  );
};
