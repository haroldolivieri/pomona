# Pomona UI Mockup Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Achieve 1:1 visual and interactive parity between the live React implementation and the pre-implementation design mockups across all 10 scan states.

**Architecture:** Refactor the stage components in `apps/web/src/components/` (`CameraViewfinder`, `FreehandDrawStage`, `AnalysingStage`, `ResultStage`, `FlipCameraStage`) to align typography, sheet containers, bounding box badging, topbar navigation, storage cards, and camera reticles with the approved mockup designs while maintaining responsive design, theme token bindings, and accessible semantics.

**Tech Stack:** React 19, TypeScript strict mode, CSS design tokens, Lucide/SVG graphics, Vitest, Testing Library, Playwright E2E.

**Spec:** `.superpowers/brainstorm/34780-1792182706/content/full-7-state-freehand-draw.html` and `.superpowers/brainstorm/34780-1792182706/content/complete-state-map-light.html`

## Global Constraints

- TypeScript strict mode enabled across all modified files.
- Design tokens must be respected: `--surface-sheet: #FBFAF6`, `--text-primary: #1A261D`, `--accent-winner: #F5D547`, `--cta-primary: #2F5D34` for Light; matching tokens for Dark.
- All fruit references must remain parameterized dynamically (no hardcoded "watermelon" in logic; consume `produce.displayName`).
- Accessibility: maintain `data-testid` attributes on all interactive controls and stages, preserve `aria-live` spatial announcements and touch target sizing.
- Zero breaking changes to `@pomona/contract` or the proxy API.

## Review Focus

1. Mobile Viewport Overflow: Bottom sheets and action buttons must not cause unwanted vertical scrolling or get obscured by mobile browser navigation bars (Safari address bar / home indicator).
2. SVG Bounding Box Badges: Circular score badges on the top-right of candidate bounding boxes must clip or clamp cleanly when a candidate box touches the edge of the viewfinder frame (xmin=0 or ymin=0).
3. Freehand Polygon Reticulation: Drawing a small or complex loop in S2 must render the exact dashed polygon in S3 without breaking SVG `path` rendering or throwing geometry errors.
4. Quota Counter Display: Daily scan quota chip must gracefully display fallback numbers when quota API fails or when offline mock mode is active.
5. Dark Mode Parity: All new ivory cards and sheet elements must correctly map to their Dark Forest equivalents (`--surface-sheet: #111D15`, `--text-primary: #F0F4EE`).

---

### Task 1: Camera Viewfinder (State 1) Parity

**Files:**
- Modify: `apps/web/src/components/CameraViewfinder.tsx`
- Modify: `apps/web/src/locales/en.json`
- Test: `apps/web/test/components/CameraViewfinder.test.tsx`

**Interfaces:**
- Consumes: `onCapture`, `onClose`, `onToggleTheme`, `theme`, `remainingScans?: number`
- Produces: State 1 viewfinder with golden framing corner brackets, topbar pills (`Pomona` brand, quota chip, flash toggle), floating prompt card, and yellow-centered shutter button.

- [ ] **Step 1: Write failing unit test for S1 mockup elements**

```typescript
// apps/web/test/components/CameraViewfinder.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CameraViewfinder } from "../../src/components/CameraViewfinder";

describe("CameraViewfinder (State 1 Parity)", () => {
  it("renders brand pill, scan quota pill, framing brackets, floating prompt card, and yellow shutter center", () => {
    render(<CameraViewfinder onCapture={vi.fn()} remainingScans={8} />);
    expect(screen.getByText("Pomona")).toBeInTheDocument();
    expect(screen.getByText("8 scans left today")).toBeInTheDocument();
    expect(screen.getByText("Point at a pile or single fruit")).toBeInTheDocument();
    expect(screen.getByText("Works with any fruit, vegetable, or produce")).toBeInTheDocument();
    expect(screen.getByTestId("camera-reticle-brackets")).toBeInTheDocument();
    expect(screen.getByTestId("shutter-button-core")).toHaveStyle({ backgroundColor: "#F5D547" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pomona/web test CameraViewfinder`
