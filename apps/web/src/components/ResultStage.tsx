import { currentDisplayLocale } from "../i18n/copy";
import { uiCopy } from "../i18n/copy";
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  type Candidate,
  type TargetRipenessWindow,
  resolveCandidatesForTarget,
  resolveTactileChecks,
} from "@pomona/contract";
import type { ScanMachineState } from "../state/scan-state-machine";
import { describeBoxPosition } from "../lib/spatial-a11y";
import { SeasonalityStrip } from "./SeasonalityStrip";
import { StorageCardsRow, SeasonalityPanelCard, ResultTopBar, CircularScoreMeter, TactileChecksCard } from "./ResultCards";
import { computeObjectFitCoverRect, type RenderedCoverRect } from "../lib/image-pipeline";

export interface ResultStageProps {
  state: ScanMachineState;
  onCompareWithRunnerUp: () => void;
  onStartFinalCheck: () => void;
  onReset: () => void;
  onSetTargetRipeness?: (target: TargetRipenessWindow) => void;
  onDeepScan?: () => void;
}

export const ResultStage: React.FC<ResultStageProps> = ({
  state,
  onCompareWithRunnerUp,
  onStartFinalCheck,
  onReset,
  onSetTargetRipeness,
  onDeepScan,
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
  const [hasOverflow, setHasOverflow] = useState<boolean>(false);
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
      const isOverflowing = sheetRef.current.scrollHeight > sheetRef.current.clientHeight + 2;
      setHasOverflow(isOverflowing);
    }
    if (minPeekRef.current && minPeekRef.current.offsetHeight > 0) {
      setMinPeekHeight(minPeekRef.current.offsetHeight);
    }
    if (defaultPeekRef.current && defaultPeekRef.current.offsetHeight > 0) {
      setDefaultPeekHeight(defaultPeekRef.current.offsetHeight);
    }
  };

  useLayoutEffect(() => {
    updateSheetDimensions();
  }, [sheetMode, phase, targetRipeness, lastResponse]);

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
          {t("errors.analysisFailed")}
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
  let headline = verdict?.headline || uiCopy("copy.buyIt");
  let subtitle = "";
  let confirmationBanner: string | null = null;
  let followUpHint: string | null = null;
  let prevMarkScore: number | null = null;
  let runnerUpTagLabel = uiCopy("copy.runnerUp");

  let targetResolution = null;
  if (phase === "S4_InitialResult" && state.allCandidatesRound1 && state.allCandidatesRound1.length > 0) {
    targetResolution = resolveCandidatesForTarget(state.allCandidatesRound1, targetRipeness, currentDisplayLocale());
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
      headline = targetResolution.headlineKind === "buy" ? uiCopy("copy.bestAvailable") : targetResolution.headline;
      subtitle = targetResolution.subtitle;
      if (targetRipeness === "ready_now") {
        followUpHint = state.round1FollowUp?.bannerText || followUp?.bannerText || targetResolution.followUpHintOverride || uiCopy("copy.theBlueOneCouldBeSweeterFlip");
      } else {
        followUpHint = targetResolution.followUpHintOverride || followUp?.bannerText || uiCopy("copy.checkUndersideBeforeStoring");
      }
    } else {
      eyebrow = uiCopy("copy.bestInView");
      headline = uiCopy("copy.bestAvailable");
      subtitle = uiCopy("copy.highConfidenceComparedInView", { count: candidateCount });
      followUpHint = state.round1FollowUp?.bannerText || followUp?.bannerText || uiCopy("copy.theBlueOneCouldBeSweeterFlip");
    }
    runnerUpTagLabel = uiCopy("copy.runnerUp");
  } else if (phase === "S5B1_RunnerUpBeaten") {
    activeWinner = firstPick;
    activeRunnerUp = runnerUp;
    const score1 = winnerScoreStr(firstPick?.score);
    const score2 = winnerScoreStr(runnerUp?.score);
    eyebrow = uiCopy("copy.1stWinnerWinsBeatsRunnerUpVs", { value1: score1, value2: score2 });
    headline = uiCopy("copy.bestAvailable");
    subtitle = uiCopy("copy.yourInitialWinnerInTheYellowBox");
    confirmationBanner = uiCopy("copy.runnerUpScoredAfterFlipStickWith", { value1: score2, value2: runnerUp?.flipSummary || uiCopy("copy.inspected") });
    prevMarkScore = runnerUp?.score ?? null;
    runnerUpTagLabel = uiCopy("copy.runnerUp2", { value1: score2 });
  } else if (phase === "S5B2_RunnerUpTookLead") {
    activeWinner = runnerUp;
    activeRunnerUp = firstPick;
    const score1 = winnerScoreStr(firstPick?.score);
    const score2 = winnerScoreStr(runnerUp?.score);
    eyebrow = uiCopy("copy.newWinnerBeats1stWinnerVs", { value1: score2, value2: score1 });
    headline = uiCopy("copy.buyThisRunnerUp");
    subtitle = uiCopy("copy.theFlippedFruitScoredAndTookThe", { value1: score2, value2: score1 });
    followUpHint = (followUp?.bannerText
      ? followUp.bannerText.replace(/1st\s*pick/gi, uiCopy("copy.1stWinner2")).replace(/first\s*pick/gi, uiCopy("copy.firstWinner"))
      : null) || uiCopy("copy.your1stWinnerWasOnlyInspectedFrom", { value1: score1 });
    prevMarkScore = firstPick?.score ?? null;
    runnerUpTagLabel = uiCopy("copy.1stWinner3", { value1: score1 });
  } else if (phase === "S7A_FirstPickWonFinal") {
    activeWinner = firstPick;
    activeRunnerUp = runnerUp;
    const score1 = winnerScoreStr(firstPick?.score);
    const score2 = winnerScoreStr(runnerUp?.score);
    eyebrow = uiCopy("copy.finalVerdict1stWinnerReclaimsTheWin", { value1: score1, value2: score2 });
    headline = uiCopy("copy.bestAvailable");
    subtitle = uiCopy("copy.afterCheckingBothSidesYourOriginal1st", { value1: score1, value2: score2 });
    confirmationBanner = uiCopy("copy.afterFlippingYour1stWinnerItsFinal", { value1: score1, value2: score2 });
    prevMarkScore = runnerUp?.score ?? null;
    runnerUpTagLabel = uiCopy("copy.runnerUp2", { value1: score2 });
  } else if (phase === "S7B_FirstPickLostFinal") {
    activeWinner = runnerUp;
    activeRunnerUp = firstPick;
    const score1 = winnerScoreStr(firstPick?.score);
    const score2 = winnerScoreStr(runnerUp?.score);
    eyebrow = uiCopy("copy.finalVerdictRunnerUpWinsVs", { value1: score2, value2: score1 });
    headline = uiCopy("copy.buyTheRunnerUp");
    subtitle = uiCopy("copy.bothCheckedFromBothSidesTheFruit", { value1: score2, value2: score1 });
    confirmationBanner = uiCopy("copy.your1stWinnerScoredAfterFlipThe", { value1: score1, value2: score2 });
    prevMarkScore = firstPick?.score ?? null;
    runnerUpTagLabel = uiCopy("copy.1stWinner3", { value1: score1 });
  }

  if (verdict?.confidence === "medium") {
    eyebrow = uiCopy("copy.tentativePick");
    headline = uiCopy("copy.looksPromising");
    subtitle = uiCopy("copy.mediumConfidenceVisibleAppearanceOnlyCheckAnother");
    confirmationBanner = null;
  }

  // Accessibility spatial speech
  const winnerA11y = activeWinner ? describeBoxPosition(activeWinner.box, uiCopy("copy.winner"), activeWinner.score) : "";
  const runnerUpA11y = activeRunnerUp ? describeBoxPosition(activeRunnerUp.box, uiCopy("copy.runnerUp"), activeRunnerUp.score) : "";

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
  const canScroll = isFullyOpen && hasOverflow;

  const denseCandidatesNote =
    (lastResponse.candidates?.length ?? 0) >= 15
      ? uiCopy("copy.topPicksShownFromAllVisibleItems", { count: lastResponse.candidates.length })
      : "";
  const fullSubtitle = subtitle + denseCandidatesNote;

  const tactileChecks = useMemo(() => {
    const produceName =
      produce?.displayName ||
      produce?.type ||
      activeWinner?.id;
    return resolveTactileChecks(produceName, currentDisplayLocale());
  }, [produce, activeWinner?.id]);

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
      <ResultTopBar
        onClose={onReset}
        closeAria={uiCopy("copy.resetAndScanAgain")}
        onRetake={onReset}
        retakeAria={uiCopy("copy.retakePhoto")}
        chip={produce?.displayName || uiCopy("copy.produce")}
      />

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
            alt={uiCopy("copy.produceCrate")}
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
                  ? uiCopy("copy.runnerUp2", { value1: activeRunnerUp.score.toFixed(1) })
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
        onTouchStart={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("button, a, input, select, textarea, [role='tab']")) return;
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
            const clientY = e.changedTouches?.[0]?.clientY;
            handleDragEnd(clientY);
          }
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") {
            const target = e.target as HTMLElement;
            if (target.closest("button, a, input, select, textarea, [role='tab']")) return;
            if (canScroll && sheetRef.current && sheetRef.current.scrollTop > 0) return;
            handleDragStart(e.clientY);
          }
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" && dragStartY.current !== null) {
            handleDragMove(e.clientY);
          }
        }}
        onPointerUp={(e) => {
          if (e.pointerType === "mouse" && dragStartY.current !== null) {
            handleDragEnd(e.clientY);
          }
        }}
        onClick={(e) => {
          if (Date.now() < suppressClickUntil.current) return;
          const target = e.target as HTMLElement;
          if (target.closest("button, a, input, select, textarea, [role='tab']")) return;
          if (sheetMode !== "expanded") {
            handleSheetToggle();
          } else if (target.closest("[data-testid='sheet-drag-area'], [data-testid='sheet-header-summary'], [data-testid='sheet-peek-bar']")) {
            handleSheetToggle();
          }
        }}
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
          boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.22), 0 200px 0 0 var(--surface-sheet)",
          transform: `translate3d(0, ${currentTranslate}px, 0)`,
          transition: isDragging
            ? "none"
            : "transform 0.32s cubic-bezier(0.2, 0.0, 0, 1.0)",
          overflowY: canScroll ? "auto" : (isFullyOpen ? "hidden" : "visible"),
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
          touchAction: canScroll ? "pan-y" : "none",
          overscrollBehavior: "contain",
          userSelect: "none",
          cursor: isDragging ? "grabbing" : (sheetMode === "expanded" ? "default" : "pointer"),
        }}
      >
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
              aria-label={sheetMode === "expanded" ? uiCopy("copy.collapseResultsSheet") : uiCopy("copy.expandResultsSheet")}
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
                aria-label={uiCopy("copy.targetRipenessWindow")}
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
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "4px",
                  border: "1px solid var(--surface-card-border)",
                  touchAction: "none",
                }}
              >
                {(
                  [
                    { id: "ready_now", label: uiCopy("copy.readyNow"), sub: uiCopy("copy.peakRipe"), dot: "#16A34A" },
                    { id: "in_2_3_days", label: uiCopy("copy.in23Days"), sub: uiCopy("copy.almostRipe"), dot: "#D97706" },
                    { id: "later_this_week", label: uiCopy("copy.laterThisWeek"), sub: uiCopy("copy.firmUnripe"), dot: "#2563EB" },
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
                        alignItems: "stretch",
                        minWidth: 0,
                        textAlign: "center",
                        lineHeight: 1.15,
                        boxShadow: isActive ? "0 2px 6px rgba(0, 0, 0, 0.12)" : "none",
                        transition: "all 0.18s ease",
                      }}
                    >
                      <span style={{ fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "2.3em", position: "relative", paddingInline: "9px" }}>
                        {isActive && (
                          <span
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              backgroundColor: tab.dot,
                              position: "absolute",
                              left: 0,
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
                  {uiCopy("copy.shoppingFor")}{" "}
                  <strong>
                    {targetRipeness === "in_2_3_days"
                      ? uiCopy("copy.in23Days")
                      : targetRipeness === "later_this_week"
                      ? uiCopy("copy.laterThisWeek")
                      : uiCopy("copy.readyNow")}
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
                    ? uiCopy("copy.almostRipe")
                    : targetRipeness === "later_this_week"
                    ? uiCopy("copy.firmUnripe2")
                    : uiCopy("copy.peakRipe")}
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
            aria-label={sheetMode === "expanded" ? uiCopy("copy.collapseResultsSheet") : uiCopy("copy.expandResultsSheet")}
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
                    {fullSubtitle}
                  </p>
                </div>

                {/* Circular Score Meter next to headline */}
                {activeWinner && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <CircularScoreMeter
                      score={Math.min(10, Math.max(0, activeWinner.score))}
                      prevMark={prevMarkScore}
                      strokeColor={isMismatch ? winnerBorderColor : undefined}
                    />
                    <span
                      data-testid="compare-visual-score-label"
                      style={{
                        fontSize: "9.5px",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        marginTop: "3px",
                        letterSpacing: "0.03em",
                        textTransform: "uppercase",
                      }}
                    >
                      {uiCopy("result.visualScoreLabel")}
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
                <SeasonalityPanelCard
                  seasonality={lastResponse.seasonality}
                  selectedOriginCode={selectedOriginCode}
                  onSelectOrigin={setSelectedOriginCode}
                />
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
              overflow: "visible",
              touchAction: isFullyOpen ? "pan-y" : "none",
            }}
          >
            {/* Storage Cards Layout (2 Rows) */}
            {afterPurchase && (
              <StorageCardsRow
                afterPurchase={afterPurchase}
                eatWithinOverride={targetResolution?.eatWithinOverride}
              />
            )}

            {/* Tactile checks for extra evidence */}
            {tactileChecks.length > 0 && (
              <TactileChecksCard
                checks={tactileChecks}
                defaultOpen={false}
                testId="compare-tactile-checks"
              />
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

        {/* Deep Scan banner for marginal single-fruit verdicts */}
        {Boolean(onDeepScan) &&
          lastResponse.candidates?.length === 1 &&
          lastResponse.verdict?.confidence === "low" && (
            <div
              data-testid="ds-banner"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                background: "var(--surface-hint-ok)",
                border: "1px solid var(--surface-hint-ok-border)",
                borderRadius: "14px",
                padding: "10px 12px",
                margin: "4px 0",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {t("deepScan.bannerTitle")}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-primary)", opacity: 0.8 }}>
                  {t("deepScan.bannerBody")}
                </div>
              </div>
              <button
                onClick={onDeepScan}
                data-testid="ds-banner-cta"
                style={{
                  flex: 0,
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "none",
                  backgroundColor: "#F5D547",
                  color: "#132418",
                  fontFamily: "Inter, system-ui, sans-serif",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ✦ {t("deepScan.inspectWinner")}
              </button>
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
