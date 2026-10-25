import React from "react";
import { uiCopy } from "../i18n/copy";

/**
 * Shared capture-stage primitives, extracted verbatim from CameraViewfinder /
 * ScanErrorStage so every scan flow (original + deep scan + capture variants)
 * renders identical card, shutter, and sheet styling.
 */

export interface ThreeDScanAnimationProps {
  size?: number;
  testId?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const ThreeDScanAnimation: React.FC<ThreeDScanAnimationProps> = ({
  size = 18,
  testId = "prompt-card-3d-scan",
  className,
  style,
}) => (
  <div
    data-testid={testId}
    className={className}
    style={{
      width: `${size}px`,
      height: `${size}px`,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      position: "relative",
      ...style,
    }}
    aria-hidden="true"
  >
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ overflow: "visible", display: "block" }}
    >
      <defs>
        <linearGradient id="scan3d-fruit-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8CB874" />
          <stop offset="55%" stopColor="#4A7C59" />
          <stop offset="100%" stopColor="#224229" />
        </linearGradient>
        <linearGradient id="scan3d-laser-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(245, 213, 71, 0)" />
          <stop offset="50%" stopColor="rgba(245, 213, 71, 0.45)" />
          <stop offset="100%" stopColor="rgba(255, 242, 117, 0.95)" />
        </linearGradient>
        <filter id="scan3d-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="0.8" floodColor="#F5D547" floodOpacity="0.8" />
        </filter>
      </defs>

      {/* 3D Wireframe Bounding Cube: Back and Outer Contours */}
      <path
        d="M 12 2.5 L 20 6.8 L 20 15.2 L 12 19.5 L 4 15.2 L 4 6.8 Z"
        stroke="#2F5D34"
        strokeWidth="1.1"
        strokeOpacity="0.38"
        strokeLinejoin="round"
      />

      {/* 3D Wireframe Internal Ridges */}
      <path
        d="M 4 6.8 L 12 11 L 20 6.8"
        stroke="#2F5D34"
        strokeWidth="1"
        strokeOpacity="0.35"
        strokeLinejoin="round"
      />
      <path
        d="M 12 11 L 12 19.5"
        stroke="#2F5D34"
        strokeWidth="1"
        strokeOpacity="0.35"
        strokeLinejoin="round"
      />

      {/* 3D Produce Volume in Perspective */}
      <ellipse
        cx="12"
        cy="11.5"
        rx="5.2"
        ry="6.2"
        fill="url(#scan3d-fruit-grad)"
        opacity="0.88"
      />

      {/* 3D Produce Latitude and Longitude Wireframe Ellipses */}
      <ellipse
        cx="12"
        cy="11.5"
        rx="5.2"
        ry="2.4"
        fill="none"
        stroke="rgba(251, 250, 246, 0.5)"
        strokeWidth="0.8"
        strokeDasharray="2 1.5"
      />
      <path
        d="M 12 5.3 C 14.5 7.5 14.5 15.5 12 17.7 C 9.5 15.5 9.5 7.5 12 5.3 Z"
        fill="none"
        stroke="rgba(251, 250, 246, 0.45)"
        strokeWidth="0.7"
        strokeDasharray="2 1.5"
      />

      {/* Sweeping 3D Laser Plane Slice */}
      <g style={{ animation: "ds-3d-scan-sweep 1.8s ease-in-out infinite" }}>
        <polygon
          points="12,3.5 19,7.2 12,10.9 5,7.2"
          fill="url(#scan3d-laser-grad)"
          opacity="0.75"
        />
        <polygon
          points="12,3.5 19,7.2 12,10.9 5,7.2"
          fill="none"
          stroke="#F5D547"
          strokeWidth="1.2"
          strokeLinejoin="round"
          filter="url(#scan3d-glow)"
        />
        <path
          d="M 5 7.2 L 12 10.9 L 19 7.2"
          stroke="#FFFFFF"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* 3D Point-Cloud / LiDAR Feature Vertices */}
      <circle cx="12" cy="2.5" r="1.1" fill="#F5D547" style={{ animation: "ds-3d-node-pulse 1.4s ease-in-out infinite", transformOrigin: "12px 2.5px" }} />
      <circle cx="20" cy="6.8" r="1" fill="#F5D547" style={{ animation: "ds-3d-node-pulse 1.4s ease-in-out infinite 0.25s", transformOrigin: "20px 6.8px" }} />
      <circle cx="4" cy="6.8" r="1" fill="#F5D547" style={{ animation: "ds-3d-node-pulse 1.4s ease-in-out infinite 0.5s", transformOrigin: "4px 6.8px" }} />
      <circle cx="12" cy="11" r="1.1" fill="#FFFFFF" style={{ animation: "ds-3d-node-pulse 1.4s ease-in-out infinite 0.75s", transformOrigin: "12px 11px" }} />
      <circle cx="20" cy="15.2" r="1" fill="#F5D547" style={{ animation: "ds-3d-node-pulse 1.4s ease-in-out infinite 1s", transformOrigin: "20px 15.2px" }} />
      <circle cx="4" cy="15.2" r="1" fill="#F5D547" style={{ animation: "ds-3d-node-pulse 1.4s ease-in-out infinite 0.35s", transformOrigin: "4px 15.2px" }} />
      <circle cx="12" cy="19.5" r="1.1" fill="#F5D547" style={{ animation: "ds-3d-node-pulse 1.4s ease-in-out infinite 0.85s", transformOrigin: "12px 19.5px" }} />
    </svg>
  </div>
);