Expected: FAIL (missing elements and testids).

- [ ] **Step 3: Implement S1 parity elements in `CameraViewfinder.tsx`**

1. Add 4 corner brackets in center of viewfinder with `data-testid="camera-reticle-brackets"`:
   - Border color `#F5D547`, border-width `3.5px`, corner radius `16px`.
2. Update Top Bar:
   - Left: White chip pill with Fraunces font: `Pomona`.
   - Center: White chip pill: `{remainingScans ?? 10} scans left today`.
   - Right: Flash toggle button `⚡` alongside existing theme toggle `🌙/☀️`.
3. Add floating prompt card above shutter:
   - Ivory frosted container: Title *"Point at a pile or single fruit"*, Subtitle *"Works with any fruit, vegetable, or produce"*.
4. Update Shutter button:
   - Outer white ring `4px solid #fff`, center inner circle `backgroundColor: "#F5D547"` with `data-testid="shutter-button-core"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pomona/web test CameraViewfinder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/CameraViewfinder.tsx apps/web/src/locales/en.json apps/web/test/components/CameraViewfinder.test.tsx
git commit -m "feat(web): achieve visual parity for State 1 Camera Viewfinder"
```

---

### Task 2: Freehand Draw Stage (State 2) Parity

**Files:**
- Modify: `apps/web/src/components/FreehandDrawStage.tsx`
- Modify: `apps/web/src/locales/en.json`
- Test: `apps/web/test/components/FreehandDrawStage.test.tsx`

**Interfaces:**
- Consumes: `photoDataUrl`, `onStartAnalyse`, `onRetake`
- Produces: State 2 with curved ivory bottom sheet, drag handle, eyebrow `STEP 1 · FOCUS AREA`, Fraunces headline *"Draw around your picks"*, outline `Whole Photo` button, green `Analyse Drawn Area` button, and floating prompt pill.

- [ ] **Step 1: Write failing unit test for S2 bottom sheet and buttons**

```typescript
// apps/web/test/components/FreehandDrawStage.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FreehandDrawStage } from "../../src/components/FreehandDrawStage";

describe("FreehandDrawStage (State 2 Parity)", () => {
  it("renders ivory bottom sheet with headline, subtitle, outline whole-photo button, and green analyse button", () => {
    render(<FreehandDrawStage photoDataUrl="data:image/png;base64,mock" onStartAnalyse={vi.fn()} onRetake={vi.fn()} />);
    expect(screen.getByTestId("draw-bottom-sheet")).toBeInTheDocument();
    expect(screen.getByText(/Step 1 · Focus area/i)).toBeInTheDocument();
    expect(screen.getByText("Draw around your picks")).toBeInTheDocument();
    expect(screen.getByText(/Trace with your finger/i)).toBeInTheDocument();
    expect(screen.getByTestId("floating-draw-pill")).toHaveTextContent("Draw around the area to focus on");
    
    const wholeBtn = screen.getByTestId("whole-photo-button");
    const analyseBtn = screen.getByTestId("analyse-drawn-button");
    expect(wholeBtn).toHaveStyle({ background: "transparent" });
    expect(analyseBtn).toHaveStyle({ backgroundColor: "var(--cta-primary)" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pomona/web test FreehandDrawStage`
Expected: FAIL.

- [ ] **Step 3: Implement S2 bottom sheet and navigation in `FreehandDrawStage.tsx`**

1. Replace bottom button row with curved bottom sheet (`data-testid="draw-bottom-sheet"`):
   - Background `var(--surface-sheet)`, `border-radius: 26px 26px 0 0`, box shadow, drag handle (`.grab`).
   - Eyebrow: `STEP 1 · FOCUS AREA` (uppercase, tracking).
   - Headline: Fraunces serif `Draw around your picks`.
   - Subtitle: `Trace with your finger so the AI only grades the produce inside your loop — or skip to scan the whole photo.`
   - CTAs:
     - `Whole Photo` (outline button: `background: transparent`, `border: 1.5px solid var(--border-neutral)`, text `var(--text-primary)`).
     - `Analyse Drawn Area` (primary button: `background: var(--cta-primary)`, white text, disabled with opacity when loop < 5%).
