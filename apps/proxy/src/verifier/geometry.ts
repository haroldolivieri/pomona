import type { BoundingBox, Point } from "@pomona/contract";

/**
 * Calculates squared distance from a point (px, py) to a line segment between (x1, y1) and (x2, y2).
 */
function pointToSegmentDistanceSquared(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const ex = px - x1;
    const ey = py - y1;
    return ex * ex + ey * ey;
  }

  // Projection scalar clamped to [0, 1]
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  const ex = px - projX;
  const ey = py - projY;
  return ex * ex + ey * ey;
}

/**
 * Checks if a point lies inside a polygon or within `tolerance` of any polygon edge.
 * Uses ray-casting algorithm for containment, plus distance-to-segment for tolerance.
 *
 * @param point [x, y] coordinates (0..1000)
 * @param polygon array of [x, y] coordinates defining polygon vertices
 * @param tolerance maximum Euclidean distance to polygon boundary (default 50 = 5% on 0..1000 scale)
 */
export function isPointInPolygon(
  point: Point,
  polygon: Point[],
  tolerance = 50
): boolean {
  if (!point || !Array.isArray(point) || point.length !== 2) {
    return false;
  }
  if (!polygon || !Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }

  const [px, py] = point;
  const n = polygon.length;

  // 1. Ray-casting algorithm (even-odd rule)
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  if (inside) {
    return true;
  }

  // 2. Tolerance boundary check (segment distance)
  if (tolerance >= 0) {
    const tolSq = tolerance * tolerance;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [x1, y1] = polygon[j];
      const [x2, y2] = polygon[i];

      const distSq = pointToSegmentDistanceSquared(px, py, x1, y1, x2, y2);
      if (distSq <= tolSq) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Validates a bounding box [ymin, xmin, ymax, xmax] coordinates and dimensions.
 *
 * @param box [ymin, xmin, ymax, xmax] on the 0..1000 scale
 * @param minSize minimum box width and height (default 20)
 */
export function isValidBoundingBox(box: BoundingBox, minSize = 20): boolean {
  if (!Array.isArray(box) || box.length !== 4) {
    return false;
  }
  const [ymin, xmin, ymax, xmax] = box;
  if (
    typeof ymin !== "number" ||
    typeof xmin !== "number" ||
    typeof ymax !== "number" ||
    typeof xmax !== "number" ||
    Number.isNaN(ymin) ||
    Number.isNaN(xmin) ||
    Number.isNaN(ymax) ||
    Number.isNaN(xmax)
  ) {
    return false;
  }
  if (ymin < 0 || xmin < 0 || ymax > 1000 || xmax > 1000) {
    return false;
  }
  const height = ymax - ymin;
  const width = xmax - xmin;
  return ymin < ymax && xmin < xmax && height >= minSize && width >= minSize;
}

/**
 * Checks if a candidate bounding box is inside or significantly overlaps a polygon.
 * Checks:
 * 1. Center of the box with tolerance (80 = 8% on 0..1000 scale).
 * 2. Any corner of the box inside the polygon.
 * 3. Any edge midpoint inside the polygon.
 */
export function isBoxInPolygon(
  box: BoundingBox,
  polygon: Point[],
  tolerance = 80
): boolean {
  if (!isValidBoundingBox(box) || !polygon || polygon.length < 3) {
    return false;
  }

  const [ymin, xmin, ymax, xmax] = box;
  const centerX = Math.round((xmin + xmax) / 2);
  const centerY = Math.round((ymin + ymax) / 2);

  // 1. Center of the box inside or close to polygon (50 = 5% tolerance)
  if (isPointInPolygon([centerX, centerY], polygon, tolerance)) {
    return true;
  }

  // 2. Corner strictly inside the polygon (tolerance 0)
  const corners: Point[] = [
    [xmin, ymin],
    [xmax, ymin],
    [xmin, ymax],
    [xmax, ymax],
  ];

  for (const corner of corners) {
    if (isPointInPolygon(corner, polygon, 0)) {
      return true;
    }
  }

  return false;
}


