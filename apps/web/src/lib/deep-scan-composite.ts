export interface CompositeGeometry {
  cols: 3;
  rows: 2;
  tilePx: 448;
  canvasW: 1344;
  canvasH: 896;
}

const GEOMETRY: CompositeGeometry = {
  cols: 3,
  rows: 2,
  tilePx: 448,
  canvasW: 1344,
  canvasH: 896,
};

export function computeTileGeometry(frameCount: number): CompositeGeometry {
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 6) {
    throw new Error(`frameCount must be an integer in 1..6 (got ${frameCount})`);
  }
  return GEOMETRY;
}

export interface CompositeOptions {
  tileMax?: number;
  qualityStart?: number;
  step?: number;
  floor?: number;
  targetBytes?: number;
}

export interface CompositeResult {
  dataUrl: string;
  tileCount: number;
  bytes: number;
}

const cream = "#FBFAF6";

export async function buildComposite(
  keptDataUrls: string[],
  options: CompositeOptions = {}
): Promise<CompositeResult> {
  const tileMax = options.tileMax ?? 448;
  const qualityStart = options.qualityStart ?? 0.7;
  const step = options.step ?? 0.05;
  const floor = options.floor ?? 0.5;
  const targetBytes = options.targetBytes ?? 262_144;

  if (keptDataUrls.length < 1 || keptDataUrls.length > 6) {
    throw new Error(`keptDataUrls must contain 1..6 entries (got ${keptDataUrls.length})`);
  }

  const geometry = computeTileGeometry(keptDataUrls.length);

  const canvas = document.createElement("canvas");
  canvas.width = geometry.canvasW;
  canvas.height = geometry.canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");

  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const layout = [
    [0, 0], [tileMax, 0], [tileMax * 2, 0],
    [0, tileMax], [tileMax, tileMax], [tileMax * 2, tileMax],
  ];

  for (let i = 0; i < keptDataUrls.length; i++) {
    const frame = await loadImage(keptDataUrls[i]);
    const [x, y] = layout[i];
    drawCoverCrop(ctx, frame, x, y, tileMax);
    drawTileBadge(ctx, x, y, i + 1);
  }

  let quality = qualityStart;
  for (;;) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const bytes = approxBytes(dataUrl);
    if (bytes <= targetBytes || quality <= floor) {
      return { dataUrl, tileCount: keptDataUrls.length, bytes };
    }
    quality = Math.max(floor, quality - step);
  }
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("composite frame decode failed"));
    img.src = dataUrl;
  });
}

function drawCoverCrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number
): void {
  const nw = img.naturalWidth || size;
  const nh = img.naturalHeight || size;

  if (nw === nh) {
    // Already a square (produced by captureDeepScanCrop): draw directly, 100% preserving oval
    ctx.drawImage(img, x, y, size, size);
    return;
  }

  // Non-square fallback: preserve the area where the oval sits (upper-center)
  // rather than blind vertical center-cropping which cuts the top off
  const ratio = Math.max(size / nw, size / nh);
  const w = nw * ratio;
  const h = nh * ratio;
  const offsetX = (size - w) / 2;
  const offsetY = h > size ? (size - h) * 0.35 : (size - h) / 2;
  ctx.drawImage(img, x + offsetX, y + offsetY, w, h);
}

function drawTileBadge(ctx: CanvasRenderingContext2D, x: number, y: number, n: number): void {
  const radius = 20;
  const cx = x + 28;
  const cy = y + 28;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(20, 20, 20, 0.85)";
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), cx, cy + 1);
}

function approxBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((base64.length * 3) / 4);
}
