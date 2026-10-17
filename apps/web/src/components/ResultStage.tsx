import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  type Candidate,
  type TargetRipenessWindow,
  resolveCandidatesForTarget,
} from "@pomona/contract";
import type { ScanMachineState } from "../state/scan-state-machine";
import { describeBoxPosition } from "../lib/spatial-a11y";
import { computeObjectFitCoverRect, type RenderedCoverRect } from "../lib/image-pipeline";

export interface ResultStageProps {
  state: ScanMachineState;
  onCompareWithRunnerUp: () => void;
  onStartFinalCheck: () => void;
  onReset: () => void;
  onSetTargetRipeness?: (target: TargetRipenessWindow) => void;
}

export const ResultStage: React.FC<ResultStageProps> = ({
  state,
  onCompareWithRunnerUp,
  onStartFinalCheck,
  onReset,
  onSetTargetRipeness,
}) => {
  const { t } = useTranslation();
  const [sheetExpanded, setSheetExpanded] = useState<boolean>(false);
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [coverRect, setCoverRect] = useState<RenderedCoverRect | null>(null);
  const { phase, lastResponse, firstPick, runnerUp, round1PhotoDataUrl } = state;

  const updateCoverRect = () => {
    const vp = viewportRef.current;
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
  }, [round1PhotoDataUrl]);

  if (!lastResponse || lastResponse.status !== "ok") {
    return (
      <div
        data-testid={`stage-${phase}`}
        style={{
          width: "100%",
          height: "100vh",
          backgroundColor: "var(--surface-sheet)",
          color: "var(--text-primary)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <p style={{ marginBottom: "16px", textAlign: "center" }}>
          {state.errorMessage || t("errors.analysisFailed")}
        </p>
        <button
          onClick={onReset}
          data-testid="try-again-button"
          style={{
            backgroundColor: "var(--cta-primary)",
            color: "var(--cta-primary-text)",
            border: "none",
            padding: "12px 24px",
            borderRadius: "12px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {t("result.tryAgain")}
        </button>
      </div>
    );
  }

  const { verdict, afterPurchase, followUp, produce } = lastResponse;

  // Decide winner candidate and runner-up candidate display info
  let activeWinner: Candidate | null = null;
  let activeRunnerUp: Candidate | null = null;
  let eyebrow = "";
  let headline = verdict?.headline || "Buy it.";
  let subtitle = "";
  let confirmationBanner: string | null = null;
  let followUpHint: string | null = null;
  let prevMarkScore: number | null = null;
  let runnerUpTagLabel = "Runner-Up";

  const targetRipeness = state.targetRipeness || "ready_now";
  let targetResolution = null;
  if (phase === "S4_InitialResult" && state.allCandidatesRound1 && state.allCandidatesRound1.length > 0) {
    targetResolution = resolveCandidatesForTarget(state.allCandidatesRound1, targetRipeness);
  }

  const winnerScoreStr = (score?: number) => (score !== undefined ? score.toFixed(1) : "8.6");
  const candidateCount = lastResponse.candidates?.length || 3;

  if (phase === "S4_InitialResult") {
    activeWinner = firstPick;
    activeRunnerUp = runnerUp;
    if (targetResolution) {
      eyebrow = targetResolution.eyebrow;
      headline = targetResolution.headline;
      subtitle = targetResolution.subtitle;
      followUpHint = targetResolution.followUpHintOverride || followUp?.bannerText || "The blue one could be sweeter. Flip it and snap.";
    } else {
      eyebrow = "BEST IN VIEW";
      headline = "Buy it.";
      subtitle = `High confidence · ${candidateCount} compared in view`;
      followUpHint = followUp?.bannerText || "The blue one could be sweeter. Flip it and snap.";
    }
    runnerUpTagLabel = "Runner-Up";
  } else if (phase === "S5B1_RunnerUpBeaten") {
    activeWinner = firstPick;
    activeRunnerUp = runnerUp;
    const score1 = winnerScoreStr(firstPick?.score);
    const score2 = winnerScoreStr(runnerUp?.score);
    eyebrow = `✓ 1ST PICK WINS · BEATS RUNNER-UP (${score1} VS ${score2})`;
    headline = "Buy your 1st pick.";
    subtitle = "Confirmed winner · Runner-Up fell short after flip";
    confirmationBanner = `Runner-Up scored ${score2} after flip (${runnerUp?.flipSummary || "inspected"}). Stick with your 1st pick in the yellow box.`;
    prevMarkScore = runnerUp?.score ?? null;
    runnerUpTagLabel = `Runner-Up · ${score2}`;
  } else if (phase === "S5B2_RunnerUpTookLead") {
    activeWinner = runnerUp;
    activeRunnerUp = firstPick;
    const score1 = winnerScoreStr(firstPick?.score);
    const score2 = winnerScoreStr(runnerUp?.score);
    eyebrow = `★ NEW WINNER · BEATS 1ST PICK (${score2} VS ${score1})`;
    headline = verdict?.headline || "Buy this one.";
    subtitle = "Runner-Up took the lead · 1 final check available";
    followUpHint = followUp?.bannerText || `1st Pick (${score1}) was only graded from the top. Flip it too for a fair final check, or take this one now.`;
    prevMarkScore = firstPick?.score ?? null;
    runnerUpTagLabel = `1st Pick · ${score1}`;
  } else if (phase === "S7A_FirstPickWonFinal") {
    activeWinner = firstPick;
    activeRunnerUp = runnerUp;
    const score1 = winnerScoreStr(firstPick?.score);
    const score2 = winnerScoreStr(runnerUp?.score);
    eyebrow = `★ FINAL VERDICT · 1ST PICK RECLAIMS THE WIN (${score1} VS ${score2})`;
    headline = verdict?.headline || "Buy your 1st pick.";
    subtitle = "Both checked from both sides · Highest overall grade";
    confirmationBanner = `After flipping, your 1st pick jumped to ${score1} and beat the Runner-Up (${score2}).`;
    prevMarkScore = runnerUp?.score ?? null;
    runnerUpTagLabel = `Runner-Up · ${score2}`;
  } else if (phase === "S7B_FirstPickLostFinal") {
    activeWinner = runnerUp;
    activeRunnerUp = firstPick;
    const score1 = winnerScoreStr(firstPick?.score);
    const score2 = winnerScoreStr(runnerUp?.score);
    eyebrow = `★ FINAL VERDICT · RUNNER-UP WINS (${score2} VS ${score1})`;
    headline = verdict?.headline || "Buy the new winner.";
    subtitle = "Both checked from both sides · Runner-Up confirmed best";
    confirmationBanner = `1st Pick scored ${score1} after flip. The former Runner-Up (${score2}) is confirmed as the best pick.`;
    prevMarkScore = firstPick?.score ?? null;
    runnerUpTagLabel = `1st Pick · ${score1}`;
  }

  // Accessibility spatial speech
  const winnerA11y = activeWinner ? describeBoxPosition(activeWinner.box, "Winner", activeWinner.score) : "";
  const runnerUpA11y = activeRunnerUp ? describeBoxPosition(activeRunnerUp.box, "Runner-Up", activeRunnerUp.score) : "";

  // Helper to convert candidate box [top, left, bottom, right] in 0..1000 scale to style percentages
  const boxToStyle = (box: [number, number, number, number]) => {
    const top = (box[0] / 10).toFixed(2) + "%";
    const left = (box[1] / 10).toFixed(2) + "%";
    const width = ((box[3] - box[1]) / 10).toFixed(2) + "%";
    const height = ((box[2] - box[0]) / 10).toFixed(2) + "%";
    return { top, left, width, height };
  };

  const isLostStyle = phase === "S5B1_RunnerUpBeaten" || phase === "S7A_FirstPickWonFinal" || phase === "S7B_FirstPickLostFinal";

  // Calculate sheet translation and parallax offset
  // Expanded moves sheet up by 120px; collapsed is 0px
  const baseTranslateY = sheetExpanded ? -110 : 0;
  const activeTranslateY = Math.max(-160, Math.min(80, baseTranslateY + dragOffsetY));
  // Subtle parallax: photo + bounding boxes shift at 25% of sheet movement without changing dimensions
  const parallaxY = activeTranslateY * 0.22;

  const handleDragStart = (clientY: number, target: EventTarget | null) => {
    // Do not hijack taps on buttons
    if (target instanceof HTMLElement && target.closest("button")) {
      return;
    }
    // If sheet is scrolled down internally, allow normal scroll up first
    if (sheetRef.current && sheetRef.current.scrollTop > 0) {
      return;
    }
    dragStartY.current = clientY;
    setIsDragging(true);
  };

  const handleDragMove = (clientY: number) => {
    if (dragStartY.current === null) return;
    const deltaY = clientY - dragStartY.current;
    setDragOffsetY(deltaY);
  };

  const handleDragEnd = () => {
    if (dragStartY.current === null) return;
    if (dragOffsetY < -35) {
      setSheetExpanded(true);
    } else if (dragOffsetY > 35) {
      setSheetExpanded(false);
    }
    dragStartY.current = null;
    setDragOffsetY(0);
    setIsDragging(false);
  };

  return (
    <div
      data-testid={`stage-${phase}`}
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        backgroundColor: "var(--bg-app)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Screen reader live region */}
      <div
        aria-live="polite"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          border: 0,
        }}
      >
        {winnerA11y}. {runnerUpA11y}
      </div>

      {/* Topbar pinned at top of screen: Left ✕, Center produce chip, Right ↻ retake */}
      <div
        style={{
          position: "absolute",
          top: "max(16px, env(safe-area-inset-top))",
          left: "14px",
          right: "14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 25,
        }}
      >
        {/* Close button */}
        <button
          onClick={onReset}
          data-testid="close-button"
          aria-label="Reset and scan again"
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

        {/* Produce Name Chip */}
        <div
          data-testid="produce-name-chip"
          style={{
            backgroundColor: "rgba(251, 250, 246, 0.88)",
            color: "#142117",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            fontSize: "12px",
            fontWeight: 700,
            padding: "7px 14px",
            borderRadius: "999px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          }}
        >
          {produce?.displayName || "Produce"}
        </div>

        {/* Retake button */}
        <button
          onClick={onReset}
          data-testid="retake-button"
          aria-label="Retake photo"
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
          ↻
        </button>
      </div>

      {/* Fixed-Size Photo Viewport with Bounding Boxes (Parallax only, never shrinks!) */}
      <div
        ref={viewportRef}
        data-testid="result-photo-viewport"
        style={{
          position: "relative",
          width: "100%",
          height: "46dvh",
          backgroundColor: "#000000",
          overflow: "hidden",
          flexShrink: 0,
          transform: `translate3d(0, ${parallaxY}px, 0)`,
          transition: isDragging ? "none" : "transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1)",
          willChange: "transform",
        }}
      >
        {round1PhotoDataUrl && (
          <img
            ref={imgRef}
            src={round1PhotoDataUrl}
            alt="Produce crate"
            onLoad={updateCoverRect}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.1)",
            pointerEvents: "none",
          }}
        />

        {/* DOM Bounding Boxes for Winner and Runner-Up mapped to rendered image */}
        <div
          data-testid="bounding-box-overlay"
          style={{
            position: "absolute",
            left: coverRect ? `${coverRect.left}px` : 0,
            top: coverRect ? `${coverRect.top}px` : 0,
            width: coverRect ? `${coverRect.width}px` : "100%",
            height: coverRect ? `${coverRect.height}px` : "100%",
            pointerEvents: "none",
          }}
        >
          {activeRunnerUp && (
            <div
              style={{
                position: "absolute",
                ...boxToStyle(activeRunnerUp.box),
                borderRadius: "14px",
                border: isLostStyle
                  ? "2px dashed rgba(255, 255, 255, 0.55)"
                  : phase === "S5B2_RunnerUpTookLead"
                  ? "2.5px dashed #F5D547"
                  : "2.5px dashed #2F6DB5",
                opacity: isLostStyle ? 0.72 : 1,
                boxSizing: "border-box",
                pointerEvents: "none",
              }}
            >
              <span
                data-testid="runner-up-tag"
                style={{
                  position: "absolute",
                  top: "-12px",
                  left: "6px",
                  backgroundColor: isLostStyle
                    ? "rgba(20, 24, 20, 0.78)"
                    : phase === "S5B2_RunnerUpTookLead"
                    ? "#142117"
                    : "#2F6DB5",
                  color: phase === "S5B2_RunnerUpTookLead" ? "#F5D547" : "#FFFFFF",
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: "8px",
                  whiteSpace: "nowrap",
                  fontFamily: "Inter, sans-serif",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                }}
              >
                {runnerUpTagLabel}
              </span>
            </div>
          )}

          {activeWinner && (
            <div
              style={{
                position: "absolute",
                ...boxToStyle(activeWinner.box),
                borderRadius: "14px",
                border: "3px solid #F5D547",
                boxShadow: "0 0 0 4px rgba(245, 213, 71, 0.32), 0 6px 18px rgba(0, 0, 0, 0.35)",
                boxSizing: "border-box",
                pointerEvents: "none",
              }}
            >
              {/* Circular score badge anchored top-right */}
              <span
                data-testid="winner-score-badge"
                style={{
                  position: "absolute",
                  top: "-15px",
                  right: "-13px",
                  width: "34px",
                  height: "34px",
                  borderRadius: "50%",
                  backgroundColor: "#F5D547",
                  color: "#142117",
                  fontWeight: 800,
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  boxShadow: "0 3px 10px rgba(0, 0, 0, 0.35)",
                  fontFamily: "Inter, sans-serif",
                }}
              >
                {winnerScoreStr(activeWinner.score)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Bottom Sheet (draggable from any area on the sheet) */}
      <div
        ref={sheetRef}
        data-testid="result-bottom-sheet"
        onTouchStart={(e) => handleDragStart(e.touches[0].clientY, e.target)}
        onTouchMove={(e) => handleDragMove(e.touches[0].clientY)}
        onTouchEnd={handleDragEnd}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") {
            handleDragStart(e.clientY, e.target);
          }
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" && isDragging) {
            handleDragMove(e.clientY);
          }
        }}
        onPointerUp={(e) => {
          if (e.pointerType === "mouse") {
            handleDragEnd();
          }
        }}
        style={{
          flex: 1,
          backgroundColor: "var(--surface-sheet)",
          color: "var(--text-primary)",
          borderTopLeftRadius: "26px",
          borderTopRightRadius: "26px",
          marginTop: "-22px",
          marginBottom: "-160px",
          paddingTop: "14px",
          paddingLeft: "20px",
          paddingRight: "20px",
          paddingBottom: "calc(max(28px, env(safe-area-inset-bottom)) + 160px)",
          zIndex: 15,
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          boxShadow: "0 -10px 30px rgba(0, 0, 0, 0.28)",
          transform: `translate3d(0, ${activeTranslateY}px, 0)`,
          transition: isDragging ? "none" : "transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1)",
          overflowY: sheetExpanded ? "auto" : "visible",
          touchAction: "pan-y",
          willChange: "transform",
          cursor: isDragging ? "grabbing" : "grab",
        }}
      >
        {/* Interactive Grab Handle Pill */}
        <div
          onClick={() => setSheetExpanded((prev) => !prev)}
          aria-label="Drag or tap to resize bottom sheet"
          role="button"
          tabIndex={0}
          style={{
            width: "100%",
            padding: "4px 0",
            display: "flex",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "4px",
              borderRadius: "4px",
              backgroundColor: "rgba(107, 106, 101, 0.35)",
            }}
          />
        </div>

        {/* 3-Way Segmented Control in S4_InitialResult */}
        {phase === "S4_InitialResult" && (
          <div
            data-testid="ripeness-target-switch"
            role="tablist"
            aria-label="Target ripeness window"
            style={{
              backgroundColor: "var(--surface-card)",
              padding: "3.5px",
              borderRadius: "13px",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "4px",
              border: "1px solid var(--surface-card-border)",
            }}
          >
            {(
              [
                { id: "ready_now", label: "Ready now", sub: "Peak ripe", dot: "#16A34A" },
                { id: "in_2_3_days", label: "In 2–3 days", sub: "Almost ripe", dot: "#D97706" },
                { id: "later_this_week", label: "Later this week", sub: "Firm / Unripe", dot: "#2563EB" },
              ] as const
            ).map((tab) => {
              const isActive = targetRipeness === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  data-testid={`target-tab-${tab.id}`}
                  onClick={() => onSetTargetRipeness && onSetTargetRipeness(tab.id)}
                  style={{
                    border: "none",
                    backgroundColor: isActive ? "var(--surface-sheet)" : "transparent",
                    color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                    padding: "6px 4px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    lineHeight: 1.15,
                    boxShadow: isActive ? "0 2px 6px rgba(0, 0, 0, 0.12)" : "none",
                    transition: "all 0.18s ease",
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center" }}>
                    {isActive && (
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          backgroundColor: tab.dot,
                          marginRight: "4px",
                          display: "inline-block",
                        }}
                      />
                    )}
                    {tab.label}
                  </span>
                  <span
                    style={{
                      fontSize: "9.5px",
                      fontWeight: 600,
                      color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                      marginTop: "2px",
                    }}
                  >
                    {tab.sub}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Locked Goal Banner in States 5B, 7A, 7B */}
        {(phase === "S5B1_RunnerUpBeaten" ||
          phase === "S5B2_RunnerUpTookLead" ||
          phase === "S7A_FirstPickWonFinal" ||
          phase === "S7B_FirstPickLostFinal") && (
          <div
            data-testid="locked-ripeness-goal"
            style={{
              backgroundColor: "var(--surface-card)",
              border: "1px solid var(--surface-card-border)",
              borderRadius: "11px",
              padding: "7px 12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "11.5px",
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            <span>
              🎯 Shopping for:{" "}
              <strong>
                {targetRipeness === "in_2_3_days"
                  ? "In 2–3 days"
                  : targetRipeness === "later_this_week"
                  ? "Later this week"
                  : "Ready now"}
              </strong>
            </span>
            <span
              style={{
                backgroundColor: "var(--surface-sheet)",
                padding: "2px 8px",
                borderRadius: "999px",
                fontSize: "10.5px",
                fontWeight: 800,
                color: "var(--eyebrow-accent)",
                border: "1px solid var(--surface-card-border)",
              }}
            >
              {targetRipeness === "in_2_3_days"
                ? "Almost ripe"
                : targetRipeness === "later_this_week"
                ? "Firm & unripe"
                : "Peak ripe"}
            </span>
          </div>
        )}

        {/* Eyebrow & Headline */}
        <div>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: phase === "S4_InitialResult" ? "var(--text-muted)" : "var(--eyebrow-accent)",
              textTransform: "uppercase",
              display: "block",
              marginBottom: "4px",
            }}
          >
            {eyebrow}
          </span>
          <h1
            className="font-serif"
            style={{
              fontSize: "32px",
              fontWeight: 700,
              lineHeight: 1.15,
              color: "var(--text-primary)",
              letterSpacing: "-0.015em",
            }}
          >
            {headline}
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
            {subtitle}
          </p>
        </div>

        {/* Score Progress Bar */}
        {activeWinner && (
          <div style={{ margin: "2px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  flex: 1,
                  position: "relative",
                  height: "8px",
                  borderRadius: "7px",
                  backgroundColor: "var(--surface-track)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.round(Math.min(100, Math.max(0, (activeWinner.score / 10) * 100)) * 10) / 10}%`,
                    height: "100%",
                    backgroundColor: "#F2C935",
                    borderRadius: "7px",
                  }}
                />
                {prevMarkScore !== null && (
                  <span
                    data-testid="score-prev-mark"
                    title={`Previous: ${prevMarkScore.toFixed(1)}`}
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `${Math.round(Math.min(100, Math.max(0, (prevMarkScore / 10) * 100)) * 10) / 10}%`,
                      width: "2px",
                      backgroundColor: "#142117",
                      opacity: 0.55,
                    }}
                  />
                )}
              </div>
              <span
                className="tabular-nums"
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  whiteSpace: "nowrap",
                }}
              >
                {activeWinner.score.toFixed(1)} / 10
              </span>
            </div>
          </div>
        )}

        {/* Traits Chips */}
        {activeWinner?.traits && activeWinner.traits.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {activeWinner.traits.map((trait, idx) => (
              <span
                key={idx}
                style={{
                  padding: "6px 11px",
                  borderRadius: "6px",
                  backgroundColor: "var(--surface-chip)",
                  color: "var(--surface-chip-text)",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                {trait}
              </span>
            ))}
          </div>
        )}

        {/* Storage Cards Layout (2 Rows) */}
        {afterPurchase && (
          <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginTop: "4px" }}>
            {/* Row 1: Full-width card: 🗓 Eat within (left) — {eatWithinLabel} (right bold) */}
            <div
              style={{
                backgroundColor: "var(--surface-card)",
                border: "1px solid var(--surface-card-border)",
                borderRadius: "14px",
                padding: "10px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                }}
              >
                {t("result.eatWithin")}
              </span>
              <strong style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                {targetResolution?.eatWithinOverride || afterPurchase.eatWithinLabel}
              </strong>
            </div>

            {/* Row 2: Two equal side-by-side cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px" }}>
              {/* Card 1: 🧺 Before cut */}
              <div
                style={{
                  backgroundColor: "var(--surface-card)",
                  border: "1px solid var(--surface-card-border)",
                  borderRadius: "14px",
                  padding: "10px 12px",
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    display: "block",
                  }}
                >
                  {t("result.beforeCut")}
                </span>
                <strong
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    display: "block",
                    marginTop: "4px",
                    color: "var(--text-primary)",
                  }}
                >
                  {afterPurchase.storage.beforeCut.summary}
                </strong>
              </div>

              {/* Card 2: ❄️ After cut */}
              <div
                style={{
                  backgroundColor: "var(--surface-card)",
                  border: "1px solid var(--surface-card-border)",
                  borderRadius: "14px",
                  padding: "10px 12px",
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    display: "block",
                  }}
                >
                  {t("result.afterCut")}
                </span>
                <strong
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    display: "block",
                    marginTop: "4px",
                    color: "var(--text-primary)",
                  }}
                >
                  {afterPurchase.storage.afterCut.summary}
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* Card Order: S4 & S5B-2 have Follow-up Hint Box, S5B-1/S7A/S7B have Green Confirmation Card */}
        {followUpHint && (phase === "S4_InitialResult" || phase === "S5B2_RunnerUpTookLead") && (
          <div
            data-testid="follow-up-hint"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 12px",
              borderRadius: "12px",
              backgroundColor: "var(--surface-hint-warn)",
              border: "1px solid var(--surface-hint-warn-border)",
              fontSize: "12px",
              lineHeight: 1.35,
              color: "var(--text-primary)",
              marginTop: "2px",
            }}
          >
            <span
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "3px",
                border: phase === "S4_InitialResult" ? "2px dashed #2F6DB5" : "2px dashed #C89C14",
                flexShrink: 0,
                display: "inline-block",
              }}
            />
            <span>{followUpHint}</span>
          </div>
        )}

        {confirmationBanner && (phase === "S5B1_RunnerUpBeaten" || phase === "S7A_FirstPickWonFinal" || phase === "S7B_FirstPickLostFinal") && (
          <div
            data-testid="confirmation-card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 12px",
              borderRadius: "12px",
              backgroundColor: "var(--surface-hint-ok)",
              border: "1px solid var(--surface-hint-ok-border)",
              fontSize: "12px",
              lineHeight: 1.35,
              color: "var(--text-primary)",
              marginTop: "2px",
            }}
          >
            <span
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                backgroundColor: "var(--cta-primary)",
                color: "#FFFFFF",
                fontSize: "10px",
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              ✓
            </span>
            <span>{confirmationBanner}</span>
          </div>
        )}

        {/* Primary Action Button */}
        <div style={{ marginTop: "auto", paddingTop: "8px" }}>
          {phase === "S4_InitialResult" && (
            <button
              onClick={onCompareWithRunnerUp}
              data-testid="cta-compare-runner-up"
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "14px",
                border: "none",
                backgroundColor: "var(--cta-primary)",
                color: "var(--cta-primary-text)",
                fontSize: "15px",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(47, 93, 52, 0.3)",
              }}
            >
              {t("result.compareWithRunnerUp")}
            </button>
          )}

          {phase === "S5B2_RunnerUpTookLead" && (
            <button
              onClick={onStartFinalCheck}
              data-testid="cta-final-check-first-pick"
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "14px",
                border: "none",
                backgroundColor: "var(--cta-primary)",
                color: "var(--cta-primary-text)",
                fontSize: "15px",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(47, 93, 52, 0.3)",
              }}
            >
              {t("result.flipFinalCheckFirstPick")}
            </button>
          )}

          {(phase === "S5B1_RunnerUpBeaten" ||
            phase === "S7A_FirstPickWonFinal" ||
            phase === "S7B_FirstPickLostFinal") && (
            <button
              onClick={onReset}
              data-testid="cta-scan-another"
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "14px",
                border: "none",
                backgroundColor: "var(--cta-primary)",
                color: "var(--cta-primary-text)",
                fontSize: "15px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {t("result.scanAnother")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
