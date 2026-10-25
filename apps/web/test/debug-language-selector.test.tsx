import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PomonaApp } from "../src/App";
import "../src/i18n";

const stubClient = {
  getQuota: vi.fn().mockResolvedValue({ remainingDeviceScans: 10, budgetOpen: true }),
  overrideQuota: vi.fn(),
  submitScan: vi.fn().mockRejectedValue(new Error("unused")),
  submitDeepScan: vi.fn(),
};

const stubTelemetry = {
  capture() {},
  identify() {},
  captureException() {},
};

describe("LanguageSelector debug gate in PomonaApp", () => {
  it("renders language selector when debug override is enabled in dev", () => {
    const { unmount } = render(
      <PomonaApp apiClient={stubClient as any} telemetry={stubTelemetry} enableDebugOverride={true} />
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    unmount();

    render(
      <PomonaApp apiClient={stubClient as any} telemetry={stubTelemetry} enableDebugOverride={false} />
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
