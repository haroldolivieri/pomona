import React from "react";
import { useTranslation } from "react-i18next";
import type { SeasonalityInfo, SeasonalityStatus } from "@pomona/contract";

export interface SeasonalityStripProps {
  seasonality: SeasonalityInfo;
  selectedOriginCode: string | null;
  onSelectOrigin: (code: string | null) => void;
}

const BADGE_STYLES: Record<SeasonalityStatus, { bg: string; fg: string; icon: string }> = {
  peak: { bg: "#DDF3E4", fg: "#166534", icon: "🌿" },
  in_season: { bg: "#DDF3E4", fg: "#166534", icon: "🌿" },
  off_season: { bg: "#FEF3C7", fg: "#92400E", icon: "🍂" },
  imported_year_round: { bg: "#E8E5DC", fg: "#494843", icon: "🌍" },
};

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * Seasonality badge + one-line note under the result subtitle, with a horizontally
 * scrollable row of origin pills. Touch/pointer events are isolated so scrolling the
 * pills never drags the bottom sheet.
 */
export const SeasonalityStrip: React.FC<SeasonalityStripProps> = ({
  seasonality,
  selectedOriginCode,
  onSelectOrigin,
}) => {
  const { t } = useTranslation();
  const origins = Array.isArray(seasonality?.origins) ? seasonality.origins : [];
  const selected = origins.find((o) => o.code === selectedOriginCode) ?? null;
  const active = selected ?? seasonality;
  const style = BADGE_STYLES[active.status] ?? BADGE_STYLES.in_season;

  const showPills =
    origins.length > 0 &&
    (seasonality.status === "off_season" ||
      seasonality.status === "imported_year_round" ||
      selected !== null);

  return (
    <div
      data-testid="seasonality-strip"
      onClick={stop}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        <span
          data-testid="seasonality-badge"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 8px",
            borderRadius: "999px",
            fontSize: "10.5px",
            fontWeight: 700,
            backgroundColor: style.bg,
            color: style.fg,
          }}
        >
          <span aria-hidden="true">{style.icon}</span>
          {active.badgeText}
        </span>
        <span
          data-testid="seasonality-note"
          style={{ fontSize: "11px", color: "var(--text-muted)" }}
        >
          {active.noteText}
        </span>
      </div>

      {showPills && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginTop: "6px",
            marginRight: "-10px",
          }}
        >
          <span
            style={{
              fontSize: "9.5px",
              fontWeight: 600,
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {selected ? t("result.originLabel") : t("result.importedFrom")}
          </span>
          <div
            data-testid="origin-pills"
            onTouchStart={stop}
            onTouchMove={stop}
            onPointerDown={stop}
            onPointerMove={stop}
            style={{
              display: "flex",
              gap: "6px",
              overflowX: "auto",
              whiteSpace: "nowrap",
              scrollbarWidth: "none",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-x",
              flex: 1,
              minWidth: 0,
              paddingRight: "10px",
            }}
          >
            {seasonality.origins.map((origin) => {
              const isActive = origin.code === selectedOriginCode;
              return (
                <button
                  key={origin.code}
                  type="button"
                  data-testid={`origin-pill-${origin.code}`}
                  aria-pressed={isActive}
                  onClick={() => onSelectOrigin(isActive ? null : origin.code)}
                  style={{
                    flexShrink: 0,
                    padding: "4px 9px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    border: isActive ? "1px solid #142117" : "1px solid #D5D0C3",
                    backgroundColor: isActive ? "#142117" : "#FFFFFF",
                    color: isActive ? "#F5D547" : "#3E453F",
                  }}
                >
                  {origin.flag} {origin.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
