# Compare & Inspect Unified Mode Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify produce scanning into two primary modes (**Compare** and **Inspect**) via an initial-screen mode switcher above the shutter button, an aligned bidirectional morphing reticle, unified CTAs, and strict error guardrails that prevent showing Inspect on blurred photos or empty scenes.

**Architecture:** 
1. Build a bidirectional geometric morphing reticle (`MorphingReticle`) with shared optical center (46% Y, 50% X) where 4 corner brackets smoothly expand, curve, and fuse into the 360° oval (and contract back).
2. Add a segmented mode switcher (`Compare` | `Inspect`) above the shutter button in `CameraViewfinder`.
3. Standardize all CTAs: `✦ Inspect Winner` on compare victory sheets, `✦ Inspect Closer` on `assessed_tie` / `insufficient_evidence` sheets, and strictly block Inspect on `no_produce` or `unclear_photo`.
4. Update EN and PT-BR locales with unified terminology.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tailwind/Inline CSS transitions.

## Global Constraints
- ESLint must report 0 errors across `apps/web` (`npx eslint apps/web/src`).
- 100% test pass rate across all packages (`pnpm -r test`).
- Adhere strictly to `AGENTS.md`: include runnable evals in `packages/evals` covering acceptance criteria and failure guardrails; zero local production deployments.
- Retain all existing test IDs (`camera-reticle-brackets`, `ds-oval`, `ds-oval-progress`, `shutter-button`, `ds-go-button`, `error-deep-scan-cta`, `ds-banner-cta`).

## Review Focus
1. **Empty scene / blur guardrail:** `no_produce` and `unclear_photo` must NEVER display an Inspect button.
2. **Bidirectional morph:** Switching Compare -> Inspect and Inspect -> Compare must run without layout jump, clipping, or visual glitch.
3. **Capture consistency:** In Inspect mode, square oval crop remains perfectly aligned with the morph reticle.
4. **Localization integrity:** Portuguese (`pt-BR`) and English (`en-GB`) keys must be 100% synchronized.
5. **Shutter semantics:** In Compare mode, shutter captures 1 frame; in Inspect mode, shutter triggers the 8-second rotation progress ring.

---

### Task 1: Unified Copy & Locale Updates (EN + PT-BR)
**Files:**
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/pt-BR.json`
- Modify: `eslint.config.mjs`
- Test: `packages/contract/test/localized-copy.test.ts`

- [ ] Add `viewfinder.modeCompare` ("Compare" / "Comparar") and `viewfinder.modeInspect` ("Inspect" / "Inspecionar").
- [ ] Add `deepScan.inspectWinner` ("Inspect Winner" / "Inspecionar vencedora") and `deepScan.inspectCloser` ("Inspect Closer" / "Inspecionar de perto").
- [ ] Update `deepScan.bannerTitle` ("Double check this fruit" / "Quer conferir esta fruta?") and `deepScan.bannerBody` ("Inspect all sides before you buy." / "Inspecione todos os lados antes de comprar.").
- [ ] Update `deepScan.start` ("Start fruit inspection" / "Iniciar inspeção da fruta").
- [ ] Update ESLint `words.exclude` in `eslint.config.mjs` for any new string literals.
- [ ] Run `pnpm --filter @pomona/contract test` and `npx eslint apps/web/src`.

---

### Task 2: Aligned Bidirectional Morphing Reticle (`MorphingReticle`)
**Files:**
- Create/Modify: `apps/web/src/components/CameraCaptureUi.tsx`
- Test: `apps/web/test/components/CameraViewfinder.test.tsx`

- [ ] Implement `MorphingReticle` in `CameraCaptureUi.tsx` centered at `top: 46%, left: 50%, transform: translate(-50%, -50%)`.
- [ ] In `"compare"` mode, size is 230×250px with 4 corner brackets (24×24px, 16px radius, #F5D547).
- [ ] In `"inspect"` mode, size expands to `min(72vw, 300px)` × `min(96vw, 400px)` with 4 quadrants expanding to 50% width and 50% height with 100% border-radius, fusing into the complete oval (rgba(251, 250, 246, 0.9)).
- [ ] Animate with cubic-bezier transitions (`transition: all 380ms cubic-bezier(0.34, 1.25, 0.64, 1)`).
- [ ] Provide backward-compatible test IDs: `data-testid="camera-reticle-brackets"` in compare mode, `data-testid="ds-oval"` in inspect mode.
- [ ] Run `pnpm --filter @pomona/web test test/components/CameraViewfinder.test.tsx`.

---

### Task 3: Mode Switcher & Integrated Viewfinder (`CameraViewfinder.tsx`)
**Files:**
- Modify: `apps/web/src/components/CameraViewfinder.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/test/components/CameraViewfinder.test.tsx`

- [ ] Add segmented mode toggle (`Compare` | `Inspect`) right above the shutter button.
- [ ] Wire active mode state (`mode: "compare" | "inspect"`).
- [ ] Floating prompt card smoothly transitions copy between compare ("Point at produce to compare") and inspect ("Show the stem side · Rotate slowly").
- [ ] Shutter button delegates to `onCapture` in compare mode, and `runDeepScanCapture` in inspect mode.
- [ ] Run `pnpm --filter @pomona/web test`.

---

### Task 4: Error Sheet Strict Guardrail & Result CTA Standardization
**Files:**
- Modify: `apps/web/src/components/ScanErrorStage.tsx`
- Modify: `apps/web/src/components/ResultStage.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/test/components/ScanErrorStage.test.tsx`
- Test: `apps/web/test/components/ResultStage.test.tsx`

- [ ] In `ScanErrorStage.tsx`: strictly disallow rendering Inspect button if status is `no_produce`, `unclear_photo`, `hardware_failure`, or `quota_exceeded`.
- [ ] In `App.tsx`: only pass `onDeepScan` when `status === "assessed_tie"` or `status === "insufficient_evidence"`.
- [ ] In `ScanErrorStage.tsx`: label button `✦ Inspect Closer` (`uiCopy("deepScan.inspectCloser")`).
- [ ] In `ResultStage.tsx`: update banner CTA to `✦ Inspect Winner` (`t("deepScan.inspectWinner")`).
- [ ] Run `pnpm --filter @pomona/web test test/components/ScanErrorStage.test.tsx test/components/ResultStage.test.tsx`.

---

### Task 5: Evals & Full Regression Verification
**Files:**
- Modify: `packages/evals/test/deep-scan-evals.test.ts`
- Test: Full workspace test suite

- [ ] Add runnable eval in `packages/evals/test/deep-scan-evals.test.ts` validating that `no_produce` and `unclear_photo` forbid Inspect CTAs, while `assessed_tie` and `insufficient_evidence` permit them.
- [ ] Run `pnpm -r test` across all 4 packages (100% pass).
- [ ] Run `npx eslint apps/web/src` (0 errors).
- [ ] Verify tunnel endpoint is returning 200.
