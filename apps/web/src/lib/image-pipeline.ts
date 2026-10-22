import type { Point, BoundingBox } from "@pomona/contract";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizePolygonResult {
  valid: boolean;
  polygon: Point[];
  cropRect: CropRect;
  polygonInCrop: Point[];
  areaRatio: number;
}

/**
 * Calculates perpendicular distance from a point to a line segment.
 */
function perpendicularDistance(
  p: [number, number],
  p1: [number, number],
  p2: [number, number]
): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const magSq = dx * dx + dy * dy;
  if (magSq === 0) {
    const ddx = p[0] - p1[0];
    const ddy = p[1] - p1[1];
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  const u = ((p[0] - p1[0]) * dx + (p[1] - p1[1]) * dy) / magSq;
  // clamp u to segment [0, 1]
  const clampedU = Math.max(0, Math.min(1, u));
  const projX = p1[0] + clampedU * dx;
  const projY = p1[1] + clampedU * dy;
  const rx = p[0] - projX;
  const ry = p[1] - projY;
  return Math.sqrt(rx * rx + ry * ry);
}

/**
 * Ramer-Douglas-Peucker line simplification.
 */
function rdp(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) {
    return points;
  }

  let dmax = 0;
  let index = 0;
  const last = points.length - 1;

  for (let i = 1; i < last; i++) {
    const d = perpendicularDistance(points[i], points[0], points[last]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const recResults1 = rdp(points.slice(0, index + 1), epsilon);
    const recResults2 = rdp(points.slice(index), epsilon);
    return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  }

  return [points[0], points[last]];
}

/**
 * Simplifies a polyline or closed loop down to at most maxPoints using RDP.
 */
export function simplifyPath(
  points: [number, number][],
  maxPoints = 32,
  initialEpsilon = 2
): [number, number][] {
  if (points.length <= maxPoints) {
    return points;
  }

  let epsilon = initialEpsilon;
  let simplified = points;
  let iterations = 0;

  while (simplified.length > maxPoints && iterations < 30) {
    simplified = rdp(points, epsilon);
    epsilon *= 1.5;
    iterations++;
  }

  // If still above maxPoints, uniformly subsample
  if (simplified.length > maxPoints) {
    const step = (simplified.length - 1) / (maxPoints - 1);
    const sampled: [number, number][] = [];
    for (let i = 0; i < maxPoints - 1; i++) {
      sampled.push(simplified[Math.round(i * step)]);
    }
    sampled.push(simplified[simplified.length - 1]);
    return sampled;
  }

  return simplified;
}

/**
 * Computes polygon area using the Shoelace formula on 0..1000 coordinates.
 * Total frame area = 1000 * 1000 = 1,000,000.
 */
export function calculatePolygonAreaRatio(polygon: [number, number][]): number {
  const n = polygon.length;
  if (n < 3) return 0;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += polygon[i][0] * polygon[j][1] - polygon[j][0] * polygon[i][1];
  }

  const area = Math.abs(sum) / 2;
  const totalFrameArea = 1000 * 1000;
  return area / totalFrameArea;
}

/**
 * Normalizes a freehand polygon drawn by the user:
 * - Simplifies using RDP (<= 32 points)
 * - Checks area using Shoelace formula (rejects < minAreaRatio, default 0.05 / 5%)
 * - Calculates bounding box with 10% padding clamped to 0..1000
 * - Remaps polygon points into crop space [0..1000]
 */
