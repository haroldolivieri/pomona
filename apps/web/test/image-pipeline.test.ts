import { describe, expect, it } from "vitest";
import {
  normalizeFreehandPolygon,
  remapBoxFromCropToFrame,
  computeScaledDimensions,
  downsampleDataUrl,
  computeObjectFitCoverRect,
} from "../src/lib/image-pipeline";
import { describeBoxPosition } from "../src/lib/spatial-a11y";

describe("image-pipeline & spatial-a11y", () => {
  it("simplifies a valid freehand loop, computes padded cropRect, and remaps polygon into crop space", () => {
    const rawLoop: [number, number][] = [
      [200, 200],
      [500, 205],
      [800, 200],
      [800, 700],
      [200, 700],
    ];
    const res = normalizeFreehandPolygon(rawLoop);
    expect(res.valid).toBe(true);
    expect(res.areaRatio).toBeGreaterThan(0.25);
    expect(res.cropRect.x).toBeLessThanOrEqual(200);
    expect(res.cropRect.y).toBeLessThanOrEqual(200);
    expect(res.polygonInCrop.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects tiny accidental taps (<5% frame area) so Analyse Drawn Area stays disabled", () => {
    const tinyTap: [number, number][] = [
      [500, 500],
      [510, 500],
      [505, 510],
    ];
    const res = normalizeFreehandPolygon(tinyTap);
    expect(res.valid).toBe(false);
  });

  it("remaps bounding boxes from cropped upload space back to full-frame 0..1000 coordinates", () => {
    const cropRect = { x: 200, y: 100, width: 500, height: 600 };
    // A box covering the middle 50% of the cropped image:
    const boxInCrop: [number, number, number, number] = [250, 250, 750, 750];
    const fullBox = remapBoxFromCropToFrame(boxInCrop, cropRect);
    expect(fullBox).toEqual([250, 325, 550, 575]);
  });

  it("scales dimensions so the longest edge never exceeds 768px", () => {
    expect(computeScaledDimensions(1920, 1440, 768)).toEqual({ width: 768, height: 576 });
    expect(computeScaledDimensions(1200, 1600, 768)).toEqual({ width: 576, height: 768 });
    expect(computeScaledDimensions(600, 400, 768)).toEqual({ width: 600, height: 400 });
  });

  it("generates screen-reader spatial descriptions for bounding boxes", () => {
    expect(describeBoxPosition([385, 370, 625, 655], "Winner", 8.6)).toBe(
      "Winner: middle row, centre, score 8.6 out of 10"
    );
    expect(describeBoxPosition([50, 700, 250, 950], "Runner-Up", 8.1)).toBe(
      "Runner-Up: top row, right, score 8.1 out of 10"
    );
  });

  it("downsamples data URLs gracefully and extracts base64 without prefix", async () => {
    const rawDataUrl = "data:image/jpeg;base64,VGhpcyBpcyBhIHRlc3Q=";
    const { base64, mimeType } = await downsampleDataUrl(rawDataUrl, 768);
    expect(base64).toBe("VGhpcyBpcyBhIHRlc3Q=");
    expect(mimeType).toBe("image/jpeg");
  });

  describe("computeObjectFitCoverRect", () => {
    it("computes geometry when image is taller than container (portrait in square/landscape)", () => {
      // Container: 390x390, Image: 3:4 portrait (768x1024)
      // Rendered width: 390, Rendered height: 390 * (1024/768) = 520, Top offset: (390-520)/2 = -65
      const rect = computeObjectFitCoverRect(390, 390, 768, 1024);
      expect(rect.width).toBe(390);
      expect(rect.height).toBe(520);
      expect(rect.left).toBe(0);
      expect(rect.top).toBe(-65);
    });

    it("computes geometry when image is wider than container (landscape in square/portrait)", () => {
      // Container: 390x390, Image: 4:3 landscape (1024x768)
      // Rendered height: 390, Rendered width: 390 * (1024/768) = 520, Left offset: (390-520)/2 = -65
      const rect = computeObjectFitCoverRect(390, 390, 1024, 768);
      expect(rect.width).toBe(520);
      expect(rect.height).toBe(390);
      expect(rect.left).toBe(-65);
      expect(rect.top).toBe(0);
    });

    it("returns exact container dimensions when aspect ratios match exactly", () => {
      const rect = computeObjectFitCoverRect(400, 300, 800, 600);
      expect(rect).toEqual({ left: 0, top: 0, width: 400, height: 300 });
    });

    it("gracefully falls back when dimensions are zero or invalid", () => {
      expect(computeObjectFitCoverRect(0, 0, 0, 0)).toEqual({ left: 0, top: 0, width: 0, height: 0 });
      expect(computeObjectFitCoverRect(300, 400, 0, 0)).toEqual({ left: 0, top: 0, width: 300, height: 400 });
    });
  });
});