2. Add floating yellow pill above photo:
   - `✍️ Draw around the area to focus on` (`data-testid="floating-draw-pill"`).
3. Update top bar:
   - Circular back button `←` (calls `onRetake`), center chip `Draw focus area (optional)`, and reset button `↺` (clears points).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pomona/web test FreehandDrawStage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/FreehandDrawStage.tsx apps/web/src/locales/en.json apps/web/test/components/FreehandDrawStage.test.tsx
git commit -m "feat(web): implement ivory bottom sheet and mockup styling for State 2 Draw Stage"
```

---

### Task 3: Analysing Stage (State 3) Parity

**Files:**
- Modify: `apps/web/src/components/AnalysingStage.tsx`
- Test: `apps/web/test/components/AnalysingStage.test.tsx`

**Interfaces:**
- Consumes: `photoDataUrl`, `focusPolygon`, `onCancel`
- Produces: State 3 retaining organic freehand dashed polygon, scanning laser beam, candidate node dots, and ivory bottom sheet (`POMONA VISION / Checking ripeness…`).

- [ ] **Step 1: Write failing test for S3 visual scan and bottom sheet**

```typescript
// apps/web/test/components/AnalysingStage.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AnalysingStage } from "../../src/components/AnalysingStage";

describe("AnalysingStage (State 3 Parity)", () => {
  it("renders organic dashed polygon, candidate pulsing dots, and ivory bottom sheet", () => {
    const polygon = [{ x: 200, y: 200 }, { x: 800, y: 200 }, { x: 800, y: 800 }, { x: 200, y: 800 }];
    render(<AnalysingStage photoDataUrl="data:image/png;base64,mock" focusPolygon={polygon} onCancel={vi.fn()} />);
    expect(screen.getByTestId("analysing-bottom-sheet")).toBeInTheDocument();
    expect(screen.getByText("Pomona Vision")).toBeInTheDocument();
    expect(screen.getByText("Checking ripeness…")).toBeInTheDocument();
    expect(screen.getByTestId("scanning-polygon-overlay")).toBeInTheDocument();
    expect(screen.getAllByTestId("candidate-pulse-dot").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pomona/web test AnalysingStage`
Expected: FAIL.

- [ ] **Step 3: Implement S3 organic polygon overlay and ivory bottom sheet**

1. Retain user's `focusPolygon` in SVG with dashed yellow stroke (`stroke-dasharray: 7 5`, `stroke: #F5D547`), dimmed outer mask (`rgba(0,0,0,0.48)`), and moving laser line.
2. Render 3 pulsing yellow node dots with white borders (`.nodeDot`, `data-testid="candidate-pulse-dot"`) positioned inside the polygon bounding area.
3. Top Bar: Left circular `✕` button, center chip `Analysing drawn area…`.
4. Bottom Sheet (`data-testid="analysing-bottom-sheet"`):
   - Background `var(--surface-sheet)`, curved top corners, drag handle.
   - Eyebrow: `POMONA VISION`.
   - Title: Fraunces serif `Checking ripeness…`.
   - Subhead: `Grading only the produce inside the boundary you drew.` (or whole photo copy if no polygon).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pomona/web test AnalysingStage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/AnalysingStage.tsx apps/web/test/components/AnalysingStage.test.tsx
git commit -m "feat(web): update State 3 Analysing Stage with organic polygon scan and ivory bottom sheet"
```

---

### Task 4: Result Stage (States 4, 5B-1, 5B-2, 7A, 7B) Parity

**Files:**
- Modify: `apps/web/src/components/ResultStage.tsx`
- Modify: `apps/web/src/locales/en.json`
- Test: `apps/web/test/components/ResultStage.test.tsx`

**Interfaces:**
- Consumes: `state: ScanMachineState`, `onCompareWithRunnerUp`, `onStartFinalCheck`, `onReset`
- Produces: Result sheets with circular score badges on top-right of winner boxes, produce name chip + retake in topbar, 2-row storage layout with emoji, score comparison tick mark, and exact card ordering.

- [ ] **Step 1: Write failing test for circular score badges, 2-row storage cards, and score tick mark**

```typescript
// apps/web/test/components/ResultStage.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ResultStage } from "../../src/components/ResultStage";
import { initialScanMachineState } from "../../src/state/scan-state-machine";

describe("ResultStage (Mockup Parity)", () => {
  it("renders circular score badge on winner, produce chip in topbar, and 2-row storage cards with emoji", () => {
    const state = {
      ...initialScanMachineState(),
      phase: "S4_InitialResult" as const,
      firstPick: { id: "c1", box: [360, 240, 680, 560] as [number, number, number, number], score: 8.6, ripeness: "ripe" as const, traits: ["Matte rind"], flipSummary: null },
      runnerUp: { id: "c2", box: [320, 580, 660, 900] as [number, number, number, number], score: 8.1, ripeness: "almost_ripe" as const, traits: ["Even form"], flipSummary: null },
      lastResponse: {
        schemaVersion: "1.0", promptVersion: "v1", modelId: "test", round: 1, status: "ok" as const, message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        candidates: [],
        verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high" as const, headline: "Buy it." },
        followUp: { targetCandidateId: "c2", targetRole: "runner_up" as const, bannerText: "The blue one could be sweeter. Flip it and snap.", flipHeadline: "Flip over", instruction: "Turn over" },
        afterPurchase: { readyInDays: { min: 0, max: 0 }, eatWithinDays: { min: 3, max: 5 }, eatWithinLabel: "3–5 days", storage: { beforeCut: { where: "counter" as const, whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" }, afterCut: { where: "fridge" as const, whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap tightly" } } },
      },
    };

    render(<ResultStage state={state} onCompareWithRunnerUp={vi.fn()} onStartFinalCheck={vi.fn()} onReset={vi.fn()} />);
    
    // Topbar
    expect(screen.getByTestId("produce-name-chip")).toHaveTextContent("Watermelon");
    expect(screen.getByTestId("retake-button")).toBeInTheDocument();

    // Circular badge
    const badge = screen.getByTestId("winner-score-badge");
    expect(badge).toHaveTextContent("8.6");
    expect(badge).toHaveStyle({ borderRadius: "50%" });

    // Storage 2-row
    expect(screen.getByText(/🗓 Eat within/i)).toBeInTheDocument();
    expect(screen.getByText(/🧺 Before cut/i)).toBeInTheDocument();
    expect(screen.getByText(/❄️ After cut/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pomona/web test ResultStage`
Expected: FAIL.

- [ ] **Step 3: Implement ResultStage visual parity**

1. Top bar over frozen photo:
   - Left: Circular `✕` button.
   - Center: White chip pill with produce name: `{produce.displayName}` (`data-testid="produce-name-chip"`).
   - Right: Circular retake button `↻` (`data-testid="retake-button"`).
2. Bounding Boxes:
   - Winner: Solid yellow border (`3px solid #F5D547`, `box-shadow`), with **circular badge** (`34px × 34px`, `border-radius: 50%`, `background: #F5D547`, bold black text `color: #142117`) anchored on **top-right** corner (`data-testid="winner-score-badge"`).
   - Runner-Up: Dashed box with blue/gray tag on top-left.
3. Bottom Sheet Headlines:
   - S4: Eyebrow `BEST IN VIEW`, headline `Buy it.`, subhead `High confidence · 3 compared in view`.
   - S5B-1: Eyebrow `✓ 1ST PICK WINS · BEATS RUNNER-UP ({score1} VS {score2})`, headline `Buy your 1st pick.`.
   - S5B-2: Eyebrow `★ NEW WINNER · BEATS 1ST PICK ({score2} VS {score1})`, headline `Buy this one.`.
   - S7A: Eyebrow `★ FINAL VERDICT · 1ST PICK RECLAIMS THE WIN ({score1} VS {score2})`, headline `Buy your 1st pick.`.
   - S7B: Eyebrow `★ FINAL VERDICT · RUNNER-UP WINS ({score2} VS {score1})`, headline `Buy the new winner.`.
4. Score Meter:
   - Clean meter with `{score} / 10` on the right.
   - On Round 2 and Round 3, add vertical black tick marker (`.prevMark`) at the previous candidate's score percentage on the track.
5. Storage Cards Layout:
   - Row 1: Full-width card: `🗓 EAT WITHIN` (left) — `{eatWithinLabel}` (right bold).
   - Row 2: Two equal side-by-side cards:
     - Card 1: `🧺 BEFORE CUT` / `{storage.beforeCut.summary}`
     - Card 2: `❄️ AFTER CUT` / `{storage.afterCut.summary}`
6. Card Order:
   - S4 & S5B-2: Storage cards first, then warm yellow follow-up hint box with dashed icon, then single CTA button.
   - S5B-1, S7A, S7B: Storage cards first, then green confirmation card with checkmark icon, then `Scan Another` CTA.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pomona/web test ResultStage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ResultStage.tsx apps/web/src/locales/en.json apps/web/test/components/ResultStage.test.tsx
git commit -m "feat(web): update ResultStage for exact visual parity with design mockups"
```

---

### Task 5: Flip Camera Stages (States 5A & 6) Parity

**Files:**
- Modify: `apps/web/src/components/FlipCameraStage.tsx`
- Test: `apps/web/test/components/FlipCameraStage.test.tsx`

**Interfaces:**
- Consumes: `state: ScanMachineState`, `onCapture`, `onBack`, `onClose`
- Produces: Flip camera with rectangular corner bracket reticle, zoomed candidate PiP thumbnail (with role border and label), ivory frosted instruction card, and topbar status chip.

- [ ] **Step 1: Write failing test for FlipCameraStage reticle, PiP crop, and ivory card**

```typescript
// apps/web/test/components/FlipCameraStage.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FlipCameraStage } from "../../src/components/FlipCameraStage";
import { initialScanMachineState } from "../../src/state/scan-state-machine";

describe("FlipCameraStage (Mockup Parity)", () => {
  it("renders rectangular corner reticle, ivory prompt card, and role-styled PiP thumbnail", () => {
    const state = {
      ...initialScanMachineState(),
      phase: "S5A_FlipRunnerUpCamera" as const,
      round: 2 as const,
      firstPick: { id: "c1", box: [360, 240, 680, 560] as [number, number, number, number], score: 8.6, ripeness: "ripe" as const, traits: [], flipSummary: null },
      runnerUp: { id: "c2", box: [320, 580, 660, 900] as [number, number, number, number], score: 8.1, ripeness: "almost_ripe" as const, traits: [], flipSummary: null },
      round1PhotoDataUrl: "data:image/png;base64,mock",
      lastResponse: {
        schemaVersion: "1.0", promptVersion: "v1", modelId: "test", round: 1, status: "ok" as const, message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        candidates: [],
        verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high" as const, headline: "Buy it." },
        followUp: { targetCandidateId: "c2", targetRole: "runner_up" as const, bannerText: "Banner", flipHeadline: "Flip the Watermelon over", instruction: "Turn over" },
        afterPurchase: { readyInDays: { min: 0, max: 0 }, eatWithinDays: { min: 3, max: 5 }, eatWithinLabel: "3-5 days", storage: { beforeCut: { where: "counter" as const, whereLabel: "Counter", summary: "Counter", tip: "" }, afterCut: { where: "fridge" as const, whereLabel: "Fridge", summary: "Fridge", tip: "" } } },
      },
    };

    render(<FlipCameraStage state={state} onCapture={vi.fn()} onBack={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId("flip-reticle-brackets")).toBeInTheDocument();
    expect(screen.getByTestId("flip-instruction-card")).toHaveStyle({ background: "rgba(251, 250, 246, 0.95)" });
    expect(screen.getByTestId("pip-reference-thumbnail")).toHaveTextContent("Runner-Up");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pomona/web test FlipCameraStage`
Expected: FAIL.

- [ ] **Step 3: Implement FlipCameraStage reticle, PiP styling, and ivory card**

1. Top Bar:
   - Left: Circle back button `←`.
   - Center: Chip pill: `Runner-Up · Step 2` (blue dashed icon) for 5A; `1st Pick · Final Check` (yellow icon) for 6.
   - Right: Circle close button `✕`.
2. PiP Reference Thumbnail:
   - Crop canvas / zoomed view focusing on target candidate bounding box.
   - 5A: Border `2.5px solid #2f6db5`, bottom label `Runner-Up` (`background: rgba(47, 109, 181, 0.92)`).
   - 6: Border `2.5px solid #F5D547`, bottom label `1st Pick` (`background: rgba(245, 213, 71, 0.95)`).
3. Reticle:
   - Center rectangular reticle with 4 yellow corner brackets (`#F5D547`, 3.5px border, rounded corners) and dashed white boundary (`data-testid="flip-reticle-brackets"`).
   - Flip animation graphic centered inside reticle.
4. Floating Instruction Card (`data-testid="flip-instruction-card"`):
   - Frosted ivory card (`background: rgba(251, 250, 246, 0.95)` in light theme, dark botanical equivalent in dark theme).
   - Eyebrow: `INSPECT RUNNER-UP` (blue) in 5A; `FINAL CHECK · BEAT {score} TO RECLAIM` (gold) in 6.
   - Title: Fraunces serif headline (`Flip the Watermelon over` / `Flip your 1st pick over`).
   - Description: Subtitle with instruction.
   - Score pill at bottom: `Winner to beat: 8.6 / 10` in 5A; `Current leader: {runnerUpScore} · 1st Pick: {firstPickScore} (top only)` in 6.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pomona/web test FlipCameraStage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/FlipCameraStage.tsx apps/web/test/components/FlipCameraStage.test.tsx
git commit -m "feat(web): update FlipCameraStage with rectangular reticle, ivory prompt card, and candidate PiP"
```

---

### Task 6: Regression Testing, Updated Visual Captures & Parity Verification

**Files:**
- Modify: `apps/web/test/app-states.integration.test.tsx`
- Modify: `apps/web/e2e/pomona-journeys.spec.ts`
- Modify: `apps/web/scripts/capture-all.mjs`
- Modify: `apps/web/scripts/capture-extra.mjs`

**Interfaces:**
- Consumes: All updated stage components and testids.
- Produces: Passing unit and E2E test suites; re-generated screenshot gallery verifying 1:1 visual parity across all 10 states.

- [ ] **Step 1: Update integration and E2E tests for new selectors and structure**

Run: `pnpm --filter @pomona/web test` and `pnpm --filter @pomona/web test:e2e`
Fix any selector mismatches (e.g. updating `app-states.integration.test.tsx` for the new bottom sheet in S2 and circular badges in S4).

- [ ] **Step 2: Run all workspace unit and integration tests**

Run: `pnpm test`
Expected: 100% test pass across all packages (`@pomona/contract`, `@pomona/proxy`, `@pomona/web`, `@pomona/evals`).

- [ ] **Step 3: Run full Playwright mobile journeys E2E suite**

Run: `pnpm --filter @pomona/web test:e2e`
Expected: All 5 journeys pass cleanly including WCAG AA accessibility audits.

- [ ] **Step 4: Re-run screenshot capture scripts and refresh comparison page**

Run: `node apps/web/scripts/capture-all.mjs && node apps/web/scripts/capture-extra.mjs && cp apps/web/../../.gemini/antigravity/brain/3d10fd55-a3aa-4756-a214-9c1f5a8fcf04/comparison/*.png .superpowers/brainstorm/34780-1792182706/content/comparison/`
Expected: Fresh screenshots reflecting the updated UI copied to `.superpowers/brainstorm/34780-1792182706/content/comparison/`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/test/ apps/web/e2e/ apps/web/scripts/
git commit -m "chore(web): update integration and e2e test suites and re-verify visual parity"
```