export function normalizeFreehandPolygon(
  rawPoints: [number, number][],
  minAreaRatio = 0.05
): NormalizePolygonResult {
  if (!rawPoints || rawPoints.length < 3) {
    return {
      valid: false,
      polygon: [],
      cropRect: { x: 0, y: 0, width: 1000, height: 1000 },
      polygonInCrop: [],
      areaRatio: 0,
    };
  }

  const simplified = simplifyPath(rawPoints, 32);
  const areaRatio = calculatePolygonAreaRatio(simplified);

  // Clamp points to integer 0..1000 Point tuples
  const polygon: Point[] = simplified.map(([x, y]) => [
    Math.max(0, Math.min(1000, Math.round(x))),
    Math.max(0, Math.min(1000, Math.round(y))),
  ]);

  if (areaRatio < minAreaRatio) {
    return {
      valid: false,
      polygon,
      cropRect: { x: 0, y: 0, width: 1000, height: 1000 },
      polygonInCrop: [],
      areaRatio,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const rawW = maxX - minX;
  const rawH = maxY - minY;

  const padX = rawW * 0.1;
  const padY = rawH * 0.1;

  const cropX = Math.max(0, Math.floor(minX - padX));
  const cropY = Math.max(0, Math.floor(minY - padY));
  const cropRight = Math.min(1000, Math.ceil(maxX + padX));
  const cropBottom = Math.min(1000, Math.ceil(maxY + padY));

  const cropW = Math.max(1, cropRight - cropX);
  const cropH = Math.max(1, cropBottom - cropY);

  const cropRect: CropRect = {
    x: cropX,
    y: cropY,
    width: cropW,
    height: cropH,
  };

  const polygonInCrop: Point[] = polygon.map(([x, y]) => [
    Math.max(0, Math.min(1000, Math.round(((x - cropRect.x) / cropRect.width) * 1000))),
    Math.max(0, Math.min(1000, Math.round(((y - cropRect.y) / cropRect.height) * 1000))),
  ]);

  return {
    valid: true,
    polygon,
    cropRect,
    polygonInCrop,
    areaRatio,
  };
}

/**
 * Remaps bounding box coordinates from crop space (0..1000) back to full-frame coordinates (0..1000).
 * box: [ymin, xmin, ymax, xmax]
 */
export function remapBoxFromCropToFrame(
  boxInCrop: BoundingBox,
  cropRect: CropRect
): BoundingBox {
  const [ymin, xmin, ymax, xmax] = boxInCrop;

  const frameYmin = Math.round(cropRect.y + (ymin / 1000) * cropRect.height);
  const frameXmin = Math.round(cropRect.x + (xmin / 1000) * cropRect.width);
  const frameYmax = Math.round(cropRect.y + (ymax / 1000) * cropRect.height);
  const frameXmax = Math.round(cropRect.x + (xmax / 1000) * cropRect.width);

  return [
    Math.max(0, Math.min(1000, frameYmin)),
    Math.max(0, Math.min(1000, frameXmin)),
    Math.max(0, Math.min(1000, frameYmax)),
    Math.max(0, Math.min(1000, frameXmax)),
  ];
}

/**
 * Computes scaled dimensions preserving aspect ratio so the longest edge never exceeds maxEdge.
 */
export function computeScaledDimensions(
  width: number,
  height: number,
  maxEdge = 768
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: maxEdge, height: maxEdge };
  }

  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const scale = maxEdge / longestEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/**
 * Prepares scan image from a source canvas:
 * 1. If focusPolygon is provided and valid, crops to padded bounding box and masks outside area with rgba(0,0,0,0.65).
 * 2. Downsamples so longest edge is <= maxEdge (default 768px).
 * 3. Encodes to WebP (fallback JPEG) and returns base64 payload.
 */
export async function prepareScanImageFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  focusPolygon: Point[] | null,
  maxEdge = 768
): Promise<{
  imageBase64: string;
  imageMimeType: "image/webp" | "image/jpeg";
  focusPolygonInUpload: Point[] | null;
  cropRect: CropRect;
}> {
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;

  let cropRect: CropRect = { x: 0, y: 0, width: 1000, height: 1000 };
  let focusPolygonInUpload: Point[] | null = null;

  // Normalise polygon if provided
  if (focusPolygon && focusPolygon.length >= 3) {
    const norm = normalizeFreehandPolygon(focusPolygon);
    if (norm.valid) {
      cropRect = norm.cropRect;
      focusPolygonInUpload = norm.polygonInCrop;
    }
  }

  // Calculate pixel crop coordinates
  const pixelX = Math.round((cropRect.x / 1000) * srcW);
  const pixelY = Math.round((cropRect.y / 1000) * srcH);
  const pixelW = Math.max(1, Math.round((cropRect.width / 1000) * srcW));
  const pixelH = Math.max(1, Math.round((cropRect.height / 1000) * srcH));

  // Determine scaled dimensions
  const scaled = computeScaledDimensions(pixelW, pixelH, maxEdge);

  // Render on offscreen canvas
  const canvas =
    typeof document !== "undefined"
      ? document.createElement("canvas")
      : (new (globalThis as any).OffscreenCanvas(scaled.width, scaled.height) as any);

  canvas.width = scaled.width;
  canvas.height = scaled.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to obtain 2D canvas context");
  }

  // Draw the cropped source image scaled into destination canvas
  ctx.drawImage(
    sourceCanvas,
    pixelX,
    pixelY,
    pixelW,
    pixelH,
    0,
    0,
    scaled.width,
    scaled.height
  );

  // If focusPolygon is present, apply mask outside polygon
  if (focusPolygonInUpload && focusPolygonInUpload.length >= 3) {
    ctx.save();
    // Create outer rectangle and inner polygon path with evenodd clipping
    const path = new Path2D();
    path.rect(0, 0, scaled.width, scaled.height);

    const firstPt = focusPolygonInUpload[0];
    path.moveTo(
      (firstPt[0] / 1000) * scaled.width,
      (firstPt[1] / 1000) * scaled.height
    );
    for (let i = 1; i < focusPolygonInUpload.length; i++) {
      const pt = focusPolygonInUpload[i];
      path.lineTo((pt[0] / 1000) * scaled.width, (pt[1] / 1000) * scaled.height);
    }
    path.closePath();

    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fill(path, "evenodd");

    // Thin high-contrast border along polygon path
    const borderPath = new Path2D();
    borderPath.moveTo(
      (firstPt[0] / 1000) * scaled.width,
      (firstPt[1] / 1000) * scaled.height
    );
    for (let i = 1; i < focusPolygonInUpload.length; i++) {
      const pt = focusPolygonInUpload[i];
      borderPath.lineTo(
        (pt[0] / 1000) * scaled.width,
        (pt[1] / 1000) * scaled.height
      );
    }
    borderPath.closePath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.stroke(borderPath);

    ctx.restore();
  }

  // Export to WebP (fallback JPEG)
  let imageMimeType: "image/webp" | "image/jpeg" = "image/webp";
  let dataUrl = "";

  if (typeof canvas.toDataURL === "function") {
    dataUrl = canvas.toDataURL("image/webp", 0.75);
    if (!dataUrl.startsWith("data:image/webp")) {
      imageMimeType = "image/jpeg";
      dataUrl = canvas.toDataURL("image/jpeg", 0.78);
    }
  } else if (typeof canvas.convertToBlob === "function") {
    try {
      const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.75 });
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      return {
        imageBase64: base64,
        imageMimeType: "image/webp",
        focusPolygonInUpload,
        cropRect,
      };
    } catch {
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.78 });
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      return {
        imageBase64: base64,
        imageMimeType: "image/jpeg",
        focusPolygonInUpload,
        cropRect,
      };
    }
  }

  const commaIdx = dataUrl.indexOf(",");
  const imageBase64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  return {
    imageBase64,
    imageMimeType,
    focusPolygonInUpload,
    cropRect,
  };
}

