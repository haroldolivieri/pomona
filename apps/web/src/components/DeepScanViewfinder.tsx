import React, { useRef, useState, useEffect } from "react";
import { uiCopy } from "../i18n/copy";
import { captureViewportCrop } from "../lib/image-pipeline";
import { type CollectedFrame } from "../lib/deep-scan-capture";

export type { CollectedFrame } from "../lib/deep-scan-capture";

export interface DeepScanViewfinderProps {
  collect?: (video: HTMLVideoElement) => Promise<CollectedFrame[]>;
  onComplete: (collected: CollectedFrame[]) => void;
  onCancel: () => void;
  notice?: string | null;
}

export async function collectDeepScanFrames(
  video: HTMLVideoElement
): Promise<CollectedFrame[]> {
  const collected: CollectedFrame[] = [];
  const start = performance.now();
  const DURATION_MS = 5000;
  const FPS = 5;
  const INTERVAL_MS = 1000 / FPS;
  let sequence = 0;
  let lastAt = -Infinity;

  const sampleNow = (dataUrl: string): CollectedFrame => {
    const gw = 24;
    const gh = 24;
    const sampling = document.createElement("canvas");
    sampling.width = gw;
    sampling.height = gh;
    const ctx = sampling.getContext("2d");
    let gray = new Float32Array(gw * gh).fill(128);
    let thumb = new Float32Array(gw * gh).fill(128);
    if (ctx) {
      gray = new Float32Array(gw * gh);
      ctx.drawImage(video, 0, 0, gw, gh);
      const { data } = ctx.getImageData(0, 0, gw, gh);
      for (let i = 0; i < gray.length; i++) {
        gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      }
      thumb = new Float32Array(gw * gh);
      ctx.drawImage(video, 0, 0, gw, gh);
      const thumbData = ctx.getImageData(0, 0, gw, gh).data;
      for (let i = 0; i < thumb.length; i++) {
        thumb[i] = 0.299 * thumbData[i * 4] + 0.587 * thumbData[i * 4 + 1] + 0.114 * thumbData[i * 4 + 2];
      }
    }
    return { sequence, gray, grayW: gw, grayH: gh, thumb, dataUrl };
  };

  while (performance.now() - start < DURATION_MS) {
    const now = performance.now();
    if (now - lastAt >= INTERVAL_MS) {
      lastAt = now;
      const dataUrl = captureViewportCrop(video, video.clientWidth || 320, video.clientHeight || 320, "image/jpeg", 0.85);
      collected.push(sampleNow(dataUrl));
      sequence += 1;
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
  return collected;
}

export const DeepScanViewfinder: React.FC<DeepScanViewfinderProps> = ({
  collect,
  onComplete,
  onCancel,
  notice,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const collectRef = useRef(collect);
  const onGoRef = useRef(() => {});
  const [running, setRunning] = useState(false);
  const progressPathRef = useRef<SVGPathElement | null>(null);
  const progressRafRef = useRef<number | null>(null);
  const DURATION_MS = 5000;

  useEffect(() => {
    collectRef.current = collect;
  }, [collect]);

  useEffect(
    () => () => {
      if (progressRafRef.current !== null) cancelAnimationFrame(progressRafRef.current);
    },
    []
  );

  const runProgressLoop = (startedAt: number) => {
    const tick = (now: number) => {
      progressRafRef.current = null;
      const progress = Math.min(1, Math.max(0, (now - startedAt) / DURATION_MS));
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

  useEffect(() => {
    return () => {
      const video = videoRef.current;
      const stream = video?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startStream = async () => {
    if (videoRef.current?.srcObject) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      void 0;
    }
  };

  useEffect(() => {
    void startStream();
  }, []);

  onGoRef.current = async () => {
    if (running) return;
    setRunning(true);
    runProgressLoop(performance.now());
    try {
      const video = videoRef.current;
      const run = collectRef.current ?? collectDeepScanFrames;
      const collected = video ? await run(video) : [];
      onComplete(collected);
    } catch (err) {
      onComplete([]);
    } finally {
      stopProgressLoop();
      setRunning(false);
    }
  };

  return (
    <div
      data-testid="stage-S_DS_Capture"
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        background: "radial-gradient(circle at 50% 30%, #1C3524 0%, #080E09 100%)",
        overflow: "hidden",
      }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
      <div
        data-testid="ds-oval"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "min(72vw, 300px)",
          height: "min(96vw, 400px)",
          transform: "translate(-50%, -54%)",
          border: "3px solid rgba(251, 250, 246, 0.9)",
          borderRadius: "50%",
          boxShadow: "0 0 0 9999px rgba(8, 14, 9, 0.35)",
          pointerEvents: "none",
        }}
      />

      {running ? (
        <svg
          data-testid="ds-oval-progress"
          viewBox="0 0 100 133.33"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "min(72vw, 300px)",
            height: "min(96vw, 400px)",
            transform: "translate(-50%, -54%)",
            overflow: "visible",
            zIndex: 15,
            pointerEvents: "none",
          }}
        >
          <path
            ref={progressPathRef}
            d="M 50 0.97 A 49 65.7 0 1 1 49.99 0.97"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={100}
            stroke="#F5D547"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      ) : null}

      <div
        style={{
          position: "absolute",
          top: "max(14px, env(safe-area-inset-top))",
          left: "14px",
          right: "14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 20,
        }}
      >
        <button
          data-testid="ds-cancel-button"
          onClick={onCancel}
          style={{
            padding: "8px 14px",
            borderRadius: "999px",
            border: "1px solid rgba(251,250,246,0.4)",
            backgroundColor: "rgba(8,14,9,0.5)",
            color: "#FBFAF6",
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {uiCopy("deepScan.cancel")}
        </button>
      </div>

      <div
        data-testid="ds-prompt-sheet"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: "var(--surface-sheet, #FBFAF6)",
          color: "var(--text-primary, #1A261D)",
          borderRadius: "26px 26px 0 0",
          paddingTop: "16px",
          paddingLeft: "20px",
          paddingRight: "20px",
          paddingBottom: "max(28px, env(safe-area-inset-bottom))",
          boxShadow: "0 -10px 30px rgba(0, 0, 0, 0.25)",
          zIndex: 20,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: "36px",
            height: "4px",
            borderRadius: "4px",
            backgroundColor: "var(--text-muted, #6B7268)",
            opacity: 0.35,
            margin: "-4px auto 12px",
          }}
        />
        <div style={{ fontSize: "18px", fontWeight: 800 }}>{uiCopy("deepScan.captureIdleTitle")}</div>
        <div style={{ fontSize: "12px", fontWeight: 500, marginTop: "4px" }}>{uiCopy("deepScan.capturePhaseStem")}</div>
        <div style={{ fontSize: "12px", fontWeight: 500 }}>{uiCopy("deepScan.capturePhaseRotate")}</div>
        {notice ? (
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
            {notice}
          </div>
        ) : null}
      </div>

      <button
        data-testid="ds-go-button"
        aria-label="GO"
        disabled={running}
        onClick={() => void onGoRef.current()}
        style={{
          position: "absolute",
          left: "50%",
          bottom: "calc(max(20px, env(safe-area-inset-bottom)) + 16px)",
          transform: "translateX(-50%)",
          width: "82px",
          height: "82px",
          borderRadius: "50%",
          border: "4px solid rgba(251,250,246,0.9)",
          backgroundColor: "#F5D547",
          color: "#132418",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: "20px",
          fontWeight: 800,
          cursor: running ? "wait" : "pointer",
          zIndex: 20,
        }}
      >
        GO
      </button>
    </div>
  );
};
