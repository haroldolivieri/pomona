import React from "react";

/**
 * Shared capture-stage primitives, extracted verbatim from CameraViewfinder /
 * ScanErrorStage so every scan flow (original + deep scan + capture variants)
 * renders identical card, shutter, and sheet styling.
 */

export interface FloatingPromptCardProps {
  testId?: string;
  title: string;
  subtitleLines?: string[];
  footer?: React.ReactNode;
  bottomOverride?: string;
}

export const FloatingPromptCard: React.FC<FloatingPromptCardProps> = ({
  testId = "floating-prompt-card",
  title,
  subtitleLines = [],
  footer,
  bottomOverride,
}) => (
  <div
    data-testid={testId}
    style={{
      position: "absolute",
      left: "16px",
      right: "16px",
      bottom: bottomOverride ?? "calc(max(24px, env(safe-area-inset-bottom)) + 84px)",
      background: "rgba(251,250,246,0.95)",
      color: "#142117",
      borderRadius: "20px",
      padding: "12px 16px",
      textAlign: "center",
      boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      zIndex: 10,
    }}
  >
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
        paddingTop: "16px",
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
      <div
        style={{
          width: "36px",
          height: "4px",
          borderRadius: "4px",
          backgroundColor: "var(--text-muted, #6B7268)",
          opacity: 0.35,
          margin: "-6px auto 4px",
        }}
      />
      {props.children}
    </div>
  );
}

export function SheetEyebrow(props: { children: React.ReactNode; color?: string }) {
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
