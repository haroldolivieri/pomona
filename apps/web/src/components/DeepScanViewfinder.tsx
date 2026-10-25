import React from "react";
import { CameraViewfinder } from "./CameraViewfinder";
import { type CollectedFrame } from "../lib/deep-scan-capture";

export type { CollectedFrame } from "../lib/deep-scan-capture";
export { collectDeepScanFrames } from "../lib/deep-scan-frames";

export interface DeepScanViewfinderProps {
  collect?: (video: HTMLVideoElement, signal?: AbortSignal) => Promise<CollectedFrame[]>;
  onComplete: (collected: CollectedFrame[]) => void;
  onCancel: () => void;
  notice?: string | null;
  onBrandTap?: () => void;
  showLanguageSelector?: boolean;
  onModeChange?: (mode: "compare" | "inspect") => void;
}

/**
 * Precise scan reuses the whole normal-scan scaffold (CameraViewfinder):
 * same screen, same margins, same top bar (brand pill + flash), same shutter
 * bar and prompt card. Only the overlays and copy are deep-scan specific.
 */
export const DeepScanViewfinder: React.FC<DeepScanViewfinderProps> = ({
  collect,
  onComplete,
  onCancel,
  notice,
  onBrandTap,
  showLanguageSelector = false,
  onModeChange,
}) => (
  <CameraViewfinder
    deepScan={{ collect, onComplete, onCancel, notice }}
    onBrandTap={onBrandTap}
    showLanguageSelector={showLanguageSelector}
    initialMode="inspect"
    onModeChange={(newMode) => {
      onModeChange?.(newMode);
      if (newMode === "compare") {
        onCancel();
      }
    }}
  />
);