export interface FloatingPromptCardProps {
  testId?: string;
  title: string;
  subtitleLines?: string[];
  footer?: React.ReactNode;
  bottomOverride?: string;
  isLoading?: boolean;
  style?: React.CSSProperties;
}

export const FloatingPromptCard: React.FC<FloatingPromptCardProps> = ({
  testId = "floating-prompt-card",
  title,
  subtitleLines = [],
  footer,
  bottomOverride,
  isLoading = false,
  style,
}) => (
  <div
    data-testid={testId}
    style={{
      position: bottomOverride ? "absolute" : "relative",
      ...(bottomOverride ? { bottom: bottomOverride, left: "16px", right: "16px" } : {}),
      width: "100%",
      maxWidth: "360px",
      background: "rgba(251,250,246,0.95)",
      color: "#142117",
      borderRadius: "20px",
      padding: "12px 16px",
      textAlign: "center",
      boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      zIndex: 20,
      boxSizing: "border-box",
      ...style,
    }}
  >
    {isLoading ? (
      <div
        data-testid={`${testId}-loading`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px",
          padding: "2px 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          <ThreeDScanAnimation testId="prompt-card-3d-scan" size={18} />
          <div
            className="font-serif"
            style={{
              fontFamily: "Fraunces, Georgia, serif",
              fontWeight: 600,
              fontSize: "15px",
              lineHeight: 1.25,
              color: "#142117",
            }}
          >
            {title}
          </div>
        </div>
        {subtitleLines.map((line) => (
          <div
            key={line}
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontWeight: 500,
              fontSize: "12px",
              lineHeight: 1.35,
              color: "#55544F",
            }}
          >
            {line}
          </div>
        ))}
      </div>
    ) : (
      <>
        <div
          className="font-serif"
          style={{
            fontFamily: "Fraunces, Georgia, serif",
            fontWeight: 600,
            fontSize: "15px",
            lineHeight: 1.25,
            color: "#142117",
            marginBottom: "3px",
          }}
        >
          {title}
        </div>
        {subtitleLines.map((line) => (
          <div
            key={line}
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontWeight: 500,
              fontSize: "12px",
              lineHeight: 1.35,
              color: "#55544F",
            }}
          >
            {line}
          </div>
        ))}
        {footer}
      </>
    )}
  </div>
);

export interface ShutterButtonProps {
  testId?: string;
  coreTestId?: string;
  ariaLabel?: string;
  disabled?: boolean;
  onClick?: () => void;
  size?: number;
  core?: React.ReactNode;
  style?: React.CSSProperties;
}

export const ShutterButton: React.FC<ShutterButtonProps> = ({
  testId = "shutter-button",
  coreTestId = "shutter-button-core",
  ariaLabel,
  disabled = false,
  onClick,
  size = 68,
  core,
  style,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    data-testid={testId}
    aria-label={ariaLabel}
    style={{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "50%",
      backgroundColor: "transparent",
      border: "4px solid #FFFFFF",
      padding: "4px",
      boxSizing: "border-box",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1,
      boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      ...(style ?? {}),
    }}
  >
    <div
      data-testid={coreTestId}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "50%",
        backgroundColor: disabled ? "#9E9D98" : "#F5D547",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {core ?? null}
    </div>
  </button>
);

export const DEEP_SCAN_OVAL_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "46%",
  left: "50%",
  width: "272px",
  height: "288px",
  transform: "translate(-50%, -50%)",
};