/**
 * Downsamples any image data URL to fit within maxEdge (default 768px) and encodes as JPEG or WebP.
 * Guarantees mobile camera uploads stay small (<250KB) and never trigger 413 Payload Too Large.
 * A supplied focus polygon masks outside pixels in black without cropping or changing frame coordinates.
 */
export async function downsampleDataUrl(
  dataUrl: string,
  maxEdge = 768,
  quality = 0.8,
  focusPolygon: Point[] | null = null
): Promise<{ base64: string; mimeType: "image/jpeg" | "image/webp" }> {
  if (focusPolygon && (
    focusPolygon.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1000 || y < 0 || y > 1000) ||
    !normalizeFreehandPolygon(focusPolygon).valid
  )) {
    throw new Error("Invalid focus polygon. Draw the selection again.");
  }
  if (
    typeof document === "undefined" ||
    typeof Image === "undefined" ||
    (typeof navigator !== "undefined" && navigator.userAgent?.includes("jsdom"))
  ) {
    if (focusPolygon) throw new Error("Could not prepare the selected area. Please try again.");
    const isJpeg = dataUrl.includes("image/jpeg");
    const comma = dataUrl.indexOf(",");
    return {
      base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
      mimeType: isJpeg ? "image/jpeg" : "image/webp",
    };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const { width, height } = computeScaledDimensions(
          img.width || 768,
          img.height || 768,
          maxEdge
        );
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          if (focusPolygon) throw new Error("Canvas context unavailable");
          const comma = dataUrl.indexOf(",");
          resolve({
            base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
            mimeType: dataUrl.includes("image/jpeg") ? "image/jpeg" : "image/webp",
          });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        if (focusPolygon) {
          // Fill only the complement of the actual loop, including concave exclusions.
          // Keep full-frame geometry so normalized model boxes still align with the original photo.
          ctx.beginPath();
          ctx.rect(0, 0, width, height);
          ctx.moveTo(focusPolygon[0][0] * width / 1000, focusPolygon[0][1] * height / 1000);
          for (const [x, y] of focusPolygon.slice(1)) {
            ctx.lineTo(x * width / 1000, y * height / 1000);
          }
          ctx.closePath();
          ctx.fillStyle = "#000000";
          ctx.fill("evenodd");
        }

        let outMime: "image/jpeg" | "image/webp" = "image/jpeg";
        let outUrl = canvas.toDataURL("image/jpeg", quality);

        try {
          const testWebp = canvas.toDataURL("image/webp", quality);
          if (testWebp && testWebp.startsWith("data:image/webp")) {
            outMime = "image/webp";
            outUrl = testWebp;
          }
        } catch {
          // ignore webp test failure
        }

        const comma = outUrl.indexOf(",");
        resolve({
          base64: comma >= 0 ? outUrl.slice(comma + 1) : outUrl,
          mimeType: outMime,
        });
      } catch {
        if (focusPolygon) {
          reject(new Error("Could not prepare the selected area. Please try again."));
          return;
        }
        const comma = dataUrl.indexOf(",");
        resolve({
          base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
          mimeType: dataUrl.includes("image/jpeg") ? "image/jpeg" : "image/webp",
        });
      }
    };
    img.onerror = () => {
      if (focusPolygon) {
        reject(new Error("Could not load the selected photo. Please retake it."));
        return;
      }
      const comma = dataUrl.indexOf(",");
      resolve({
        base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
        mimeType: dataUrl.includes("image/jpeg") ? "image/jpeg" : "image/webp",
      });
    };
    img.src = dataUrl;
  });
}

