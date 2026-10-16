import React from "react";
import { useTranslation } from "react-i18next";
import type { ScanResponse, Candidate, BoundingBox } from "@pomona/contract";
import type { ScanMachineState } from "../state/scan-state-machine";
import { describeBoxPosition } from "../lib/spatial-a11y";

export interface ResultStageProps {
  state: ScanMachineState;
  onCompareWithRunnerUp: () => void;
  onStartFinalCheck: () => void;
  onReset: () => void;
}

export const ResultStage: React.FC<ResultStageProps> = ({
  state,
  onCompareWithRunnerUp,
  onStartFinalCheck,
  onReset,
}) => {
  const { t } = useTranslation();
  const { phase, lastResponse, firstPick, runnerUp, round1PhotoDataUrl } = state;

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

  const { verdict, afterPurchase, followUp } = lastResponse;

  // Decide winner candidate and runner-up candidate display info
  let activeWinner: Candidate | null = null;
  let activeRunnerUp: Candidate | null = null;
  let eyebrow = "";
  let headline = verdict?.headline || "Buy it.";
  let subtitle = "";
  let confirmationBanner: string | null = null;
  let finalCheckBanner: string | null = null;

  if (phase === "S4_InitialResult") {
    activeWinner = firstPick;
    activeRunnerUp = runnerUp;
    eyebrow = `★ WINNER · SCORE ${activeWinner?.score?.toFixed(1) ?? "8.6"} / 10`;
    subtitle = "Top pick in crate · Evaluated from current angle";
  } else if (phase === "S5B1_RunnerUpBeaten") {
    activeWinner = firstPick;
    activeRunnerUp = runnerUp;
    eyebrow = `★ 1ST PICK WINS · CONFIRMED BEST`;
    headline = "Buy your 1st pick.";
    subtitle = "Runner-Up inspected from underside · Score did not improve";
    confirmationBanner = `✓ Runner-Up scored ${runnerUp?.score?.toFixed(1)} after flip (${runnerUp?.flipSummary || "inspected"}). Stick with your 1st pick in the yellow box.`;
  } else if (phase === "S5B2_RunnerUpTookLead") {
    activeWinner = runnerUp;
    activeRunnerUp = firstPick;
    eyebrow = `★ NEW WINNER · BEATS 1ST PICK (${runnerUp?.score?.toFixed(1)} VS ${firstPick?.score?.toFixed(1)})`;
    headline = verdict?.headline || "Buy this one.";
    subtitle = "Runner-Up took the lead · 1 final check available";
    finalCheckBanner = followUp?.bannerText || `1st Pick (${firstPick?.score?.toFixed(1)}) was only graded from the top. Flip it too for a fair final check, or take this one now.`;
  } else if (phase === "S7A_FirstPickWonFinal") {
    activeWinner = firstPick;
    activeRunnerUp = runnerUp;
    eyebrow = `★ FINAL VERDICT · 1ST PICK RECLAIMS THE WIN (${firstPick?.score?.toFixed(1)} VS ${runnerUp?.score?.toFixed(1)})`;
    headline = verdict?.headline || "Buy your 1st pick.";
    subtitle = "Both checked from both sides · Highest overall grade";
    confirmationBanner = `✓ After flipping, your 1st pick jumped to ${firstPick?.score?.toFixed(1)} and beat the Runner-Up (${runnerUp?.score?.toFixed(1)}).`;
  } else if (phase === "S7B_FirstPickLostFinal") {
    activeWinner = runnerUp;
    activeRunnerUp = firstPick;
    eyebrow = `★ FINAL VERDICT · RUNNER-UP WINS (${runnerUp?.score?.toFixed(1)} VS ${firstPick?.score?.toFixed(1)})`;
    headline = verdict?.headline || "Buy the new winner.";
    subtitle = "Both checked from both sides · Runner-Up confirmed best";
    confirmationBanner = `✓ 1st Pick scored ${firstPick?.score?.toFixed(1)} after flip. The former Runner-Up (${runnerUp?.score?.toFixed(1)}) is confirmed as the best pick.`;
  }

  // Accessibility spatial speech
  const winnerA11y = activeWinner ? describeBoxPosition(activeWinner.box, "Winner", activeWinner.score) : "";
  const runnerUpA11y = activeRunnerUp ? describeBoxPosition(activeRunnerUp.box, "Runner-Up", activeRunnerUp.score) : "";

  return (
    <div
      data-testid={`stage-${phase}`}
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100vh",
        backgroundColor: "var(--bg-app)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
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

      {/* Top Photo Viewport with Bounding Boxes */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "44vh",
          backgroundColor: "#000000",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {round1PhotoDataUrl && (
          <img
            src={round1PhotoDataUrl}
            alt="Produce crate"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}

        {/* SVG Bounding Boxes Overlay (0..1000 coordinate space) */}
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
          {/* Runner Up Box */}
          {activeRunnerUp && (
            <g>
              <rect
                x={activeRunnerUp.box[1]}
                y={activeRunnerUp.box[0]}
                width={activeRunnerUp.box[3] - activeRunnerUp.box[1]}
                height={activeRunnerUp.box[2] - activeRunnerUp.box[0]}
                fill="none"
                stroke="var(--accent-runnerup)"
                strokeWidth="4"
                strokeDasharray="8,6"
                rx="8"
              />
              <rect
                x={activeRunnerUp.box[1]}
                y={Math.max(0, activeRunnerUp.box[0] - 32)}
                width="140"
                height="28"
                fill="var(--accent-runnerup)"
                rx="4"
              />
              <text
                x={activeRunnerUp.box[1] + 8}
                y={Math.max(0, activeRunnerUp.box[0] - 32) + 18}
                fill="#FFFFFF"
                fontSize="16"
                fontWeight="700"
                fontFamily="Inter"
              >
                {activeRunnerUp.id === firstPick?.id && phase === "S5B2_RunnerUpTookLead"
                  ? `1st Pick · ${activeRunnerUp.score.toFixed(1)}`
                  : `Runner-Up · ${activeRunnerUp.score.toFixed(1)}`}
              </text>
            </g>
          )}

          {/* Winner Box */}
          {activeWinner && (
            <g>
              <rect
                x={activeWinner.box[1]}
                y={activeWinner.box[0]}
                width={activeWinner.box[3] - activeWinner.box[1]}
                height={activeWinner.box[2] - activeWinner.box[0]}
                fill="rgba(245, 213, 71, 0.12)"
                stroke="var(--accent-winner)"
                strokeWidth="6"
                rx="8"
              />
              <rect
                x={activeWinner.box[1]}
                y={Math.max(0, activeWinner.box[0] - 36)}
                width="120"
                height="32"
                fill="var(--accent-winner)"
                rx="6"
              />
              <text
                x={activeWinner.box[1] + 8}
                y={Math.max(0, activeWinner.box[0] - 36) + 22}
                fill="#1A261D"
                fontSize="18"
                fontWeight="800"
                fontFamily="Inter"
              >
                ★ {activeWinner.score.toFixed(1)}
              </text>
            </g>
          )}
        </svg>

        {/* Top close button */}
        <button
          onClick={onReset}
          aria-label="Reset and scan again"
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            backgroundColor: "rgba(0,0,0,0.5)",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "50%",
            width: "36px",
            height: "36px",
            cursor: "pointer",
            fontSize: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>
      </div>

      {/* Bottom Sheet */}
      <div
        style={{
          flex: 1,
          backgroundColor: "var(--surface-sheet)",
          color: "var(--text-primary)",
          borderTopLeftRadius: "24px",
          borderTopRightRadius: "24px",
          marginTop: "-16px",
          padding: "24px 20px 40px",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        {/* Eyebrow & Headline */}
        <div>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "var(--text-muted)",
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
          <p style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "4px" }}>
            {subtitle}
          </p>
        </div>

        {/* Score Progress Bar */}
        {activeWinner && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600 }}>Ripeness & Quality</span>
              <span className="tabular-nums" style={{ fontSize: "14px", fontWeight: 700 }}>
                {activeWinner.score.toFixed(1)} / 10
              </span>
            </div>
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "10px",
                borderRadius: "5px",
                backgroundColor: "var(--surface-track)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(activeWinner.score / 10) * 100}%`,
                  height: "100%",
                  backgroundColor: "var(--accent-winner)",
                }}
              />
            </div>
          </div>
        )}

        {/* Traits Chips */}
        {activeWinner?.traits && activeWinner.traits.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {activeWinner.traits.map((trait, idx) => (
              <span
                key={idx}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  backgroundColor: "var(--surface-chip)",
                  color: "var(--surface-chip-text)",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                {trait}
              </span>
            ))}
          </div>
        )}

        {/* Confirmation Banner if applicable */}
        {confirmationBanner && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "10px",
              backgroundColor: "var(--surface-hint-ok)",
              border: "1px solid var(--surface-hint-ok-border)",
              fontSize: "13px",
              lineHeight: 1.4,
              color: "var(--text-primary)",
            }}
          >
            {confirmationBanner}
          </div>
        )}

        {/* Final Check Warning / Banner if applicable */}
        {finalCheckBanner && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "10px",
              backgroundColor: "var(--surface-hint-warn)",
              border: "1px solid var(--surface-hint-warn-border)",
              fontSize: "13px",
              lineHeight: 1.4,
              color: "var(--text-primary)",
            }}
          >
            {finalCheckBanner}
          </div>
        )}

        {/* Explicit 3 Cards: Eat within, Before cut, After cut */}
        {afterPurchase && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
            {/* Card 1: Eat within */}
            <div
              style={{
                backgroundColor: "var(--surface-card)",
                border: "1px solid var(--surface-card-border)",
                borderRadius: "12px",
                padding: "12px 10px",
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>
                {t("result.eatWithin")}
              </span>
              <strong style={{ fontSize: "14px", display: "block", marginTop: "2px" }}>
                {afterPurchase.eatWithinLabel}
              </strong>
            </div>

            {/* Card 2: Before cut */}
            <div
              style={{
                backgroundColor: "var(--surface-card)",
                border: "1px solid var(--surface-card-border)",
                borderRadius: "12px",
                padding: "12px 10px",
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>
                {t("result.beforeCut")}
              </span>
              <strong style={{ fontSize: "13px", display: "block", marginTop: "2px" }}>
                {afterPurchase.storage.beforeCut.summary}
              </strong>
            </div>

            {/* Card 3: After cut */}
            <div
              style={{
                backgroundColor: "var(--surface-card)",
                border: "1px solid var(--surface-card-border)",
                borderRadius: "12px",
                padding: "12px 10px",
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>
                {t("result.afterCut")}
              </span>
              <strong style={{ fontSize: "13px", display: "block", marginTop: "2px" }}>
                {afterPurchase.storage.afterCut.summary}
              </strong>
            </div>
          </div>
        )}

        {/* Single Primary Action Button */}
        <div style={{ marginTop: "auto", paddingTop: "12px" }}>
          {phase === "S4_InitialResult" && (
            <button
              onClick={onCompareWithRunnerUp}
              data-testid="cta-compare-runner-up"
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: "14px",
                border: "none",
                backgroundColor: "var(--cta-primary)",
                color: "var(--cta-primary-text)",
                fontSize: "16px",
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
                padding: "16px",
                borderRadius: "14px",
                border: "none",
                backgroundColor: "var(--cta-primary)",
                color: "var(--cta-primary-text)",
                fontSize: "16px",
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
                padding: "16px",
                borderRadius: "14px",
                border: "none",
                backgroundColor: "var(--cta-primary)",
                color: "var(--cta-primary-text)",
                fontSize: "16px",
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
