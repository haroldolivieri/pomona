# Parameterized Ripeness Target ("Ready Now" / "In 2–3 Days" / "Later This Week") — Design Spec

**Date:** 2026-10-17  
**Status:** Ready for User Approval (Builder Check Passed)

---

## 1. Intent & Why

Shoppers don't always buy fruit to eat the same day. A common real-world scenario (e.g., buying bananas or avocados when you already have ripe ones at home) is stocking up for **2–3 days from now** (`almost_ripe`) or **later in the week** (`underripe` / firm).

Currently, Pomona assumes the user always wants the most peak-ripe fruit ready to eat immediately (`ripeness: "ripe"`). This design introduces a **3-Way Ripeness Target Switch** on the Round 1 Result Screen (**State 4**) that defaults to the current behavior (**"Ready now"**) while letting the user switch to **"In 2–3 days"** or **"Later this week"** with zero network latency, and carries that chosen target into the **Round 2 & Round 3 Flip Workflow**.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
1. **Default Preserved:** Default target is `"ready_now"` (*Ready now · Peak ripe*), preserving 100% of current Round 1, Round 2, and Round 3 behavior when untouched.
2. **3-Way Switch on State 4 (`S4_InitialResult`):**
   - **Ready now** · *Peak ripe* (`"ready_now"`, targets `ripeness: "ripe"`)
   - **In 2–3 days** · *Almost ripe* (`"in_2_3_days"`, targets `ripeness: "almost_ripe"`)
   - **Later this week** · *Firm / Unripe* (`"later_this_week"`, targets `ripeness: "underripe"`)
3. **Zero-Latency Re-Ranking on State 4:** Tapping any of the 3 tabs on State 4 immediately re-computes `firstPick`, `runnerUp`, their suitability scores (`0.0–10.0`), headlines, storage timelines, and bounding box highlights on the frozen photo in memory—without making an extra API call or decrementing scan quota.
4. **Locked Goal Across Flip Steps (States 5A, 5B-1, 5B-2, 6, 7A, 7B):**
   - Once the user taps *"Compare with Runner-Up"* on State 4, the selected `targetRipeness` is locked for the flip workflow.
   - States 5A and 6 show the active goal chip (`🎯 Goal: In 2–3 days`) and crop the PiP reference thumbnail to the `firstPick` / `runnerUp` selected for that goal.
   - States 5B-1, 5B-2, 7A, and 7B replace the interactive 3-way switch with a locked banner (`🎯 Shopping for: In 2–3 days · Almost ripe`) so the single-fruit close-up verdict stays consistent.
   - Tapping `← Back` in State 5A returns to State 4 (`S4_InitialResult`), where the full-pile photo and interactive 3-way switch are available again.
5. **Goal-Aware AI Flip Grading (Round 2 & Round 3):**
   - `FollowUpContext` carries `targetRipeness` (`"ready_now" | "in_2_3_days" | "later_this_week"`, defaulting to `"ready_now"`).
   - When `targetRipeness` is `"in_2_3_days"` or `"later_this_week"`, the Round 2/3 prompt (`v1.ts`) instructs the vision model to grade the flipped underside for **suitability for that storage window** (penalizing soft bruises, stem rot, water-soaked patches, or undersides that are already over-mature).
6. **Offline Evals Coverage:** Add unit and ground-truth evaluation assertions in `@pomona/evals` testing all 3 target windows on Round 1 and goal-aware flip grading on Round 2/3.

### Non-Goals
- Adding pre-capture settings modals on State 1 (`CameraViewfinder`) or State 2 (`FreehandDrawStage`).
- Allowing the user to switch the 3-way target on State 5B or State 7 while viewing a close-up photo of a single flipped fruit.

### Anti-Goals
- **No extra API calls on tab switch:** Switching between the 3 tabs on State 4 must never trigger a network request or consume daily scan quota.
- **No confusing "low ripeness" scores on unripe winners:** When a user selects *"In 2–3 days"* or *"Later this week"*, a healthy, unblemished `almost_ripe` or `underripe` winner must display a high **suitability score** (e.g., `8.5–9.2 / 10` for that window), never a low `5.5 / 10` "unripe today" score.
- **No breaking changes to existing contract payloads:** `targetRipeness` in `FollowUpContextSchema` must default to `"ready_now"` so existing tests, mocks, and saved eval fixtures continue to validate without modification.

---

## 3. Contract & Shared Ranking Specification (`@pomona/contract`)

### 3.1 Schema Additions (`packages/contract/src/schema.ts`)
- **`TargetRipenessWindowSchema`:**
  ```ts
  export const TargetRipenessWindowSchema = z.enum([
    "ready_now",
    "in_2_3_days",
    "later_this_week",
  ]);
  export type TargetRipenessWindow = z.infer<typeof TargetRipenessWindowSchema>;
  ```
