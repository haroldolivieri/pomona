# Parameterized Ripeness Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to choose their eating window on the Round 1 result screen ("Ready now" [default], "In 2–3 days", or "Later this week") with instant 0ms client-side re-ranking, and propagate that target into the Round 2/3 flip workflow.

**Architecture:** Add `TargetRipenessWindowSchema` and shared deterministic ranker `resolveCandidatesForTarget` to `@pomona/contract`. Wire a 3-way segmented control to `scan-state-machine.ts` and `ResultStage.tsx`, locking the goal into `followUpContext` for Round 2/3 flip evaluation. Extend proxy prompts and evals to test all 3 target windows.

**Tech Stack:** TypeScript, React, Zod, Vitest, Playwright, Cloudflare Workers (Hono), Google Gemini AI SDK.

**Spec:** `docs/superpowers/specs/2026-10-17-parameterized-ripeness-target-design.md`

## Global Constraints

- TypeScript strict mode across all packages.
- Zero extra network calls or quota burns when toggling tabs on State 4.
- Default behavior must be 100% backwards-compatible (`"ready_now"` is default).
- Unripe winners must display an intuitive suitability score (`8.3–9.4 / 10`), never a raw low ripeness score like `5.5 / 10`.
- 3-way switch is active only in State 4; locked goal badge displays in States 5A, 5B, 6, 7.

## Review Focus

1. **No exact match in view:** User selects "In 2–3 days" but all items in crate are already ripe. Expected: Pick closest item, set `isExactMatch: false`, and show advisory eyebrow "CLOSEST MATCH · ALL ITEMS ALREADY RIPE".
2. **Single-produce scan:** User scans a single pineapple and toggles tabs. Expected: Winner updates suitability score without crashing on null runner-up.
3. **Flip Runner-Up sync:** User selects "In 2–3 days" and taps "Compare with Runner-Up". Expected: PiP thumbnail and Round 2 request target the new runner-up for that window.
4. **Round 2 Overtake scoring:** In Round 2 with `targetRipeness: "in_2_3_days"`, a bruised melon must score lower than previous winner even if glossy. Expected: Score reflects storage suitability.
5. **Session Reset:** Tapping retake/close resets `targetRipeness` to `"ready_now"`.

---

### Task 1: Contract Additions & Shared Target Ranker

**Files:**
- Create: `packages/contract/src/ripeness-target.ts`
- Modify: `packages/contract/src/schema.ts`
- Modify: `packages/contract/src/index.ts`
- Test: `packages/contract/test/ripeness-target.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `CandidateSchema`, `FollowUpContextSchema` from `@pomona/contract`
- Produces: `TargetRipenessWindowSchema`, `TargetRipenessWindow`, `resolveCandidatesForTarget(candidates, targetWindow)`

- [ ] **Step 1: Write failing unit tests for `resolveCandidatesForTarget`**

```ts
// packages/contract/test/ripeness-target.test.ts
import { describe, expect, it } from "vitest";
import { resolveCandidatesForTarget, TargetRipenessWindowSchema } from "../src";

