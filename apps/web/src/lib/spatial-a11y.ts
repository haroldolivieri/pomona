import { uiCopy } from "../i18n/copy";
import type { BoundingBox } from "@pomona/contract";

/**
 * Translates bounding box coordinates into user-friendly spatial audio descriptions.
 * Example: "Winner: middle row, centre, score 8.6 out of 10"
 *
 * @param box [ymin, xmin, ymax, xmax] in 0..1000 coordinates
 * @param roleLabel e.g. "Winner", "Runner-Up", "Candidate"
 * @param score produce score (0..10)
 */
export function describeBoxPosition(
  box: BoundingBox,
  roleLabel: string,
  score: number
): string {
  const [ymin, xmin, ymax, xmax] = box;
  const centerY = (ymin + ymax) / 2;
  const centerX = (xmin + xmax) / 2;

  let row: string;
  if (centerY < 333) {
    row = uiCopy("copy.topRow");
  } else if (centerY > 666) {
    row = uiCopy("copy.bottomRow");
  } else {
    row = uiCopy("copy.middleRow");
  }

  let col: string;
  if (centerX < 333) {
    col = uiCopy("copy.left");
  } else if (centerX > 666) {
    col = uiCopy("copy.right");
  } else {
    col = uiCopy("copy.centre");
  }

  return uiCopy("copy.scoreOutOf10", { value1: roleLabel, value2: row, value3: col, value4: score });
}
