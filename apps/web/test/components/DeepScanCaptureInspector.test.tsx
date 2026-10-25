import "@testing-library/jest-dom";
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeepScanCaptureInspector } from "../../src/components/DeepScanCaptureInspector";
import type { DeepScanDebugCaptureRecord } from "../../src/lib/deep-scan-debug";
import "../../src/i18n";

const mockSuccessRecord: DeepScanDebugCaptureRecord = {
  sessionId: "test-session-123",
  at: "2026-10-24T14:00:00.000Z",
  sampleCount: 25,
  keptDataUrls: [
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ],
  allDataUrls: Array.from(
    { length: 25 },
    (_, i) =>
      `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP${i}z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==`
  ),
  compositeDataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPifAQAE+wHflXnfcQAAAABJRU5ErkJggg==",
  rejectedReason: null,
};

const mockFailedRecord: DeepScanDebugCaptureRecord = {
  sessionId: "failed-session-456",
  at: "2026-10-24T14:05:00.000Z",
  sampleCount: 25,
  keptDataUrls: [],
  allDataUrls: Array.from(
    { length: 25 },
    (_, i) =>
      `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP${i}z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==`
  ),
  compositeDataUrl: null,
  rejectedReason: "all_blurry",
};

describe("DeepScanCaptureInspector", () => {
  it("renders success record with composite and kept tiles", () => {
    render(<DeepScanCaptureInspector record={mockSuccessRecord} />);
    expect(screen.getByTestId("ds-capture-inspector")).toBeInTheDocument();
    expect(screen.getByTestId("ds-inspector-composite")).toBeInTheDocument();
    expect(screen.getByTestId("ds-inspector-tiles")).toBeInTheDocument();
    expect(screen.getByTestId("ds-inspector-all-grid")).toBeInTheDocument();
    expect(screen.getByTestId("ds-inspector-meta")).toHaveTextContent("test-session-123");
  });

  it("renders even when local validation failed, showing rejection notice and all 25 photos", () => {
    render(<DeepScanCaptureInspector record={mockFailedRecord} />);
    expect(screen.getByTestId("ds-capture-inspector")).toBeInTheDocument();
    expect(screen.getByTestId("ds-inspector-reject-banner")).toBeInTheDocument();
    expect(screen.getByTestId("ds-inspector-reject-banner")).toHaveTextContent("Validation rejected");
    // Composite is null, so it shouldn't be rendered
    expect(screen.queryByTestId("ds-inspector-composite")).not.toBeInTheDocument();
    // All 25 photos are rendered in the grid
    expect(screen.getByTestId("ds-inspector-all-grid")).toBeInTheDocument();
    expect(screen.getAllByRole("img").length).toBe(25);
  });

  it("opens the full gallery modal when tapping a thumbnail or gallery button", () => {
    render(<DeepScanCaptureInspector record={mockFailedRecord} />);
    expect(screen.queryByTestId("ds-gallery-modal")).not.toBeInTheDocument();

    // Tap the open gallery CTA
    fireEvent.click(screen.getByTestId("ds-inspector-open-gallery"));
    expect(screen.getByTestId("ds-gallery-modal")).toBeInTheDocument();
    expect(screen.getByTestId("ds-gallery-main-image")).toBeInTheDocument();
    expect(screen.getByText("Photo 1 of 25")).toBeInTheDocument();

    // Navigate to next photo
    fireEvent.click(screen.getByTestId("ds-gallery-next"));
    expect(screen.getByText("Photo 2 of 25")).toBeInTheDocument();

    // Navigate to previous photo
    fireEvent.click(screen.getByTestId("ds-gallery-prev"));
    expect(screen.getByText("Photo 1 of 25")).toBeInTheDocument();

    // Close the gallery
    fireEvent.click(screen.getByTestId("ds-gallery-close"));
    expect(screen.queryByTestId("ds-gallery-modal")).not.toBeInTheDocument();
  });

  it("clicking any photo in the 25-photo grid opens gallery directly at that index", () => {
    render(<DeepScanCaptureInspector record={mockSuccessRecord} />);
    // Click on photo at index 4 (photo 5)
    fireEvent.click(screen.getByTestId("ds-all-thumb-4"));
    expect(screen.getByTestId("ds-gallery-modal")).toBeInTheDocument();
    expect(screen.getByText("Photo 5 of 25")).toBeInTheDocument();
  });

  it("allows opening and viewing the gallery of chosen pics", () => {
    render(<DeepScanCaptureInspector record={mockSuccessRecord} />);
    // Click on the first chosen tile
    fireEvent.click(screen.getByTestId("ds-chosen-thumb-0"));
    expect(screen.getByTestId("ds-gallery-modal")).toBeInTheDocument();
    expect(screen.getByText("Chosen photo 1 of 2")).toBeInTheDocument();

    // Navigate to next chosen photo
    fireEvent.click(screen.getByTestId("ds-gallery-next"));
    expect(screen.getByText("Chosen photo 2 of 2")).toBeInTheDocument();
  });

  it("allows opening and viewing the composite grid in the gallery", () => {
    render(<DeepScanCaptureInspector record={mockSuccessRecord} />);
    fireEvent.click(screen.getByTestId("ds-inspector-view-grid-btn"));
    expect(screen.getByTestId("ds-gallery-modal")).toBeInTheDocument();
    expect(screen.getByTestId("ds-gallery-title")).toHaveTextContent("Grid sent (/api/v1/deep-scan)");
  });

  it("allows switching between Chosen, All, and Grid tabs inside the gallery", () => {
    render(<DeepScanCaptureInspector record={mockSuccessRecord} />);
    // Open in All mode
    fireEvent.click(screen.getByTestId("ds-inspector-open-gallery"));
    expect(screen.getByTestId("ds-gallery-title")).toHaveTextContent("Photo 1 of 25");

    // Switch to Chosen tab
    fireEvent.click(screen.getByTestId("ds-gallery-tab-chosen"));
    expect(screen.getByTestId("ds-gallery-title")).toHaveTextContent("Chosen photo 1 of 2");

    // Switch to Grid tab
    fireEvent.click(screen.getByTestId("ds-gallery-tab-grid"));
    expect(screen.getByTestId("ds-gallery-title")).toHaveTextContent("Grid sent (/api/v1/deep-scan)");

    // Switch back to All tab
    fireEvent.click(screen.getByTestId("ds-gallery-tab-all"));
    expect(screen.getByTestId("ds-gallery-title")).toHaveTextContent("Photo 1 of 25");
  });

  it("can be dismissed with the close button", () => {
    const onDismiss = vi.fn();
    render(<DeepScanCaptureInspector record={mockSuccessRecord} onDismiss={onDismiss} />);
    expect(screen.getByTestId("ds-capture-inspector")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("ds-inspector-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("ds-capture-inspector")).not.toBeInTheDocument();
  });
});
