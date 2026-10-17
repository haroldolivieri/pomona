import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { lookupProduceSeasonality } from "@pomona/contract";
import { SeasonalityStrip } from "../../src/components/SeasonalityStrip";
import "../../src/i18n";

const GB = { cfCountry: "GB" };
const imported = lookupProduceSeasonality("mango", GB, 11)!; // imported, Brazil peak origin
const offSeason = lookupProduceSeasonality("strawberry", GB, 11)!; // off_season locally
const peak = lookupProduceSeasonality("strawberry", GB, 6)!; // peak locally

describe("SeasonalityStrip", () => {
  it("renders the badge and note from the seasonality info", () => {
    render(<SeasonalityStrip seasonality={peak} selectedOriginCode={null} onSelectOrigin={vi.fn()} />);
    expect(screen.getByTestId("seasonality-badge")).toHaveTextContent(peak.badgeText);
    expect(screen.getByTestId("seasonality-note")).toHaveTextContent(peak.noteText);
  });

  it("hides the origin row when peak and nothing is selected", () => {
    render(<SeasonalityStrip seasonality={peak} selectedOriginCode={null} onSelectOrigin={vi.fn()} />);
    expect(screen.queryByTestId("origin-pills")).toBeNull();
  });

  it("shows the origin row for off_season and imported_year_round", () => {
    const { rerender } = render(
      <SeasonalityStrip seasonality={offSeason} selectedOriginCode={null} onSelectOrigin={vi.fn()} />
    );
    expect(screen.getByTestId("origin-pills")).toBeInTheDocument();
    rerender(<SeasonalityStrip seasonality={imported} selectedOriginCode={null} onSelectOrigin={vi.fn()} />);
    expect(screen.getByTestId("origin-pill-BR")).toBeInTheDocument();
  });

  it("selects an origin on tap and deselects when the active pill is tapped again", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <SeasonalityStrip seasonality={imported} selectedOriginCode={null} onSelectOrigin={onSelect} />
    );
    fireEvent.click(screen.getByTestId("origin-pill-BR"));
    expect(onSelect).toHaveBeenLastCalledWith("BR");

    rerender(<SeasonalityStrip seasonality={imported} selectedOriginCode="BR" onSelectOrigin={onSelect} />);
    fireEvent.click(screen.getByTestId("origin-pill-BR"));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("shows the selected origin's badge and note instead of the local ones", () => {
    const br = imported.origins.find((o) => o.code === "BR")!;
    render(<SeasonalityStrip seasonality={imported} selectedOriginCode="BR" onSelectOrigin={vi.fn()} />);
    expect(screen.getByTestId("seasonality-badge")).toHaveTextContent(br.badgeText);
    expect(screen.getByTestId("seasonality-note")).toHaveTextContent(br.noteText);
    expect(screen.getByTestId("origin-pill-BR")).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the origin row visible when an origin is selected even if locally peak", () => {
    render(<SeasonalityStrip seasonality={peak} selectedOriginCode={peak.origins[0].code} onSelectOrigin={vi.fn()} />);
    expect(screen.getByTestId("origin-pills")).toBeInTheDocument();
  });

  it("scrolls horizontally and stops touch/pointer events from reaching the bottom sheet", () => {
    const parentTouch = vi.fn();
    const parentPointer = vi.fn();
    render(
      <div onTouchStart={parentTouch} onTouchMove={parentTouch} onPointerDown={parentPointer}>
        <SeasonalityStrip seasonality={imported} selectedOriginCode={null} onSelectOrigin={vi.fn()} />
      </div>
    );
    const row = screen.getByTestId("origin-pills");
    expect(row.style.overflowX).toBe("auto");
    expect(row.getAttribute("style")).toContain("touch-action: pan-x");
    fireEvent.touchStart(row);
    fireEvent.touchMove(row);
    fireEvent.pointerDown(row);
    expect(parentTouch).not.toHaveBeenCalled();
    expect(parentPointer).not.toHaveBeenCalled();
  });
});
