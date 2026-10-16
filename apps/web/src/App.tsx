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

export interface PomonaAppProps {
  apiClient: PomonaApiClient;
  telemetry: TelemetryProvider;
  initialState?: Partial<ScanMachineState>;
}

export const PomonaApp: React.FC<PomonaAppProps> = ({
  apiClient,
  telemetry,
  initialState,
}) => {
  const [state, dispatch] = useReducer(scanMachineReducer, {
    ...initialScanMachineState(),
    ...initialState,
  });

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

      const result = await apiClient.submitScan(request);
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
        return <AnalysingStage photoDataUrl={state.currentPhotoDataUrl} />;

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

  return <div className="pomona-root">{renderCurrentStage()}</div>;
};
