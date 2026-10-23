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
