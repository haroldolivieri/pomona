import React, { useReducer, useState, useEffect, useRef } from "react";
import type { ScanRequest, Point, ScanResponse } from "@pomona/contract";
import type { PomonaApiClient } from "./lib/api-client";
import type { TelemetryProvider } from "./lib/telemetry";
import {
  initialScanMachineState,
  scanMachineReducer,
  buildFollowUpRequestContext,
  type ScanMachineState,
} from "./state/scan-state-machine";
import { downsampleDataUrl, simplifyPath, type CropRect } from "./lib/image-pipeline";
import { getIsLocalBuild } from "./lib/build-mode";

function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => {
    const num = Number(c);
    const rnd = typeof crypto !== "undefined" && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint8Array(1))[0]
      : Math.floor(Math.random() * 256);
    return (num ^ (rnd & (15 >> (num / 4)))).toString(16);
  });
}
import { CameraViewfinder } from "./components/CameraViewfinder";
import { FreehandDrawStage } from "./components/FreehandDrawStage";
import { AnalysingStage } from "./components/AnalysingStage";
import { ResultStage } from "./components/ResultStage";
import { FlipCameraStage } from "./components/FlipCameraStage";
import { ScanErrorStage } from "./components/ScanErrorStage";
import { Toast } from "./components/Toast";
import "./styles/index.css";

import { createMockApiClient } from "./lib/mock-api-client";

export interface PomonaAppProps {
  apiClient: PomonaApiClient;
  telemetry: TelemetryProvider;
  initialState?: Partial<ScanMachineState>;
  enableDebugOverride?: boolean;
  initialRemainingScans?: number;
}

