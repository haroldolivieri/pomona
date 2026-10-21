import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";
import { PomonaApp } from "../src/App";
import { createNoopTelemetry } from "../src/lib/telemetry";
import "../src/i18n";

vi.mock("../src/lib/build-mode", () => ({
  getIsLocalBuild: () => false,
}));

describe("Published build: 5-tap version toast only", () => {
  beforeEach(() => {
    cleanup();
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    try {
      localStorage.clear();
    } catch {}
  });

  const makeDummyClient = () => ({
    getQuota: vi.fn().mockResolvedValue({ remainingDeviceScans: 10, budgetOpen: true }),
    overrideQuota: vi.fn().mockResolvedValue({ success: true, remainingDeviceScans: 10 }),
    submitScan: vi.fn(),
  });

  it("shows a version toast after 5 taps and never unlocks debug UI", async () => {
    vi.useFakeTimers();
    try {
      render(
        <PomonaApp apiClient={makeDummyClient()} telemetry={createNoopTelemetry()} />
      );

      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByLabelText("Toggle Mock Mode")).toBeNull();
      expect(screen.queryByTestId("dev-set-scans-button")).toBeNull();

      const pill = screen.getByTestId("brand-pill");
      act(() => {
        for (let i = 0; i < 5; i++) {
          fireEvent.click(pill);
        }
      });

      const toast = screen.getByRole("status");
      expect(toast.getAttribute("data-testid")).toBe("brand-toast");
      expect(toast.textContent).toMatch(/^Pomona v\d+\.\d+\.\d+$/);

      expect(screen.queryByLabelText("Toggle Mock Mode")).toBeNull();
      expect(screen.queryByTestId("dev-set-scans-button")).toBeNull();

      // Toast disappears right after
      act(() => {
        vi.advanceTimersByTime(2600);
      });
      expect(screen.queryByRole("status")).toBeNull();

      // And shows again on the next 5 taps
      act(() => {
        for (let i = 0; i < 5; i++) {
          fireEvent.click(pill);
        }
      });
      expect(screen.getByRole("status")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
  it.each(["S2_DrawFocusArea", "S3_Analysing"] as const)(
    "blocks production quota overrides in %s while fetching quota",
    async (phase) => {
      const client = makeDummyClient();
      window.history.replaceState({}, "", "/?scans=999&debug=true");
      localStorage.setItem("pomona-debug-device", "true");
      localStorage.setItem("pomona-mock-mode", "true");
      try {
        await act(async () => {
          render(<PomonaApp apiClient={client} telemetry={createNoopTelemetry()}
            initialState={{ phase }} />);
        });
        expect(client.getQuota).toHaveBeenCalledOnce();
        expect(client.overrideQuota).not.toHaveBeenCalled();
        expect((window as any).__setRemainingScans).toBeUndefined();
        expect(screen.queryByTestId("scan-quota-pill")).toBeNull();
        expect(screen.queryByTestId("dev-set-scans-button")).toBeNull();
        expect(client.overrideQuota).not.toHaveBeenCalled();
      } finally {
        window.history.replaceState({}, "", "/");
        cleanup();
      }
    }
  );

});
