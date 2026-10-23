import React from "react";
import type { DeepScanDebugCaptureRecord } from "../lib/deep-scan-capture";

export interface DeepScanCaptureInspectorProps {
  record: DeepScanDebugCaptureRecord | null;
}

export const DeepScanCaptureInspector: React.FC<DeepScanCaptureInspectorProps> = ({ record }) => {
  if (!record) return null;
  return (
    <div
      data-testid="ds-capture-inspector"
      style={{
        position: "fixed",
        top: "calc(max(16px, env(safe-area-inset-top)) + 50px)",
        right: "16px",
        zIndex: 90,
        background: "rgba(8, 14, 9, 0.88)",
        color: "#FBFAF6",
        borderRadius: "12px",
        padding: "10px",
        width: "168px",
        maxHeight: "46vh",
        overflowY: "auto",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: "10px",
        lineHeight: 1.35,
        boxShadow: "0 4px 18px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>DS capture inspector</div>

      <div style={{ opacity: 0.75 }}>Grid sent (/api/v1/deep-scan)</div>
      <img
        data-testid="ds-inspector-composite"
        src={record.compositeDataUrl}
        alt="composite"
        style={{ width: "100%", borderRadius: 8, marginTop: 4, background: "#132418" }}
      />

      <div style={{ opacity: 0.75, marginTop: 8 }}>
        Chosen from {record.sampleCount} samples
      </div>
      <div
        data-testid="ds-inspector-tiles"
        style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}
      >
        {record.keptDataUrls.map((url, index) => (
          <img
            key={`${record.sessionId}-${index}`}
            src={url}
            alt={`tile ${index + 1}`}
            style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 6, background: "#132418" }}
          />
        ))}
      </div>

      <div data-testid="ds-inspector-meta" style={{ opacity: 0.6, marginTop: 8, wordBreak: "break-all" }}>
        {record.sessionId}
        <br />
        {record.at}
      </div>
    </div>
  );
};
