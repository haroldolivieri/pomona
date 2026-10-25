import React, { useState, useEffect } from "react";
import type { DeepScanDebugCaptureRecord } from "../lib/deep-scan-debug";
import { uiCopy } from "../i18n/copy";

export interface DeepScanCaptureInspectorProps {
  record: DeepScanDebugCaptureRecord | null;
  onDismiss?: () => void;
}

type GalleryMode = "chosen" | "all" | "grid";

export const DeepScanCaptureInspector: React.FC<DeepScanCaptureInspectorProps> = ({ record, onDismiss }) => {
  const [dismissedSessionId, setDismissedSessionId] = useState<string | null>(null);
  const [galleryMode, setGalleryMode] = useState<GalleryMode>("all");
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  const hasChosen = Boolean(record?.keptDataUrls && record.keptDataUrls.length > 0);
  const allPhotos = record?.allDataUrls && record.allDataUrls.length > 0
    ? record.allDataUrls
    : record?.keptDataUrls ?? [];
  const hasAll = allPhotos.length > 0;
  const hasGrid = Boolean(record?.compositeDataUrl);

  const activePhotos =
    galleryMode === "chosen" && hasChosen
      ? record!.keptDataUrls
      : galleryMode === "grid" && hasGrid
      ? [record!.compositeDataUrl!]
      : allPhotos;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (galleryIndex === null) return;
      if (e.key === "Escape") {
        setGalleryIndex(null);
      } else if (e.key === "ArrowLeft") {
        setGalleryIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
      } else if (e.key === "ArrowRight") {
        const max = activePhotos.length - 1;
        setGalleryIndex((prev) => (prev !== null && prev < max ? prev + 1 : prev));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [galleryIndex, activePhotos]);

  if (!record || record.sessionId === dismissedSessionId) return null;

  const handleDismiss = () => {
    setDismissedSessionId(record.sessionId);
    setGalleryIndex(null);
    onDismiss?.();
  };

  const openGallery = (mode: GalleryMode, index = 0) => {
    setGalleryMode(mode);
    setGalleryIndex(index);
  };

  return (
    <>
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
          width: "184px",
          maxHeight: "54vh",
          overflowY: "auto",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: "10px",
          lineHeight: 1.35,
          boxShadow: "0 4px 18px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontWeight: 700 }}>{uiCopy("deepScan.debug.inspectorTitle")}</div>
          <button
            type="button"
            data-testid="ds-inspector-dismiss"
            aria-label={uiCopy("copy.close")}
            onClick={handleDismiss}
            style={{
              background: "transparent",
              border: "none",
              color: "#FBFAF6",
              opacity: 0.7,
              cursor: "pointer",
              padding: "2px 4px",
              fontSize: "12px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {record.rejectedReason ? (
          <div
            data-testid="ds-inspector-reject-banner"
            style={{
              background: "rgba(162, 75, 59, 0.35)",
              border: "1px solid #A24B3B",
              borderRadius: "8px",
              padding: "6px 8px",
              marginBottom: "8px",
              color: "#FFD2CC",
              fontSize: "10px",
              fontWeight: 600,
            }}
          >
            {uiCopy("deepScan.debug.rejectedBadge")}:{" "}
            {record.rejectedReason === "too_dark_or_bright"
              ? uiCopy("deepScan.localTooDark")
              : record.rejectedReason === "not_rotated"
              ? uiCopy("deepScan.localNotRotated")
              : uiCopy("deepScan.localTooBlurry")}
          </div>
        ) : null}

        {record.compositeDataUrl ? (
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ opacity: 0.75 }}>{uiCopy("deepScan.debug.gridSent")}</span>
              <button
                type="button"
                data-testid="ds-inspector-view-grid-btn"
                onClick={() => openGallery("grid", 0)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#6DB375",
                  fontSize: "9px",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "0 2px",
                }}
              >
                {uiCopy("deepScan.debug.openGallery")}
              </button>
            </div>
            <img
              data-testid="ds-inspector-composite"
              src={record.compositeDataUrl}
              alt={uiCopy("deepScan.debug.compositeAlt")}
              onClick={() => openGallery("grid", 0)}
              style={{
                width: "100%",
                borderRadius: 8,
                marginTop: 4,
                background: "#132418",
                cursor: "pointer",
              }}
            />
          </div>
        ) : null}

        {record.keptDataUrls.length > 0 ? (
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ opacity: 0.75 }}>
                {uiCopy("deepScan.debug.tabChosen", { count: record.keptDataUrls.length })}
              </span>
              <button
                type="button"
                data-testid="ds-inspector-view-chosen-btn"
                onClick={() => openGallery("chosen", 0)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#6DB375",
                  fontSize: "9px",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "0 2px",
                }}
              >
                {uiCopy("deepScan.debug.openGallery")}
              </button>
            </div>
            <div
              data-testid="ds-inspector-tiles"
              style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}
            >
              {record.keptDataUrls.map((url, index) => (
                <img
                  key={`${record.sessionId}-kept-${index}`}
                  data-testid={`ds-chosen-thumb-${index}`}
                  src={url}
                  alt={uiCopy("deepScan.debug.tileAlt", { index: index + 1 })}
                  onClick={() => openGallery("chosen", index)}
                  style={{
                    width: 32,
                    height: 32,
                    objectFit: "cover",
                    borderRadius: 6,
                    background: "#132418",
                    cursor: "pointer",
                    border: "1.5px solid #2F5D34",
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {allPhotos.length > 0 ? (
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              data-testid="ds-inspector-open-gallery"
              onClick={() => openGallery("all", 0)}
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: "6px",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                background: "rgba(255, 255, 255, 0.08)",
                color: "#FBFAF6",
                fontSize: "10px",
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              {uiCopy("deepScan.debug.allPhotosLabel", { count: allPhotos.length })} ·{" "}
              {uiCopy("deepScan.debug.openGallery")}
            </button>
            <div
              data-testid="ds-inspector-all-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "3px",
                marginTop: "6px",
                maxHeight: "84px",
                overflowY: "auto",
              }}
            >
              {allPhotos.map((url, i) => (
                <img
                  key={`${record.sessionId}-all-${i}`}
                  data-testid={`ds-all-thumb-${i}`}
                  src={url}
                  alt={uiCopy("deepScan.debug.tileAlt", { index: i + 1 })}
                  onClick={() => openGallery("all", i)}
                  style={{
                    width: "100%",
                    aspectRatio: "1",
                    objectFit: "cover",
                    borderRadius: "4px",
                    cursor: "pointer",
                    border: record.keptDataUrls.includes(url)
                      ? "1.5px solid #2F5D34"
                      : "1px solid rgba(255, 255, 255, 0.12)",
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div data-testid="ds-inspector-meta" style={{ opacity: 0.6, marginTop: 8, wordBreak: "break-all" }}>
          {record.sessionId}
          <br />
          {record.at}
        </div>
      </div>

      {galleryIndex !== null && activePhotos.length > 0 ? (
        <div
          data-testid="ds-gallery-modal"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(8, 14, 9, 0.96)",
            backdropFilter: "blur(12px)",
            display: "flex",
            flexDirection: "column",
            color: "#FBFAF6",
            fontFamily: "Inter, system-ui, sans-serif",
            padding: "calc(max(16px, env(safe-area-inset-top))) 16px max(16px, env(safe-area-inset-bottom))",
          }}
        >
          {/* Top Bar with Mode Switcher & Close */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingBottom: "12px",
              gap: "12px",
            }}
          >
            {/* Gallery Mode Switcher Tabs */}
            <div
              style={{
                display: "flex",
                gap: "4px",
                background: "rgba(255, 255, 255, 0.08)",
                padding: "3px",
                borderRadius: "8px",
              }}
            >
              {hasChosen ? (
                <button
                  type="button"
                  data-testid="ds-gallery-tab-chosen"
                  onClick={() => openGallery("chosen", 0)}
                  style={{
                    background: galleryMode === "chosen" ? "#2F5D34" : "transparent",
                    color: "#FBFAF6",
                    border: "none",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: galleryMode === "chosen" ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {uiCopy("deepScan.debug.tabChosen", { count: record.keptDataUrls.length })}
                </button>
              ) : null}

              {hasAll ? (
                <button
                  type="button"
                  data-testid="ds-gallery-tab-all"
                  onClick={() => openGallery("all", 0)}
                  style={{
                    background: galleryMode === "all" ? "#2F5D34" : "transparent",
                    color: "#FBFAF6",
                    border: "none",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: galleryMode === "all" ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {uiCopy("deepScan.debug.tabAll", { count: allPhotos.length })}
                </button>
              ) : null}

              {hasGrid ? (
                <button
                  type="button"
                  data-testid="ds-gallery-tab-grid"
                  onClick={() => openGallery("grid", 0)}
                  style={{
                    background: galleryMode === "grid" ? "#2F5D34" : "transparent",
                    color: "#FBFAF6",
                    border: "none",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: galleryMode === "grid" ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {uiCopy("deepScan.debug.tabGrid")}
                </button>
              ) : null}
            </div>

            <button
              type="button"
              data-testid="ds-gallery-close"
              aria-label={uiCopy("copy.close")}
              onClick={() => setGalleryIndex(null)}
              style={{
                background: "rgba(255, 255, 255, 0.12)",
                border: "none",
                color: "#FBFAF6",
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          {/* Subheader Title */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <div data-testid="ds-gallery-title" style={{ fontSize: "13px", fontWeight: 700 }}>
              {galleryMode === "grid"
                ? uiCopy("deepScan.debug.gridSent")
                : galleryMode === "chosen"
                ? uiCopy("deepScan.debug.photoOfChosen", {
                    current: (galleryIndex ?? 0) + 1,
                    total: activePhotos.length,
                  })
                : uiCopy("deepScan.debug.photoOf", {
                    current: (galleryIndex ?? 0) + 1,
                    total: activePhotos.length,
                  })}
            </div>
            {galleryMode === "all" && record.keptDataUrls.includes(activePhotos[galleryIndex ?? 0]) ? (
              <span
                style={{
                  background: "#2F5D34",
                  fontSize: "10px",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontWeight: 600,
                }}
              >
                {uiCopy("deepScan.debug.keptBadge")}
              </span>
            ) : null}
          </div>

          {/* Main Image Preview */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <img
              data-testid="ds-gallery-main-image"
              src={activePhotos[galleryIndex ?? 0]}
              alt={uiCopy("deepScan.debug.tileAlt", { index: (galleryIndex ?? 0) + 1 })}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                borderRadius: "12px",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
              }}
            />

            {activePhotos.length > 1 && (galleryIndex ?? 0) > 0 ? (
              <button
                type="button"
                data-testid="ds-gallery-prev"
                aria-label={uiCopy("deepScan.debug.previous")}
                onClick={() => setGalleryIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev))}
                style={{
                  position: "absolute",
                  left: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "rgba(8, 14, 9, 0.75)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "#FBFAF6",
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  cursor: "pointer",
                  fontSize: "22px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ‹
              </button>
            ) : null}

            {activePhotos.length > 1 && (galleryIndex ?? 0) < activePhotos.length - 1 ? (
              <button
                type="button"
                data-testid="ds-gallery-next"
                aria-label={uiCopy("deepScan.debug.next")}
                onClick={() =>
                  setGalleryIndex((prev) =>
                    prev !== null && prev < activePhotos.length - 1 ? prev + 1 : prev
                  )
                }
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "rgba(8, 14, 9, 0.75)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "#FBFAF6",
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  cursor: "pointer",
                  fontSize: "22px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ›
              </button>
            ) : null}
          </div>

          {/* Bottom Thumbnails Filmstrip (when more than 1 photo) */}
          {activePhotos.length > 1 ? (
            <div
              data-testid="ds-gallery-filmstrip"
              style={{
                display: "flex",
                gap: "6px",
                overflowX: "auto",
                paddingTop: "12px",
                paddingBottom: "4px",
              }}
            >
              {activePhotos.map((url, i) => (
                <img
                  key={`${record.sessionId}-${galleryMode}-film-${i}`}
                  data-testid={`ds-gallery-film-thumb-${i}`}
                  src={url}
                  alt={uiCopy("deepScan.debug.tileAlt", { index: i + 1 })}
                  onClick={() => setGalleryIndex(i)}
                  style={{
                    width: "48px",
                    height: "48px",
                    flexShrink: 0,
                    objectFit: "cover",
                    borderRadius: "6px",
                    cursor: "pointer",
                    border: i === galleryIndex ? "2px solid #FBFAF6" : "2px solid transparent",
                    opacity: i === galleryIndex ? 1 : 0.6,
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
};
