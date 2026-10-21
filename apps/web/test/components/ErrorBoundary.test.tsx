import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";

const ThrowingComponent: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error("Simulated React render crash");
  }
  return <div>Normal Content</div>;
};

describe("ErrorBoundary", () => {
  it("renders children normally when no error occurs", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Normal Content")).toBeInTheDocument();
  });

  it("catches render errors and renders the application error fallback screen", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("error-boundary-fallback")).toBeInTheDocument();
    expect(screen.getByText("Application Error")).toBeInTheDocument();
    expect(screen.getByText("An unexpected error occurred in the produce scanner.")).toBeInTheDocument();
    expect(screen.queryByText("Simulated React render crash")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload App" })).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
