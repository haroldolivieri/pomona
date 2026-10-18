import React from "react";
import ReactDOM from "react-dom/client";
import { PomonaApp } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { createFetchApiClient } from "./lib/api-client";
import { createPostHogSentryTelemetry } from "./lib/telemetry";
import "./i18n";
import "./styles/index.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  const apiClient = createFetchApiClient();
  const telemetry = createPostHogSentryTelemetry();

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <PomonaApp apiClient={apiClient} telemetry={telemetry} />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore registration failure in restricted/dev environments
    });
  });
}