export interface DeepScanOvalProps {
  testId?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export const DeepScanOval: React.FC<DeepScanOvalProps> = ({
  testId = "ds-viewfinder-oval",
  children,
  style,
}) => (
  <div
    data-testid={testId}
    style={{
      ...DEEP_SCAN_OVAL_STYLE,
      borderRadius: "24px",
      border: "3px solid rgba(251, 250, 246, 0.9)",
      boxShadow: "0 0 0 9999px rgba(8, 14, 9, 0.35)",
      pointerEvents: "none",
      zIndex: 2,
      ...style,
    }}
  >
    {children}
  </div>
);

export interface MorphingReticleProps {
  mode: "compare" | "inspect";
  deepScanRunning?: boolean;
  progressPathRef?: React.RefObject<SVGPathElement | null>;
  dragProgress?: number;
  isDragging?: boolean;
  style?: React.CSSProperties;
}

const SCANNING_FEATURE_DOTS = [
  { left: "34%", top: "32%", delay: "0s" },
  { left: "66%", top: "28%", delay: "0.6s" },
  { left: "50%", top: "48%", delay: "1.2s" },
  { left: "28%", top: "64%", delay: "1.8s" },
  { left: "72%", top: "60%", delay: "0.9s" },
  { left: "48%", top: "76%", delay: "1.5s" },
  { left: "38%", top: "44%", delay: "2.1s" },
  { left: "62%", top: "40%", delay: "0.3s" },
];

export const MorphingReticle: React.FC<MorphingReticleProps> = ({
  mode,
  deepScanRunning = false,
  progressPathRef,
  dragProgress,
  isDragging = false,
  style,
}) => {
  const targetProgress = mode === "inspect" ? 1 : 0;
  const progress = typeof dragProgress === "number" ? Math.max(0, Math.min(1, dragProgress)) : targetProgress;
  const isInspect = progress >= 0.5;

  const width = Math.round(228 + (272 - 228) * progress);
  const height = Math.round(240 + (288 - 240) * progress);
  const borderRadius = Math.round(20 + (24 - 20) * progress);
  const shadowAlpha = (0.35 * progress).toFixed(3);

  const reticleStyle: React.CSSProperties = {
    position: "absolute",
    top: "46%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: `${width}px`,
    height: `${height}px`,
  };

  /* eslint-disable i18next/no-literal-string */
  const cornerSize = progress >= 0.98 ? "50%" : `calc(24px + (50% - 24px) * ${progress.toFixed(3)})`;
  const cornerBorderWidth = `${(3.5 - 0.5 * progress).toFixed(2)}px`;
  const r = Math.round(245 + (251 - 245) * progress);
  const g = Math.round(213 + (250 - 213) * progress);
  const b = Math.round(71 + (246 - 71) * progress);
  const a = (1.0 - 0.1 * progress).toFixed(2);
  const cornerColor = `rgba(${r}, ${g}, ${b}, ${a})`;
  const cornerRadius = `${borderRadius}px`;
  const animTransition = isDragging
    ? "none"
    : "all 420ms cubic-bezier(0.34, 1.25, 0.64, 1)";
  /* eslint-enable i18next/no-literal-string */

  return (
    <>
      <div
        data-testid={isInspect ? "ds-oval" : "camera-reticle-brackets"}
        style={{
          ...reticleStyle,
          borderRadius: cornerRadius,
          boxShadow: `0 0 0 9999px rgba(8, 14, 9, ${shadowAlpha})`,
          pointerEvents: "none",
          transition: isDragging
            ? "none"
            : "width 420ms cubic-bezier(0.34, 1.25, 0.64, 1), height 420ms cubic-bezier(0.34, 1.25, 0.64, 1), border-radius 420ms ease, box-shadow 420ms ease",
          zIndex: 2,
          ...style,
        }}
      >
        {/* Top Left Quadrant / Bracket */}
        <span
          style={{
            position: "absolute",
            top: isInspect ? "0" : "-2px",
            left: isInspect ? "0" : "-2px",
            width: cornerSize,
            height: cornerSize,
            borderColor: cornerColor,
            borderStyle: "solid",
            borderWidth: "0",
            borderTopWidth: cornerBorderWidth,
            borderLeftWidth: cornerBorderWidth,
            borderTopLeftRadius: cornerRadius,
            borderTopRightRadius: "0",
            borderBottomLeftRadius: "0",
            borderBottomRightRadius: "0",
            transition: animTransition,
            boxSizing: "border-box",
          }}
        />

        {/* Top Right Quadrant / Bracket */}
        <span
          style={{
            position: "absolute",
            top: isInspect ? "0" : "-2px",
            right: isInspect ? "0" : "-2px",
            width: cornerSize,
            height: cornerSize,
            borderColor: cornerColor,
            borderStyle: "solid",
            borderWidth: "0",
            borderTopWidth: cornerBorderWidth,
            borderRightWidth: cornerBorderWidth,
            borderTopRightRadius: cornerRadius,
            borderTopLeftRadius: "0",
            borderBottomLeftRadius: "0",
            borderBottomRightRadius: "0",
            transition: animTransition,
            boxSizing: "border-box",
          }}
        />

        {/* Bottom Left Quadrant / Bracket */}
        <span
          style={{
            position: "absolute",
            bottom: isInspect ? "0" : "-2px",
            left: isInspect ? "0" : "-2px",
            width: cornerSize,
            height: cornerSize,
            borderColor: cornerColor,
            borderStyle: "solid",
            borderWidth: "0",
            borderBottomWidth: cornerBorderWidth,
            borderLeftWidth: cornerBorderWidth,
            borderBottomLeftRadius: cornerRadius,
            borderTopLeftRadius: "0",
            borderTopRightRadius: "0",
            borderBottomRightRadius: "0",
            transition: animTransition,
            boxSizing: "border-box",
          }}
        />

        {/* Bottom Right Quadrant / Bracket */}
        <span
          style={{
            position: "absolute",
            bottom: isInspect ? "0" : "-2px",
            right: isInspect ? "0" : "-2px",
            width: cornerSize,
            height: cornerSize,
            borderColor: cornerColor,
            borderStyle: "solid",
            borderWidth: "0",
            borderBottomWidth: cornerBorderWidth,
            borderRightWidth: cornerBorderWidth,
            borderBottomRightRadius: cornerRadius,
            borderTopLeftRadius: "0",
            borderTopRightRadius: "0",
            borderBottomLeftRadius: "0",
            transition: animTransition,
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* While deepScanRunning during 5s scan: scanning laser sweep and blinking yellow dots within the mask */}
      {isInspect && deepScanRunning && (
        <div
          data-testid="ds-scanning-mask-overlay"
          style={{
            ...reticleStyle,
            borderRadius: cornerRadius,
            overflow: "hidden",
            pointerEvents: "none",
            zIndex: 3,
          }}
        >
          {/* Scanning laser beam sweep */}
          <div
            data-testid="ds-scanning-laser-beam"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "-40px",
              height: "40px",
              animation: "ds-laser-sweep 2.2s ease-in-out infinite",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to bottom, rgba(255,242,117,0), rgba(255,242,117,0.45), rgba(245,213,71,0.8), rgba(255,242,117,0.45), rgba(255,242,117,0))",
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
                boxShadow: "0 0 10px 2px rgba(255,242,117,0.85)",
              }}
            />
          </div>

          {/* Yellow candidate pulsing dots from compare animation blinking and showing in different positions */}
          {SCANNING_FEATURE_DOTS.map((dot, index) => (
            <div
              key={index}
              data-testid="candidate-pulse-dot"
              className="ds-blinking-dot"
              style={{
                left: dot.left,
                top: dot.top,
                animationDelay: dot.delay,
              }}
            />
          ))}
        </div>
      )}

