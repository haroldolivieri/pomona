import React, { useReducer, useState, useEffect } from "react";
import type { ScanRequest, Point } from "@pomona/contract";
import type { PomonaApiClient } from "./lib/api-client";
import type { TelemetryProvider } from "./lib/telemetry";
import {
  initialScanMachineState,
  scanMachineReducer,
  buildFollowUpRequestContext,
  type ScanMachineState,
} from "./state/scan-state-machine";
import type { CropRect } from "./lib/image-pipeline";
import { CameraViewfinder } from "./components/CameraViewfinder";
import { FreehandDrawStage } from "./components/FreehandDrawStage";
import { AnalysingStage } from "./components/AnalysingStage";
import { ResultStage } from "./components/ResultStage";
import { FlipCameraStage } from "./components/FlipCameraStage";
import "./styles/index.css";

import { createMockApiClient } from "./lib/mock-api-client";

export interface PomonaAppProps {
  apiClient: PomonaApiClient;
  telemetry: TelemetryProvider;
  initialState?: Partial<ScanMachineState>;
  enableDebugOverride?: boolean;
}

export const PomonaApp: React.FC<PomonaAppProps> = ({
  apiClient: realApiClient,
  telemetry,
  initialState,
  enableDebugOverride,
}) => {
  const [state, dispatch] = useReducer(scanMachineReducer, {
    ...initialScanMachineState(),
    ...initialState,
  });

  // Debug mock mode is strictly active only during development (import.meta.env.DEV)
  // or when explicitly enabled via enableDebugOverride (e.g. in targeted tests)
  const isDevMode = Boolean(enableDebugOverride ?? (import.meta.env?.DEV));

  const [isMockMode, setIsMockMode] = useState<boolean>(() => {
    if (!isDevMode) return false;
    try {
      if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
        const saved = localStorage.getItem("pomona-mock-mode");
        if (saved !== null) return saved === "true";
      }
    } catch {}
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "test" && !enableDebugOverride) {
      return false;
    }
    return true;
  });

  const [toastMessage, setToastMessage] = useState<string | null>(() => {
    return isDevMode && isMockMode ? "🧪 Mock Mode ON (Shake device to toggle)" : null;
  });

  const [mockApiClient] = useState<PomonaApiClient>(() => createMockApiClient());
  const activeApiClient = isDevMode && isMockMode ? mockApiClient : realApiClient;

  // Shake detection listener: only mounted in development / debug mode
  useEffect(() => {
    if (!isDevMode) return;
    let lastX: number | null = null;
    let lastY: number | null = null;
    let lastZ: number | null = null;
    let lastTime = 0;
    const SHAKE_THRESHOLD = 25; // acceleration magnitude threshold

    const handleMotion = (event: DeviceMotionEvent) => {
      const current = event.accelerationIncludingGravity;
      if (!current || current.x === null || current.y === null || current.z === null) return;

      const now = Date.now();
      if (now - lastTime > 100) {
        const diffTime = now - lastTime;
        lastTime = now;

        if (lastX !== null && lastY !== null && lastZ !== null) {
          const deltaX = Math.abs(current.x - lastX);
          const deltaY = Math.abs(current.y - lastY);
          const deltaZ = Math.abs(current.z - lastZ);
          const speed = ((deltaX + deltaY + deltaZ) / diffTime) * 1000;

          if (speed > SHAKE_THRESHOLD) {
            setIsMockMode((prev) => {
              const next = !prev;
              try {
                localStorage.setItem("pomona-mock-mode", String(next));
              } catch {}
              setToastMessage(next ? "🧪 Mock Mode ENABLED" : "🌐 Live Mode (real API) ENABLED");
              setTimeout(() => setToastMessage(null), 3000);
              return next;
            });
          }
        }

        lastX = current.x;
        lastY = current.y;
        lastZ = current.z;
      }
    };

    if (typeof window !== "undefined" && window.DeviceMotionEvent) {
      window.addEventListener("devicemotion", handleMotion, false);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("devicemotion", handleMotion);
      }
    };
  }, []);

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      if (typeof window !== "undefined" && typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
        const saved = localStorage.getItem("pomona-theme");
        if (saved === "light" || saved === "dark") return saved;
      }
      if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
      }
    } catch {
      // ignore in test/restricted environments
    }
    return "light";
  });

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
      if (typeof localStorage !== "undefined" && typeof localStorage.setItem === "function") {
        localStorage.setItem("pomona-theme", theme);
      }
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const handleFrameCaptured = (photoDataUrl: string) => {
    telemetry.capture("frame_captured", { round: state.round });
    dispatch({ type: "FRAME_CAPTURED", photoDataUrl });
  };

  const executeScan = async (
    photoDataUrl: string,
    focusPolygon: Point[] | null,
    round: 1 | 2 | 3,
    currentState: ScanMachineState
  ) => {
    try {
      telemetry.capture("scan_started", { round });
      // Strip base64 prefix
      const base64Data = photoDataUrl.includes(",")
        ? photoDataUrl.split(",")[1]
        : photoDataUrl;
      const mimeType = photoDataUrl.includes("image/jpeg") ? "image/jpeg" : "image/webp";

      const request: ScanRequest = {
        schemaVersion: "1.0",
        sessionId: "session-" + Date.now(),
        round,
        locale: "en",
        imageBase64: base64Data,
        imageMimeType: mimeType,
        focusPolygon: focusPolygon || null,
        followUpContext: round > 1 ? buildFollowUpRequestContext(currentState) : null,
      };

      const result = await activeApiClient.submitScan(request);
      telemetry.capture("scan_completed", { round, status: result.response.status });
      dispatch({ type: "SCAN_SUCCEEDED", response: result.response });
    } catch (err: any) {
      telemetry.captureException(err, { round });
      dispatch({ type: "SCAN_FAILED", error: err.message || "Network error" });
    }
  };

  const handleStartAnalyse = (focusPolygon: Point[] | null, cropRect: CropRect | null) => {
    dispatch({ type: "START_ANALYSE", focusPolygon, cropRect });
    if (state.currentPhotoDataUrl) {
      executeScan(state.currentPhotoDataUrl, focusPolygon, 1, state);
    }
  };

  const handleFollowUpCaptured = (photoDataUrl: string) => {
    dispatch({ type: "FOLLOW_UP_CAPTURED", photoDataUrl });
    const targetRound = state.phase === "S6_FlipFirstPickCamera" ? 3 : 2;
    executeScan(photoDataUrl, null, targetRound, state);
  };

  const handleCompareWithRunnerUp = () => {
    telemetry.capture("compare_with_runner_up_clicked");
    dispatch({ type: "COMPARE_WITH_RUNNER_UP" });
  };

  const handleStartFinalCheck = () => {
    telemetry.capture("start_final_check_clicked");
    dispatch({ type: "START_FINAL_CHECK_ON_FIRST_PICK" });
  };

  const handleReset = () => {
    telemetry.capture("session_reset");
    dispatch({ type: "RESET" });
  };

  const renderCurrentStage = () => {
    switch (state.phase) {
      case "S1_LiveCamera":
        return (
          <CameraViewfinder
            onCapture={handleFrameCaptured}
            onToggleTheme={toggleTheme}
            theme={theme}
          />
        );

      case "S2_DrawFocusArea":
        return (
          <FreehandDrawStage
            photoDataUrl={state.currentPhotoDataUrl || ""}
            onAnalyse={handleStartAnalyse}
            onRetake={handleReset}
            errorMessage={state.errorMessage}
          />
        );

      case "S3_Analysing":
        return (
          <AnalysingStage
            photoDataUrl={state.currentPhotoDataUrl}
            focusPolygon={state.focusPolygon}
            cropRect={state.cropRect}
            onCancel={handleReset}
          />
        );

      case "S4_InitialResult":
      case "S5B1_RunnerUpBeaten":
      case "S5B2_RunnerUpTookLead":
      case "S7A_FirstPickWonFinal":
      case "S7B_FirstPickLostFinal":
        return (
          <ResultStage
            state={state}
            onCompareWithRunnerUp={handleCompareWithRunnerUp}
            onStartFinalCheck={handleStartFinalCheck}
            onReset={handleReset}
          />
        );

      case "S5A_FlipRunnerUpCamera":
      case "S6_FlipFirstPickCamera":
        return (
          <FlipCameraStage
            state={state}
            onCapture={handleFollowUpCaptured}
            onBack={() => {
              if (state.phase === "S6_FlipFirstPickCamera") {
                // Back returns to S5B2
                dispatch({
                  type: "SCAN_SUCCEEDED",
                  response: {
                    ...state.lastResponse!,
                    round: 2,
                  },
                });
              } else {
                // Back returns to S4
                dispatch({
                  type: "SCAN_SUCCEEDED",
                  response: {
                    ...state.lastResponse!,
                    round: 1,
                  },
                });
              }
            }}
            onClose={handleReset}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="pomona-root">
      {renderCurrentStage()}

      {/* Shake / Debug Mock Mode Indicator & Toast (DEV ONLY) */}
      {isDevMode && toastMessage && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(17, 29, 21, 0.92)",
            color: "#F5D547",
            padding: "8px 16px",
            borderRadius: "9999px",
            fontSize: "13px",
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            zIndex: 9999,
            pointerEvents: "none",
            textAlign: "center",
            backdropFilter: "blur(8px)",
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Discrete tap target in top right corner (DEV ONLY) */}
      {isDevMode && (
        <button
          type="button"
          onClick={() => {
            setIsMockMode((prev) => {
              const next = !prev;
              try {
                localStorage.setItem("pomona-mock-mode", String(next));
              } catch {}
              setToastMessage(next ? "🧪 Mock Mode ENABLED" : "🌐 Live Mode (real API) ENABLED");
              setTimeout(() => setToastMessage(null), 3000);
              return next;
            });
          }}
          aria-label="Toggle Mock Mode"
          style={{
            position: "fixed",
            top: "14px",
            right: "72px",
            zIndex: 80,
            background: isMockMode ? "rgba(245, 213, 71, 0.2)" : "rgba(0,0,0,0.2)",
            border: isMockMode ? "1px solid #F5D547" : "1px solid rgba(255,255,255,0.3)",
            color: isMockMode ? "#F5D547" : "rgba(255,255,255,0.7)",
            padding: "4px 8px",
            borderRadius: "12px",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            backdropFilter: "blur(6px)",
          }}
        >
          {isMockMode ? "🧪 MOCK" : "🌐 LIVE"}
        </button>
      )}
    </div>
  );
};
