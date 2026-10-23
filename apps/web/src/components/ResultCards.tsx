import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { SeasonalityStrip } from "./SeasonalityStrip";
import type { AfterPurchase, SeasonalityInfo } from "@pomona/contract";

/**
 * Result-card primitives extracted verbatim from ResultStage so the deep-scan
 * result sheet renders the same styles as the original scan (storage guidance,
 * "eat in X days" chip and the seasonality panel) without recreating them.
 */

export interface StorageCardsRowProps {
  afterPurchase: AfterPurchase;
  eatWithinOverride?: string | null;
}

export const StorageCardsRow: React.FC<StorageCardsRowProps> = ({ afterPurchase, eatWithinOverride }) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "2px" }}>
      {/* Row 1: Full-width card: 🗓 Eat within (left) — {eatWithinLabel} (right bold) */}
      <div
        style={{
          backgroundColor: "var(--surface-card)",
          border: "1px solid var(--surface-card-border)",
          borderRadius: "13px",
          padding: "8px 12px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: "4px",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "var(--text-muted)",
            textTransform: "uppercase",
          }}
        >
          {t("result.eatWithin")}
        </span>
        <strong style={{ fontSize: "12px", fontWeight: 600, lineHeight: 1.35, overflowWrap: "anywhere", color: "var(--text-primary)" }}>
          {eatWithinOverride || afterPurchase.eatWithinLabel}
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
  );
};

export interface SeasonalityPanelCardProps {
  seasonality: SeasonalityInfo;
  selectedOriginCode?: string | null;
  onSelectOrigin?: (code: string | null) => void;
}

export const SeasonalityPanelCard: React.FC<SeasonalityPanelCardProps> = ({ seasonality, selectedOriginCode, onSelectOrigin }) => {
  const [localOriginCode, setLocalOriginCode] = useState<string | null>(null);
  const current = onSelectOrigin ? selectedOriginCode ?? null : localOriginCode;
  const handleSelect = onSelectOrigin ?? setLocalOriginCode;
  return (
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
        seasonality={seasonality}
        selectedOriginCode={current}
        onSelectOrigin={handleSelect}
      />
    </div>
  );
};

export interface TraitChipsProps {
  labels: string[];
}

export const TraitChips: React.FC<TraitChipsProps> = ({ labels }) => {
  if (labels.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
      {labels.map((trait, idx) => (
        <span
          key={`${trait}-${idx}`}
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
  );
};

export interface ResultTopBarProps {
  onClose: () => void;
  closeAria: string;
  onRetake: () => void;
  retakeAria: string;
  chip: string | null;
}

// Contextual top bar pinned above the result photo — verbatim from ResultStage
// (close ✕, produce chip, retake ↻) so every scan result stage shares one style.
export const ResultTopBar: React.FC<ResultTopBarProps> = ({ onClose, closeAria, onRetake, retakeAria, chip }) => {
  return (
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
      <button
        onClick={onClose}
        data-testid="close-button"
        aria-label={closeAria}
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

      {chip ? (
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
          {chip}
        </div>
      ) : null}

      <button
        onClick={onRetake}
        data-testid="retake-button"
        aria-label={retakeAria}
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
  );
};

export interface CircularScoreMeterProps {
  score: number; // 0..10
  prevMark?: number | null;
  strokeColor?: string;
}

// Circular score meter next to the result headline — verbatim from ResultStage.
export const CircularScoreMeter: React.FC<CircularScoreMeterProps> = ({ score, prevMark = null, strokeColor }) => {
  return (
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
        <circle cx="24" cy="24" r="19" fill="none" stroke="var(--surface-track)" strokeWidth="3.5" />
        <circle
          cx="24"
          cy="24"
          r="19"
          fill="none"
          stroke={strokeColor ?? "#F2C935"}
          strokeWidth="3.5"
          strokeDasharray={2 * Math.PI * 19}
          strokeDashoffset={2 * Math.PI * 19 * (1 - Math.min(10, Math.max(0, score)) / 10)}
          strokeLinecap="round"
        />
        {prevMark !== null && (
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
              -1 * (2 * Math.PI * 19 * (Math.min(10, Math.max(0, prevMark)) / 10) - 1)
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
        {score.toFixed(1)}
      </span>
    </div>
  );
};
