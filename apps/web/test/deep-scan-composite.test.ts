import { describe, it, expect } from "vitest";
import { computeTileGeometry } from "../src/lib/deep-scan-composite";

describe("computeTileGeometry", () => {
  it("returns the constant 2×3 grid for every valid frame count 1..6", () => {
    for (const frameCount of [1, 2, 3, 4, 5, 6]) {
      expect(computeTileGeometry(frameCount)).toEqual({
        cols: 3,
        rows: 2,
        tilePx: 448,
        canvasW: 1344,
        canvasH: 896,
      });
    }
  });

  it("throws for counts outside 1..6", () => {
    expect(() => computeTileGeometry(0)).toThrowError();
    expect(() => computeTileGeometry(7)).toThrowError();
  });
});