      {/* Progress SVG along the frame boundary when deepScanRunning */}
      {isInspect && deepScanRunning && progressPathRef ? (
        <svg
          data-testid="ds-oval-progress"
          viewBox="0 0 272 288"
          preserveAspectRatio="none"
          style={{
            ...reticleStyle,
            overflow: "visible",
            zIndex: 3,
            pointerEvents: "none",
          }}
        >
          <path
            ref={progressPathRef}
            d="M 136 1.5 H 246.5 A 24 24 0 0 1 270.5 25.5 V 262.5 A 24 24 0 0 1 246.5 286.5 H 25.5 A 24 24 0 0 1 1.5 262.5 V 25.5 A 24 24 0 0 1 25.5 1.5 H 136 Z"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={100}
            stroke="#F5D547"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      ) : null}
    </>
  );
};

export interface CameraModeSwitcherProps {
  mode: "compare" | "inspect";
  onChange: (mode: "compare" | "inspect") => void;
  disabled?: boolean;
  dragProgress?: number;
  isDragging?: boolean;
}

export const CameraModeSwitcher: React.FC<CameraModeSwitcherProps> = ({
  mode,
  onChange,
  disabled = false,
  dragProgress,
  isDragging = false,
}) => {
  const targetProgress = mode === "inspect" ? 1 : 0;
  const progress = typeof dragProgress === "number" ? Math.max(0, Math.min(1, dragProgress)) : targetProgress;

  return (
    <div
      data-testid="camera-mode-switcher"
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "rgba(10, 15, 12, 0.65)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderRadius: "999px",
        padding: "3px",
        border: "1px solid rgba(255, 255, 255, 0.14)",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
        position: "relative",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* Sliding active tab pill indicator */}
      <div
        data-testid="mode-switcher-pill"
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "3px",
          bottom: "3px",
          left: "3px",
          width: "calc(50% - 3px)",
          backgroundColor: "#F5D547",
          borderRadius: "999px",
          transform: `translateX(${progress * 100}%)`,
          transition: isDragging ? "none" : "transform 260ms cubic-bezier(0.2, 0.0, 0, 1.0)",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />

      <button
        type="button"
        data-testid="mode-tab-compare"
        disabled={disabled}
        onClick={() => onChange("compare")}
        style={{
          border: "none",
          cursor: disabled ? "default" : "pointer",
          padding: "6px 14px",
          borderRadius: "999px",
          fontSize: "12px",
          fontWeight: progress < 0.5 ? 700 : 500,
          color: progress < 0.5 ? "#132418" : "rgba(251, 250, 246, 0.8)",
          backgroundColor: "transparent",
          transition: isDragging ? "none" : "color 200ms ease, font-weight 200ms ease",
          fontFamily: "Inter, system-ui, sans-serif",
          position: "relative",
          zIndex: 2,
          flex: 1,
          minWidth: "72px",
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {uiCopy("camera.modeCompare")}
      </button>
      <button
        type="button"
        data-testid="mode-tab-inspect"
        disabled={disabled}
        onClick={() => onChange("inspect")}
        style={{
          border: "none",
          cursor: disabled ? "default" : "pointer",
          padding: "6px 14px",
          borderRadius: "999px",
          fontSize: "12px",
          fontWeight: progress >= 0.5 ? 700 : 500,
          color: progress >= 0.5 ? "#132418" : "rgba(251, 250, 246, 0.8)",
          backgroundColor: "transparent",
          transition: isDragging ? "none" : "color 200ms ease, font-weight 200ms ease",
          fontFamily: "Inter, system-ui, sans-serif",
          position: "relative",
          zIndex: 2,
          flex: 1,
          minWidth: "72px",
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {uiCopy("camera.modeInspect")}
      </button>
    </div>
  );
};

export interface PrimaryCtaProps {
  testId?: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const PrimaryCta: React.FC<PrimaryCtaProps> = ({
  testId,
  onClick,
  disabled = false,
  children,
  style,
}) => (
  <button
    type="button"
    {...(testId ? { "data-testid": testId } : {})}
    onClick={onClick}
    disabled={disabled}
    style={{
      flex: 1,
      padding: "14px 12px",
      borderRadius: "14px",
      border: "none",
      backgroundColor: "var(--cta-primary, #2F5D34)",
      color: "#FFFFFF",
      fontFamily: "Inter, system-ui, sans-serif",
      fontWeight: 700,
      fontSize: "15px",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      boxShadow: "0 4px 14px rgba(47, 93, 52, 0.3)",
      textAlign: "center",
      ...style,
    }}
  >
    {children}
  </button>
);

export interface SecondaryCtaProps {
  testId?: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const SecondaryCta: React.FC<SecondaryCtaProps> = ({
  testId,
  onClick,
  disabled = false,
  children,
  style,
}) => (
  <button
    type="button"
    {...(testId ? { "data-testid": testId } : {})}
    onClick={onClick}
    disabled={disabled}
    style={{
      flex: 1,
      padding: "14px 12px",
      borderRadius: "14px",
      border: "1.5px solid var(--border-subtle, #d5cebe)",
      backgroundColor: "transparent",
      color: "var(--text-primary, #1A261D)",
      fontFamily: "Inter, system-ui, sans-serif",
      fontWeight: 700,
      fontSize: "15px",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      textAlign: "center",
      ...style,
    }}
  >
    {children}
  </button>
);

export interface SheetDragHandlers {
  handleDragStart: (clientY: number) => void;
  handleDragMove: (clientY: number) => void;
  handleDragEnd: (clientY?: number) => void;
}

export interface InteractiveResultBottomSheetProps {
  testId?: string;
  coreTestId?: string;
  peekContent: React.ReactNode;
  expandedContent?: React.ReactNode;
  isExpandable?: boolean;
  onDragSync?: (isDragging: boolean, currentTranslate: number, defaultTranslate: number, maxTranslate: number) => void;
  onRegisterDragHandlers?: (handlers: SheetDragHandlers) => void;
}

export const InteractiveResultBottomSheet: React.FC<InteractiveResultBottomSheetProps> = ({
  testId = "result-bottom-sheet",
  coreTestId,
  peekContent,
  expandedContent,
  isExpandable = true,
  onDragSync,
  onRegisterDragHandlers,
}) => {
  const [sheetMode, setSheetMode] = React.useState<"min" | "default" | "expanded">("default");
  const [dragOffsetY, setDragOffsetY] = React.useState<number>(0);
  const [isDragging, setIsDragging] = React.useState<boolean>(false);
  const dragSource = React.useRef<"sheet" | "photo">("sheet");
  const dragStartY = React.useRef<number | null>(null);
  const dragStartTime = React.useRef<number>(0);
  const dragMovedDistance = React.useRef<number>(0);
  const suppressClickUntil = React.useRef<number>(0);

  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const defaultPeekRef = React.useRef<HTMLDivElement | null>(null);
  const [sheetHeight, setSheetHeight] = React.useState<number>(0);
  const [defaultPeekHeight, setDefaultPeekHeight] = React.useState<number>(180);
  const [hasOverflow, setHasOverflow] = React.useState<boolean>(false);

  const updateDimensions = () => {
    if (sheetRef.current && sheetRef.current.offsetHeight > 0) {
      setSheetHeight(sheetRef.current.offsetHeight);
      const isOverflowing = sheetRef.current.scrollHeight > sheetRef.current.clientHeight + 2;
      setHasOverflow(isOverflowing);
    }
    if (defaultPeekRef.current && defaultPeekRef.current.offsetHeight > 0) {
      setDefaultPeekHeight(defaultPeekRef.current.offsetHeight);
    }
  };

  React.useEffect(() => {
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && sheetRef.current) {
      ro = new ResizeObserver(() => updateDimensions());
      ro.observe(sheetRef.current);
      if (defaultPeekRef.current) ro.observe(defaultPeekRef.current);
    }
    return () => {
      window.removeEventListener("resize", updateDimensions);
      if (ro) ro.disconnect();
    };
  }, []);

  React.useLayoutEffect(() => {
    updateDimensions();
  }, [sheetMode, peekContent, expandedContent]);

  const defaultTranslate = isExpandable && sheetHeight > 0
    ? Math.max(0, sheetHeight - defaultPeekHeight)
    : 0;
  const maxTranslate = isExpandable && sheetHeight > 0
    ? Math.max(0, sheetHeight - Math.min(defaultPeekHeight, 100))
    : 0;

  const baseTranslate = !isExpandable || sheetMode === "expanded"
    ? 0
    : sheetMode === "default"
    ? defaultTranslate
    : maxTranslate;

  const canScroll = isExpandable && sheetMode === "expanded" && hasOverflow;

  let currentTranslate = baseTranslate + dragOffsetY;
  if (currentTranslate < 0) {
    currentTranslate = currentTranslate * 0.2;
  } else if (currentTranslate > maxTranslate) {
    currentTranslate = maxTranslate + (currentTranslate - maxTranslate) * 0.2;
  }

  React.useEffect(() => {
    onDragSync?.(isDragging, currentTranslate, defaultTranslate, maxTranslate);
  }, [isDragging, currentTranslate, defaultTranslate, maxTranslate, onDragSync]);

  const handleDragStart = (clientY: number, source: "sheet" | "photo" = "sheet") => {
    if (!isExpandable) return;
    dragSource.current = source;
    dragStartY.current = clientY;
    dragStartTime.current = Date.now();
    dragMovedDistance.current = 0;
    setIsDragging(true);
  };

  const handleDragMove = (clientY: number) => {
    if (!isExpandable || dragStartY.current === null) return;
    const rawDeltaY = clientY - dragStartY.current;
    dragMovedDistance.current = Math.abs(rawDeltaY);
    const factor = dragSource.current === "photo" ? 1.6 : 1.0;
    setDragOffsetY(rawDeltaY * factor);
  };

  const handleDragEnd = (clientY?: number) => {
    if (!isExpandable || dragStartY.current === null) return;
    const currentY = clientY ?? (dragStartY.current + dragOffsetY);
    const rawDeltaY = currentY - dragStartY.current;
    const factor = dragSource.current === "photo" ? 1.6 : 1.0;
    const deltaY = rawDeltaY * factor;
    const elapsed = Math.max(1, Date.now() - dragStartTime.current);
    const velocity = deltaY / elapsed;

    if (dragMovedDistance.current > 8) {
      suppressClickUntil.current = Date.now() + 250;
      const projected = baseTranslate + deltaY + velocity * 120;
      const midExpandedDefault = defaultTranslate / 2;
      const midDefaultMin = (defaultTranslate + maxTranslate) / 2;

      if (projected <= midExpandedDefault) {
        setSheetMode("expanded");
      } else if (projected <= midDefaultMin) {
        setSheetMode("default");
      } else {
        setSheetMode("min");
      }
    }

    dragStartY.current = null;
    setDragOffsetY(0);
    setIsDragging(false);
  };

  const handleToggle = () => {
    if (!isExpandable || Date.now() < suppressClickUntil.current) return;
    setSheetMode((prev) => (prev === "expanded" ? "default" : "expanded"));
  };

  React.useEffect(() => {
    onRegisterDragHandlers?.({
      handleDragStart: (clientY) => handleDragStart(clientY, "photo"),
      handleDragMove,
      handleDragEnd,
    });
  }, [onRegisterDragHandlers, isExpandable, baseTranslate, defaultTranslate, maxTranslate]);

  return (
    <div
      ref={sheetRef}
      data-testid={testId}
      onTouchStart={(e) => {
        if (!isExpandable) return;
        const target = e.target as HTMLElement;
        if (target.closest("button, a, input, select, textarea, [role='tab']")) return;
        if (canScroll && sheetRef.current && sheetRef.current.scrollTop > 0) return;
        handleDragStart(e.touches[0].clientY);
      }}
      onTouchMove={(e) => {
        if (!isExpandable || dragStartY.current === null) return;
        const rawDeltaY = e.touches[0].clientY - dragStartY.current;
        if (canScroll && rawDeltaY < 0) {
          dragStartY.current = null;
          setDragOffsetY(0);
          setIsDragging(false);
          return;
        }
        handleDragMove(e.touches[0].clientY);
      }}
      onTouchEnd={(e) => {
        if (!isExpandable || dragStartY.current === null) return;
        handleDragEnd(e.changedTouches?.[0]?.clientY);
      }}
      onPointerDown={(e) => {
        if (!isExpandable || e.pointerType !== "mouse") return;
        const target = e.target as HTMLElement;
        if (target.closest("button, a, input, select, textarea, [role='tab']")) return;
        if (canScroll && sheetRef.current && sheetRef.current.scrollTop > 0) return;
        handleDragStart(e.clientY);
      }}
      onPointerMove={(e) => {
        if (!isExpandable || e.pointerType !== "mouse" || dragStartY.current === null) return;
        handleDragMove(e.clientY);
      }}
      onPointerUp={(e) => {
        if (!isExpandable || e.pointerType !== "mouse" || dragStartY.current === null) return;
        handleDragEnd(e.clientY);
      }}
      onClick={(e) => {
        if (!isExpandable || Date.now() < suppressClickUntil.current) return;
        const target = e.target as HTMLElement;
        if (target.closest("button, a, input, select, textarea, [role='tab']")) return;
        if (sheetMode !== "expanded") {
          handleToggle();
        } else if (target.closest("[data-testid='sheet-drag-area'], [data-testid='sheet-header-summary'], [data-testid='sheet-peek-bar']")) {
          handleToggle();
        }
      }}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: "92dvh",
        backgroundColor: "var(--surface-sheet, #FBFAF6)",
        color: "var(--text-primary, #1A261D)",
        borderTopLeftRadius: "26px",
        borderTopRightRadius: "26px",
        paddingTop: isExpandable ? "0px" : "20px",
        paddingLeft: "18px",
        paddingRight: "18px",
        paddingBottom: "calc(max(14px, env(safe-area-inset-bottom)) + 4px)",
        zIndex: 15,
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.22), 0 200px 0 0 var(--surface-sheet, #FBFAF6)",
        transform: `translate3d(0, ${currentTranslate}px, 0)`,
        transition: isDragging ? "none" : "transform 0.32s cubic-bezier(0.2, 0.0, 0, 1.0)",
        overflowY: canScroll ? "auto" : (sheetMode === "expanded" ? "hidden" : "visible"),
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
        touchAction: canScroll ? "pan-y" : "none",
        overscrollBehavior: "contain",
        userSelect: "none",
        cursor: isExpandable ? (isDragging ? "grabbing" : (sheetMode === "expanded" ? "default" : "pointer")) : "default",
      }}
    >
      <div
        {...(coreTestId ? { "data-testid": coreTestId } : {})}
        style={{ width: "100%", display: "flex", flexDirection: "column" }}
      >
        <div
          ref={defaultPeekRef}
          data-testid="sheet-peek-bar"
          style={{ width: "100%", display: "flex", flexDirection: "column" }}
        >
          {isExpandable && (
            <div
              data-testid="sheet-drag-area"
              role="button"
              tabIndex={0}
              aria-label={sheetMode === "expanded" ? uiCopy("copy.collapseResultsSheet") : uiCopy("copy.expandResultsSheet")}
              aria-expanded={sheetMode === "expanded"}
              onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
              onTouchMove={(e) => {
                if (dragStartY.current !== null) handleDragMove(e.touches[0].clientY);
              }}
              onTouchEnd={(e) => handleDragEnd(e.changedTouches?.[0]?.clientY)}
              onPointerDown={(e) => {
                if (e.pointerType === "mouse") handleDragStart(e.clientY);
              }}
              onPointerMove={(e) => {
                if (e.pointerType === "mouse" && dragStartY.current !== null) handleDragMove(e.clientY);
              }}
              onPointerUp={(e) => {
                if (e.pointerType === "mouse") handleDragEnd(e.clientY);
              }}
              onClick={handleToggle}
              style={{ width: "100%", padding: "8px 0 4px", cursor: isExpandable ? "pointer" : "default" }}
            >
              <div
                style={{
                  width: "36px",
                  height: "4px",
                  borderRadius: "4px",
                  backgroundColor: "var(--text-muted, #6B7268)",
                  opacity: 0.35,
                  margin: "0 auto 6px",
                }}
              />
            </div>
          )}
          <div
            data-testid="sheet-header-summary"
            role={isExpandable ? "button" : undefined}
            tabIndex={isExpandable ? 0 : undefined}
            aria-label={sheetMode === "expanded" ? uiCopy("copy.collapseResultsSheet") : uiCopy("copy.expandResultsSheet")}
            aria-expanded={sheetMode === "expanded"}
            onTouchStart={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest("button, a, input, select, textarea, [role='tab']")) return;
              handleDragStart(e.touches[0].clientY);
            }}
            onTouchMove={(e) => {
              if (dragStartY.current !== null) handleDragMove(e.touches[0].clientY);
            }}
            onTouchEnd={(e) => handleDragEnd(e.changedTouches?.[0]?.clientY)}
            onPointerDown={(e) => {
              if (e.pointerType === "mouse") {
                const target = e.target as HTMLElement;
                if (target.closest("button, a, input, select, textarea, [role='tab']")) return;
                handleDragStart(e.clientY);
              }
            }}
            onPointerMove={(e) => {
              if (e.pointerType === "mouse" && dragStartY.current !== null) handleDragMove(e.clientY);
            }}
            onPointerUp={(e) => {
              if (e.pointerType === "mouse") handleDragEnd(e.clientY);
            }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest("button") || target.closest("a")) return;
              handleToggle();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleToggle();
              }
            }}
            style={{ width: "100%", cursor: isExpandable ? "pointer" : "default", userSelect: "none" }}
          >
            {peekContent}
          </div>
        </div>
        <div
          data-testid="sheet-expanded-content"
          onTouchStart={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest("button") || target.closest("a") || target.closest("[role='tab']")) return;
            if (canScroll && sheetRef.current && sheetRef.current.scrollTop > 0) return;
            handleDragStart(e.touches[0].clientY);
          }}
          onTouchMove={(e) => {
            if (dragStartY.current !== null) {
              const rawDeltaY = e.touches[0].clientY - dragStartY.current;
              if (canScroll && rawDeltaY < 0) {
                dragStartY.current = null;
                setDragOffsetY(0);
                setIsDragging(false);
                return;
              }
              handleDragMove(e.touches[0].clientY);
            }
          }}
          onTouchEnd={(e) => {
            if (dragStartY.current !== null) {
              handleDragEnd(e.changedTouches?.[0]?.clientY);
            }
          }}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse") {
              const target = e.target as HTMLElement;
              if (target.closest("button") || target.closest("a") || target.closest("[role='tab']")) return;
              handleDragStart(e.clientY);
            }
          }}
          onPointerMove={(e) => {
            if (e.pointerType === "mouse" && dragStartY.current !== null) {
              handleDragMove(e.clientY);
            }
          }}
          onPointerUp={(e) => {
            if (e.pointerType === "mouse") {
              handleDragEnd(e.clientY);
            }
          }}
          style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px" }}
        >
          {expandedContent}
        </div>
      </div>
    </div>
  );
};

export function IvoryBottomSheet(props: {
  testId?: string;
  children: React.ReactNode;
}) {
  const testId = props.testId;
  return (
    <div
      {...(testId ? { "data-testid": testId } : {})}
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
      {props.children}
    </div>
  );
}

export function SheetEyebrow(props: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 700,
        fontSize: "11px",
        lineHeight: 1,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: props.color ?? "var(--text-muted, #6B7268)",
        ...(props.style ?? {}),
      }}
    >
      {props.children}
    </div>
  );
}

export function SheetHeadline(props: {
  children: React.ReactNode;
  size?: string;
  style?: React.CSSProperties;
}) {
  return (
    <h2
      className="font-serif"
      style={{
        fontFamily: "Fraunces, Georgia, serif",
        fontSize: props.size ?? "22px",
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: "-0.015em",
        margin: "0 0 2px",
        color: "var(--text-primary)",
        ...(props.style ?? {}),
      }}
    >
      {props.children}
    </h2>
  );
}
