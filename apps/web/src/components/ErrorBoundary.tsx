import { uiCopy } from "../i18n/copy";
import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary caught error]", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          data-testid="error-boundary-fallback"
          style={{
            padding: "24px",
            color: "#F0F4EE",
            backgroundColor: "#080E09",
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            fontFamily: "Inter, system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "44px", marginBottom: "16px" }}>⚠️</div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>
            {uiCopy("copy.applicationError")}</h2>
          <p
            style={{
              color: "#97AB9C",
              fontSize: "13px",
              lineHeight: 1.4,
              maxWidth: "340px",
              marginBottom: "20px",
              wordBreak: "break-word",
            }}
          >
            {uiCopy("copy.anUnexpectedErrorOccurredInTheProduce")}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "12px 24px",
              backgroundColor: "#2F5D34",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "12px",
              fontWeight: 600,
              fontSize: "14px",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(47, 93, 52, 0.4)",
            }}
          >
            {uiCopy("copy.reloadApp")}</button>
        </div>
      );
    }
    return this.props.children;
  }
}