export const PomonaApp: React.FC<PomonaAppProps> = ({
  apiClient: realApiClient,
  telemetry,
  initialState,
  enableDebugOverride,
  initialRemainingScans,
}) => {
  const [state, dispatch] = useReducer(scanMachineReducer, {
    ...initialScanMachineState(),
    ...initialState,
  });

  // Device-specific developer / debug mode:
  // Enabled ONLY on this specific device when activated via:
  // 1. Five (5) rapid taps on the "Pomona" brand logo
  // 2. OR ?debug=true in the URL
  // 3. Stored in localStorage ("pomona-debug-device": "true") so it persists only on this device
  // 4. In automated unit test environments with enableDebugOverride set to true
  const [isDeviceDebugEnabled, setIsDeviceDebugEnabled] = useState<boolean>(() => {
    if (enableDebugOverride !== undefined) return enableDebugOverride;
    // Published (non-local) builds never unlock debug mode on this device
    if (!getIsLocalBuild()) return false;
    try {
      if (typeof window !== "undefined") {
        if (typeof window.location !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          if (params.get("debug") === "true") {
            try {
              localStorage.setItem("pomona-debug-device", "true");
            } catch {}
            return true;
          }
        }
        if (typeof localStorage !== "undefined") {
          return localStorage.getItem("pomona-debug-device") === "true";
        }
      }
    } catch {}
    return false;
  });

  const isDevMode = Boolean(enableDebugOverride ?? isDeviceDebugEnabled);
  const isLocalBuild = getIsLocalBuild();

  // Toast state: 5 taps on the brand logo always show the app version briefly
  const [brandToast, setBrandToast] = useState<string | null>(null);

  // 5-tap counter on the Pomona brand logo
  const brandTapCountRef = useRef<number>(0);
  const brandTapTimerRef = useRef<any>(null);

  const handleBrandTap = () => {
    brandTapCountRef.current += 1;
    if (brandTapTimerRef.current) {
      clearTimeout(brandTapTimerRef.current);
    }
    brandTapTimerRef.current = setTimeout(() => {
      brandTapCountRef.current = 0;
    }, 2000); // 5 taps must occur within 2 seconds

    if (brandTapCountRef.current >= 5) {
      brandTapCountRef.current = 0;
      // Always show the current app version, in every build
      setBrandToast(`Pomona v${__APP_VERSION__}`);
      if (!isLocalBuild) {
        // Published build: show the toast only; never unlock debug mode
        try {
          localStorage.removeItem("pomona-debug-device");
        } catch {}
        return;
      }
      setIsDeviceDebugEnabled((prev) => {
        const next = !prev;
        try {
          if (next) {
            localStorage.setItem("pomona-debug-device", "true");
          } else {
            localStorage.removeItem("pomona-debug-device");
          }
        } catch {}
        return next;
      });
    }
  };

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

  const [mockApiClient] = useState<PomonaApiClient>(() => createMockApiClient());
  const activeApiClient = isDevMode && isMockMode ? mockApiClient : realApiClient;

  const [remainingScans, setRemainingScans] = useState<number>(initialRemainingScans ?? 10);

  useEffect(() => {
    // Check if URL has ?scans=N to override backend limit for this device
    if (typeof window !== "undefined" && typeof window.location !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const scansParam = params.get("scans");
      if (scansParam !== null) {
        const parsed = parseInt(scansParam, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          activeApiClient
            .overrideQuota({ remainingScans: parsed })
            .then((res) => {
              if (typeof res?.remainingDeviceScans === "number") {
                setRemainingScans(res.remainingDeviceScans);
              }
            })
            .catch((err) => console.warn("[quota] Failed to override backend quota:", err));
          return;
        }
      }
    }

    // Authoritative backend quota for this device
    activeApiClient
      .getQuota()
      .then((info) => {
        if (typeof info?.remainingDeviceScans === "number") {
          setRemainingScans(info.remainingDeviceScans);
        }
      })
      .catch((err) => console.warn("[quota] Failed to fetch quota from backend:", err));
  }, [activeApiClient]);

  const handleQuotaPrompt = () => {
    if (typeof window === "undefined" || typeof window.prompt !== "function") return;
    const current = remainingScans;
    const val = window.prompt(
      "Set backend scan quota for this device (currently " + current + "):",
      String(current)
    );
    if (val !== null) {
      const parsed = parseInt(val.trim(), 10);
      if (!isNaN(parsed) && parsed >= 0) {
        activeApiClient
          .overrideQuota({ remainingScans: parsed })
          .then((res) => {
            if (typeof res?.remainingDeviceScans === "number") {
              setRemainingScans(res.remainingDeviceScans);
            }
          })
          .catch((err) => {
            console.error("[quota] Failed to override quota on backend:", err);
            if (typeof window.alert === "function") {
              window.alert("Could not update backend quota: " + err.message);
            }
          });
      }
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__setRemainingScans = (count: number) => {
        activeApiClient
          .overrideQuota({ remainingScans: count })
          .then((res) => {
            if (typeof res?.remainingDeviceScans === "number") {
              setRemainingScans(res.remainingDeviceScans);
            }
          })
          .catch(console.error);
      };
    }
  }, [activeApiClient]);

  // Shake detection listener: only mounted in development / debug mode
  useEffect(() => {
    if (!isDevMode || !getIsLocalBuild()) return;
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

      // Downsample and compress photo to <= 768px JPEG/WebP so it stays lightweight and within body limits
      const { base64: base64Data, mimeType } = await downsampleDataUrl(photoDataUrl, 768, 0.8);
      console.log(
        `[scan] Prepared payload: round ${round}, ${mimeType}, base64 length: ${base64Data.length} chars`
      );

      // Ensure focusPolygon is simplified to <=32 points so it never exceeds the schema limit of 40 points
      const safePolygon: Point[] | null =
        focusPolygon && focusPolygon.length >= 3
          ? (simplifyPath(focusPolygon as [number, number][], 32) as Point[])
          : null;

      const request: ScanRequest = {
        schemaVersion: "1.0",
        sessionId: generateUuid(),
        round,
        locale: "en-GB",
        imageBase64: base64Data,
        imageMimeType: mimeType,
        focusPolygon: safePolygon,
        followUpContext: round > 1 ? buildFollowUpRequestContext(currentState) : null,
      };

      const result = await activeApiClient.submitScan(request);
      const scanResponse: ScanResponse =
        result && typeof result === "object" && "response" in result && (result as any).response
          ? (result as any).response
          : (result as unknown as ScanResponse);

      // Update authoritative remaining scans returned by backend
      if (typeof result?.remainingScans === "number") {
        setRemainingScans(result.remainingScans);
      }

      telemetry.capture("scan_completed", { round, status: scanResponse.status });
      dispatch({ type: "SCAN_SUCCEEDED", response: scanResponse });
    } catch (err: any) {
      console.error("[scan:failed]", err);
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
            remainingScans={remainingScans}
            onQuotaClick={handleQuotaPrompt}
            onToggleTheme={toggleTheme}
            theme={theme}
            onBrandTap={handleBrandTap}
          />
        );

      case "S2_DrawFocusArea":
        return (
          <FreehandDrawStage
            photoDataUrl={state.currentPhotoDataUrl || ""}
            onAnalyse={handleStartAnalyse}
            onRetake={handleReset}
            errorMessage={state.errorMessage}
            remainingScans={remainingScans}
            onQuotaClick={handleQuotaPrompt}
          />
        );

      case "S3_Analysing":
        return (
          <AnalysingStage
            photoDataUrl={state.currentPhotoDataUrl}
            focusPolygon={state.focusPolygon}
            cropRect={state.cropRect}
            onCancel={handleReset}
            remainingScans={remainingScans}
            onQuotaClick={handleQuotaPrompt}
          />
        );

      case "S_ScanError":
        return (
          <ScanErrorStage
            status={state.status}
            errorMessage={state.errorMessage}
            photoDataUrl={state.currentPhotoDataUrl || state.round1PhotoDataUrl}
            onRetake={() => dispatch({ type: "DISMISS_ERROR" })}
            onDrawFocus={
              state.status === "multiple_types" || state.status === "unclear_photo"
                ? () => dispatch({ type: "DRAW_FOCUS_AFTER_ERROR" })
                : undefined
            }
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
            onSetTargetRipeness={(targetRipeness) => {
              telemetry.capture("target_ripeness_selected", { targetRipeness });
              dispatch({ type: "SET_TARGET_RIPENESS", targetRipeness });
            }}
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

      {brandToast && <Toast message={brandToast} onDone={() => setBrandToast(null)} />}

      {/* Discrete tap target below top bar on left (LOCAL DEV BUILDS ONLY) */}
      {isDevMode && isLocalBuild && (
        <div
          style={{
            position: "fixed",
            top: "calc(max(16px, env(safe-area-inset-top)) + 50px)",
            left: "16px",
            zIndex: 80,
            display: "flex",
            gap: "6px",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setIsMockMode((prev) => {
                const next = !prev;
                try {
                  localStorage.setItem("pomona-mock-mode", String(next));
                } catch {}
                return next;
              });
            }}
            aria-label="Toggle Mock Mode"
            style={{
              background: isMockMode ? "rgba(245, 213, 71, 0.2)" : "rgba(0,0,0,0.35)",
              border: isMockMode ? "1px solid #F5D547" : "1px solid rgba(255,255,255,0.3)",
              color: isMockMode ? "#F5D547" : "rgba(255,255,255,0.8)",
              padding: "4px 9px",
              borderRadius: "12px",
              fontSize: "10.5px",
              fontWeight: 600,
              cursor: "pointer",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          >
            {isMockMode ? "🧪 MOCK" : "🌐 LIVE"}
          </button>

          <button
            type="button"
            onClick={handleQuotaPrompt}
            aria-label="Set remaining scans"
            data-testid="dev-set-scans-button"
            title="Click to override scan quota"
            style={{
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.3)",
              color: "#F5D547",
              padding: "4px 9px",
              borderRadius: "12px",
              fontSize: "10.5px",
              fontWeight: 600,
              cursor: "pointer",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          >
            ⚡ {remainingScans} scans
          </button>
        </div>
      )}
    </div>
  );
};