- **`FollowUpContextSchema`:**
  Add optional defaulted field:
  ```ts
  targetRipeness: TargetRipenessWindowSchema.optional().default("ready_now"),
  ```

### 3.2 Deterministic Shared Target Ranker (`packages/contract/src/ripeness-target.ts`)
To guarantee that client and server always agree on winner, runner-up, and suitability scores for any `TargetRipenessWindow`, `@pomona/contract` exports `resolveCandidatesForTarget(candidates: Candidate[], targetWindow: TargetRipenessWindow)`:

1. **When `targetWindow === "ready_now"` (Default):**
   - Sort candidates by `score` descending (100% identical to existing behavior).
   - `isExactMatch` is `true` if `winner.ripeness === "ripe"`.
2. **When `targetWindow === "in_2_3_days"` (Target: `almost_ripe`):**
   - **Stage Priority Order:** `almost_ripe` (tier 1) > `underripe` (tier 2) > `ripe` (tier 3) > `overripe` (tier 4).
   - **Suitability Score Mapping:**
     - If `c.ripeness === "almost_ripe"`: maps raw `score` (typically `7.0–8.5` on the ready-now scale) to a window suitability score in `8.4–9.4` (`round1Decimal(Math.min(9.4, Math.max(8.4, c.score + 0.8)))`).
     - If `c.ripeness === "underripe"`: `round1Decimal(Math.min(8.2, Math.max(7.2, c.score + 1.2)))`.
     - If `c.ripeness === "ripe"`: `round1Decimal(Math.min(7.9, Math.max(6.8, c.score - 1.2)))` (already ripe today, may overripen in 2–3 days).
     - If `c.ripeness === "overripe"`: `round1Decimal(Math.min(4.5, c.score))`.
   - Candidates are sorted by Stage Priority Tier first, then by raw `score` descending within the same tier.
   - `isExactMatch` is `true` if the top-ranked candidate has `ripeness === "almost_ripe"`.
3. **When `targetWindow === "later_this_week"` (Target: `underripe`):**
   - **Stage Priority Order:** `underripe` (tier 1) > `almost_ripe` (tier 2) > `ripe` (tier 3) > `overripe` (tier 4).
   - **Suitability Score Mapping:**
     - If `c.ripeness === "underripe"`: maps raw `score` (typically `5.5–7.2` on the ready-now scale) to a window suitability score in `8.3–9.2` (`round1Decimal(Math.min(9.2, Math.max(8.3, c.score + 2.2)))`).
     - If `c.ripeness === "almost_ripe"`: `round1Decimal(Math.min(8.0, Math.max(7.0, c.score - 0.2)))`.
     - If `c.ripeness === "ripe"`: `round1Decimal(Math.min(6.5, Math.max(5.5, c.score - 2.5)))`.
     - If `c.ripeness === "overripe"`: `round1Decimal(Math.min(3.5, c.score))`.
   - Candidates are sorted by Stage Priority Tier first, then by raw `score` descending within the same tier.
   - `isExactMatch` is `true` if the top-ranked candidate has `ripeness === "underripe"`.

4. **Return Shape of `resolveCandidatesForTarget`:**
   ```ts
   export interface TargetResolutionResult {
     targetWindow: TargetRipenessWindow;
     rankedCandidates: Candidate[]; // candidates with score updated to window suitability score
     winner: Candidate | null;
     runnerUp: Candidate | null;
     isExactMatch: boolean;
     eyebrow: string;
     headline: string;
     subtitle: string;
     eatWithinOverride: string | null; // e.g. "Ready in 2–3d · Keeps 5–7 days" when in_2_3_days
     followUpHintOverride: string | null;
   }
   ```
   - If `isExactMatch === false` (e.g., user tapped *"In 2–3 days"* on a crate where every single fruit is already `ripe`), `eyebrow` warns: `"CLOSEST MATCH · ALL ITEMS ALREADY RIPE"`, and `headline` adapts: `"Eat sooner (already ripe)."` so Pomona never misleads the shopper.

---

## 4. Client State Machine & UI Specification (`@pomona/web`)

### 4.1 State Machine (`apps/web/src/state/scan-state-machine.ts`)
- Add `targetRipeness: TargetRipenessWindow` to `ScanMachineState` (initial value: `"ready_now"`).
- Add event `{ type: "SET_TARGET_RIPENESS"; targetRipeness: TargetRipenessWindow }`:
  - Only valid when `state.phase === "S4_InitialResult"` and `state.round1Response` is present.
  - Calls `resolveCandidatesForTarget(state.round1Response.candidates, action.targetRipeness)` to update:
    - `state.targetRipeness`
    - `state.firstPick` (to `resolution.winner`)
    - `state.runnerUp` (to `resolution.runnerUp`)
