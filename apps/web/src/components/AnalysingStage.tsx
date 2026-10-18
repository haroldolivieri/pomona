import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Point } from "@pomona/contract";
import type { CropRect } from "../lib/image-pipeline";

export type CoordinatePoint = Point | { x: number; y: number };

export interface AnalysingStageProps {
  photoDataUrl: string | null;
  focusPolygon?: CoordinatePoint[] | null;
  cropRect?: CropRect | null;
  onCancel?: () => void;
  remainingScans?: number;
  onQuotaClick?: () => void;
}

function normalizePoint(p: CoordinatePoint): [number, number] {
  if (Array.isArray(p)) {
    return [p[0], p[1]];
  }
  return [p.x, p.y];
}

export const AnalysingStage: React.FC<AnalysingStageProps> = ({
  photoDataUrl,
  focusPolygon,
  cropRect,
  onCancel,
  remainingScans = 10,
  onQuotaClick,
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

  const rawPoints = focusPolygon && focusPolygon.length >= 3 ? focusPolygon.map(normalizePoint) : null;
  const isDrawnArea = Boolean(rawPoints && rawPoints.length >= 3);

  // Compute bounding box from raw points if cropRect is not passed
  let minX = 0;
  let maxX = 1000;
  let minY = 0;
  let maxY = 1000;

  if (cropRect) {
    minX = cropRect.x;
    minY = cropRect.y;
    maxX = cropRect.x + cropRect.width;
    maxY = cropRect.y + cropRect.height;
  } else if (rawPoints) {
    minX = Math.min(...rawPoints.map((p) => p[0]));
    maxX = Math.max(...rawPoints.map((p) => p[0]));
    minY = Math.min(...rawPoints.map((p) => p[1]));
    maxY = Math.max(...rawPoints.map((p) => p[1]));
  }

  const boxWidth = Math.max(1, maxX - minX);
  const boxHeight = Math.max(1, maxY - minY);

  const scanBox = isDrawnArea
    ? {
        left: `${(minX / 1000) * 100}%`,
        top: `${(minY / 1000) * 100}%`,
        width: `${(boxWidth / 1000) * 100}%`,
        height: `${(boxHeight / 1000) * 100}%`,
      }
    : {
        left: "0%",
        top: "0%",
        width: "100%",
        height: "100%",
      };

  // Node dots inside the bounding area
  const candidateDots = isDrawnArea
    ? [
        {
          left: `${((minX + boxWidth * 0.42) / 1000) * 100}%`,
          top: `${((minY + boxHeight * 0.48) / 1000) * 100}%`,
          delay: "0s",
        },
        {
          left: `${((minX + boxWidth * 0.72) / 1000) * 100}%`,
          top: `${((minY + boxHeight * 0.42) / 1000) * 100}%`,
          delay: "0.3s",
        },
        {
          left: `${((minX + boxWidth * 0.48) / 1000) * 100}%`,
          top: `${((minY + boxHeight * 0.26) / 1000) * 100}%`,
          delay: "0.6s",
        },
      ]
    : [
        { left: "50%", top: "45%", delay: "0s" },
        { left: "38%", top: "38%", delay: "0.3s" },
        { left: "62%", top: "42%", delay: "0.6s" },
      ];

  const polygonPathD = rawPoints
    ? rawPoints.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ") + " Z"
    : "";

  const containerRef = React.useRef<HTMLDivElement>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const [coverRect, setCoverRect] = useState<any>(null);

  const updateCoverRect = () => {
    const vp = containerRef.current;
    const img = imgRef.current;
    if (!vp || !img) return;

    const cw = vp.clientWidth;
    const ch = vp.clientHeight;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    if (cw > 0 && ch > 0 && iw > 0 && ih > 0) {
      const scale = Math.max(cw / iw, ch / ih);
      const width = iw * scale;
      const height = ih * scale;
      const left = (cw - width) / 2;
      const top = (ch - height) / 2;
      setCoverRect({ left, top, width, height });
    }
  };

  useEffect(() => {
    updateCoverRect();
    window.addEventListener("resize", updateCoverRect);
    return () => window.removeEventListener("resize", updateCoverRect);
  }, [photoDataUrl]);

  return (
    <div
      data-testid="stage-S3_Analysing"
      ref={containerRef}
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
      {/* Background frozen image */}
      {photoDataUrl && (
        <img
          ref={imgRef}
          src={photoDataUrl}
          alt="Analysing produce"
          onLoad={updateCoverRect}
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

      {/* SVG overlay exactly aligned with rendered image's coverRect */}
      <div
        data-testid="analysing-overlay-wrapper"
        style={{
          position: "absolute",
          left: coverRect ? `${coverRect.left}px` : 0,
          top: coverRect ? `${coverRect.top}px` : 0,
          width: coverRect ? `${coverRect.width}px` : "100%",
          height: coverRect ? `${coverRect.height}px` : "100%",
          pointerEvents: "none",
          zIndex: 5,
        }}
      >
        <svg
          data-testid="scanning-polygon-overlay"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          style={{
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <defs>
            {isDrawnArea && rawPoints && (
              <clipPath id="drawn-focus-clip">
                <path d={polygonPathD} />
              </clipPath>
            )}
          </defs>

          {/* Dim outer mask: rgba(0, 0, 0, 0.48) */}
          {isDrawnArea && rawPoints && (
            <path
              d={`M 0 0 L 1000 0 L 1000 1000 L 0 1000 Z ${polygonPathD}`}
              fill="rgba(0, 0, 0, 0.48)"
              fillRule="evenodd"
            />
          )}

          {/* Glowing polygon outline: dashed yellow */}
          {isDrawnArea && rawPoints && (
            <path
              d={polygonPathD}
              fill="rgba(245, 213, 71, 0.08)"
              stroke="#F5D547"
              strokeWidth="4"
              strokeDasharray="7 5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>

        {/* Laser Sweep Scanning Overlay strictly constrained to drawn area */}
        <div
          data-testid="scanning-laser-container"
          style={{
            position: "absolute",
            left: scanBox.left,
            top: scanBox.top,
            width: scanBox.width,
            height: scanBox.height,
            overflow: "hidden",
            pointerEvents: "none",
            zIndex: 10,
            clipPath: isDrawnArea && rawPoints ? "url(#drawn-focus-clip)" : undefined,
            WebkitClipPath: isDrawnArea && rawPoints ? "url(#drawn-focus-clip)" : undefined,
          }}
        >
          <div
            className="animate-scan-laser"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: "4px",
              background:
                "linear-gradient(90deg, transparent 0%, #FFF275 30%, #F5D547 50%, #FFF275 70%, transparent 100%)",
              boxShadow: "0 0 20px 4px #F5D547, 0 0 6px 1px #FFFFFF",
            }}
          />
        </div>

        {/* Candidate pulsing dots positioned in 0..1000 image coordinate space */}
        {candidateDots.map((dot, index) => (
          <div
            key={index}
            data-testid="candidate-pulse-dot"
            className="node-pulse-dot"
            style={{
              position: "absolute",
              left: dot.left,
              top: dot.top,
              transform: "translate(-50%, -50%)",
              animationDelay: dot.delay,
            }}
          />
        ))}
      </div>

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
          zIndex: 30,
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          data-testid="cancel-button"
          aria-label="Cancel analysis"
          style={{
            width: "30px",
            height: "30px",
            borderRadius: "50%",
            backgroundColor: "rgba(251, 250, 246, 0.88)",
            color: "#142117",
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

        <div
          data-testid="scan-quota-pill"
          onClick={onQuotaClick}
          role={onQuotaClick ? "button" : undefined}
          tabIndex={onQuotaClick ? 0 : undefined}
          title={onQuotaClick ? "Tap to override scan quota (testing)" : undefined}
          style={{
            background: "rgba(251,250,246,0.92)",
            color: "#142117",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 600,
            fontSize: "12px",
            lineHeight: 1,
            padding: "7px 12px",
            borderRadius: "999px",
            display: "inline-flex",
            alignItems: "center",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.18)",
            cursor: onQuotaClick ? "pointer" : "default",
          }}
        >
          {t("camera.scansLeftToday", { count: remainingScans ?? 10 })}
        </div>

        <div style={{ width: "30px" }} />
      </div>

      {/* Curved ivory bottom sheet */}
      <div
        data-testid="analysing-bottom-sheet"
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
          Pomona Vision
        </div>

        {/* Headline */}
        <div
          className="font-serif"
          style={{
            fontSize: "24px",
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: "-0.015em",
            margin: "6px 0 4px",
            color: "var(--text-primary)",
          }}
        >
          Checking ripeness…
        </div>

        {/* Subhead */}
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 500,
            fontSize: "12px",
            lineHeight: 1.3,
            color: "var(--text-muted)",
          }}
        >
          {isDrawnArea
            ? "Grading only the produce inside the boundary you drew."
            : "Grading produce across the entire photo."}
        </div>

        {/* Produce Tip ticker inside sheet */}
        {tips.length > 0 && (
          <div
            style={{
              marginTop: "12px",
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
              TIP
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
              {tips[tipIndex] || "Evaluating produce freshness and quality..."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
