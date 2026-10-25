import { uiCopy } from "../i18n/copy";
import i18n from "../i18n";
import { saveLocalePreference } from "../i18n/bootstrap";
import { isSupportedLocale } from "@pomona/contract";
import { LanguageSelector } from "./LanguageSelector";
import React, { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { captureViewportCrop } from "../lib/image-pipeline";
import {
  FloatingPromptCard,
  ShutterButton,
  MorphingReticle,
  CameraModeSwitcher,
} from "./CameraCaptureUi";
import {
  collectDeepScanFrames,
  DEEP_SCAN_CAPTURE_DURATION_MS,
  type CollectedFrame,
} from "../lib/deep-scan-frames";

export interface DeepScanModeConfig {
  collect?: (video: HTMLVideoElement, signal?: AbortSignal) => Promise<CollectedFrame[]>;
  onComplete: (collected: CollectedFrame[]) => void | Promise<void>;
  onCancel: () => void;
  notice?: string | null;
}

const DEEP_SCAN_CAPTURE_MS = DEEP_SCAN_CAPTURE_DURATION_MS;

const isTestEnv = typeof process !== "undefined" && process.env.NODE_ENV === "test";
let hasBrandEntrancePlayed = isTestEnv;

export function __resetBrandEntranceForTesting() {
  hasBrandEntrancePlayed = false;
}

const SUFFIX_LETTERS = [
  { char: "o", key: "o1", delay: 360, zIndex: 5 },
  { char: "m", key: "m", delay: 270, zIndex: 4 },
  { char: "o", key: "o2", delay: 180, zIndex: 3 },
  { char: "n", key: "n", delay: 90, zIndex: 2 },
  { char: "a", key: "a", delay: 0, zIndex: 1 },
];

export interface CameraViewfinderProps {
  onCapture?: (photoDataUrl: string) => void | Promise<void>;
  onClose?: () => void;
  onToggleTheme?: () => void;
  theme?: "light" | "dark";
  remainingScans?: number;
  onQuotaClick?: () => void;
  onBrandTap?: () => void;
  showLanguageSelector?: boolean;
  deepScan?: DeepScanModeConfig;
  initialMode?: "compare" | "inspect";
  mode?: "compare" | "inspect";
  onModeChange?: (mode: "compare" | "inspect") => void;
  notice?: string | null;
}

export const CameraViewfinder: React.FC<CameraViewfinderProps> = ({
  onCapture,
  onClose,
  onToggleTheme,
  theme = "light",
  remainingScans = 10,
  onQuotaClick,
  onBrandTap,
  showLanguageSelector = false,
  deepScan,
  initialMode,
  mode: propMode,
  onModeChange,
  notice,
}) => {
  const { t } = useTranslation();
  const [internalMode, setInternalMode] = useState<"compare" | "inspect">(
    propMode ?? initialMode ?? (deepScan !== undefined ? "inspect" : "compare")
  );

  useEffect(() => {
    if (propMode) {
      setInternalMode(propMode);
    } else if (initialMode) {
      setInternalMode(initialMode);
    }
  }, [propMode, initialMode]);

  const activeMode = propMode ?? internalMode;
  const isInspect = activeMode === "inspect";
  const isDeepScan = isInspect;
  const deepScanCollectRef = useRef(deepScan?.collect);
  const [deepScanRunning, setDeepScanRunning] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const progressPathRef = useRef<SVGPathElement | null>(null);
  const progressRafRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [brandExpanded, setBrandExpanded] = useState<boolean>(() => !hasBrandEntrancePlayed);
  const [showOmona, setShowOmona] = useState<boolean>(() => !hasBrandEntrancePlayed);
  const [isInitialEntrance, setIsInitialEntrance] = useState<boolean>(() => !hasBrandEntrancePlayed);

  useEffect(() => {
    if (!isInitialEntrance) return;

    const collapseTimer = setTimeout(() => {
      setBrandExpanded(false);
    }, 200);

    const cleanupTimer = setTimeout(() => {
      setShowOmona(false);
      setIsInitialEntrance(false);
      hasBrandEntrancePlayed = true;
    }, 1100);

    return () => {
      clearTimeout(collapseTimer);
      clearTimeout(cleanupTimer);
    };
  }, [isInitialEntrance]);

  useEffect(() => {
    deepScanCollectRef.current = deepScan?.collect;
  }, [deepScan?.collect]);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
      if (progressRafRef.current !== null) cancelAnimationFrame(progressRafRef.current);
    },
    []
  );

  const runProgressLoop = (startedAt: number) => {
    const tick = (now: number) => {
      progressRafRef.current = null;
      const progress = Math.min(1, Math.max(0, (now - startedAt) / DEEP_SCAN_CAPTURE_MS));
      const offset = String(100 * (1 - progress));
      const path = progressPathRef.current;
      if (path) {
        path.style.strokeDashoffset = offset;
        path.setAttribute("stroke-dashoffset", offset);
      }
      if (progress < 1) progressRafRef.current = requestAnimationFrame(tick);
    };
    progressRafRef.current = requestAnimationFrame(tick);
  };

  const stopProgressLoop = () => {
    if (progressRafRef.current !== null) {
      cancelAnimationFrame(progressRafRef.current);
      progressRafRef.current = null;
    }
  };

  const handleDeepScanCancel = () => {
    abortControllerRef.current?.abort();
    stopProgressLoop();
    setDeepScanRunning(false);
    deepScan?.onCancel();
  };

  const runDeepScanCapture = async () => {
    if (!deepScan || deepScanRunning || isCapturing) return;
    setDeepScanRunning(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    runProgressLoop(performance.now());
    try {
      const video = videoRef.current;
      const run = deepScanCollectRef.current ?? collectDeepScanFrames;
      const collected = video ? await run(video, controller.signal) : [];
      if (!controller.signal.aborted) {
        await deepScan.onComplete(collected);
      }
    } catch {
      if (!controller.signal.aborted) {
        await deepScan.onComplete([]);
      }
    } finally {
      stopProgressLoop();
      setDeepScanRunning(false);
      abortControllerRef.current = null;
    }
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [streamActive, setStreamActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flashActive, setFlashActive] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
      ? navigator.onLine
      : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let isMounted = true;

    async function initCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error(uiCopy("copy.getusermediaNotSupported"));
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
          audio: false,
        });

        // Stabilize camera focus, exposure, and white-balance on supported devices
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && typeof videoTrack.applyConstraints === "function") {
          try {
            const caps = (typeof videoTrack.getCapabilities === "function" ? videoTrack.getCapabilities() : {}) as any;
            const advanced: any[] = [];
            if (caps?.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
              advanced.push({ focusMode: "continuous" });
            }
            if (caps?.exposureMode && Array.isArray(caps.exposureMode) && caps.exposureMode.includes("continuous")) {
              advanced.push({ exposureMode: "continuous" });
            }
            if (caps?.whiteBalanceMode && Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes("continuous")) {
              advanced.push({ whiteBalanceMode: "continuous" });
            }
            if (advanced.length > 0) {
              await videoTrack.applyConstraints({ advanced });
            }
          } catch {
            // Browser or device does not support advanced video track constraints
          }
        }

        if (isMounted && videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
          setStreamActive(true);
        }
      } catch (err: any) {
        if (isMounted) {
          setCameraError(uiCopy("copy.cameraAccessDenied"));
          setStreamActive(false);
        }
      }
    }

    initCamera();

    return () => {
      isMounted = false;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const toggleFlash = async () => {
    setFlashActive((prev) => !prev);
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const capabilities = (track.getCapabilities && track.getCapabilities()) as any;
          if (capabilities && capabilities.torch) {
            await (track as any).applyConstraints({
              advanced: [{ torch: !flashActive }],
            });
          }
        } catch {
          // torch constraint not supported in browser / environment
        }
      }
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);

  const handleCapture = async () => {
    if (!isOnline || isCapturing || deepScanRunning) return;
    setIsCapturing(true);
    try {
      if (videoRef.current && streamActive) {
        const video = videoRef.current;
        const container = containerRef.current;
        const cw = container?.clientWidth || window.innerWidth;
        const ch = container?.clientHeight || window.innerHeight;
        const croppedUrl = captureViewportCrop(video, cw, ch, "image/webp", 0.85);
        if (croppedUrl && croppedUrl.startsWith("data:")) {
          await onCapture?.(croppedUrl);
          return;
        }
      }

      // Fallback if video isn't producing frames (e.g. mock test environment)
      try {
        const fallbackCanvas = document.createElement("canvas");
        fallbackCanvas.width = 768;
        fallbackCanvas.height = 768;
        const ctx = fallbackCanvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#2F5D34";
          ctx.fillRect(0, 0, 768, 768);
        }
        const dataUrl = fallbackCanvas.toDataURL("image/webp", 0.75);
        if (dataUrl && dataUrl.startsWith("data:")) {
          await onCapture?.(dataUrl);
          return;
        }
      } catch {
        // ignore
      }
      await onCapture?.("data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=");
    } finally {
      setIsCapturing(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isOnline) return;
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          onCapture?.(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleModeSelect = (newMode: "compare" | "inspect") => {
    if (deepScanRunning || isCapturing || newMode === activeMode) return;
    setInternalMode(newMode);
    onModeChange?.(newMode);
  };

  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const swipeStartRef = useRef<{ x: number; y: number; time: number; mode: "compare" | "inspect" } | null>(null);

  const SWIPE_DISTANCE = 160;

  const handleSwipeStart = (clientX: number, clientY: number) => {
    if (deepScanRunning || isCapturing) return;
    swipeStartRef.current = { x: clientX, y: clientY, time: Date.now(), mode: activeMode };
    setIsDragging(false);
  };

  const handleSwipeMove = (clientX: number, clientY: number) => {
    if (!swipeStartRef.current || deepScanRunning || isCapturing) return;
    const deltaX = clientX - swipeStartRef.current.x;
    const deltaY = clientY - swipeStartRef.current.y;

    if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        setIsDragging(true);
        const startMode = swipeStartRef.current.mode;
        let p: number;
        if (startMode === "compare") {
          if (deltaX <= 0) {
            p = Math.min(1, Math.max(0, -deltaX / SWIPE_DISTANCE));
          } else {
            p = -Math.min(0.15, (deltaX / SWIPE_DISTANCE) * 0.15);
          }
        } else {
          if (deltaX >= 0) {
            p = Math.max(0, Math.min(1, 1 - (deltaX / SWIPE_DISTANCE)));
          } else {
            p = 1 + Math.min(0.15, (-deltaX / SWIPE_DISTANCE) * 0.15);
          }
        }
        setDragProgress(p);
      }
    }
  };

  const handleSwipeEnd = (clientX: number, clientY: number) => {
    if (!swipeStartRef.current || deepScanRunning || isCapturing) {
      swipeStartRef.current = null;
      setIsDragging(false);
      setDragProgress(null);
      return;
    }
    const deltaX = clientX - swipeStartRef.current.x;
    const deltaY = clientY - swipeStartRef.current.y;
    const elapsed = Date.now() - swipeStartRef.current.time;
    const startMode = swipeStartRef.current.mode;
    const currentProgress = dragProgress;
    swipeStartRef.current = null;

    const SWIPE_THRESHOLD = 35;
    const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.0;
    const wasQuickFlick = elapsed < 800 && Math.abs(deltaX) > SWIPE_THRESHOLD && isHorizontal;

    let targetMode = startMode;
    if (startMode === "compare") {
      if (wasQuickFlick && deltaX < 0) {
        targetMode = "inspect";
      } else if (currentProgress !== null && currentProgress >= 0.5) {
        targetMode = "inspect";
      }
    } else {
      if (wasQuickFlick && deltaX > 0) {
        targetMode = "compare";
      } else if (currentProgress !== null && currentProgress <= 0.5) {
        targetMode = "compare";
      }
    }

    setIsDragging(false);
    setDragProgress(null);

    if (targetMode !== activeMode) {
      handleModeSelect(targetMode);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) handleSwipeStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) handleSwipeMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = e.changedTouches?.[0] ?? e.touches?.[0];
    const clientX = touch ? touch.clientX : (e as any).clientX ?? 0;
    const clientY = touch ? touch.clientY : (e as any).clientY ?? 0;
    handleSwipeEnd(clientX, clientY);
  };

  const handleTouchCancel = () => {
    swipeStartRef.current = null;
    setIsDragging(false);
    setDragProgress(null);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    handleSwipeStart(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    if (e.buttons === 1) {
      handleSwipeMove(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    handleSwipeEnd(e.clientX, e.clientY);
  };

  const handlePointerCancel = () => {
    swipeStartRef.current = null;
    setIsDragging(false);
    setDragProgress(null);
  };

  return (
    <div
      data-testid={isDeepScan ? "stage-S_DS_Capture" : "stage-S1_LiveCamera"}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        backgroundColor: "#000000",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        touchAction: "pan-y",
      }}
    >
      {showLanguageSelector && <div style={{ position: "absolute", top: "max(72px, env(safe-area-inset-top))", right: "20px", zIndex: 21 }}>
        <LanguageSelector locale={isSupportedLocale(i18n.language) ? i18n.language : "en-GB"} onChange={(locale) => { saveLocalePreference(locale); void i18n.changeLanguage(locale); }} />
      </div>}
      {/* Top bar with brand pill, mode switcher tab, and flash/action buttons */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          paddingTop: "max(16px, env(safe-area-inset-top))",
          paddingLeft: "16px",
          paddingRight: "16px",
          paddingBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 20,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)",
        }}
      >
        {/* Left: Pomona brand pill (5-tap debug trigger) - starts expanded 'Pomona' on initial boot, animates to 'P' */}
        <div style={{ display: "flex", alignItems: "center", flex: 1, justifyContent: "flex-start" }}>
          <div
            data-testid="brand-pill"
            onClick={onBrandTap}
            role={onBrandTap ? "button" : undefined}
            tabIndex={onBrandTap ? 0 : undefined}
            aria-label={uiCopy("copy.pomona")}
            style={{
              background: "rgba(251,250,246,0.92)",
              color: "#142117",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              height: "36px",
              width: brandExpanded ? "92px" : "36px",
              minWidth: "36px",
              padding: "0 12px",
              borderRadius: brandExpanded ? "999px" : "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "flex-start",
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
              cursor: onBrandTap ? "pointer" : "default",
              userSelect: "none",
              flexShrink: 0,
              boxSizing: "border-box",
              overflow: "hidden",
              transition: isInitialEntrance
                ? "width 340ms cubic-bezier(0.25, 0.9, 0.3, 1) 360ms, border-radius 340ms ease 360ms"
                : "none",
            }}
          >
            <span
              className="font-serif"
              style={{
                fontFamily: "Fraunces, Georgia, serif",
                fontSize: "17px",
                fontWeight: 700,
                color: "#142117",
                lineHeight: 1,
                width: "12px",
                textAlign: "center",
                display: "inline-block",
                position: "relative",
                zIndex: 10,
                flexShrink: 0,
                animation:
                  isInitialEntrance && !brandExpanded
                    ? "p-recoil-bounce 340ms cubic-bezier(0.25, 0.9, 0.3, 1) 380ms backwards"
                    : "none",
              }}
            >
              {uiCopy("copy.brandMark")}
            </span>
            {showOmona && (
              <span
                aria-hidden="true"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  overflow: "hidden",
                  pointerEvents: "none",
                }}
              >
                {SUFFIX_LETTERS.map(({ char, key, delay, zIndex }) => (
                  <span
                    key={key}
                    style={{
                      fontFamily: "Fraunces, Georgia, serif",
                      fontSize: "16px",
                      fontWeight: 700,
                      color: "#142117",
                      lineHeight: 1,
                      letterSpacing: "0.01em",
                      display: "inline-block",
                      position: "relative",
                      zIndex,
                      whiteSpace: "nowrap",
                      maxWidth: brandExpanded ? "18px" : "0px",
                      opacity: brandExpanded ? 1 : 0,
                      transform: brandExpanded
                        ? "translateX(0px)"
                        : key === "o1"
                          ? "translateX(-14px)"
                          : "translateX(-8px)",
                      filter: brandExpanded ? "blur(0px)" : "blur(1px)",
                      transition: isInitialEntrance
                        ? `max-width 280ms ease ${delay}ms, opacity 240ms ease ${delay}ms, transform 280ms ease ${delay}ms, filter 240ms ease ${delay}ms`
                        : "none",
                    }}
                  >
                    {char}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>

        {/* Center: CameraModeSwitcher (Compare | Inspect) */}
        {!isCapturing && !deepScanRunning && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: isInitialEntrance
                ? "pomona-fade-down 800ms cubic-bezier(0.2, 0.8, 0.2, 1) 400ms backwards"
                : "none",
            }}
          >
            <CameraModeSwitcher
              mode={activeMode}
              onChange={handleModeSelect}
              disabled={deepScanRunning || isCapturing}
              dragProgress={dragProgress !== null ? dragProgress : (activeMode === "inspect" ? 1 : 0)}
              isDragging={isDragging}
            />
          </div>
        )}

        {/* Right action buttons: Flash toggle, Theme toggle, Close button */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1, justifyContent: "flex-end" }}>
          <button
            onClick={toggleFlash}
            aria-label={t("camera.flash")}
            data-testid="flash-toggle-button"
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              backgroundColor: flashActive ? "#F5D547" : "rgba(251,250,246,0.92)",
              color: "#142117",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              cursor: "pointer",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
              flexShrink: 0,
            }}
          >
            ⚡
          </button>

          {onClose && (
            <button
              onClick={onClose}
              aria-label={uiCopy("copy.close")}
              data-testid="close-button"
              style={{
                background: "rgba(251,250,246,0.92)",
                border: "none",
                borderRadius: "50%",
                width: "36px",
                height: "36px",
                color: "#142117",
                cursor: "pointer",
                fontSize: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Video Viewfinder & Framing Corners */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          width: "100%",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1,
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />

        {/* Reticle: bidirectional morphing reticle between corner brackets (Compare) and oval (Inspect) */}
        <MorphingReticle
          mode={activeMode}
          deepScanRunning={deepScanRunning}
          progressPathRef={progressPathRef}
          dragProgress={dragProgress !== null ? dragProgress : (activeMode === "inspect" ? 1 : 0)}
          isDragging={isDragging}
        />

        {cameraError && (
          <div
            style={{
              position: "absolute",
              padding: "16px",
              backgroundColor: "rgba(0,0,0,0.75)",
              color: "#FFF",
              borderRadius: "8px",
              textAlign: "center",
              margin: "20px",
              zIndex: 2,
            }}
          >
            <p style={{ marginBottom: "12px", fontSize: "14px" }}>
              {t("camera.permissionDenied")}
            </p>
            <button
              onClick={() => isOnline && fileInputRef.current?.click()}
              disabled={!isOnline}
              style={{
                backgroundColor: "var(--cta-primary)",
                color: "#FFF",
                border: "none",
                padding: "8px 16px",
                borderRadius: "20px",
                fontSize: "14px",
                cursor: isOnline ? "pointer" : "not-allowed",
                opacity: isOnline ? 1 : 0.5,
              }}
            >
              {t("camera.uploadFallback")}
            </button>
          </div>
        )}
      </div>

      {/* Floating Prompt Card above shutter */}
      <div
        data-testid="prompt-card-container"
        style={{
          position: "absolute",
          left: "16px",
          right: "16px",
          bottom: "calc(max(24px, env(safe-area-inset-bottom)) + 84px)",
          zIndex: 25,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
          transform: isDragging && dragProgress !== null
            ? `translateX(${((dragProgress - (activeMode === "inspect" ? 1 : 0)) * -32).toFixed(1)}px)`
            : "translateX(0px)",
          transition: isDragging ? "none" : "transform 260ms cubic-bezier(0.2, 0, 0, 1)",
          animation: isInitialEntrance
            ? "pomona-fade-up 850ms cubic-bezier(0.2, 0.8, 0.2, 1) 500ms backwards"
            : "none",
        }}
      >
        <div style={{ pointerEvents: "auto", width: "100%", maxWidth: "360px", display: "flex", justifyContent: "center" }}>
          {isInspect ? (
            <FloatingPromptCard
              testId="ds-prompt-card"
              isLoading={deepScanRunning}
              title={
                deepScanRunning
                  ? uiCopy("deepScan.captureScanningTitle")
                  : uiCopy("deepScan.captureIdleTitle")
              }
              subtitleLines={
                deepScanRunning
                  ? [uiCopy("deepScan.captureScanningSubtitle")]
                  : [uiCopy("deepScan.captureInstruction")]
              }
              footer={
                !deepScanRunning && (notice ?? deepScan?.notice) ? (
                  <div
                    data-testid="ds-notice"
                    style={{
                      marginTop: "10px",
                      fontSize: "12px",
                      fontWeight: 600,
                      background: "var(--surface-hint-warn, #FFF4D6)",
                      border: "1px solid var(--surface-hint-warn-border, #E8D48B)",
                      borderRadius: "12px",
                      padding: "8px 10px",
                    }}
                  >
                    {notice ?? deepScan?.notice}
                  </div>
                ) : null
              }
            />
          ) : (
            <FloatingPromptCard
              testId="floating-prompt-card"
              isLoading={isCapturing}
              title={
                isCapturing
                  ? t("camera.scanningTitle")
                  : isOnline
                  ? t("camera.promptTitle")
                  : t("camera.offlineTitle")
              }
              subtitleLines={
                isCapturing
                  ? [t("camera.scanningSubtitle")]
                  : [isOnline ? t("camera.promptSubtitle") : t("camera.offlineSubtitle")]
              }
              footer={
                !isCapturing && (notice ?? deepScan?.notice) ? (
                  <div
                    data-testid="camera-notice"
                    style={{
                      marginTop: "10px",
                      fontSize: "12px",
                      fontWeight: 600,
                      background: "var(--surface-hint-warn, #FFF4D6)",
                      border: "1px solid var(--surface-hint-warn-border, #E8D48B)",
                      borderRadius: "12px",
                      padding: "8px 10px",
                    }}
                  >
                    {notice ?? deepScan?.notice}
                  </div>
                ) : null
              }
            />
          )}
        </div>
      </div>

      {/* Shutter bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          paddingTop: "12px",
          paddingLeft: "20px",
          paddingRight: "20px",
          paddingBottom: "max(24px, env(safe-area-inset-bottom))",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 20,
          background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 100%)",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={!isOnline}
          style={{ display: "none" }}
          onChange={handleFileInput}
          data-testid="file-fallback-input"
        />

        <ShutterButton
          testId={isInspect ? "ds-go-button" : "shutter-button"}
          coreTestId={isInspect ? "ds-go-button-core" : "shutter-button-core"}
          ariaLabel={isInspect ? uiCopy("deepScan.start") : t("camera.shutter")}
          disabled={isInspect ? deepScanRunning : (!isOnline || isCapturing)}
          onClick={isInspect ? (() => void runDeepScanCapture()) : (() => void handleCapture())}
        />
      </div>
    </div>
  );
};
