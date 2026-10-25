import jpeg from "jpeg-js";
import type { FrameSample } from "@pomona/contract";

export interface ExtractedTileData {
  tiles: FrameSample[];
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
}

/**
 * Slices a 2x3 composite inspection image into 6 FrameSample objects.
 * Computes grayscale (64x64) and thumbnail (32x32) representations for each tile,
 * matching the client-side frame sampling in deep-scan-capture.
 */
export function extractTilesFromJpeg(jpegBuffer: Buffer): ExtractedTileData {
  const raw = jpeg.decode(jpegBuffer, { useTArray: true });
  const tileWidth = Math.floor(raw.width / 3);
  const tileHeight = Math.floor(raw.height / 2);

  const layout: [number, number][] = [
    [0, 0],
    [tileWidth, 0],
    [tileWidth * 2, 0],
    [0, tileHeight],
    [tileWidth, tileHeight],
    [tileWidth * 2, tileHeight],
  ];

  const grayW = 64;
  const grayH = 64;
  const thumbW = 32;
  const thumbH = 32;

  const tiles = layout.map(([ox, oy], sequence): FrameSample => {
    const gray = new Float32Array(grayW * grayH);
    for (let gy = 0; gy < grayH; gy++) {
      for (let gx = 0; gx < grayW; gx++) {
        const px = ox + Math.floor((gx * tileWidth) / grayW);
        const py = oy + Math.floor((gy * tileHeight) / grayH);
        const idx = (py * raw.width + px) * 4;
        // Standard luminance: 0.299R + 0.587G + 0.114B
        gray[gy * grayW + gx] =
          0.299 * raw.data[idx] + 0.587 * raw.data[idx + 1] + 0.114 * raw.data[idx + 2];
      }
    }

    const thumb = new Float32Array(thumbW * thumbH);
    for (let ty = 0; ty < thumbH; ty++) {
      for (let tx = 0; tx < thumbW; tx++) {
        const px = ox + Math.floor((tx * tileWidth) / thumbW);
        const py = oy + Math.floor((ty * tileHeight) / thumbH);
        const idx = (py * raw.width + px) * 4;
        thumb[ty * thumbW + tx] =
          0.299 * raw.data[idx] + 0.587 * raw.data[idx + 1] + 0.114 * raw.data[idx + 2];
      }
    }

    return { sequence, gray, grayW, grayH, thumb };
  });

  return {
    tiles,
    width: raw.width,
    height: raw.height,
    tileWidth,
    tileHeight,
  };
}