describe("resolveCandidatesForTarget", () => {
  const sampleCandidates = [
    { id: "c1", box: [400, 100, 800, 500], score: 9.2, ripeness: "ripe", traits: ["Deep yellow spot"], flipSummary: null },
    { id: "c2", box: [400, 500, 800, 900], score: 8.0, ripeness: "almost_ripe", traits: ["Pale spot"], flipSummary: null },
    { id: "c3", box: [100, 300, 400, 700], score: 6.2, ripeness: "underripe", traits: ["White spot"], flipSummary: null },
  ];

  it("ranks ripe candidate first for ready_now with original scores", () => {
    const res = resolveCandidatesForTarget(sampleCandidates, "ready_now");
    expect(res.winner?.id).toBe("c1");
    expect(res.runnerUp?.id).toBe("c2");
    expect(res.isExactMatch).toBe(true);
    expect(res.winner?.score).toBe(9.2);
  });

  it("ranks almost_ripe candidate first for in_2_3_days and calculates suitability score", () => {
    const res = resolveCandidatesForTarget(sampleCandidates, "in_2_3_days");
    expect(res.winner?.id).toBe("c2");
    expect(res.isExactMatch).toBe(true);
    expect(res.winner?.score).toBeGreaterThanOrEqual(8.4);
  });

  it("ranks underripe candidate first for later_this_week and calculates suitability score", () => {
    const res = resolveCandidatesForTarget(sampleCandidates, "later_this_week");
    expect(res.winner?.id).toBe("c3");
    expect(res.isExactMatch).toBe(true);
    expect(res.winner?.score).toBeGreaterThanOrEqual(8.3);
  });

  it("flags isExactMatch=false and gives advisory headline when no candidate matches target", () => {
    const allRipe = [sampleCandidates[0]];
    const res = resolveCandidatesForTarget(allRipe, "later_this_week");
    expect(res.isExactMatch).toBe(false);
    expect(res.eyebrow).toContain("CLOSEST MATCH");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pomona/contract test`
Expected: FAIL with missing modules/exports.

- [ ] **Step 3: Implement `TargetRipenessWindowSchema` and `resolveCandidatesForTarget`**

In `packages/contract/src/schema.ts`, add `TargetRipenessWindowSchema` and update `FollowUpContextSchema`.
In `packages/contract/src/ripeness-target.ts`, implement candidate sorting and suitability score transformation according to Spec Section 3.2.
Export both from `packages/contract/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pomona/contract test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/contract/
git commit -m "feat(contract): add TargetRipenessWindow schema and deterministic target ranker"
```

---

### Task 2: State Machine Support for Target Ripeness

**Files:**
- Modify: `apps/web/src/state/scan-state-machine.ts`
- Test: `apps/web/test/state/scan-state-machine.test.ts`

**Interfaces:**
- Consumes: `resolveCandidatesForTarget`, `TargetRipenessWindow` from `@pomona/contract`
- Produces: `ScanMachineState.targetRipeness`, event `{ type: "SET_TARGET_RIPENESS", targetRipeness }`

- [ ] **Step 1: Write failing tests for `SET_TARGET_RIPENESS` event**

Test that:
1. Initial state has `targetRipeness: "ready_now"`.
2. Emitting `SET_TARGET_RIPENESS` with `"in_2_3_days"` in `S4_InitialResult` updates `state.targetRipeness`, `state.firstPick`, and `state.runnerUp`.
3. Transitioning to `S5A_FlipRunnerUpCamera` preserves the updated `firstPick` and `runnerUp`, and includes `targetRipeness` in `followUpContext`.
4. Emitting `RESET` restores `targetRipeness` to `"ready_now"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pomona/web test scan-state-machine.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `scan-state-machine.ts`**

Add `targetRipeness: TargetRipenessWindow` to `ScanMachineState` (default `"ready_now"`).
Handle `SET_TARGET_RIPENESS` in `scanReducer` when in `S4_InitialResult`.
Pass `targetRipeness` into `followUpContext` on `COMPARE_WITH_RUNNER_UP`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pomona/web test scan-state-machine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/state/scan-state-machine.ts apps/web/test/state/scan-state-machine.test.ts
git commit -m "feat(web): add targetRipeness state and SET_TARGET_RIPENESS transition"
```

---

### Task 3: ResultStage 3-Way Switch & Locked Goal Banner

**Files:**
- Modify: `apps/web/src/components/ResultStage.tsx`
- Test: `apps/web/test/components/ResultStage.test.tsx`

**Interfaces:**
- Consumes: `state.targetRipeness`, dispatch action `onSetTargetRipeness` (or via state action handler)
- Produces: Rendered 3-way segmented control in State 4; locked goal banner in States 5B, 7A, 7B

- [ ] **Step 1: Write failing component tests for 3-way switch and locked banner**

```tsx
// In apps/web/test/components/ResultStage.test.tsx
it("renders 3-way ripeness switch in S4_InitialResult and triggers onSetTargetRipeness", () => {
  // test that target-tab-ready_now, target-tab-in_2_3_days, target-tab-later_this_week render
  // clicking target-tab-in_2_3_days calls callback
});

it("renders locked ripeness goal banner in S5B1 and S5B2 instead of interactive switch", () => {
  // test that data-testid="locked-ripeness-goal" renders with correct label
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pomona/web test ResultStage.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement 3-way segmented control & locked banner in `ResultStage.tsx`**

Style matching mockup in `.superpowers/brainstorm/34780-1792182706/content/ripeness-target-mockup.html`:
- Segmented control in `S4_InitialResult` right under drag handle with `data-testid="ripeness-target-switch"`.
- Bounding box score badge and winner pill dynamically updated.
- Locked badge in `S5B1`, `S5B2`, `S7A`, `S7B` with `data-testid="locked-ripeness-goal"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pomona/web test ResultStage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ResultStage.tsx apps/web/test/components/ResultStage.test.tsx
git commit -m "feat(web): render 3-way ripeness switch on State 4 and locked banner on post-flip states"
```

---

### Task 4: FlipCameraStage Goal Chip & Synchronized PiP

**Files:**
- Modify: `apps/web/src/components/FlipCameraStage.tsx`
- Test: `apps/web/test/components/FlipCameraStage.test.tsx`

**Interfaces:**
- Consumes: `state.targetRipeness`, `state.runnerUp`, `state.firstPick`
- Produces: `data-testid="flip-goal-pill"`, tailored subtitle mentioning storage bruises

- [ ] **Step 1: Write failing tests for `FlipCameraStage` target ripeness display**

Verify that:
1. `data-testid="flip-goal-pill"` displays the active target window (e.g., `🎯 Goal: In 2–3 days`).
2. PiP reference thumbnail crops to the active `runnerUp` bounding box.
3. Subtitle advises checking for storage-ruining bruises when `targetRipeness !== "ready_now"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pomona/web test FlipCameraStage.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update `FlipCameraStage.tsx`**

Add goal chip in top-right bar and contextualize instruction copy when shopping for storage.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pomona/web test FlipCameraStage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/FlipCameraStage.tsx apps/web/test/components/FlipCameraStage.test.tsx
git commit -m "feat(web): add goal chip and storage advice to FlipCameraStage"
```

---

### Task 5: Proxy Prompt & Verifier Support for Storage Flips

**Files:**
- Modify: `apps/proxy/src/prompts/v1.ts`
- Modify: `apps/proxy/src/verifier/verify-response.ts`
- Test: `apps/proxy/test/verifier.test.ts`

**Interfaces:**
- Consumes: `request.followUpContext.targetRipeness`
- Produces: Storage-tailored Round 2/3 prompts and verifier resolution

- [ ] **Step 1: Write failing test in `apps/proxy/test/verifier.test.ts`**

Test that Round 2 comparison cleanly resolves when `targetRipeness: "in_2_3_days"` is provided in `followUpContext`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pomona/proxy test verifier.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `v1.ts` prompt and `verify-response.ts`**

In `v1.ts`, include instructions for evaluating flipped undersides for storage suitability when `targetRipeness` is `"in_2_3_days"` or `"later_this_week"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pomona/proxy test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/proxy/src/prompts/v1.ts apps/proxy/src/verifier/verify-response.ts apps/proxy/test/verifier.test.ts
git commit -m "feat(proxy): support targetRipeness in v1 prompt and verifier"
```

---

### Task 6: Full Regression Verification & Playwright E2E

**Files:**
- Modify: `apps/web/test/app-states.integration.test.tsx`
- Modify: `apps/web/e2e/pomona-journeys.spec.ts`

- [ ] **Step 1: Update integration test to exercise 3-way switch re-ranking**

Add test step in `apps/web/test/app-states.integration.test.tsx` clicking `target-tab-in_2_3_days` and verifying that `#1` shifts from melon c1 to melon c2.

- [ ] **Step 2: Run full unit test suite across monorepo**

Run: `pnpm test`
Expected: All test suites PASS.

- [ ] **Step 3: Run Playwright E2E journeys**

Run: `pnpm --filter @pomona/web test:e2e`
Expected: All 5 journeys PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/test/app-states.integration.test.tsx apps/web/e2e/pomona-journeys.spec.ts
git commit -m "test: verify 3-way ripeness switch across integration and Playwright journeys"
```