- When `{ type: "COMPARE_WITH_RUNNER_UP" }` is dispatched on State 4:
  - Uses the currently active `state.firstPick` and `state.runnerUp` for the selected `state.targetRipeness`.
  - When constructing `ScanRequest` for Round 2 (`S5A_FlipRunnerUpCamera` $\rightarrow$ `S5A_AnalysingRunnerUp`) and Round 3 (`S6_FlipFirstPickCamera` $\rightarrow$ `S6_AnalysingFirstPick`), includes `targetRipeness: state.targetRipeness` inside `followUpContext`.
- When `{ type: "BACK" }` is dispatched from `S5A_FlipRunnerUpCamera`:
  - Returns to `S4_InitialResult` preserving `state.targetRipeness`, `state.firstPick`, and `state.runnerUp`.
- When `{ type: "RESET" }` is dispatched:
  - Resets `targetRipeness` back to `"ready_now"`.

### 4.2 Result Stage (`apps/web/src/components/ResultStage.tsx`)
- **In `S4_InitialResult`:**
  - Renders the 3-way segmented control (`data-testid="ripeness-target-switch"`) at the top of the bottom sheet directly below the grab handle:
    - `data-testid="target-tab-ready_now"`: **Ready now** / *Peak ripe*
    - `data-testid="target-tab-in_2_3_days"`: **In 2–3 days** / *Almost ripe*
    - `data-testid="target-tab-later_this_week"`: **Later this week** / *Firm / Unripe*
  - Bounding boxes on the frozen photo highlight `state.firstPick` (gold `#1` box with circular score badge) and `state.runnerUp` (blue dashed `Runner-Up` box), and dim any remaining candidates.
  - If `state.runnerUp` is null (single-fruit photo), the 3-way switch still shows how well that single fruit matches each window (or warns if it's already ripe when you click *"Later this week"*), with no Runner-Up CTA.
- **In `S5B1_RunnerUpBeaten`, `S5B2_RunnerUpTookLead`, `S7A_FirstPickWonFinal`, `S7B_FirstPickLostFinal`:**
  - Renders the locked goal banner (`data-testid="locked-ripeness-goal"`) showing `🎯 Shopping for: Ready now | In 2–3 days | Later this week` instead of the interactive 3-way switch.

### 4.3 Flip Camera Stage (`apps/web/src/components/FlipCameraStage.tsx`)
- Displays a compact goal pill (`data-testid="flip-goal-pill"`) in the top-right (`🎯 Goal: Ready now | In 2–3 days | Later this week`).
- Cropped PiP thumbnail automatically focuses on `state.runnerUp.box` (in 5A) or `state.firstPick.box` (in 6), which already reflects the user's chosen `targetRipeness`.
- Adapts the flip instruction subtitle when `targetRipeness !== "ready_now"` to mention checking the underside for hidden bruises or uneven ripening before storing.

---

## 5. Proxy Prompt & Verifier Specification (`@pomona/proxy`)

### 5.1 Prompt Builder (`apps/proxy/src/prompts/v1.ts`)
- **Round 1:** Unchanged—asks the model to detect all visible candidates in the focus area and assign each its `ripeness` (`underripe`, `almost_ripe`, `ripe`, `overripe`), `score` (`0.0–10.0`), `box`, and `traits`.
- **Round 2 & Round 3 (`followUpContext.targetRipeness`):**
  - When `targetRipeness === "ready_now"` (default): existing prompt instructions apply.
  - When `targetRipeness === "in_2_3_days"` or `"later_this_week"`: instructs the model that the shopper is selecting produce for **storage (`in_2_3_days` = almost ripe; `later_this_week` = firm/unripe)**. The model must grade the flipped underside on `0.0–10.0` for how well it suits that storage window:
    - High score (`> previousWinner.score`) if the underside is healthy, firm, unblemished, and matches the target ripeness stage.
    - Low score (`< previousWinner.score`) if the underside reveals soft water-soaked bruises, stem rot, mold, or is already over-mature for the requested storage window.

### 5.2 Verifier (`apps/proxy/src/verifier/verify-response.ts`)
- Round 2 & Round 3 winner comparison (`runnerUpCandidate.score > prevWinner.score` on Round 2; `firstPickCandidate.score >= prevWinner.score` on Round 3) continues to work deterministically because `prevWinner.score` in `followUpContext` already carries the target window suitability score from Round 1, and Round 2/3 grades the flipped candidate on that same `0.0–10.0` target suitability scale.

---

## 6. What Is Left to the Builder
- Exact CSS transitions on bounding box movement when toggling tabs on State 4.
- Exact i18n translation keys in `en-GB.json` / `en-US.json` for the 3 tab labels, eyebrows, and locked goal badge.