/**
 * Crops a video element frame to match the exact aspect ratio and visible framing of its container
 * when displayed with CSS `object-fit: cover`.
 * This ensures the captured snapshot image exactly matches what the user saw in the viewfinder,
 * preventing any bounding-box coordinate misalignment.
 */
export function captureViewportCrop(
  video: HTMLVideoElement,
  containerWidth: number,
  containerHeight: number,
  format: "image/webp" | "image/jpeg" = "image/webp",
  quality = 0.85
): string {
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  if (!vw || !vh || !containerWidth || !containerHeight) {
    const canvas = document.createElement("canvas");
    canvas.width = vw || 640;
    canvas.height = vh || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL(format, quality);
    }
    return "";
  }

  const containerAspect = containerWidth / containerHeight;
  const videoAspect = vw / vh;

  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = vw;
  let sourceHeight = vh;

  if (videoAspect > containerAspect) {
    // Video is wider than viewfinder container: crop horizontally from sides
    sourceWidth = vh * containerAspect;
    sourceX = (vw - sourceWidth) / 2;
  } else {
    // Video is taller than viewfinder container: crop vertically from top/bottom
    sourceHeight = vw / containerAspect;
    sourceY = (vh - sourceHeight) / 2;
  }

  // Create canvas with aspect ratio matching the visible container
  const maxEdge = 1280;
  let destWidth = sourceWidth;
  let destHeight = sourceHeight;
  if (destWidth > maxEdge || destHeight > maxEdge) {
    if (destWidth > destHeight) {
      destHeight = Math.round((destHeight * maxEdge) / destWidth);
      destWidth = maxEdge;
    } else {
      destWidth = Math.round((destWidth * maxEdge) / destHeight);
      destHeight = maxEdge;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = destWidth;
  canvas.height = destHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.drawImage(
    video,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    destWidth,
    destHeight
  );

  return canvas.toDataURL(format, quality);
}

export interface RenderedCoverRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Computes the pixel geometry of an image rendered with CSS `object-fit: cover`
 * (and centered `object-position: 50% 50%`) inside a container.
 *
 * This allows DOM overlays, bounding boxes, and SVG drawing masks to precisely match
 * the underlying image pixels without any scaling or cropping distortion.
 */
export function computeObjectFitCoverRect(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number
): RenderedCoverRect {
  if (!containerWidth || !containerHeight || !imageWidth || !imageHeight) {
    return {
      left: 0,
      top: 0,
      width: containerWidth || 0,
      height: containerHeight || 0,
    };
  }

  const containerAspect = containerWidth / containerHeight;
  const imageAspect = imageWidth / imageHeight;

  if (imageAspect > containerAspect) {
    // Image is wider than container: height fills container, left/right are cropped
    const renderedHeight = containerHeight;
    const renderedWidth = containerHeight * imageAspect;
    const left = (containerWidth - renderedWidth) / 2;
    return {
      left,
      top: 0,
      width: renderedWidth,
      height: renderedHeight,
    };
  } else {
    // Image is taller than container: width fills container, top/bottom are cropped
    const renderedWidth = containerWidth;
    const renderedHeight = containerWidth / imageAspect;
    const top = (containerHeight - renderedHeight) / 2;
    return {
      left: 0,
      top,
      width: renderedWidth,
      height: renderedHeight,
    };
  }
}
