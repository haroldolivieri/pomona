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
  // 3-way bottom sheet snap mode:
  // 'collapsed': minimum sheet size (peek mode) showing handle + target goal + verdict headline + score bar; picture maximized to ~68dvh
  // 'default': standard balance showing above + traits + storage cards
  // 'expanded': scrolled up to clearly show follow-up hint and action buttons
  // Two clean sheet states:
  // 'collapsed': min-height mode showing grab handle + target selector + headline + score meter (ripeness bar)
  // 'expanded': fully opened static sheet showing all cards, traits, and action buttons
  const [sheetMode, setSheetMode] = useState<"collapsed" | "expanded">("collapsed");
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartY = useRef<number | null>(null);

  // Photo pan offset (allows user to drag/scroll photo up and down to see items at the bottom or top)
  const [photoPanY, setPhotoPanY] = useState<number>(0);
  const photoPanStartY = useRef<number | null>(null);

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [coverRect, setCoverRect] = useState<RenderedCoverRect | null>(null);
  const hasAutoCentered = useRef<boolean>(false);
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
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && viewportRef.current) {
      ro = new ResizeObserver(() => {
        updateCoverRect();
      });
      ro.observe(viewportRef.current);
    }
    return () => {
      window.removeEventListener("resize", updateCoverRect);
      if (ro) ro.disconnect();
    };
  }, [round1PhotoDataUrl, sheetMode]);

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
      headline = targetResolution.headline === "Buy it." ? "Best available." : targetResolution.headline;
      subtitle = targetResolution.subtitle;
      followUpHint = targetResolution.followUpHintOverride || followUp?.bannerText || "The blue one could be sweeter. Flip it and snap.";
    } else {
      eyebrow = "BEST IN VIEW";
      headline = "Best available.";
      subtitle = `High confidence · ${candidateCount} compared in view`;
      followUpHint = followUp?.bannerText || "The blue one could be sweeter. Flip it and snap.";
    }
    runnerUpTagLabel = "Runner-Up";
  } else if (phase === "S5B1_RunnerUpBeaten") {
    activeWinner = firstPick;
    activeRunnerUp = runnerUp;
    const score1 = winnerScoreStr(firstPick?.score);
    const score2 = winnerScoreStr(runnerUp?.score);
    eyebrow = `✓ 1ST WINNER WINS · BEATS RUNNER-UP (${score1} VS ${score2})`;
    headline = "Best available.";
    subtitle = "Your initial winner in the yellow box remains the best produce.";
    confirmationBanner = `Runner-Up scored ${score2} after flip (${runnerUp?.flipSummary || "inspected"}). Stick with your initial 1st winner in the yellow box.`;
    prevMarkScore = runnerUp?.score ?? null;
    runnerUpTagLabel = `Runner-Up · ${score2}`;
  } else if (phase === "S5B2_RunnerUpTookLead") {
    activeWinner = runnerUp;
    activeRunnerUp = firstPick;
    const score1 = winnerScoreStr(firstPick?.score);
    const score2 = winnerScoreStr(runnerUp?.score);
    eyebrow = `★ NEW WINNER · BEATS 1ST WINNER (${score2} VS ${score1})`;
    headline = "Buy this Runner-Up.";
    subtitle = `The flipped fruit scored ${score2} and took the lead over your 1st winner (${score1}).`;
    followUpHint = followUp?.bannerText || `Your 1st Winner (${score1}) was only inspected from the top. Flip it too for a fair final check, or take this new winner now.`;
    prevMarkScore = firstPick?.score ?? null;
    runnerUpTagLabel = `1st Winner · ${score1}`;
  } else if (phase === "S7A_FirstPickWonFinal") {
    activeWinner = firstPick;
    activeRunnerUp = runnerUp;
    const score1 = winnerScoreStr(firstPick?.score);
    const score2 = winnerScoreStr(runnerUp?.score);
    eyebrow = `★ FINAL VERDICT · 1ST WINNER RECLAIMS THE WIN (${score1} VS ${score2})`;
    headline = "Best available.";
    subtitle = `After checking both sides, your original 1st winner won overall (${score1} vs ${score2}).`;
    confirmationBanner = `After flipping your 1st winner, its final score reached ${score1}, beating the Runner-Up (${score2}). Take your original winner!`;
    prevMarkScore = runnerUp?.score ?? null;
    runnerUpTagLabel = `Runner-Up · ${score2}`;
  } else if (phase === "S7B_FirstPickLostFinal") {
    activeWinner = runnerUp;
    activeRunnerUp = firstPick;
    const score1 = winnerScoreStr(firstPick?.score);
    const score2 = winnerScoreStr(runnerUp?.score);
    eyebrow = `★ FINAL VERDICT · RUNNER-UP WINS (${score2} VS ${score1})`;
    headline = "Buy the Runner-Up.";
    subtitle = `Both checked from both sides · The fruit flipped in Round 2 won (${score2} vs ${score1}).`;
    confirmationBanner = `Your 1st Winner scored ${score1} after flip. The Runner-Up you flipped in Round 2 (${score2}) is confirmed as the best pick.`;
    prevMarkScore = firstPick?.score ?? null;
    runnerUpTagLabel = `1st Winner · ${score1}`;
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

  // Calculate live drag delta and snap translation:
  const isFullyOpen = sheetMode === "expanded";

  // Coordinates dragging for bottom sheet with native sheet mechanics:
  // - When collapsed: dragging or tapping on drag area expands sheet
  // - When expanded: dragging down on drag area collapses sheet;
  //   or when scrolling inside content and at scrollTop === 0, dragging down collapses sheet.
  const handleDragStart = (clientY: number) => {
    dragStartY.current = clientY;
    setIsDragging(true);
  };

  const handleDragMove = (clientY: number) => {
    if (dragStartY.current === null) return;
    const deltaY = clientY - dragStartY.current;
    if (sheetMode === "collapsed") {
      // When collapsed, user drags upward: deltaY is negative, clamp so it doesn't drag downwards past 0
      setDragOffsetY(Math.min(0, deltaY));
    } else {
      // When expanded, user drags downward: deltaY is positive, clamp so it doesn't pull sheet upwards past 0
      setDragOffsetY(Math.max(0, deltaY));
    }
  };

  const handleDragEnd = () => {
    if (dragStartY.current === null) return;
    if (sheetMode === "collapsed" && dragOffsetY < -35) {
      // Swiping UP from collapsed -> expand
      setSheetMode("expanded");
    } else if (sheetMode === "expanded" && dragOffsetY > 40) {
      // Swiping DOWN from expanded -> collapse
      setSheetMode("collapsed");
    }
    dragStartY.current = null;
    setDragOffsetY(0);
    setIsDragging(false);
  };

  // Internal content scroll container ref and pull-down-to-collapse tracking
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollDragStartY = useRef<number | null>(null);

  const handleContentTouchStart = (e: React.TouchEvent) => {
    // Only intercept when at the very top of scroll container
    if (contentScrollRef.current && contentScrollRef.current.scrollTop <= 0) {
      scrollDragStartY.current = e.touches[0].clientY;
    } else {
      scrollDragStartY.current = null;
    }
  };

  const handleContentTouchMove = (e: React.TouchEvent) => {
    if (scrollDragStartY.current !== null && contentScrollRef.current && contentScrollRef.current.scrollTop <= 0) {
      const deltaY = e.touches[0].clientY - scrollDragStartY.current;
      if (deltaY > 10) {
        // User is pulling down at top of scroll view: translate sheet down like native sheet
        handleDragStart(scrollDragStartY.current);
        handleDragMove(e.touches[0].clientY);
      }
    }
  };

  const handleContentTouchEnd = () => {
    if (scrollDragStartY.current !== null) {
      scrollDragStartY.current = null;
      if (isDragging) {
        handleDragEnd();
      }
    }
  };

  // Photo pan handlers: allow dragging the photo backdrop up/down
  const handlePhotoPanStart = (clientY: number) => {
    photoPanStartY.current = clientY;
  };

  const handlePhotoPanMove = (clientY: number) => {
    if (photoPanStartY.current === null) return;
    const deltaY = clientY - photoPanStartY.current;
    setPhotoPanY((prev) => Math.max(-200, Math.min(200, prev + deltaY)));
    photoPanStartY.current = clientY;
  };

  const handlePhotoPanEnd = () => {
    photoPanStartY.current = null;
  };

  // Auto-scroll image so winner is centered in visible photo area above bottom sheet
  useEffect(() => {
    if (!coverRect || !activeWinner || !viewportRef.current) return;
    const vpHeight = viewportRef.current.clientHeight;
    if (vpHeight <= 0) return;

    // Determine bottom sheet height (or fallback to ~30% of viewport when collapsed)
    const sheetEl = sheetRef.current;
    const sheetHeight = sheetEl?.offsetHeight || vpHeight * 0.3;
    const visibleAreaHeight = Math.max(100, vpHeight - sheetHeight);

    // Target center Y in viewport coordinates
    const targetCenterY = visibleAreaHeight / 2;

    // Winner box center Y in 0..1000 normalized coordinates
    const boxCenterNormalizedY = (activeWinner.box[0] + activeWinner.box[2]) / 2 / 1000;

    // Rendered winner center Y in unpanned coverRect coordinates
    const renderedWinnerY = coverRect.top + boxCenterNormalizedY * coverRect.height;

    // Required pan offset: targetCenterY - renderedWinnerY
    // Negative offset moves photo up, positive moves photo down
    const desiredPanY = Math.round(targetCenterY - renderedWinnerY);

    // Allow a generous vertical pan range so any winner anywhere in the frame can be centered
    const maxPan = Math.max(300, coverRect.height / 2);
    const clampedPanY = Math.max(-maxPan, Math.min(maxPan, desiredPanY));

    setPhotoPanY(clampedPanY);
  }, [coverRect, activeWinner?.id, sheetMode]);

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

      {/* Full-bleed Photo Viewport with Bounding Boxes (fills whole screen behind sheet, supports vertical panning) */}
      <div
        ref={viewportRef}
        data-testid="result-photo-viewport"
        onTouchStart={(e) => handlePhotoPanStart(e.touches[0].clientY)}
        onTouchMove={(e) => handlePhotoPanMove(e.touches[0].clientY)}
        onTouchEnd={handlePhotoPanEnd}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") handlePhotoPanStart(e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse") handlePhotoPanMove(e.clientY);
        }}
        onPointerUp={(e) => {
          if (e.pointerType === "mouse") handlePhotoPanEnd();
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "#000000",
          overflow: "hidden",
          zIndex: 1,
          transform: `translate3d(0, ${photoPanY}px, 0)`,
          transition: photoPanStartY.current !== null ? "none" : "transform 0.24s cubic-bezier(0.2, 0.9, 0.3, 1)",
          willChange: "transform",
          cursor: "grab",
          touchAction: "none",
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
              pointerEvents: "none",
              userSelect: "none",
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

      {/* Interactive Bottom Sheet (overlay sliding on top of full-bleed photo) */}
      <div
        ref={sheetRef}
        data-testid="result-bottom-sheet"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "auto",
          maxHeight: "86dvh",
          backgroundColor: "var(--surface-sheet)",
          color: "var(--text-primary)",
          borderTopLeftRadius: "26px",
          borderTopRightRadius: "26px",
          paddingTop: "2px",
          paddingLeft: "18px",
          paddingRight: "18px",
          paddingBottom: isFullyOpen
            ? "calc(max(16px, env(safe-area-inset-bottom)) + 12px)"
            : "calc(max(14px, env(safe-area-inset-bottom)) + 4px)",
          zIndex: 15,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          boxShadow: "0 -10px 30px rgba(0, 0, 0, 0.28)",
          transform: isFullyOpen
            ? `translate3d(0, ${Math.max(0, dragOffsetY)}px, 0)`
            : `translate3d(0, ${Math.min(0, dragOffsetY)}px, 0)`,
          transition: isDragging ? "none" : "height 0.32s cubic-bezier(0.2, 0.9, 0.3, 1), transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1)",
          overflowY: isFullyOpen ? "auto" : "hidden",
          WebkitOverflowScrolling: "touch",
          touchAction: isFullyOpen ? "pan-y" : "none",
        }}
      >
        {/* Solid background skirt extending below the sheet to prevent any gap during rubberband or drag */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "98%",
            left: 0,
            right: 0,
            height: "100vh",
            backgroundColor: "var(--surface-sheet)",
            pointerEvents: "none",
          }}
        />
        {/* Interactive Top Drag Area (drag anywhere across grab handle, target selector, headlines, and score bar) */}
        <div
          data-testid="sheet-drag-area"
          onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
          onTouchMove={(e) => {
            if (isDragging) {
              handleDragMove(e.touches[0].clientY);
            }
          }}
          onTouchEnd={handleDragEnd}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse") {
              handleDragStart(e.clientY);
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
          onClick={(e) => {
            // Prevent toggling if user was clicking a button inside like the target tabs
            const target = e.target as HTMLElement;
            if (target.closest("button") || target.closest("[role='tab']")) return;
            setSheetMode((prev) => (prev === "collapsed" ? "expanded" : "collapsed"));
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            touchAction: "none",
            cursor: "pointer",
          }}
        >
          {/* Grab Handle Pill */}
          <div
            style={{
              width: "100%",
              padding: "6px 0 3px 0",
              display: "flex",
              justifyContent: "center",
              cursor: "pointer",
              touchAction: "none",
            }}
          >
            <div
              data-testid="drag-handle"
              style={{
                width: "42px",
                height: "5px",
                borderRadius: "4px",
                backgroundColor: "rgba(107, 106, 101, 0.4)",
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

        {/* Divider 1: Between Target Selector / Goal Banner and Headline area */}
        <div
          data-testid="sheet-divider-top"
          style={{
            height: "1px",
            backgroundColor: "var(--surface-card-border)",
            opacity: 0.6,
            marginTop: "6px",
            marginBottom: "4px",
          }}
        />

        {/* Eyebrow, Headline & Round Score Rating */}
        <div>
          {phase !== "S4_InitialResult" && eyebrow && (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "var(--eyebrow-accent)",
                textTransform: "uppercase",
                display: "block",
                marginBottom: "4px",
              }}
            >
              {eyebrow}
            </span>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div>
              <h1
                className="font-serif"
                style={{
                  fontSize: "30px",
                  fontWeight: 700,
                  lineHeight: 1.15,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.015em",
                }}
              >
                {headline}
              </h1>
              <p style={{ fontSize: "12.5px", color: "var(--text-muted)", marginTop: "2px" }}>
                {subtitle}
              </p>
            </div>

            {/* Circular Score Meter next to headline */}
            {activeWinner && (
              <div
                data-testid="circular-score-meter"
                style={{
                  position: "relative",
                  width: "48px",
                  height: "48px",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 48 48"
                  style={{ transform: "rotate(-90deg)", position: "absolute", inset: 0 }}
                >
                  {/* Track circle */}
                  <circle
                    cx="24"
                    cy="24"
                    r="19"
                    fill="none"
                    stroke="var(--surface-track)"
                    strokeWidth="3.5"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="24"
                    cy="24"
                    r="19"
                    fill="none"
                    stroke="#F2C935"
                    strokeWidth="3.5"
                    strokeDasharray={2 * Math.PI * 19}
                    strokeDashoffset={
                      2 * Math.PI * 19 * (1 - Math.min(10, Math.max(0, activeWinner.score)) / 10)
                    }
                    strokeLinecap="round"
                  />
                  {/* Previous tick mark if multi-round */}
                  {prevMarkScore !== null && (
                    <circle
                      data-testid="score-prev-mark"
                      cx="24"
                      cy="24"
                      r="19"
                      fill="none"
                      stroke="#142117"
                      strokeWidth="3.5"
                      strokeDasharray={`2 ${2 * Math.PI * 19 - 2}`}
                      strokeDashoffset={
                        -1 * (2 * Math.PI * 19 * (Math.min(10, Math.max(0, prevMarkScore)) / 10) - 1)
                      }
                      opacity={0.7}
                    />
                  )}
                </svg>
                <span
                  className="tabular-nums"
                  style={{
                    fontSize: "13px",
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    lineHeight: 1,
                  }}
                >
                  {activeWinner.score.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Expanded content visible when sheet is fully open */}
        {isFullyOpen && (
          <div
            ref={contentScrollRef}
            data-testid="sheet-expanded-content"
            onTouchStart={handleContentTouchStart}
            onTouchMove={handleContentTouchMove}
            onTouchEnd={handleContentTouchEnd}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              flex: 1,
            }}
          >
            {/* Traits Chips */}
            {activeWinner?.traits && activeWinner.traits.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {activeWinner.traits.map((trait, idx) => (
                  <span
                    key={idx}
                    style={{
                      padding: "5px 10px",
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

            {/* Divider 2: Between Traits and Storage Cards */}
            <div
              data-testid="sheet-divider-middle"
              style={{
                height: "1px",
                backgroundColor: "var(--surface-card-border)",
                opacity: 0.6,
                marginTop: "6px",
                marginBottom: "4px",
              }}
            />

        {/* Storage Cards Layout (2 Rows) */}
        {afterPurchase && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "2px" }}>
            {/* Row 1: Full-width card: 🗓 Eat within (left) — {eatWithinLabel} (right bold) */}
            <div
              style={{
                backgroundColor: "var(--surface-card)",
                border: "1px solid var(--surface-card-border)",
                borderRadius: "13px",
                padding: "8px 12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: "10.5px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                }}
              >
                {t("result.eatWithin")}
              </span>
              <strong style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                {targetResolution?.eatWithinOverride || afterPurchase.eatWithinLabel}
              </strong>
            </div>

            {/* Row 2: Two equal side-by-side cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              {/* Card 1: 🧺 Before cut */}
              <div
                style={{
                  backgroundColor: "var(--surface-card)",
                  border: "1px solid var(--surface-card-border)",
                  borderRadius: "13px",
                  padding: "8px 10px",
                }}
              >
                <span
                  style={{
                    fontSize: "9.5px",
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
                    fontSize: "12.5px",
                    fontWeight: 700,
                    display: "block",
                    marginTop: "3px",
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
                  borderRadius: "13px",
                  padding: "8px 10px",
                }}
              >
                <span
                  style={{
                    fontSize: "9.5px",
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
                    fontSize: "12.5px",
                    fontWeight: 700,
                    display: "block",
                    marginTop: "3px",
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
              gap: "9px",
              padding: "9px 12px",
              borderRadius: "12px",
              backgroundColor: "var(--surface-hint-warn)",
              border: "1px solid var(--surface-hint-warn-border)",
              fontSize: "12px",
              lineHeight: 1.35,
              color: "var(--text-primary)",
              marginTop: "2px",
            }}
          >
            {/* Flip / Rotation icon */}
            <span
              data-testid="flip-hint-icon"
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                backgroundColor: phase === "S4_InitialResult" ? "rgba(47, 109, 181, 0.15)" : "rgba(200, 156, 20, 0.15)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: phase === "S4_InitialResult" ? "#2F6DB5" : "#C89C14",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
            </span>
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

        {/* Divider 3: Before Primary Action Button */}
        <div
          data-testid="sheet-divider-bottom"
          style={{
            height: "1px",
            backgroundColor: "var(--surface-card-border)",
            opacity: 0.6,
            marginTop: "8px",
            marginBottom: "2px",
          }}
        />

        {/* Primary Action Button */}
        <div style={{ paddingTop: "6px" }}>
          {phase === "S4_InitialResult" && (
            <button
              onClick={onCompareWithRunnerUp}
              data-testid="cta-compare-runner-up"
              style={{
                width: "100%",
                padding: "12px",
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
                padding: "12px",
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
        )}
      </div>
    </div>
  );
};
