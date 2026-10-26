import { describe, expect, it, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PomonaApp } from "../src/App";
import { createNoopTelemetry } from "../src/lib/telemetry";
import {
  evaluateCompareFrame,
  COMPARE_FRAME_VALIDATION,
} from "../src/lib/deep-scan-frames";

const dummyClient: any = {
  getQuota: async () => ({
    allowed: true,
    remainingDeviceScans: 10,
    resetAt: "2099-01-01T00:00:00.000Z",
  }),
  submitScan: async () => ({
    status: "ok",
    candidates: [],
  }),
};

describe("Compare local frame validation in App", () => {
  beforeEach(() => {
    (window as any).__POMONA_BYPASS_LOCAL_REJECT = false;
  });

  it("renders live camera and shutter button", async () => {
    render(
      <PomonaApp
        apiClient={dummyClient}
        telemetry={createNoopTelemetry()}
      />
    );

    const shutter = screen.getByTestId("shutter-button");
    expect(shutter).toBeDefined();
  });

  it("evaluates pure compare frame rejection logic accurately", () => {
    const w = 64;
    const h = 64;

    // 1. Sharp checkerboard passes (returns null)
    const sharpGray = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        sharpGray[y * w + x] = ((x ^ y) & 1) === 0 ? 240 : 15;
      }
    }
    expect(evaluateCompareFrame(sharpGray, w, h)).toBeNull();

    // 2. Dark frame triggers too_dark_or_bright
    const darkGray = new Float32Array(w * h).fill(2);
    expect(evaluateCompareFrame(darkGray, w, h)).toBe("too_dark_or_bright");

    // 3. Flat blurry frame triggers all_blurry
    const blurryGray = new Float32Array(w * h).fill(128);
    expect(evaluateCompareFrame(blurryGray, w, h)).toBe("all_blurry");
  });

  it("advances to focus draw stage in simulated jsdom environment", async () => {
    render(
      <PomonaApp
        apiClient={dummyClient}
        telemetry={createNoopTelemetry()}
      />
    );

    const shutter = screen.getByTestId("shutter-button");
    fireEvent.click(shutter);

    await waitFor(() => {
      expect(screen.getByTestId("stage-S2_DrawFocusArea")).toBeDefined();
    });
  });
});
