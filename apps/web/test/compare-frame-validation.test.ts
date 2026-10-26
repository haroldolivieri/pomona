import { describe, expect, it } from "vitest";
import {
  extractSingleFrameLuminance,
  evaluateCompareFrame,
} from "../src/lib/deep-scan-frames";

describe("compare-frame-validation", () => {
  it("evaluates a synthetic 64x64 checkerboard as sharp and well-exposed (null)", () => {
    const w = 64;
    const h = 64;
    const gray = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        gray[y * w + x] = ((x ^ y) & 1) === 0 ? 240 : 15;
      }
    }
    const result = evaluateCompareFrame(gray, w, h);
    expect(result).toBeNull();
  });

  it("evaluates a synthetic underexposed frame as too_dark_or_bright", () => {
    const w = 64;
    const h = 64;
    const darkGray = new Float32Array(w * h).fill(3);
    const result = evaluateCompareFrame(darkGray, w, h);
    expect(result).toBe("too_dark_or_bright");
  });

  it("evaluates a synthetic flat blurry frame as all_blurry", () => {
    const w = 64;
    const h = 64;
    const flatGray = new Float32Array(w * h).fill(128);
    const result = evaluateCompareFrame(flatGray, w, h);
    expect(result).toBe("all_blurry");
  });

  it("extracts luminance from fallback canvas / mock without crashing", async () => {
    const gray = await extractSingleFrameLuminance("data:image/webp;base64,mock", 64, 64);
    expect(gray).toHaveLength(64 * 64);
  });
});
