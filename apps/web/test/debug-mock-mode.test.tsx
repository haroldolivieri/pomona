import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import { PomonaApp } from "../src/App";
import { createMockApiClient } from "../src/lib/mock-api-client";
import { createNoopTelemetry } from "../src/lib/telemetry";
import "../src/i18n";

describe("Debug mock mode and shake detection", () => {
  it("does not render debug button or toast when isDevMode is false", () => {
    const dummyClient = {
      getQuota: vi.fn(),
      submitScan: vi.fn(),
    };
    render(
      <PomonaApp
        apiClient={dummyClient}
        telemetry={createNoopTelemetry()}
        enableDebugOverride={false}
      />
    );

    expect(screen.queryByLabelText("Toggle Mock Mode")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders debug toggle button when enableDebugOverride is true and switches modes on click", () => {
    const dummyClient = {
      getQuota: vi.fn(),
      submitScan: vi.fn(),
    };
    render(
      <PomonaApp
        apiClient={dummyClient}
        telemetry={createNoopTelemetry()}
        enableDebugOverride={true}
      />
    );

    const toggleBtn = screen.getByLabelText("Toggle Mock Mode");
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn.textContent).toBe("🧪 MOCK");

    // Click to toggle to LIVE mode
    fireEvent.click(toggleBtn);
    expect(toggleBtn.textContent).toBe("🌐 LIVE");

    // Click back to MOCK mode
    fireEvent.click(toggleBtn);
    expect(toggleBtn.textContent).toBe("🧪 MOCK");
  });

  it("toggles mock mode on device shake motion event", async () => {
    const dummyClient = {
      getQuota: vi.fn(),
      submitScan: vi.fn(),
    };
    render(
      <PomonaApp
        apiClient={dummyClient}
        telemetry={createNoopTelemetry()}
        enableDebugOverride={true}
      />
    );

    const toggleBtn = screen.getByLabelText("Toggle Mock Mode");
    expect(toggleBtn.textContent).toBe("🧪 MOCK");

    // Simulate first motion tick
    act(() => {
      window.dispatchEvent(
        new DeviceMotionEvent("devicemotion", {
          accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 },
        })
      );
    });

    // Simulate rapid shake acceleration after a short delay (threshold > 25)
    await new Promise((r) => setTimeout(r, 120));
    act(() => {
      window.dispatchEvent(
        new DeviceMotionEvent("devicemotion", {
          accelerationIncludingGravity: { x: 30, y: 25, z: 15 },
        })
      );
    });

    // Device motion shake toggled MOCK -> LIVE
    expect(toggleBtn.textContent).toBe("🌐 LIVE");
  });

  it("mock-api-client returns contract-valid multi-round responses for rounds 1, 2, and 3", async () => {
    const client = createMockApiClient();

    // Round 1
    const r1 = await client.submitScan({
      schemaVersion: "1.0",
      sessionId: "test-sess",
      round: 1,
      locale: "en",
      imageBase64: "dummy",
      imageMimeType: "image/webp",
      focusPolygon: null,
      followUpContext: null,
    });
    expect(r1.response.status).toBe("ok");
    expect(r1.response.candidates.length).toBe(2);
    expect(r1.response.verdict?.winnerId).toBe("c1");
    expect(r1.response.followUp?.targetRole).toBe("runner_up");

    // Round 2
    const r2 = await client.submitScan({
      schemaVersion: "1.0",
      sessionId: "test-sess",
      round: 2,
      locale: "en",
      imageBase64: "dummy",
      imageMimeType: "image/webp",
      focusPolygon: null,
      followUpContext: null,
    });
    expect(r2.response.status).toBe("ok");
    expect(r2.response.verdict?.winnerId).toBe("c2");
    expect(r2.response.candidates[0].score).toBe(9.0);

    // Round 3
    const r3 = await client.submitScan({
      schemaVersion: "1.0",
      sessionId: "test-sess",
      round: 3,
      locale: "en",
      imageBase64: "dummy",
      imageMimeType: "image/webp",
      focusPolygon: null,
      followUpContext: null,
    });
    expect(r3.response.status).toBe("ok");
    expect(r3.response.verdict?.winnerId).toBe("c1");
    expect(r3.response.candidates[0].score).toBe(9.3);
  });
});
