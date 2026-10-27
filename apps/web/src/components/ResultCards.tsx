import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SeasonalityStrip } from "./SeasonalityStrip";
import { IconClose, IconRetake, IconHand, IconChevronRight } from "./Icons";
import type { AfterPurchase, SeasonalityInfo, ManualCheck } from "@pomona/contract";

/**
 * Result-card primitives extracted verbatim from ResultStage so the deep-scan
 * result sheet renders the same styles as the original scan (storage guidance,
 * "eat in X days" chip and the seasonality panel) without recreating them.
 */

export interface StorageCardsRowProps {
  afterPurchase: AfterPurchase;
  eatWithinOverride?: string | null;
  peakRipenessText?: string | null;
}

export const StorageCardsRow: React.FC<StorageCardsRowProps> = ({ afterPurchase, eatWithinOverride, peakRipenessText }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        backgroundColor: "var(--surface-group, #F2EFE6)",
        borderRadius: "16px",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        marginTop: "2px",
      }}
    >
      {peakRipenessText ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            paddingBottom: "8px",
            borderBottom: "1px solid var(--surface-group-divider, rgba(26, 38, 29, 0.08))",
          }}
        >
          {/* Cell 1: Peak ripeness */}
          <div data-testid="storage-peak-ripeness-card">
            <span
              style={{
                fontSize: "10.5px",
                fontWeight: 500,
                color: "var(--text-muted)",
                display: "block",
              }}
            >
              {t("result.peakRipeness")}
            </span>
            <strong
              style={{
                fontSize: "12px",
                fontWeight: 600,
                display: "block",
                marginTop: "2px",
                color: "var(--text-primary)",
                lineHeight: 1.35,
              }}
            >
              {peakRipenessText}
            </strong>
          </div>

          {/* Cell 2: Eat within */}
          <div
            data-testid="storage-eat-within-card"
            style={{
              paddingLeft: "12px",
              borderLeft: "1px solid var(--surface-group-divider, rgba(26, 38, 29, 0.08))",
            }}
          >
            <span
              style={{
                fontSize: "10.5px",
                fontWeight: 500,
                color: "var(--text-muted)",
                display: "block",
              }}
            >
              {t("result.eatWithin")}
            </span>
            <strong
              style={{
                fontSize: "12px",
                fontWeight: 600,
                display: "block",
                marginTop: "2px",
                color: "var(--text-primary)",
                lineHeight: 1.35,
              }}
            >
              {eatWithinOverride || afterPurchase.eatWithinLabel}
            </strong>
          </div>
        </div>
      ) : (
        /* Full-width row: Eat within */
        <div
          data-testid="storage-eat-within-card"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: "2px",
            alignItems: "center",
            paddingBottom: "8px",
            borderBottom: "1px solid var(--surface-group-divider, rgba(26, 38, 29, 0.08))",
          }}
        >
          <span
            style={{
              fontSize: "10.5px",
              fontWeight: 500,
              color: "var(--text-muted)",
            }}
          >
            {t("result.eatWithin")}
          </span>
          <strong style={{ fontSize: "12px", fontWeight: 600, lineHeight: 1.35, overflowWrap: "anywhere", color: "var(--text-primary)" }}>
            {eatWithinOverride || afterPurchase.eatWithinLabel}
          </strong>
        </div>
      )}

      {/* Row 2: Two equal side-by-side cells */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {/* Cell 1: Before cut */}
        <div>
          <span
            style={{
              fontSize: "10.5px",
              fontWeight: 500,
              color: "var(--text-muted)",
              display: "block",
            }}
          >
            {t("result.beforeCut")}
          </span>
          <strong
            style={{
              fontSize: "12px",
              fontWeight: 600,
              display: "block",
              marginTop: "2px",
              color: "var(--text-primary)",
              lineHeight: 1.35,
            }}
          >
            {afterPurchase.storage.beforeCut.summary}
          </strong>
        </div>

        {/* Cell 2: After cut */}
        <div
          style={{
            paddingLeft: "12px",
            borderLeft: "1px solid var(--surface-group-divider, rgba(26, 38, 29, 0.08))",
          }}
        >
          <span
            style={{
              fontSize: "10.5px",
              fontWeight: 500,
              color: "var(--text-muted)",
              display: "block",
            }}
          >
            {t("result.afterCut")}
          </span>
          <strong
            style={{
              fontSize: "12px",
              fontWeight: 600,
              display: "block",
              marginTop: "2px",
              color: "var(--text-primary)",
              lineHeight: 1.35,
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
        backgroundColor: "var(--surface-group, #F2EFE6)",
        borderRadius: "14px",
        padding: "8px 12px",
        marginTop: "6px",
        overflow: "hidden",
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
            padding: "4px 10px",
            borderRadius: "999px",
            backgroundColor: "var(--surface-group, #F2EFE6)",
            color: "var(--surface-chip-text)",
            fontSize: "11px",
            fontWeight: 500,
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

// Contextual top bar pinned above the result photo: verbatim from ResultStage
// (close, produce chip, retake) so every scan result stage shares one style.
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
        <IconClose size={15} />
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
        <IconRetake size={15} />
      </button>
    </div>
  );
};

export interface CircularScoreMeterProps {
  score: number; // 0..10
  prevMark?: number | null;
  strokeColor?: string;
}

// Circular score meter next to the result headline: verbatim from ResultStage.
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

export interface TactileChecksCardProps {
  checks: ManualCheck[];
  defaultOpen?: boolean;
  testId?: string;
  title?: string;
  subtitle?: string;
  disclaimer?: string;
}

export const TactileChecksCard: React.FC<TactileChecksCardProps> = ({
  checks,
  defaultOpen = false,
  testId = "tactile-checks-card",
  title,
  subtitle,
  disclaimer,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!checks || checks.length === 0) return null;

  const headerTitle = title || t("deepScan.manualChecksHeader");
  const headerSubtitle = subtitle || t("deepScan.manualChecksSubtitle");
  const headerDisclaimer = disclaimer || t("deepScan.manualChecksDisclaimer");
  const closeLabel = t("copy.close");

  return (
    <>
      <div
        data-testid={testId}
        style={{
          marginTop: "4px",
          background: "var(--surface-group, #F2EFE6)",
          borderRadius: "14px",
          padding: "10px 12px",
        }}
      >
        <button
          type="button"
          data-testid={`${testId}-toggle`}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            textAlign: "left",
            color: "inherit",
            font: "inherit",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: 0 }}>
            <IconHand size={16} color="var(--eyebrow-accent, #2F5D34)" />
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>
                {headerTitle}
              </span>
              <span
                data-testid={`${testId}-subtitle`}
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  lineHeight: 1.25,
                  marginTop: "1px",
                }}
              >
                {headerSubtitle}
              </span>
            </div>
          </div>
          <span
            data-testid={`${testId}-chevron`}
            aria-hidden="true"
            style={{
              color: "var(--text-muted)",
              lineHeight: 1,
              userSelect: "none",
              flexShrink: 0,
              marginLeft: "4px",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <IconChevronRight size={15} />
          </span>
        </button>
      </div>

      {/* Tactile Checks Bottom Sheet Dialog */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${testId}-dialog-title`}
          data-testid={`${testId}-dialog`}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: 0,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--surface-sheet, #FBFAF6)",
              color: "var(--text-primary, #1A261D)",
              borderRadius: "26px 26px 0 0",
              paddingTop: "10px",
              paddingLeft: "20px",
              paddingRight: "20px",
              paddingBottom: "max(24px, env(safe-area-inset-bottom))",
              maxWidth: "480px",
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 -12px 36px rgba(0, 0, 0, 0.3)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {/* Sheet grabber bar */}
            <div
              style={{
                width: "36px",
                height: "4px",
                borderRadius: "4px",
                backgroundColor: "rgba(107, 106, 101, 0.38)",
                margin: "0 auto 4px",
              }}
            />

            {/* Header: Title and Close button */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <IconHand size={18} color="var(--eyebrow-accent, #2F5D34)" />
                <h2
                  id={`${testId}-dialog-title`}
                  className="font-serif"
                  style={{
                    margin: 0,
                    fontSize: "20px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {headerTitle}
                </h2>
              </div>
              <button
                type="button"
                data-testid={`${testId}-close-button`}
                onClick={() => setIsOpen(false)}
                aria-label={closeLabel}
                style={{
                  background: "var(--surface-group, #F2EFE6)",
                  border: "none",
                  borderRadius: "50%",
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  flexShrink: 0,
                }}
              >
                <IconClose size={14} />
              </button>
            </div>

            {/* Transparency Note */}
            <p
              data-testid={`${testId}-disclaimer`}
              style={{
                margin: 0,
                fontSize: "12px",
                lineHeight: 1.45,
                color: "var(--text-muted)",
              }}
            >
              {headerDisclaimer}
            </p>

            {/* Checks list inside unified Apple HIG inset group */}
            <ul
              data-testid={`${testId}-list`}
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                backgroundColor: "var(--surface-group, #F2EFE6)",
                borderRadius: "16px",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {checks.map((check, i) => (
                <li
                  key={i}
                  style={{
                    padding: "12px 14px",
                    fontSize: "12.5px",
                    lineHeight: 1.4,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    borderTop: i > 0 ? "1px solid var(--surface-group-divider, rgba(26, 38, 29, 0.08))" : "none",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      backgroundColor: "var(--cta-primary, #2F5D34)",
                      color: "#FFFFFF",
                      fontSize: "11px",
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: "1px",
                    }}
                  >
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ color: "var(--text-primary)", display: "block", marginBottom: "2px", fontWeight: 600 }}>
                      {check.trait}
                    </strong>
                    <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                      {check.how}
                    </div>
                    <div style={{ color: "var(--eyebrow-accent, #2F5D34)", fontSize: "11.5px", fontWeight: 500, marginTop: "3px" }}>
                      {check.whatItMeans}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Bottom Dismiss CTA */}
            <button
              type="button"
              data-testid={`${testId}-dismiss-button`}
              onClick={() => setIsOpen(false)}
              style={{
                marginTop: "2px",
                width: "100%",
                padding: "12px",
                borderRadius: "14px",
                backgroundColor: "var(--cta-primary, #2F5D34)",
                color: "#FFFFFF",
                border: "none",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              {closeLabel}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
