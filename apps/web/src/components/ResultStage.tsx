import React, { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  type Candidate,
  type TargetRipenessWindow,
  resolveCandidatesForTarget,
} from "@pomona/contract";
import type { ScanMachineState } from "../state/scan-state-machine";
import { describeBoxPosition } from "../lib/spatial-a11y";
import { SeasonalityStrip } from "./SeasonalityStrip";
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
  // 'min': collapsed even more up to divider 1 (under Ready Now tab / Goal selector)
  // 'default': default initial height up to divider 2 (below labels / vibrant skin / score)
  // 'expanded': fully scrolled up showing storage cards, hint, and action buttons
  const [sheetMode, setSheetMode] = useState<"min" | "default" | "expanded">("default");
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartY = useRef<number | null>(null);
  const dragStartTime = useRef<number>(0);
  const dragMovedDistance = useRef<number>(0);
  const suppressClickUntil = useRef<number>(0);
  const dragSource = useRef<"sheet" | "photo">("sheet");

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const minPeekRef = useRef<HTMLDivElement | null>(null); // Peek bar up to divider 1 (Ready now tab)
  const defaultPeekRef = useRef<HTMLDivElement | null>(null); // Peek bar up to divider 2 (below labels)
  const [sheetHeight, setSheetHeight] = useState<number>(0);
  const [minPeekHeight, setMinPeekHeight] = useState<number>(76);
  const [defaultPeekHeight, setDefaultPeekHeight] = useState<number>(180);
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

  const targetRipeness = state.targetRipeness || "ready_now";

  const updateSheetDimensions = () => {
    if (sheetRef.current && sheetRef.current.offsetHeight > 0) {
      setSheetHeight(sheetRef.current.offsetHeight);
    }
    if (minPeekRef.current && minPeekRef.current.offsetHeight > 0) {
      setMinPeekHeight(minPeekRef.current.offsetHeight);
    }
    if (defaultPeekRef.current && defaultPeekRef.current.offsetHeight > 0) {
      setDefaultPeekHeight(defaultPeekRef.current.offsetHeight);
    }
  };

  useEffect(() => {
    updateSheetDimensions();
    window.addEventListener("resize", updateSheetDimensions);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && sheetRef.current) {
      ro = new ResizeObserver(() => {
        updateSheetDimensions();
      });
      ro.observe(sheetRef.current);
      if (minPeekRef.current) {
        ro.observe(minPeekRef.current);
      }
      if (defaultPeekRef.current) {
        ro.observe(defaultPeekRef.current);
      }
    }
    return () => {
      window.removeEventListener("resize", updateSheetDimensions);
      if (ro) ro.disconnect();
    };
  }, [phase, targetRipeness, lastResponse]);

  const [selectedOriginCode, setSelectedOriginCode] = useState<string | null>(null);
  const producePhaseType = lastResponse?.produce?.type;
  useEffect(() => {
    setSelectedOriginCode(null);
  }, [producePhaseType]);

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

  let targetResolution = null;
  if (phase === "S4_InitialResult" && state.allCandidatesRound1 && state.allCandidatesRound1.length > 0) {
    targetResolution = resolveCandidatesForTarget(state.allCandidatesRound1, targetRipeness);
  }

  const isMismatch = targetResolution ? !targetResolution.isExactMatch : false;
  const mismatchColor = targetResolution?.mismatchReason === "all_underripe"
    ? "#2563EB"
    : "#EA580C";
  const winnerBorderColor = isMismatch ? mismatchColor : "#F5D547";
  const winnerGlowColor = isMismatch
    ? (targetResolution?.mismatchReason === "all_underripe" ? "rgba(37, 99, 235, 0.35)" : "rgba(234, 88, 12, 0.35)")
    : "rgba(245, 213, 71, 0.32)";
  const winnerBadgeBg = isMismatch ? mismatchColor : "#F5D547";
  const winnerBadgeColor = isMismatch ? "#FFFFFF" : "#142117";

  const winnerScoreStr = (score?: number) => (score !== undefined ? score.toFixed(1) : "8.6");
  const candidateCount = state.allCandidatesRound1?.length || lastResponse.candidates?.length || 2;

  if (phase === "S4_InitialResult") {
    activeWinner = firstPick;
    activeRunnerUp = runnerUp;
    if (targetResolution) {
      eyebrow = targetResolution.eyebrow;
      headline = targetResolution.headline === "Buy it." ? "Best available." : targetResolution.headline;
      subtitle = targetResolution.subtitle;
      if (targetRipeness === "ready_now") {
        followUpHint = state.round1FollowUp?.bannerText || followUp?.bannerText || targetResolution.followUpHintOverride || "The blue one could be sweeter. Flip it and snap.";
      } else {
        followUpHint = targetResolution.followUpHintOverride || followUp?.bannerText || "Check underside before storing.";
      }
    } else {
      eyebrow = "BEST IN VIEW";
      headline = "Best available.";
      subtitle = `High confidence · ${candidateCount} compared in view`;
      followUpHint = state.round1FollowUp?.bannerText || followUp?.bannerText || "The blue one could be sweeter. Flip it and snap.";
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
    followUpHint = (followUp?.bannerText
      ? followUp.bannerText.replace(/1st\s*pick/gi, "1st Winner").replace(/first\s*pick/gi, "first winner")
      : null) || `Your 1st Winner (${score1}) was only inspected from the top. Flip it too for a fair final check, or take this new winner now.`;
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
  const isFullyOpen = sheetMode === "expanded";

  // Calculate translation distance needed to tuck the sheet to each snap height:
  // - 'expanded': translateY = 0 (full sheet visible)
  // - 'default': translateY = sheetHeight - defaultPeekHeight (shows handle + goal + headline/score + labels + divider 2)
  // - 'min': translateY = sheetHeight - minPeekHeight (shows handle + goal + divider 1)
  const defaultTranslate = sheetHeight > 0
    ? Math.max(0, sheetHeight - defaultPeekHeight)
    : 160;
  const maxTranslate = sheetHeight > 0
    ? Math.max(0, sheetHeight - minPeekHeight)
    : 320;

  // Base translateY for the current discrete mode:
  const baseTranslate =
    sheetMode === "expanded"
      ? 0
      : sheetMode === "default"
      ? defaultTranslate
      : maxTranslate;

  // Apply drag offset directly with rubber banding past extremes
  let currentTranslate = baseTranslate + dragOffsetY;
  if (currentTranslate < 0) {
    currentTranslate = currentTranslate * 0.2; // Rubberband upward past fully expanded
  } else if (currentTranslate > maxTranslate) {
    currentTranslate = maxTranslate + (currentTranslate - maxTranslate) * 0.2; // Rubberband downward past min collapsed
  }

  // Coordinates dragging for bottom sheet across 3 snap points:
  // expanded <---> default <---> min
  // Coordinates dragging for bottom sheet across 3 snap points:
  // expanded <---> default <---> min
  const handleDragStart = (clientY: number, source: "sheet" | "photo" = "sheet") => {
    dragSource.current = source;
    dragStartY.current = clientY;
    dragStartTime.current = Date.now();
    dragMovedDistance.current = 0;
    setIsDragging(true);
  };

  const handleDragMove = (clientY: number) => {
    if (dragStartY.current === null) return;
    const rawDeltaY = clientY - dragStartY.current;
    dragMovedDistance.current = Math.abs(rawDeltaY);
    // When dragging the photo directly, apply a 1.6x multiplier so dragging the photo feels natural
    // and creates a differentiated parallax motion relative to the bottom sheet
    const factor = dragSource.current === "photo" ? 1.6 : 1.0;
    setDragOffsetY(rawDeltaY * factor);
  };

  const handleDragEnd = (clientY?: number) => {
    if (dragStartY.current === null) return;
    const currentY = clientY ?? (dragStartY.current + dragOffsetY);
    const rawDeltaY = currentY - dragStartY.current;
    const factor = dragSource.current === "photo" ? 1.6 : 1.0;
    const deltaY = rawDeltaY * factor;
    const elapsed = Math.max(1, Date.now() - dragStartTime.current);
    const velocity = deltaY / elapsed; // px/ms

    if (dragMovedDistance.current > 8) {
      suppressClickUntil.current = Date.now() + 250;

      // Project ending position based on current drag + velocity throw
      const projectedTranslate = baseTranslate + deltaY + velocity * 120;

      // Threshold midpoints between snap levels:
      const midExpandedDefault = defaultTranslate / 2;
      const midDefaultMin = (defaultTranslate + maxTranslate) / 2;

      if (projectedTranslate <= midExpandedDefault) {
        setSheetMode("expanded");
      } else if (projectedTranslate <= midDefaultMin) {
        setSheetMode("default");
      } else {
        setSheetMode("min");
      }
    }

    dragStartY.current = null;
    setDragOffsetY(0);
    setIsDragging(false);
  };

  // Toggle on click / tap:
  // If at 'expanded', collapses to 'default'
  // If at 'default' or 'min', toggles to 'expanded' (or user can toggle back and forth)
  const handleSheetToggle = () => {
    if (Date.now() < suppressClickUntil.current) return;
    setSheetMode((prev) => (prev === "expanded" ? "default" : "expanded"));
  };

  // Synchronous live photo pan offset based on current sheet translation
  // Synchronous live photo pan offset based on current sheet translation
  // Moves the photo at the exact same time as the bottom sheet with a smooth 2:1 parallax
  const livePhotoPanY = useMemo(() => {
    if (!coverRect || !activeWinner) return 0;
    const vpHeight = viewportRef.current?.clientHeight || (typeof window !== "undefined" && window.innerHeight > 0 ? window.innerHeight : 800);
    if (vpHeight <= 0) return 0;

    const actualSheetHeight = sheetHeight || sheetRef.current?.offsetHeight || 0;
    const basePeek = sheetMode === "expanded"
      ? (actualSheetHeight || vpHeight * 0.5)
      : sheetMode === "default"
      ? (defaultPeekHeight || 180)
      : (minPeekHeight || 76);

    const effectiveSheetHeight = actualSheetHeight > 0
      ? Math.max(0, actualSheetHeight - currentTranslate)
      : Math.max(0, basePeek - dragOffsetY);

    const visibleAreaHeight = Math.max(120, vpHeight - effectiveSheetHeight);
    const targetCenterY = visibleAreaHeight / 2;

    const boxCenterNormalizedY = (activeWinner.box[0] + activeWinner.box[2]) / 2 / 1000;
    const renderedWinnerY = coverRect.top + boxCenterNormalizedY * coverRect.height;
    const desiredPanY = Math.round(targetCenterY - renderedWinnerY);

    const minPanY = Math.min(0, (vpHeight - effectiveSheetHeight) - (coverRect.top + coverRect.height));
    const maxPanY = Math.max(0, -coverRect.top);

    return minPanY <= maxPanY
      ? Math.max(minPanY, Math.min(maxPanY, desiredPanY))
      : desiredPanY;
  }, [coverRect, activeWinner, currentTranslate, dragOffsetY, sheetHeight, sheetMode, defaultPeekHeight, minPeekHeight]);

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

      {/* Full-bleed Photo Viewport with Bounding Boxes (fills whole screen behind sheet, auto-centers winner above sheet) */}
      <div
        ref={viewportRef}
        data-testid="result-photo-viewport"
        onTouchStart={(e) => handleDragStart(e.touches[0].clientY, "photo")}
        onTouchMove={(e) => {
          if (dragStartY.current !== null) {
            handleDragMove(e.touches[0].clientY);
          }
        }}
        onTouchEnd={(e) => {
          const clientY = e.changedTouches?.[0]?.clientY;
          handleDragEnd(clientY);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") {
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {}
            handleDragStart(e.clientY, "photo");
          }
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" && dragStartY.current !== null) {
            handleDragMove(e.clientY);
          }
        }}
        onPointerUp={(e) => {
          if (e.pointerType === "mouse") {
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {}
            handleDragEnd(e.clientY);
          }
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "#000000",
          overflow: "hidden",
          zIndex: 1,
          transform: `translate3d(0, ${livePhotoPanY}px, 0)`,
          transition: isDragging
            ? "none"
            : "transform 0.32s cubic-bezier(0.2, 0.0, 0, 1.0)",
          willChange: "transform",
          pointerEvents: "auto",
          touchAction: "none",
          userSelect: "none",
          cursor: isDragging ? "grabbing" : "grab",
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
          {/* Other evaluated contenders with clear score badges */}
          {lastResponse.candidates &&
            lastResponse.candidates
              .filter(
                (c) =>
                  c.id !== activeWinner?.id &&
                  c.id !== activeRunnerUp?.id
              )
              .map((otherCand) => (
                <div
                  key={otherCand.id}
                  data-testid={`other-candidate-box-${otherCand.id}`}
                  style={{
                    position: "absolute",
                    ...boxToStyle(otherCand.box),
                    borderRadius: "14px",
                    border: "2px dashed rgba(255, 255, 255, 0.7)",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
                    boxSizing: "border-box",
                    pointerEvents: "none",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "-12px",
                      right: "6px",
                      backgroundColor: "rgba(20, 24, 20, 0.88)",
                      color: "#FFFFFF",
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: "8px",
                      whiteSpace: "nowrap",
                      fontFamily: "Inter, sans-serif",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
                      border: "1px solid rgba(255, 255, 255, 0.25)",
                    }}
                  >
                    {otherCand.score.toFixed(1)}
                  </span>
                </div>
              ))}

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
                  fontSize: "10.5px",
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: "8px",
                  whiteSpace: "nowrap",
                  fontFamily: "Inter, sans-serif",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                }}
              >
                {phase === "S4_InitialResult" && activeRunnerUp.score !== undefined
                  ? `Runner-Up · ${activeRunnerUp.score.toFixed(1)}`
                  : runnerUpTagLabel}
              </span>
            </div>
          )}

          {activeWinner && (
            <div
              style={{
                position: "absolute",
                ...boxToStyle(activeWinner.box),
                borderRadius: "14px",
                border: `3px solid ${winnerBorderColor}`,
                boxShadow: `0 0 0 4px ${winnerGlowColor}, 0 6px 18px rgba(0, 0, 0, 0.35)`,
                boxSizing: "border-box",
                pointerEvents: "none",
              }}
            >
              {/* Tag on top-left of winner when not an exact match */}
              {isMismatch && targetResolution?.badgeLabel && (
                <span
                  data-testid="winner-mismatch-tag"
                  style={{
                    position: "absolute",
                    top: "-12px",
                    left: "6px",
                    backgroundColor: winnerBorderColor,
                    color: "#FFFFFF",
                    fontSize: "10.5px",
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "8px",
                    whiteSpace: "nowrap",
                    fontFamily: "Inter, sans-serif",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span>{targetResolution.mismatchReason === "all_underripe" ? "⏱️" : "⚠️"}</span>
                  <span>{targetResolution.badgeLabel}</span>
                </span>
              )}

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
                  backgroundColor: winnerBadgeBg,
                  color: winnerBadgeColor,
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

      {/* Interactive Bottom Sheet (Material Design 3 standard bottom sheet, ZERO internal scroll) */}
      <div
        ref={sheetRef}
        data-testid="result-bottom-sheet"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "auto",
          maxHeight: "92dvh",
          backgroundColor: "var(--surface-sheet)",
          color: "var(--text-primary)",
          borderTopLeftRadius: "26px",
          borderTopRightRadius: "26px",
          paddingTop: "0px",
          paddingLeft: "18px",
          paddingRight: "18px",
          paddingBottom: isFullyOpen
            ? "calc(max(12px, env(safe-area-inset-bottom)) + 4px)"
            : "calc(max(14px, env(safe-area-inset-bottom)) + 4px)",
          zIndex: 15,
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.22)",
          transform: `translate3d(0, ${currentTranslate}px, 0)`,
          transition: isDragging
            ? "none"
            : "transform 0.32s cubic-bezier(0.2, 0.0, 0, 1.0)",
          overflow: "visible",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        {/* Solid background skirt extending below the sheet to prevent any gap during drag */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "90%",
            left: 0,
            right: 0,
            height: "100vh",
            backgroundColor: "var(--surface-sheet)",
            pointerEvents: "none",
            zIndex: -1,
          }}
        />
        {/* Material 3 Drag Handle Affordance: dedicated touch target with accessible single-pointer/keyboard alternative */}
        <div
          ref={defaultPeekRef}
          data-testid="sheet-peek-bar"
          style={{ width: "100%", display: "flex", flexDirection: "column" }}
        >
          {/* Section 1: Drag handle + Ripeness tabs + Divider 1 (Min collapsed height boundary) */}
          <div ref={minPeekRef} style={{ width: "100%", display: "flex", flexDirection: "column" }}>
            <div
              data-testid="sheet-drag-area"
              role="button"
              tabIndex={0}
              aria-label={sheetMode === "expanded" ? "Collapse results sheet" : "Expand results sheet"}
              aria-expanded={sheetMode === "expanded"}
              onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
              onTouchMove={(e) => {
                if (dragStartY.current !== null) {
                  handleDragMove(e.touches[0].clientY);
                }
              }}
              onTouchEnd={(e) => {
                const clientY = e.changedTouches?.[0]?.clientY;
                handleDragEnd(clientY);
              }}
              onPointerDown={(e) => {
                if (e.pointerType === "mouse") {
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
              onClick={handleSheetToggle}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSheetToggle();
                }
              }}
              style={{
                width: "100%",
                minHeight: "20px",
                paddingTop: "8px",
                paddingBottom: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                touchAction: "none",
                outline: "none",
              }}
            >
              <div
                data-testid="drag-handle"
                style={{
                  width: "36px",
                  height: "4px",
                  borderRadius: "4px",
                  backgroundColor: "rgba(107, 106, 101, 0.45)",
                  pointerEvents: "none",
                }}
              />
            </div>

            {/* 3-Way Segmented Control in S4_InitialResult - also draggable to expand/collapse sheet */}
            {phase === "S4_InitialResult" && (
              <div
                data-testid="ripeness-target-switch"
                role="tablist"
                aria-label="Target ripeness window"
                onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
                onTouchMove={(e) => {
                  if (dragStartY.current !== null) {
                    handleDragMove(e.touches[0].clientY);
                  }
                }}
                onTouchEnd={(e) => {
                  const clientY = e.changedTouches?.[0]?.clientY;
                  handleDragEnd(clientY);
                }}
                onPointerDown={(e) => {
                  if (e.pointerType === "mouse") {
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
                style={{
                  backgroundColor: "var(--surface-card)",
                  padding: "3.5px",
                  borderRadius: "13px",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "4px",
                  border: "1px solid var(--surface-card-border)",
                  touchAction: "none",
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
                      onClick={() => {
                        if (Date.now() < suppressClickUntil.current) return;
                        if (onSetTargetRipeness) onSetTargetRipeness(tab.id);
                      }}
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

            {/* Advisory Mismatch Banner when no candidates in view match target window */}
            {targetResolution && !targetResolution.isExactMatch && targetResolution.bannerNotice && (
              <div
                data-testid="ripeness-mismatch-banner"
                style={{
                  marginTop: "6px",
                  padding: "6px 10px",
                  borderRadius: "10px",
                  backgroundColor: targetResolution.mismatchReason === "all_already_ripe"
                    ? "rgba(234, 88, 12, 0.12)"
                    : "rgba(37, 99, 235, 0.12)",
                  border: `1px solid ${targetResolution.mismatchReason === "all_already_ripe" ? "rgba(234, 88, 12, 0.3)" : "rgba(37, 99, 235, 0.3)"}`,
                  color: targetResolution.mismatchReason === "all_already_ripe" ? "#C2410C" : "#1D4ED8",
                  fontSize: "11px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  lineHeight: 1.25,
                }}
              >
                <span>{targetResolution.mismatchReason === "all_underripe" ? "⏱️" : "⚠️"}</span>
                <span>{targetResolution.bannerNotice}</span>
              </div>
            )}

            {/* Divider 1: Under Goal Selector / Banner (Min height snap line) */}
            <div
              data-testid="sheet-divider-top"
              style={{
                height: "1px",
                backgroundColor: "var(--surface-card-border)",
                opacity: 0.6,
                marginTop: "6px",
                marginBottom: "6px",
              }}
            />
          </div>

          {/* Eyebrow, Headline & Round Score Rating */}
          <div
            data-testid="sheet-header-summary"
            role="button"
            tabIndex={0}
            aria-label={sheetMode === "expanded" ? "Collapse results sheet" : "Expand results sheet"}
            aria-expanded={sheetMode === "expanded"}
            onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
            onTouchMove={(e) => {
              if (dragStartY.current !== null) {
                handleDragMove(e.touches[0].clientY);
              }
            }}
            onTouchEnd={(e) => {
              const clientY = e.changedTouches?.[0]?.clientY;
              handleDragEnd(clientY);
            }}
            onPointerDown={(e) => {
              if (e.pointerType === "mouse") {
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
            onClick={handleSheetToggle}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSheetToggle();
              }
            }}
            style={{
              cursor: "pointer",
              touchAction: "none",
              outline: "none",
              userSelect: "none",
            }}
            >
              {(phase !== "S4_InitialResult" || isMismatch) && eyebrow && (
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    color: isMismatch ? winnerBorderColor : "var(--eyebrow-accent)",
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
                        stroke={isMismatch ? winnerBorderColor : "#F2C935"}
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
              {/* Traits Chips (e.g. Creamy-yellow ground spot, Matte rind) above Seasonality */}
              {activeWinner?.traits && activeWinner.traits.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                  {activeWinner.traits.map((trait, idx) => (
                    <span
                      key={idx}
                      style={{
                        padding: "4px 9px",
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
              {lastResponse.seasonality && (
                <div
                  data-testid="seasonality-panel"
                  style={{
                    backgroundColor: "var(--surface-card)",
                    border: "1px solid var(--surface-card-border)",
                    borderRadius: "13px",
                    padding: "8px 10px",
                    marginTop: "6px",
                  }}
                >
                  <SeasonalityStrip
                    seasonality={lastResponse.seasonality}
                    selectedOriginCode={selectedOriginCode}
                    onSelectOrigin={setSelectedOriginCode}
                  />
                </div>
              )}
            </div>

            {/* Divider 2: Under Traits / Seasonality Labels */}
            <div
              data-testid="sheet-divider-second"
              style={{
                height: "1px",
                backgroundColor: "var(--surface-card-border)",
                opacity: 0.6,
                marginTop: "8px",
                marginBottom: "4px",
              }}
            />
        </div>

        {/* Bottom Sheet Body: always mounted in DOM, revealed smoothly as sheet translates up */}
        <div data-testid="sheet-body-content" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div
            data-testid="sheet-expanded-content"
            onTouchStart={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest("button") || target.closest("[role='tab']")) return;
              handleDragStart(e.touches[0].clientY);
            }}
            onTouchMove={(e) => {
              if (dragStartY.current !== null) {
                handleDragMove(e.touches[0].clientY);
              }
            }}
            onTouchEnd={(e) => {
              const clientY = e.changedTouches?.[0]?.clientY;
              handleDragEnd(clientY);
            }}
            onPointerDown={(e) => {
              if (e.pointerType === "mouse") {
                const target = e.target as HTMLElement;
                if (target.closest("button") || target.closest("[role='tab']")) return;
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
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              flex: 1,
              overflow: "hidden", // ZERO SCROLLING
              touchAction: "none",
            }}
          >
            {/* Storage Cards Layout (2 Rows) */}

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
            marginTop: "3px",
            marginBottom: "1px",
          }}
        />

        {/* Primary Action Button */}
        <div style={{ paddingTop: "2px" }}>
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
        </div>
      </div>
    </div>
  );
};
