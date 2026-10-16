# Pomona Produce Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Pomona, a mobile-first Progressive Web App and Cloudflare Worker vision proxy that lets grocery shoppers photograph a pile or single item of produce, optionally draw a freehand focus loop, and receive instant bounding-box recommendations, explicit before/after-cut storage advice, and a 3-round head-to-head flip comparison under a strict \$10/month AI budget.

**Architecture:** A `pnpm` TypeScript monorepo containing a shared Zod contract package (`packages/contract`), a Cloudflare Worker + Hono inference proxy (`apps/proxy`) with swappable Gemini/OpenAI vision adapters, a 2-stage semantic verifier, and KV-backed rate/budget controls, a React 19 + Vite + Tailwind PWA (`apps/web`) driven by a deterministic 10-state reducer (`ScanStateMachine`), and a `promptfoo` evaluation suite (`packages/evals`).

**Tech Stack:** TypeScript 5.8, React 19, Vite 6, Tailwind CSS 4, Zod, Hono, Cloudflare Workers (`wrangler` v4 / `Miniflare`), Vercel AI SDK (`ai`, `@ai-sdk/google`, `@ai-sdk/openai`), `i18next` + `react-i18next`, PostHog + Sentry (behind `TelemetryProvider`), Vitest + Testing Library, Playwright + `@axe-core/playwright`, `promptfoo`.

**Spec:** `docs/superpowers/specs/2026-10-16-pomona-produce-picker-design.md`

## Global Constraints

- **Node / Package Manager:** `pnpm` workspaces (`packages/*`, `apps/*`), TypeScript strict mode (`"strict": true`).
- **Single Source of Truth Contract:** `packages/contract` defines `ScanRequestSchema` and `ScanResponseSchema` in Zod; neither frontend nor backend may redefine contract types.
- **Bounding Box Convention:** `[ymin, xmin, ymax, xmax]` integers normalized `0..1000`.
- **Freehand Focus Polygon:** `S2_DrawFocusArea` traces a closed freehand loop (`PointSchema = [x, y]` normalized `0..1000`), masks outside pixels (`rgba(0,0,0,0.65)`), crops to the padded polygon bounding box before upload, and the backend verifier strips any candidate whose box centre lies outside `focusPolygon` (with 5% tolerance).
- **Image Compression Ceiling:** Client resizes the longest edge to `<= 768px` and encodes as `image/webp` (`0.75` quality, fallback `image/jpeg` at `0.78`).
- **Parameterized Copy Rule:** No UI component or prompt output may hardcode `"melon"` or `"field spot"`; all copy is parameterized via `produce.displayName`, `followUp.flipHeadline`, and `followUp.instruction`, and checked by the semantic verifier.
- **Explicit Storage Split:** Every `status === "ok"` response provides `afterPurchase.eatWithinLabel`, `afterPurchase.storage.beforeCut`, and `afterPurchase.storage.afterCut` rendered as 3 distinct cards (Layout B).
- **Single Bottom CTA on Result Sheets:** `S4_InitialResult` renders a single full-width button (`Compare with Runner-Up` when `followUp !== null`, or `Scan Another` when `followUp === null`); `S5B2_RunnerUpTookLead` renders a single full-width button (`Flip 1st Pick for Final Check`).
- **All 10 States Required & Tested:** `S1_LiveCamera`, `S2_DrawFocusArea`, `S3_Analysing`, `S4_InitialResult`, `S5A_FlipRunnerUpCamera`, `S5B1_RunnerUpBeaten`, `S5B2_RunnerUpTookLead`, `S6_FlipFirstPickCamera`, `S7A_FirstPickWonFinal`, `S7B_FirstPickLostFinal` (plus non-happy-path statuses `no_produce`, `unclear_photo`, `multiple_types`, `analysis_failed`, `rate_limited`).
- **Hard \$10/Month Budget Ceiling:** Worker KV tracks monthly spend (`spend:YYYY-MM`); downgrades from `gemini-2.5-flash` to `gemini-2.5-flash-lite` at `>= $9.50` (`950_000` micro-cents) and blocks LLM calls at `>= $10.00` (`1_000_000` micro-cents). Daily quotas: `10` scans/day/device, `20` scans/day/IP. `analysis_failed` never decrements a caller's daily quota.
- **Themes, i18n, a11y, o11y:** Both Light (`Crisp Daylight`, `#FBFAF6`) and Dark (`Deep Forest`, `#111D15`) themes supported; all UI copy loaded from `apps/web/src/i18n/locales/en.json`; WCAG 2.2 AA compliance verified by `@axe-core/playwright`.

## Review Focus

- **Crop-to-Full-Frame Coordinate Remapping:** When a user draws a `focusPolygon` in `S2_DrawFocusArea` and the client uploads a cropped image, the AI returns candidate bounding boxes in `0..1000` coordinates *relative to the cropped image*; if the client does not remap those boxes back to the full Round 1 frame coordinates, the yellow Winner box in `S4_InitialResult` will point at the wrong fruit. Tested in Task 6 (`remapBoxFromCropToFrame`).
- **Self-drawn Open or Self-Intersecting Finger Stroke:** A shopper lifting their finger after a tiny tap (<3 points or `<5%` area) must not produce a zero-area crop or crash canvas clipping. Tested in Task 6 (`normalizeFreehandPolygon` rejects `<5%` area and disables `Analyse Drawn Area`).
- **Tie Score on Round 2 vs Round 3:** In Round 2, a tie (`runnerUp.score === winner.score`) means the Runner-Up did *not* beat the 1st Pick (`S5B1_RunnerUpBeaten`); in Round 3, a tie (`firstPick.score === newWinner.score`) means the 1st Pick reclaims the win (`S7A_FirstPickWonFinal`). Tested in Task 3 and Task 7.
- **Provider Error / Verifier Exhaustion Must Not Burn User Quota:** When the LLM returns malformed output twice or throws a 5xx error, the proxy returns `status: "analysis_failed"` and the caller's daily device/IP scan counter remains unchanged. Tested in Task 4 and Task 5.
- **Camera Permission Denied / Desktop Browser Fallback:** If `navigator.mediaDevices.getUserMedia` rejects with `NotAllowedError` or `NotFoundError`, `S1_LiveCamera` must let the shopper pick/capture a photo via an `<input type="file" accept="image/*" capture="environment">` fallback rather than stranding them on a black screen. Tested in Task 8.

---

## File Structure Map

```text
pomona/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── contract/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                 # Exports all Zod schemas, TS types, JSON schema helper
│   │   │   └── schemas.ts               # ScanRequestSchema, ScanResponseSchema, CandidateMemorySchema
│   │   └── test/
│   │       └── schemas.test.ts
│   └── evals/
│       ├── package.json
│       ├── promptfooconfig.yaml         # Prompt evaluation suite against contract & verifier
│       └── assertions/
│           └── verify-contract.ts
├── apps/
│   ├── proxy/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── wrangler.jsonc
│   │   ├── .dev.vars.example
│   │   ├── src/
│   │   │   ├── index.ts                 # Hono app entry (/api/v1/scan, /api/v1/quota)
│   │   │   ├── types.ts                 # Worker Env bindings & context types
│   │   │   ├── prompts/
│   │   │   │   ├── index.ts             # Prompt registry & version selector
│   │   │   │   └── v1.ts                # Parameterized multi-round produce system & user prompts
│   │   │   ├── adapters/
│   │   │   │   ├── types.ts             # VisionProviderAdapter interface
│   │   │   │   ├── gemini.ts            # Gemini 2.5 Flash / Flash-Lite adapter
│   │   │   │   └── openai.ts            # GPT-4o-mini adapter
│   │   │   ├── verifier/
│   │   │   │   ├── geometry.ts          # Point-in-polygon & box validation
│   │   │   │   └── verify-response.ts   # 2-stage syntactic + semantic verifier & round resolver
│   │   │   └── quota/
│   │   │       ├── token.ts             # HMAC-SHA256 device token sign/verify
│   │   │       └── budget.ts            # KV daily device/IP limits & $9.50/$10.00 circuit breaker
│   │   └── test/
│   │       ├── verifier.test.ts
│   │       ├── adapters.test.ts
│   │       ├── budget.test.ts
│   │       └── routes.integration.test.ts
│   └── web/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── playwright.config.ts
│       ├── index.html
│       ├── public/
│       │   └── manifest.json
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── styles/
│       │   │   └── index.css            # Crisp Daylight & Deep Forest CSS variables + Tailwind
│       │   ├── i18n/
│       │   │   ├── index.ts
│       │   │   └── locales/
│       │   │       └── en.json
│       │   ├── lib/
│       │   │   ├── image-pipeline.ts    # Freehand polygon simplify, mask, crop, <=768px compress, box remap
│       │   │   ├── spatial-a11y.ts      # Screen-reader grid labels ("middle row, centre")
│       │   │   ├── api-client.ts        # Typed fetch client for /api/v1/scan & /api/v1/quota
│       │   │   └── telemetry.ts         # TelemetryProvider interface + PostHog/Sentry/Noop adapters
│       │   ├── state/
│       │   │   └── scan-state-machine.ts # Pure 10-state reducer & in-memory session model
│       │   └── components/
│       │       ├── CameraViewfinder.tsx # S1 Live Camera + file-input fallback
│       │       ├── FreehandDrawStage.tsx # S2 Freehand SVG draw loop & outside mask
│       │       ├── AnalysingStage.tsx   # S3 Shimmer scan beam over focus region
│       │       ├── ResultStage.tsx      # S4, S5B-1, S5B-2, S7A, S7B bottom sheet + bounding boxes
│       │       └── FlipCameraStage.tsx  # S5A & S6 3D flipping fruit overlay + PIP thumbnail
│       ├── test/
│       │   ├── image-pipeline.test.ts
│       │   ├── scan-state-machine.test.ts
│       │   └── app-states.integration.test.tsx
│       └── e2e/
│           └── pomona-journeys.spec.ts
└── scripts/
    └── setup-cloudflare.sh              # Idempotent agent CLI setup for Cloudflare KV, secrets, deploy
```

---

### Task 1: Monorepo Scaffolding & Shared Contract Package (`packages/contract`)

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `packages/contract/package.json`
- Create: `packages/contract/tsconfig.json`
- Create: `packages/contract/src/schemas.ts`
- Create: `packages/contract/src/index.ts`
- Test: `packages/contract/test/schemas.test.ts`

**Interfaces:**
- Consumes: none (foundational package)
- Produces:
  - `ScanRequestSchema`, `ScanResponseSchema`, `ScanResponseModelSchema`, `CandidateMemorySchema`, `BoundingBoxSchema`, `PointSchema`, `StorageStageSchema`
  - Types: `ScanRequest`, `ScanResponse`, `ScanStatus`, `Candidate`, `CandidateMemory`, `BoundingBox`, `Point`, `StorageStage`, `FollowUp`, `AfterPurchase`

- [ ] **Step 1: Create root workspace configs (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`) and `packages/contract/package.json`**

Configure `pnpm-workspace.yaml` with `packages: ["packages/*", "apps/*"]`. Root `package.json` includes scripts `"test": "pnpm -r test"`, `"build": "pnpm -r build"`, `"typecheck": "pnpm -r typecheck"`, and devDependencies `typescript`, `vitest`. `packages/contract/package.json` declares `"name": "@pomona/contract"`, dependency `"zod": "^3.24.2"`.

- [ ] **Step 2: Write the failing contract unit tests in `packages/contract/test/schemas.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { ScanRequestSchema, ScanResponseSchema } from "../src/index";

describe("ScanRequestSchema & ScanResponseSchema", () => {
  it("accepts a valid Round 1 ScanRequest with a freehand focusPolygon", () => {
    const parsed = ScanRequestSchema.safeParse({
      schemaVersion: "1.0",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      round: 1,
      locale: "en-GB",
      imageBase64: "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=",
      imageMimeType: "image/webp",
      focusPolygon: [[120, 140], [880, 140], [880, 820], [120, 820]],
      followUpContext: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a focusPolygon with fewer than 3 points or out-of-range coordinates", () => {
    const tooFew = ScanRequestSchema.safeParse({
      schemaVersion: "1.0",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      round: 1,
      imageBase64: "abc",
      imageMimeType: "image/webp",
      focusPolygon: [[10, 20], [30, 40]],
      followUpContext: null,
    });
    expect(tooFew.success).toBe(false);
  });

  it("accepts a complete Round 1 ScanResponse with explicit beforeCut and afterCut storage", () => {
    const res = ScanResponseSchema.safeParse({
      schemaVersion: "1.0",
      promptVersion: "v1",
      modelId: "gemini-2.5-flash",
      round: 1,
      status: "ok",
      message: null,
      produce: { type: "watermelon", displayName: "Watermelon", variety: null },
      candidates: [
        {
          id: "c1",
          box: [385, 370, 625, 655],
          score: 8.6,
          ripeness: "ripe",
          traits: ["Yellow field spot", "Matte rind", "Even form"],
          flipSummary: null,
        },
        {
          id: "c2",
          box: [380, 645, 590, 925],
          score: 8.1,
          ripeness: "almost_ripe",
          traits: ["Matte rind", "Symmetrical"],
          flipSummary: null,
        },
      ],
      verdict: {
        winnerId: "c1",
        runnerUpId: "c2",
        confidence: "high",
        headline: "Buy it.",
      },
      followUp: {
        targetCandidateId: "c2",
        targetRole: "runner_up",
        bannerText: "The blue-marked Watermelon could be sweeter. Flip it and snap.",
        flipHeadline: "Flip the Watermelon over",
        instruction: "Turn the blue-marked Watermelon to show its underside so we can check the field spot.",
      },
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 3, max: 5 },
        eatWithinLabel: "3–5 days",
        storage: {
          beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep whole at room temperature" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap tightly and eat within 3 days" },
        },
      },
    });
    expect(res.success).toBe(true);
  });
});
```

- [ ] **Step 3: Install dependencies and run test to verify it fails**

Run: `pnpm install && pnpm --filter @pomona/contract test`
Expected: FAIL with module `../src/index` not found.

- [ ] **Step 4: Implement `packages/contract/src/schemas.ts` and `packages/contract/src/index.ts`**

Implement the exact schemas from Spec Section 6.1 (`PointSchema`, `BoundingBoxSchema`, `CandidateMemorySchema`, `StorageStageSchema`, `ScanRequestSchema`, `ScanResponseSchema`, plus `ScanResponseModelSchema` which omits server-injected fields `schemaVersion`, `promptVersion`, `modelId`, `round` for LLM `generateObject` calls, and adds `"rate_limited"` to `ScanResponseSchema`'s `status` enum for quota responses).

- [ ] **Step 5: Run contract tests to verify they pass**

Run: `pnpm --filter @pomona/contract test`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json packages/contract
git commit -m "feat(contract): add shared Zod scan request and response schemas"
```

---

### Task 2: Semantic Verifier, Polygon Containment & Multi-Round Score Resolution (`apps/proxy/src/verifier`)

**Files:**
- Create: `apps/proxy/package.json`
- Create: `apps/proxy/tsconfig.json`
- Create: `apps/proxy/src/verifier/geometry.ts`
- Create: `apps/proxy/src/verifier/verify-response.ts`
- Test: `apps/proxy/test/verifier.test.ts`

**Interfaces:**
- Consumes: `@pomona/contract` (`ScanRequest`, `ScanResponse`, `Point`, `BoundingBox`)
- Produces:
  - `isPointInPolygon(point: Point, polygon: Point[], tolerance?: number): boolean` in `apps/proxy/src/verifier/geometry.ts`
  - `isValidBoundingBox(box: BoundingBox, minSize?: number): boolean` in `apps/proxy/src/verifier/geometry.ts`
  - `verifyAndResolveScanResponse(rawModelOutput: unknown, ctx: { request: ScanRequest; promptVersion: string; modelId: string }): { ok: true; response: ScanResponse } | { ok: false; errors: string[] }` in `apps/proxy/src/verifier/verify-response.ts`

- [ ] **Step 1: Write the failing verifier unit tests in `apps/proxy/test/verifier.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { isPointInPolygon, isValidBoundingBox } from "../src/verifier/geometry";
import { verifyAndResolveScanResponse } from "../src/verifier/verify-response";

describe("geometry & semantic verifier", () => {
  const square: [number, number][] = [[200, 200], [800, 200], [800, 800], [200, 800]];

  it("checks point-in-polygon with tolerance and validates box dimensions", () => {
    expect(isPointInPolygon([500, 500], square)).toBe(true);
    expect(isPointInPolygon([50, 50], square)).toBe(false);
    expect(isValidBoundingBox([100, 100, 400, 500])).toBe(true);
    expect(isValidBoundingBox([400, 100, 100, 500])).toBe(false);
    expect(isValidBoundingBox([100, 100, 110, 115])).toBe(false); // < 20 minSize
  });

  it("strips candidates outside focusPolygon and promotes highest remaining candidate to winnerId", () => {
    const res = verifyAndResolveScanResponse(
      {
        status: "ok",
        message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        candidates: [
          { id: "outside", box: [10, 10, 90, 90], score: 9.5, ripeness: "ripe", traits: ["Matte rind"], flipSummary: null },
          { id: "inside1", box: [300, 300, 600, 600], score: 8.6, ripeness: "ripe", traits: ["Yellow field spot"], flipSummary: null },
          { id: "inside2", box: [400, 400, 700, 700], score: 8.1, ripeness: "almost_ripe", traits: ["Even form"], flipSummary: null },
        ],
        verdict: { winnerId: "outside", runnerUpId: "inside1", confidence: "high", headline: "Buy it." },
        followUp: {
          targetCandidateId: "inside2",
          targetRole: "runner_up",
          bannerText: "Flip the Runner-Up Watermelon.",
          flipHeadline: "Flip the Watermelon over",
          instruction: "Show the underside of the Watermelon.",
        },
        afterPurchase: {
          readyInDays: { min: 0, max: 0 },
          eatWithinDays: { min: 3, max: 5 },
          eatWithinLabel: "3–5 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
          },
        },
      },
      {
        promptVersion: "v1",
        modelId: "gemini-2.5-flash",
        request: {
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 1,
          locale: "en-GB",
          imageBase64: "abc",
          imageMimeType: "image/webp",
          focusPolygon: square,
          followUpContext: null,
        },
      }
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.response.candidates.map((c) => c.id)).toEqual(["inside1", "inside2"]);
      expect(res.response.verdict?.winnerId).toBe("inside1");
      expect(res.response.verdict?.runnerUpId).toBe("inside2");
    }
  });

  it("resolves Round 2 when Runner-Up beats 1st Pick (9.0 vs 8.6) by promoting Runner-Up and offering Round 3 final check on 1st Pick", () => {
    const res = verifyAndResolveScanResponse(
      {
        status: "ok",
        message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        candidates: [
          { id: "c2", box: [200, 200, 800, 800], score: 9.0, ripeness: "ripe", traits: ["Deep creamy spot"], flipSummary: "deep creamy spot" },
        ],
        verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high", headline: "Buy this one." },
        followUp: {
          targetCandidateId: "c1",
          targetRole: "first_pick",
          bannerText: "1st Pick (8.6) was only graded from the top. Flip it too for a fair final check, or take this one now.",
          flipHeadline: "Flip your 1st pick over",
          instruction: "Show the other side of the Watermelon.",
        },
        afterPurchase: {
          readyInDays: { min: 0, max: 0 },
          eatWithinDays: { min: 3, max: 5 },
          eatWithinLabel: "3–5 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
          },
        },
      },
      {
        promptVersion: "v1",
        modelId: "gemini-2.5-flash",
        request: {
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 2,
          locale: "en-GB",
          imageBase64: "abc",
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: {
            produceType: "watermelon",
            produceDisplayName: "Watermelon",
            targetCandidateId: "c2",
            targetRole: "runner_up",
            requestedInstruction: "Show the underside",
            previousWinner: { id: "c1", role: "first_pick", score: 8.6, ripeness: "ripe", traits: ["Yellow field spot"], anglesInspected: 1 },
            previousRunnerUp: { id: "c2", role: "runner_up", score: 8.1, ripeness: "almost_ripe", traits: ["Matte rind"], anglesInspected: 1 },
          },
        },
      }
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.response.verdict?.winnerId).toBe("c2");
      expect(res.response.followUp?.targetRole).toBe("first_pick");
      expect(res.response.followUp?.targetCandidateId).toBe("c1");
    }
  });

  it("resolves Round 2 when Runner-Up loses or ties (7.2 <= 8.6) by keeping 1st Pick as winner and setting followUp to null", () => {
    const res = verifyAndResolveScanResponse(
      {
        status: "ok",
        message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        candidates: [
          { id: "c2", box: [200, 200, 800, 800], score: 7.2, ripeness: "almost_ripe", traits: ["Pale spot"], flipSummary: "pale underside" },
        ],
        verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st pick." },
        followUp: null,
        afterPurchase: {
          readyInDays: { min: 0, max: 0 },
          eatWithinDays: { min: 3, max: 5 },
          eatWithinLabel: "3–5 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
          },
        },
      },
      {
        promptVersion: "v1",
        modelId: "gemini-2.5-flash",
        request: {
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 2,
          locale: "en-GB",
          imageBase64: "abc",
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: {
            produceType: "watermelon",
            produceDisplayName: "Watermelon",
            targetCandidateId: "c2",
            targetRole: "runner_up",
            requestedInstruction: "Show the underside",
            previousWinner: { id: "c1", role: "first_pick", score: 8.6, ripeness: "ripe", traits: ["Yellow field spot"], anglesInspected: 1 },
            previousRunnerUp: { id: "c2", role: "runner_up", score: 8.1, ripeness: "almost_ripe", traits: ["Matte rind"], anglesInspected: 1 },
          },
        },
      }
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.response.verdict?.winnerId).toBe("c1");
      expect(res.response.followUp).toBeNull();
    }
  });

  it("rejects followUp copy that mentions a conflicting produce name (e.g. 'melon' when produce is 'Avocado')", () => {
    const res = verifyAndResolveScanResponse(
      {
        status: "ok",
        message: null,
        produce: { type: "avocado", displayName: "Avocado", variety: "Hass" },
        candidates: [
          { id: "c1", box: [200, 200, 500, 500], score: 8.5, ripeness: "ripe", traits: ["Dark pebbled skin"], flipSummary: null },
          { id: "c2", box: [500, 500, 800, 800], score: 8.0, ripeness: "almost_ripe", traits: ["Intact stem"], flipSummary: null },
        ],
        verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "medium", headline: "Buy it." },
        followUp: {
          targetCandidateId: "c2",
          targetRole: "runner_up",
          bannerText: "Turn the blue-marked melon to check the field spot.",
          flipHeadline: "Flip the melon over",
          instruction: "Turn the blue-marked melon to show its underside.",
        },
        afterPurchase: {
          readyInDays: { min: 0, max: 1 },
          eatWithinDays: { min: 2, max: 4 },
          eatWithinLabel: "2–4 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
          },
        },
      },
      {
        promptVersion: "v1",
        modelId: "gemini-2.5-flash",
        request: {
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 1,
          locale: "en-GB",
          imageBase64: "abc",
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: null,
        },
      }
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.join(" ")).toContain("produce");
    }
  });
});
```

- [ ] **Step 2: Run verifier tests to verify they fail**

Run: `pnpm --filter @pomona/proxy test`
Expected: FAIL with module `../src/verifier/geometry` not found.

- [ ] **Step 3: Implement `apps/proxy/src/verifier/geometry.ts` and `apps/proxy/src/verifier/verify-response.ts`**

Use ray-casting + segment distance (`tolerance = 50` on the `0..1000` scale, i.e. 5%) in `isPointInPolygon`. In `verifyAndResolveScanResponse`:
1. Parse with `ScanResponseModelSchema`.
2. Filter `candidates` through `isValidBoundingBox` and (on Round 1 with `focusPolygon`) `isPointInPolygon`.
3. Enforce Round 1 / Round 2 / Round 3 winner and `followUp` invariants from Spec Section 6.3 (including forcing `followUp = null` on Round 3, and rejecting mismatched fruit names in `followUp`).

- [ ] **Step 4: Run verifier tests to verify they pass**

Run: `pnpm --filter @pomona/proxy test`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/proxy
git commit -m "feat(proxy): add semantic verifier, polygon containment, and multi-round resolver"
```

---

### Task 3: Server-Side Prompt Registry & Swappable Vision Adapters (`GeminiVisionAdapter` & `OpenAIVisionAdapter`)

**Files:**
- Create: `apps/proxy/src/prompts/v1.ts`
- Create: `apps/proxy/src/prompts/index.ts`
- Create: `apps/proxy/src/adapters/types.ts`
- Create: `apps/proxy/src/adapters/gemini.ts`
- Create: `apps/proxy/src/adapters/openai.ts`
- Test: `apps/proxy/test/adapters.test.ts`

**Interfaces:**
- Consumes: `@pomona/contract` (`ScanRequest`, `ScanResponse`), `verifyAndResolveScanResponse` from Task 2
- Produces:
  - `PromptConfig`, `getPromptConfig(version?: string): PromptConfig` in `apps/proxy/src/prompts/index.ts`
  - `VisionProviderAdapter`, `AdapterInput`, `AdapterRawResult`, `TokenUsage` in `apps/proxy/src/adapters/types.ts`
  - `createGeminiVisionAdapter(options: { apiKey: string; modelId?: string; baseURL?: string; generateObjectFn?: typeof generateObject }): VisionProviderAdapter` in `apps/proxy/src/adapters/gemini.ts`
  - `createOpenAIVisionAdapter(options: { apiKey: string; modelId?: string; baseURL?: string; generateObjectFn?: typeof generateObject }): VisionProviderAdapter` in `apps/proxy/src/adapters/openai.ts`
  - `runVerifiedVisionScan(request: ScanRequest, adapter: VisionProviderAdapter, promptConfig: PromptConfig): Promise<{ response: ScanResponse; usage: TokenUsage; attempts: number }>` in `apps/proxy/src/adapters/types.ts`

- [ ] **Step 1: Write the failing prompt & adapter tests in `apps/proxy/test/adapters.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { getPromptConfig } from "../src/prompts";
import { createGeminiVisionAdapter } from "../src/adapters/gemini";
import { createOpenAIVisionAdapter } from "../src/adapters/openai";
import { runVerifiedVisionScan } from "../src/adapters/types";

describe("Prompt registry & vision adapters", () => {
  const sampleRequest = {
    schemaVersion: "1.0" as const,
    sessionId: "550e8400-e29b-41d4-a716-446655440000",
    round: 1 as const,
    locale: "en-GB",
    imageBase64: "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=",
    imageMimeType: "image/webp" as const,
    focusPolygon: [[100, 100], [900, 100], [900, 900], [100, 900]] as [number, number][],
    followUpContext: null,
  };

  it("builds a parameterized v1 prompt that includes focusPolygon coordinates and forbids hardcoded fruit names", () => {
    const prompt = getPromptConfig("v1");
    const sys = prompt.buildSystemPrompt(sampleRequest);
    expect(sys).toContain("[ymin, xmin, ymax, xmax]");
    expect(sys).toContain("focusPolygon");
    expect(sys).toContain("beforeCut");
    expect(sys).toContain("afterCut");
  });

  it("normalizes Gemini and OpenAI outputs identically and retries once on verification failure", async () => {
    const validModelPayload = {
      status: "ok",
      message: null,
      produce: { type: "pineapple", displayName: "Pineapple", variety: null },
      candidates: [
        { id: "c1", box: [250, 300, 750, 700], score: 8.8, ripeness: "ripe", traits: ["Golden base", "Fragrant crown"], flipSummary: null },
      ],
      verdict: { winnerId: "c1", runnerUpId: null, confidence: "high", headline: "Buy it." },
      followUp: null,
      afterPurchase: {
        readyInDays: { min: 0, max: 0 },
        eatWithinDays: { min: 3, max: 4 },
        eatWithinLabel: "3–4 days",
        storage: {
          beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep out of direct sun" },
          afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · sealed", tip: "Store in airtight container" },
        },
      },
    };

    const mockGenerate = vi
      .fn()
      .mockResolvedValueOnce({
        object: { ...validModelPayload, candidates: [] }, // invalid on attempt 1: status ok with 0 candidates
        usage: { promptTokens: 400, completionTokens: 200, totalTokens: 600 },
      })
      .mockResolvedValueOnce({
        object: validModelPayload,
        usage: { promptTokens: 450, completionTokens: 220, totalTokens: 670 },
      });

    const gemini = createGeminiVisionAdapter({ apiKey: "test-key", generateObjectFn: mockGenerate as any });
    const openai = createOpenAIVisionAdapter({ apiKey: "test-key", generateObjectFn: mockGenerate as any });
    expect(gemini.modelId).toBe("gemini-2.5-flash");
    expect(openai.modelId).toBe("gpt-4o-mini");

    const result = await runVerifiedVisionScan(sampleRequest, gemini, getPromptConfig("v1"));
    expect(result.attempts).toBe(2);
    expect(result.response.status).toBe("ok");
    expect(result.response.produce?.displayName).toBe("Pineapple");
    expect(result.usage.totalTokens).toBe(1270);
  });

  it("returns a contract-valid analysis_failed response when both initial and repair attempts fail", async () => {
    const alwaysBad = vi.fn().mockResolvedValue({
      object: { status: "ok", message: null, produce: null, candidates: [], verdict: null, followUp: null, afterPurchase: null },
      usage: { promptTokens: 300, completionTokens: 100, totalTokens: 400 },
    });
    const gemini = createGeminiVisionAdapter({ apiKey: "test-key", generateObjectFn: alwaysBad as any });
    const result = await runVerifiedVisionScan(sampleRequest, gemini, getPromptConfig("v1"));
    expect(result.attempts).toBe(2);
    expect(result.response.status).toBe("analysis_failed");
  });
});
```

- [ ] **Step 2: Run adapter tests to verify they fail**

Run: `pnpm --filter @pomona/proxy test`
Expected: FAIL with module `../src/prompts` not found.

- [ ] **Step 3: Install Vercel AI SDK packages and implement `prompts/` and `adapters/`**

Add `"ai"`, `"@ai-sdk/google"`, `"@ai-sdk/openai"` to `apps/proxy/package.json`. Implement `v1.ts` (parameterized produce grading prompt covering Round 1 pile/single, `focusPolygon` constraint, Round 2 Runner-Up close-up, and Round 3 1st-Pick final check), `gemini.ts` (setting `thinkingConfig: { thinkingBudget: 0 }`), `openai.ts`, and `runVerifiedVisionScan` (1 repair retry passing verifier errors back to the model, falling back to `status: "analysis_failed"`).

- [ ] **Step 4: Run adapter tests to verify they pass**

Run: `pnpm --filter @pomona/proxy test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml apps/proxy
git commit -m "feat(proxy): add versioned prompt registry and Gemini/OpenAI vision adapters"
```

---

### Task 4: Device Token Signing, Daily Quotas & \$10/Month Budget Circuit Breaker (`apps/proxy/src/quota`)

**Files:**
- Create: `apps/proxy/src/quota/token.ts`
- Create: `apps/proxy/src/quota/budget.ts`
- Test: `apps/proxy/test/budget.test.ts`

**Interfaces:**
- Consumes: `TokenUsage` from `apps/proxy/src/adapters/types.ts`
- Produces:
  - `signDeviceToken(deviceId: string, secret: string): Promise<string>` and `verifyDeviceToken(token: string, secret: string): Promise<string | null>` in `apps/proxy/src/quota/token.ts`
  - `QuotaStore` interface (in-memory + Cloudflare `KVNamespace` adapter) in `apps/proxy/src/quota/budget.ts`
  - `checkQuotaAndSelectModel(store: QuotaStore, params: { deviceId: string; ip: string; now?: Date; defaultModel?: string }): Promise<{ allowed: true; modelId: string; remainingDeviceScans: number; monthlySpendMicroCents: number } | { allowed: false; reason: "device_daily_limit" | "ip_daily_limit" | "monthly_budget_cap"; message: string; remainingDeviceScans: number }>`
  - `recordScanOutcome(store: QuotaStore, params: { deviceId: string; ip: string; modelId: string; usage: TokenUsage; status: ScanStatus; now?: Date }): Promise<{ remainingDeviceScans: number; monthlySpendMicroCents: number }>`

- [ ] **Step 1: Write the failing quota & budget unit tests in `apps/proxy/test/budget.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { signDeviceToken, verifyDeviceToken } from "../src/quota/token";
import { createInMemoryQuotaStore, checkQuotaAndSelectModel, recordScanOutcome } from "../src/quota/budget";

describe("HMAC device token & $10/month budget circuit breaker", () => {
  it("signs and verifies a tamper-proof HMAC-SHA256 device token", async () => {
    const token = await signDeviceToken("dev-123", "super-secret");
    expect(await verifyDeviceToken(token, "super-secret")).toBe("dev-123");
    expect(await verifyDeviceToken(token + "x", "super-secret")).toBeNull();
  });

  it("enforces 10 scans/day per device and does not decrement quota on analysis_failed", async () => {
    const store = createInMemoryQuotaStore();
    const now = new Date("2026-10-16T12:00:00Z");

    // Failed analysis does NOT burn quota
    await recordScanOutcome(store, {
      deviceId: "dev-1",
      ip: "1.2.3.4",
      modelId: "gemini-2.5-flash",
      usage: { promptTokens: 400, completionTokens: 100, totalTokens: 500 },
      status: "analysis_failed",
      now,
    });
    const afterFail = await checkQuotaAndSelectModel(store, { deviceId: "dev-1", ip: "1.2.3.4", now });
    expect(afterFail.allowed).toBe(true);
    if (afterFail.allowed) expect(afterFail.remainingDeviceScans).toBe(10);

    // 10 successful scans burn the daily device quota
    for (let i = 0; i < 10; i++) {
      await recordScanOutcome(store, {
        deviceId: "dev-1",
        ip: "1.2.3.4",
        modelId: "gemini-2.5-flash",
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
        status: "ok",
        now,
      });
    }
    const eleventh = await checkQuotaAndSelectModel(store, { deviceId: "dev-1", ip: "1.2.3.4", now });
    expect(eleventh).toEqual({
      allowed: false,
      reason: "device_daily_limit",
      message: "You've used all 10 free scans for today. Come back tomorrow!",
      remainingDeviceScans: 0,
    });
  });

  it("downgrades model to gemini-2.5-flash-lite at $9.50 and trips the hard circuit breaker at $10.00", async () => {
    const store = createInMemoryQuotaStore();
    const now = new Date("2026-10-16T12:00:00Z");
    await store.setMonthlySpendMicroCents("2026-10", 960_000); // $9.60

    const softCap = await checkQuotaAndSelectModel(store, { deviceId: "dev-2", ip: "5.6.7.8", now });
    expect(softCap.allowed).toBe(true);
    if (softCap.allowed) expect(softCap.modelId).toBe("gemini-2.5-flash-lite");

    await store.setMonthlySpendMicroCents("2026-10", 1_000_000); // $10.00 hard cap
    const hardCap = await checkQuotaAndSelectModel(store, { deviceId: "dev-2", ip: "5.6.7.8", now });
    expect(hardCap.allowed).toBe(false);
    if (!hardCap.allowed) expect(hardCap.reason).toBe("monthly_budget_cap");
  });
});
```

- [ ] **Step 2: Run budget tests to verify they fail**

Run: `pnpm --filter @pomona/proxy test`
Expected: FAIL with module `../src/quota/token` not found.

- [ ] **Step 3: Implement `apps/proxy/src/quota/token.ts` and `apps/proxy/src/quota/budget.ts`**

Use Web Crypto `crypto.subtle.sign("HMAC", ...)` so it runs identically in Cloudflare Workers and Node/Vitest. Implement `createKvQuotaStore(kv: KVNamespace)` and `createInMemoryQuotaStore()`, pricing calculator (`1 USD = 100_000 micro-cents`, soft cap `950_000`, hard cap `1_000_000`), and daily device (`10`) / IP (`20`) counters.

- [ ] **Step 4: Run budget tests to verify they pass**

Run: `pnpm --filter @pomona/proxy test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/proxy
git commit -m "feat(proxy): add HMAC device token, daily quotas, and $10/month circuit breaker"
```

---

### Task 5: Cloudflare Worker Hono Routes & Integration Tests (`apps/proxy/src/index.ts`)

**Files:**
- Create: `apps/proxy/src/types.ts`
- Create: `apps/proxy/src/index.ts`
- Create: `apps/proxy/wrangler.jsonc`
- Create: `apps/proxy/.dev.vars.example`
- Test: `apps/proxy/test/routes.integration.test.ts`

**Interfaces:**
- Consumes: `@pomona/contract`, `prompts/`, `adapters/`, `verifier/`, `quota/` from Tasks 1–4
- Produces:
  - `createProxyApp(deps?: { adapterFactory?: (modelId: string, env: Env) => VisionProviderAdapter; quotaStore?: QuotaStore }): Hono<{ Bindings: Env }>` in `apps/proxy/src/index.ts`
  - Endpoints: `GET /api/v1/quota` and `POST /api/v1/scan`

- [ ] **Step 1: Write the failing Worker route integration tests in `apps/proxy/test/routes.integration.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { createProxyApp } from "../src/index";
import { createInMemoryQuotaStore } from "../src/quota/budget";

describe("Hono Worker routes (/api/v1/quota & /api/v1/scan)", () => {
  const env = {
    GEMINI_API_KEY: "test-gemini-key",
    OPENAI_API_KEY: "test-openai-key",
    COOKIE_SIGNING_SECRET: "test-signing-secret-32-bytes-long",
    ACTIVE_PROMPT_VERSION: "v1",
    ACTIVE_PROVIDER: "gemini",
  };

  it("GET /api/v1/quota issues an X-Pomona-Device-Token and returns 10 remaining scans", async () => {
    const app = createProxyApp({ quotaStore: createInMemoryQuotaStore() });
    const res = await app.request("/api/v1/quota", { method: "GET" }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Pomona-Device-Token")).toBeTruthy();
    const body = await res.json();
    expect(body).toMatchObject({ remainingDeviceScans: 10, budgetOpen: true });
  });

  it("POST /api/v1/scan executes the vision adapter, verifies the contract, and decrements quota to 9", async () => {
    const store = createInMemoryQuotaStore();
    const app = createProxyApp({
      quotaStore: store,
      adapterFactory: (modelId) => ({
        providerId: "gemini",
        modelId,
        analyzeProduce: async () => ({
          rawOutput: {
            status: "ok",
            message: null,
            produce: { type: "watermelon", displayName: "Watermelon", variety: null },
            candidates: [
              { id: "c1", box: [385, 370, 625, 655], score: 8.6, ripeness: "ripe", traits: ["Yellow field spot", "Matte rind"], flipSummary: null },
            ],
            verdict: { winnerId: "c1", runnerUpId: null, confidence: "high", headline: "Buy it." },
            followUp: null,
            afterPurchase: {
              readyInDays: { min: 0, max: 0 },
              eatWithinDays: { min: 3, max: 5 },
              eatWithinLabel: "3–5 days",
              storage: {
                beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep whole" },
                afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
              },
            },
          },
          usage: { promptTokens: 450, completionTokens: 250, totalTokens: 700 },
        }),
      }),
    });

    const scanRes = await app.request(
      "/api/v1/scan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 1,
          locale: "en-GB",
          imageBase64: "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=",
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: null,
        }),
      },
      env
    );
    expect(scanRes.status).toBe(200);
    const json = await scanRes.json();
    expect(json.status).toBe("ok");
    expect(json.promptVersion).toBe("v1");
    expect(scanRes.headers.get("X-Pomona-Remaining-Scans")).toBe("9");
  });

  it("converts upstream provider HTTP 429 errors into a graceful status: 'rate_limited' contract response", async () => {
    const app = createProxyApp({
      quotaStore: createInMemoryQuotaStore(),
      adapterFactory: (modelId) => ({
        providerId: "gemini",
        modelId,
        analyzeProduce: async () => {
          const err: any = new Error("Resource has been exhausted (429)");
          err.statusCode = 429;
          throw err;
        },
      }),
    });

    const res = await app.request(
      "/api/v1/scan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "1.0",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          round: 1,
          locale: "en-GB",
          imageBase64: "abc",
          imageMimeType: "image/webp",
          focusPolygon: null,
          followUpContext: null,
        }),
      },
      env
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("rate_limited");
  });
});
```

- [ ] **Step 2: Run route integration tests to verify they fail**

Run: `pnpm --filter @pomona/proxy test`
Expected: FAIL with module `../src/index` not found.

- [ ] **Step 3: Install `hono` and implement `apps/proxy/src/index.ts`, `wrangler.jsonc`, and `.dev.vars.example`**

Add `"hono"` to `apps/proxy/package.json`. Implement `createProxyApp` with CORS, 500 KB body limit, device token extraction/signing (`X-Pomona-Device-Token` header or cookie), quota check, provider/gateway 429 catch -> `status: "rate_limited"`, and `X-Pomona-Remaining-Scans` response header. Configure `apps/proxy/wrangler.jsonc` with `kv_namespaces: [{ "binding": "POMONA_QUOTA_KV", ... }]` and static assets binding `"assets": { "directory": "../web/dist" }`.

- [ ] **Step 4: Run proxy tests to verify they pass**

Run: `pnpm --filter @pomona/proxy test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml apps/proxy
git commit -m "feat(proxy): add Hono Cloudflare Worker routes and integration tests"
```

---

### Task 6: Client Image Pipeline, Freehand Polygon Simplification, Crop/Mask & Box Remapping (`apps/web/src/lib`)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/lib/image-pipeline.ts`
- Create: `apps/web/src/lib/spatial-a11y.ts`
- Test: `apps/web/test/image-pipeline.test.ts`

**Interfaces:**
- Consumes: `@pomona/contract` (`Point`, `BoundingBox`)
- Produces:
  - `CropRect = { x: number; y: number; width: number; height: number }` (normalized `0..1000` in original frame space)
  - `normalizeFreehandPolygon(points: Point[], minAreaRatio?: number): { valid: boolean; polygon: Point[]; cropRect: CropRect; polygonInCrop: Point[]; areaRatio: number }` in `apps/web/src/lib/image-pipeline.ts`
  - `remapBoxFromCropToFrame(boxInCrop: BoundingBox, cropRect: CropRect): BoundingBox` in `apps/web/src/lib/image-pipeline.ts`
  - `computeScaledDimensions(width: number, height: number, maxEdge?: number): { width: number; height: number }` in `apps/web/src/lib/image-pipeline.ts`
  - `prepareScanImageFromCanvas(sourceCanvas: HTMLCanvasElement, focusPolygon: Point[] | null, maxEdge?: number): Promise<{ imageBase64: string; imageMimeType: "image/webp" | "image/jpeg"; focusPolygonInUpload: Point[] | null; cropRect: CropRect }>`
  - `describeBoxPosition(box: BoundingBox, roleLabel: string, score: number): string` in `apps/web/src/lib/spatial-a11y.ts`

- [ ] **Step 1: Write the failing image pipeline & spatial a11y unit tests in `apps/web/test/image-pipeline.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  normalizeFreehandPolygon,
  remapBoxFromCropToFrame,
  computeScaledDimensions,
} from "../src/lib/image-pipeline";
import { describeBoxPosition } from "../src/lib/spatial-a11y";

describe("image-pipeline & spatial-a11y", () => {
  it("simplifies a valid freehand loop, computes padded cropRect, and remaps polygon into crop space", () => {
    const rawLoop: [number, number][] = [
      [200, 200],
      [500, 205],
      [800, 200],
      [800, 700],
      [200, 700],
    ];
    const res = normalizeFreehandPolygon(rawLoop);
    expect(res.valid).toBe(true);
    expect(res.areaRatio).toBeGreaterThan(0.25);
    expect(res.cropRect.x).toBeLessThanOrEqual(200);
    expect(res.cropRect.y).toBeLessThanOrEqual(200);
    expect(res.polygonInCrop.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects tiny accidental taps (<5% frame area) so Analyse Drawn Area stays disabled", () => {
    const tinyTap: [number, number][] = [
      [500, 500],
      [510, 500],
      [505, 510],
    ];
    const res = normalizeFreehandPolygon(tinyTap);
    expect(res.valid).toBe(false);
  });

  it("remaps bounding boxes from cropped upload space back to full-frame 0..1000 coordinates", () => {
    const cropRect = { x: 200, y: 100, width: 500, height: 600 };
    // A box covering the middle 50% of the cropped image:
    const boxInCrop: [number, number, number, number] = [250, 250, 750, 750];
    const fullBox = remapBoxFromCropToFrame(boxInCrop, cropRect);
    expect(fullBox).toEqual([250, 325, 550, 575]);
  });

  it("scales dimensions so the longest edge never exceeds 768px", () => {
    expect(computeScaledDimensions(1920, 1440, 768)).toEqual({ width: 768, height: 576 });
    expect(computeScaledDimensions(1200, 1600, 768)).toEqual({ width: 576, height: 768 });
    expect(computeScaledDimensions(600, 400, 768)).toEqual({ width: 600, height: 400 });
  });

  it("generates screen-reader spatial descriptions for bounding boxes", () => {
    expect(describeBoxPosition([385, 370, 625, 655], "Winner", 8.6)).toBe(
      "Winner: middle row, centre, score 8.6 out of 10"
    );
    expect(describeBoxPosition([50, 700, 250, 950], "Runner-Up", 8.1)).toBe(
      "Runner-Up: top row, right, score 8.1 out of 10"
    );
  });
});
```

- [ ] **Step 2: Run web unit tests to verify they fail**

Run: `pnpm --filter @pomona/web test`
Expected: FAIL with module `../src/lib/image-pipeline` not found.

- [ ] **Step 3: Implement `apps/web/src/lib/image-pipeline.ts` and `apps/web/src/lib/spatial-a11y.ts`**

Implement Ramer–Douglas–Peucker simplification (max 32 vertices), shoelace polygon area ratio (`>= 0.05`), padded bounding box computation (`10%` padding clamped to `0..1000`), `remapBoxFromCropToFrame`, `computeScaledDimensions` (`maxEdge = 768`), offscreen canvas masking (`rgba(0,0,0,0.65)` outside the freehand path via `evenodd` clip) + WebP/JPEG export, and `describeBoxPosition` (`top/middle/bottom row`, `left/centre/right`).

- [ ] **Step 4: Run web unit tests to verify they pass**

Run: `pnpm --filter @pomona/web test`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml apps/web
git commit -m "feat(web): add freehand polygon math, <=768px image compression, and spatial a11y"
```

---

### Task 7: 10-State Scan State Machine & In-Memory Score Comparison (`apps/web/src/state/scan-state-machine.ts`)

**Files:**
- Create: `apps/web/src/state/scan-state-machine.ts`
- Test: `apps/web/test/scan-state-machine.test.ts`

**Interfaces:**
- Consumes: `@pomona/contract` (`ScanResponse`, `Candidate`, `Point`), `CropRect`, `remapBoxFromCropToFrame` from Task 6
- Produces:
  - `ScanPhase = "S1_LiveCamera" | "S2_DrawFocusArea" | "S3_Analysing" | "S4_InitialResult" | "S5A_FlipRunnerUpCamera" | "S5B1_RunnerUpBeaten" | "S5B2_RunnerUpTookLead" | "S6_FlipFirstPickCamera" | "S7A_FirstPickWonFinal" | "S7B_FirstPickLostFinal"`
  - `ScanMachineState`, `ScanMachineAction`, `initialScanMachineState`, `scanMachineReducer(state: ScanMachineState, action: ScanMachineAction): ScanMachineState`
  - `buildFollowUpRequestContext(state: ScanMachineState): ScanRequest["followUpContext"]`

- [ ] **Step 1: Write exhaustive unit tests for all 10 states in `apps/web/test/scan-state-machine.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  initialScanMachineState,
  scanMachineReducer,
  buildFollowUpRequestContext,
} from "../src/state/scan-state-machine";
import type { ScanResponse } from "@pomona/contract";

const makeRound1Response = (): ScanResponse => ({
  schemaVersion: "1.0",
  promptVersion: "v1",
  modelId: "gemini-2.5-flash",
  round: 1,
  status: "ok",
  message: null,
  produce: { type: "watermelon", displayName: "Watermelon", variety: null },
  candidates: [
    { id: "c1", box: [385, 370, 625, 655], score: 8.6, ripeness: "ripe", traits: ["Yellow field spot", "Matte rind"], flipSummary: null },
    { id: "c2", box: [380, 645, 590, 925], score: 8.1, ripeness: "almost_ripe", traits: ["Matte rind"], flipSummary: null },
  ],
  verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy it." },
  followUp: {
    targetCandidateId: "c2",
    targetRole: "runner_up",
    bannerText: "The blue-marked Watermelon could be sweeter. Flip it and snap.",
    flipHeadline: "Flip the Watermelon over",
    instruction: "Turn the blue-marked Watermelon to show its underside.",
  },
  afterPurchase: {
    readyInDays: { min: 0, max: 0 },
    eatWithinDays: { min: 3, max: 5 },
    eatWithinLabel: "3–5 days",
    storage: {
      beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
      afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
    },
  },
});

describe("10-state ScanStateMachine", () => {
  it("transitions S1 -> S2 -> S3 -> S4 -> S5A -> S5B1_RunnerUpBeaten when Runner-Up scores <= 1st Pick (7.2 vs 8.6)", () => {
    let s = initialScanMachineState();
    expect(s.phase).toBe("S1_LiveCamera");

    s = scanMachineReducer(s, { type: "FRAME_CAPTURED", photoDataUrl: "data:image/webp;base64,r1" });
    expect(s.phase).toBe("S2_DrawFocusArea");

    s = scanMachineReducer(s, {
      type: "START_ANALYSE",
      focusPolygon: [[100, 100], [900, 100], [900, 900], [100, 900]],
      cropRect: { x: 0, y: 0, width: 1000, height: 1000 },
    });
    expect(s.phase).toBe("S3_Analysing");

    s = scanMachineReducer(s, { type: "SCAN_SUCCEEDED", response: makeRound1Response() });
    expect(s.phase).toBe("S4_InitialResult");
    expect(s.firstPick?.score).toBe(8.6);
    expect(s.runnerUp?.score).toBe(8.1);

    s = scanMachineReducer(s, { type: "COMPARE_WITH_RUNNER_UP" });
    expect(s.phase).toBe("S5A_FlipRunnerUpCamera");
    expect(buildFollowUpRequestContext(s)?.targetRole).toBe("runner_up");

    s = scanMachineReducer(s, { type: "FOLLOW_UP_CAPTURED", photoDataUrl: "data:image/webp;base64,r2" });
    expect(s.phase).toBe("S3_Analysing");

    const r2Beaten: ScanResponse = {
      ...makeRound1Response(),
      round: 2,
      candidates: [{ id: "c2", box: [200, 200, 800, 800], score: 7.2, ripeness: "almost_ripe", traits: ["Pale spot"], flipSummary: "pale underside" }],
      verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st pick." },
      followUp: null,
    };
    s = scanMachineReducer(s, { type: "SCAN_SUCCEEDED", response: r2Beaten });
    expect(s.phase).toBe("S5B1_RunnerUpBeaten");
    expect(s.firstPick?.score).toBe(8.6);
    expect(s.runnerUp?.score).toBe(7.2);
  });

  it("transitions S5A -> S5B2_RunnerUpTookLead (9.0 vs 8.6) -> S6 -> S7A_FirstPickWonFinal (9.3 vs 9.0) and S7B_FirstPickLostFinal (8.4 vs 9.0)", () => {
    let s = initialScanMachineState();
    s = scanMachineReducer(s, { type: "FRAME_CAPTURED", photoDataUrl: "data:image/webp;base64,r1" });
    s = scanMachineReducer(s, { type: "START_ANALYSE", focusPolygon: null, cropRect: { x: 0, y: 0, width: 1000, height: 1000 } });
    s = scanMachineReducer(s, { type: "SCAN_SUCCEEDED", response: makeRound1Response() });
    s = scanMachineReducer(s, { type: "COMPARE_WITH_RUNNER_UP" });
    s = scanMachineReducer(s, { type: "FOLLOW_UP_CAPTURED", photoDataUrl: "data:image/webp;base64,r2" });

    const r2Lead: ScanResponse = {
      ...makeRound1Response(),
      round: 2,
      candidates: [{ id: "c2", box: [200, 200, 800, 800], score: 9.0, ripeness: "ripe", traits: ["Deep creamy spot", "Rich webbing"], flipSummary: "deep creamy spot" }],
      verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high", headline: "Buy this one." },
      followUp: {
        targetCandidateId: "c1",
        targetRole: "first_pick",
        bannerText: "1st Pick (8.6) was only graded from the top.",
        flipHeadline: "Flip your 1st pick over",
        instruction: "Turn the yellow-marked Watermelon to show its underside.",
      },
    };
    s = scanMachineReducer(s, { type: "SCAN_SUCCEEDED", response: r2Lead });
    expect(s.phase).toBe("S5B2_RunnerUpTookLead");
    expect(s.runnerUp?.score).toBe(9.0);
    expect(s.firstPick?.score).toBe(8.6);

    s = scanMachineReducer(s, { type: "START_FINAL_CHECK_ON_FIRST_PICK" });
    expect(s.phase).toBe("S6_FlipFirstPickCamera");
    expect(buildFollowUpRequestContext(s)?.targetRole).toBe("first_pick");

    const sCapturing = scanMachineReducer(s, { type: "FOLLOW_UP_CAPTURED", photoDataUrl: "data:image/webp;base64,r3" });
    expect(sCapturing.phase).toBe("S3_Analysing");

    // Branch A: 1st Pick reclaims win (9.3 >= 9.0)
    const r3Won: ScanResponse = {
      ...makeRound1Response(),
      round: 3,
      candidates: [{ id: "c1", box: [200, 200, 800, 800], score: 9.3, ripeness: "ripe", traits: ["Golden field spot", "Heavy webbing"], flipSummary: "golden spot" }],
      verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st pick." },
      followUp: null,
    };
    const s7A = scanMachineReducer(sCapturing, { type: "SCAN_SUCCEEDED", response: r3Won });
    expect(s7A.phase).toBe("S7A_FirstPickWonFinal");
    expect(s7A.firstPick?.score).toBe(9.3);

    // Branch B: 1st Pick loses final check (8.4 < 9.0)
    const r3Lost: ScanResponse = {
      ...makeRound1Response(),
      round: 3,
      candidates: [{ id: "c1", box: [200, 200, 800, 800], score: 8.4, ripeness: "ripe", traits: ["Small spot"], flipSummary: "smaller spot" }],
      verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high", headline: "Buy the new winner." },
      followUp: null,
    };
    const s7B = scanMachineReducer(sCapturing, { type: "SCAN_SUCCEEDED", response: r3Lost });
    expect(s7B.phase).toBe("S7B_FirstPickLostFinal");
    expect(s7B.runnerUp?.score).toBe(9.0);
    expect(s7B.firstPick?.score).toBe(8.4);
  });
});
```

- [ ] **Step 2: Run state machine tests to verify they fail**

Run: `pnpm --filter @pomona/web test`
Expected: FAIL with module `../src/state/scan-state-machine` not found.

- [ ] **Step 3: Implement `apps/web/src/state/scan-state-machine.ts`**

Maintain in-memory `firstPick` (preserving its Round 1 bounding box on `round1PhotoDataUrl`) and `runnerUp` (preserving its Round 1 bounding box on `round1PhotoDataUrl`) across all 3 rounds, remapping Round 1 candidate boxes from `cropRect` to full-frame coordinates on receipt, and resolving `S4_InitialResult`, `S5B1_RunnerUpBeaten`, `S5B2_RunnerUpTookLead`, `S7A_FirstPickWonFinal`, and `S7B_FirstPickLostFinal` deterministically.

- [ ] **Step 4: Run state machine tests to verify they pass**

Run: `pnpm --filter @pomona/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/state/scan-state-machine.ts apps/web/test/scan-state-machine.test.ts
git commit -m "feat(web): implement 10-state scan reducer and in-memory multi-round score tracking"
```

---

### Task 8: UI Components, Light/Dark Themes, i18n, Telemetry & Component Integration Tests (`apps/web/src`)

**Files:**
- Create: `apps/web/index.html`
- Create: `apps/web/public/manifest.json`
- Create: `apps/web/src/styles/index.css`
- Create: `apps/web/src/i18n/locales/en.json`
- Create: `apps/web/src/i18n/index.ts`
- Create: `apps/web/src/lib/telemetry.ts`
- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/components/CameraViewfinder.tsx`
- Create: `apps/web/src/components/FreehandDrawStage.tsx`
- Create: `apps/web/src/components/AnalysingStage.tsx`
- Create: `apps/web/src/components/ResultStage.tsx`
- Create: `apps/web/src/components/FlipCameraStage.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/main.tsx`
- Test: `apps/web/test/app-states.integration.test.tsx`

**Interfaces:**
- Consumes: `ScanStateMachine` from Task 7, `image-pipeline` & `spatial-a11y` from Task 6, `@pomona/contract` from Task 1
- Produces:
  - `<PomonaApp apiClient={...} telemetry={...} initialState={...} />` in `apps/web/src/App.tsx`
  - `TelemetryProvider` interface + `createNoopTelemetry()` / `createPostHogSentryTelemetry()` in `apps/web/src/lib/telemetry.ts`
  - `PomonaApiClient` interface + `createFetchApiClient(baseUrl?: string)` in `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Write the failing component integration tests across all 10 states in `apps/web/test/app-states.integration.test.tsx`**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { PomonaApp } from "../src/App";
import { createNoopTelemetry } from "../src/lib/telemetry";
import "../src/i18n";

describe("<PomonaApp /> integration across all 10 states, themes, and parameterized copy", () => {
  it("renders S4_InitialResult with explicit Before cut & After cut storage cards and single 'Compare with Runner-Up' CTA, then transitions through S5A -> S5B-2 -> S6 -> S7A", async () => {
    const mockScan = vi
      .fn()
      // Round 1: Avocado crate (verifies parameterized produce copy, not watermelon)
      .mockResolvedValueOnce({
        remainingScans: 9,
        response: {
          schemaVersion: "1.0",
          promptVersion: "v1",
          modelId: "gemini-2.5-flash",
          round: 1,
          status: "ok",
          message: null,
          produce: { type: "avocado", displayName: "Hass Avocado", variety: "Hass" },
          candidates: [
            { id: "c1", box: [385, 370, 625, 655], score: 8.6, ripeness: "ripe", traits: ["Dark pebbled skin", "Intact stem"], flipSummary: null },
            { id: "c2", box: [380, 645, 590, 925], score: 8.1, ripeness: "almost_ripe", traits: ["Even shape"], flipSummary: null },
          ],
          verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy it." },
          followUp: {
            targetCandidateId: "c2",
            targetRole: "runner_up",
            bannerText: "The blue-marked Hass Avocado could be better. Flip it and snap.",
            flipHeadline: "Flip the Hass Avocado over",
            instruction: "Turn the blue-marked Hass Avocado to show its stem base.",
          },
          afterPurchase: {
            readyInDays: { min: 0, max: 0 },
            eatWithinDays: { min: 2, max: 3 },
            eatWithinLabel: "2–3 days",
            storage: {
              beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Keep at room temperature" },
              afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Spritz with lime and wrap tightly" },
            },
          },
        },
      })
      // Round 2: Runner-Up takes the lead (9.0 vs 8.6) -> S5B2_RunnerUpTookLead
      .mockResolvedValueOnce({
        remainingScans: 8,
        response: {
          schemaVersion: "1.0",
          promptVersion: "v1",
          modelId: "gemini-2.5-flash",
          round: 2,
          status: "ok",
          message: null,
          produce: { type: "avocado", displayName: "Hass Avocado", variety: "Hass" },
          candidates: [
            { id: "c2", box: [200, 200, 800, 800], score: 9.0, ripeness: "ripe", traits: ["Green stem base", "No bruising"], flipSummary: "clean green stem base" },
          ],
          verdict: { winnerId: "c2", runnerUpId: "c1", confidence: "high", headline: "Buy this one." },
          followUp: {
            targetCandidateId: "c1",
            targetRole: "first_pick",
            bannerText: "1st Pick (8.6) was only graded from the top. Flip it too for a fair final check, or take this one now.",
            flipHeadline: "Flip your 1st pick over",
            instruction: "Turn the yellow-marked Hass Avocado to show its stem base.",
          },
          afterPurchase: {
            readyInDays: { min: 0, max: 0 },
            eatWithinDays: { min: 2, max: 3 },
            eatWithinLabel: "2–3 days",
            storage: {
              beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
              afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
            },
          },
        },
      })
      // Round 3: 1st Pick wins final flip (9.3 vs 9.0) -> S7A_FirstPickWonFinal
      .mockResolvedValueOnce({
        remainingScans: 7,
        response: {
          schemaVersion: "1.0",
          promptVersion: "v1",
          modelId: "gemini-2.5-flash",
          round: 3,
          status: "ok",
          message: null,
          produce: { type: "avocado", displayName: "Hass Avocado", variety: "Hass" },
          candidates: [
            { id: "c1", box: [200, 200, 800, 800], score: 9.3, ripeness: "ripe", traits: ["Bright green stem", "Uniform give"], flipSummary: "bright green stem base" },
          ],
          verdict: { winnerId: "c1", runnerUpId: "c2", confidence: "high", headline: "Buy your 1st pick." },
          followUp: null,
          afterPurchase: {
            readyInDays: { min: 0, max: 0 },
            eatWithinDays: { min: 2, max: 3 },
            eatWithinLabel: "2–3 days",
            storage: {
              beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
              afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
            },
          },
        },
      });

    const apiClient = {
      getQuota: vi.fn().mockResolvedValue({ remainingDeviceScans: 10, budgetOpen: true }),
      submitScan: mockScan,
    };

    render(<PomonaApp apiClient={apiClient} telemetry={createNoopTelemetry()} />);

    // State 1 -> Snap photo -> State 2
    fireEvent.click(screen.getByTestId("shutter-button"));
    expect(await screen.findByTestId("stage-S2_DrawFocusArea")).toBeTruthy();

    // State 2 -> Whole Photo -> State 3 -> State 4
    fireEvent.click(screen.getByTestId("whole-photo-button"));
    expect(await screen.findByTestId("stage-S4_InitialResult")).toBeTruthy();
    expect(screen.getByText("Buy it.")).toBeTruthy();
    expect(screen.getByText("Counter · whole")).toBeTruthy();
    expect(screen.getByText("Fridge · wrapped")).toBeTruthy();
    expect(screen.getByTestId("cta-compare-runner-up").textContent).toBe("Compare with Runner-Up");

    // State 4 -> Compare with Runner-Up -> State 5A (parameterized Hass Avocado copy)
    fireEvent.click(screen.getByTestId("cta-compare-runner-up"));
    expect(await screen.findByTestId("stage-S5A_FlipRunnerUpCamera")).toBeTruthy();
    expect(screen.getByText("Flip the Hass Avocado over")).toBeTruthy();
    expect(screen.getByText(/Winner to beat: 8\.6 \/ 10/)).toBeTruthy();

    // State 5A -> Snap -> State 5B-2 (Runner-Up Took Lead)
    fireEvent.click(screen.getByTestId("flip-shutter-button"));
    expect(await screen.findByTestId("stage-S5B2_RunnerUpTookLead")).toBeTruthy();
    expect(screen.getByText(/Beats 1st Pick \(9\.0 vs 8\.6\)/i)).toBeTruthy();
    expect(screen.getByTestId("cta-final-check-first-pick").textContent).toBe("Flip 1st Pick for Final Check");

    // State 5B-2 -> Flip 1st Pick -> State 6 -> Snap -> State 7A (1st Pick Reclaims Win)
    fireEvent.click(screen.getByTestId("cta-final-check-first-pick"));
    expect(await screen.findByTestId("stage-S6_FlipFirstPickCamera")).toBeTruthy();
    fireEvent.click(screen.getByTestId("flip-shutter-button"));
    expect(await screen.findByTestId("stage-S7A_FirstPickWonFinal")).toBeTruthy();
    expect(screen.getByText(/1st Pick Reclaims the Win \(9\.3 vs 9\.0\)/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run component integration tests to verify they fail**

Run: `pnpm --filter @pomona/web test`
Expected: FAIL with module `../src/App` not found.

- [ ] **Step 3: Implement `styles/index.css`, `i18n/`, `telemetry.ts`, `api-client.ts`, and the 5 stage components + `App.tsx`**

Use the exact design tokens from Spec Section 4.2 (`--surface-sheet: #FBFAF6` in Light `Crisp Daylight`, `#111D15` in Dark `Deep Forest`, `--accent-winner: #F5D547`, `--cta-primary: #2F5D34` / `#3B7A42`), `Fraunces` + `Inter` fonts, SVG `fill-rule="evenodd"` freehand draw mask in `FreehandDrawStage.tsx`, 3D flipping fruit animation + PIP reference thumbnail in `FlipCameraStage.tsx`, and screen-reader `aria-live="polite"` spatial box descriptions in `ResultStage.tsx`. Add `data-testid="stage-${phase}"` to each stage root for deterministic integration and E2E testing, and include an `<input type="file" accept="image/*" capture="environment">` fallback in `CameraViewfinder.tsx`.

- [ ] **Step 4: Run all web unit and integration tests to verify they pass**

Run: `pnpm --filter @pomona/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml apps/web
git commit -m "feat(web): build all 10 UI states, Light/Dark themes, i18n, and integration tests"
```

---

### Task 9: Playwright End-to-End (E2E) Browser Suite & WCAG 2.2 AA Accessibility Audit (`apps/web/e2e`)

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/pomona-journeys.spec.ts`

**Interfaces:**
- Consumes: `<PomonaApp />` served by Vite (`pnpm --filter @pomona/web preview` or `dev`)
- Produces: Automated Playwright E2E test suite verifying all 10 states across the 5 journeys in Spec Section 9.3 + `@axe-core/playwright` zero-violation checks in Light and Dark themes

- [ ] **Step 1: Write the Playwright E2E test suite in `apps/web/e2e/pomona-journeys.spec.ts` and `apps/web/playwright.config.ts`**

Configure `playwright.config.ts` with mobile viewport (`{ width: 393, height: 852 }`) and Chromium launch args `["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]`. Write the 5 journeys in `apps/web/e2e/pomona-journeys.spec.ts`:
1. **Journey 1:** Whole-Photo Quick Pick (`S1_LiveCamera` → `S2_DrawFocusArea` → `S3_Analysing` → `S4_InitialResult`).
2. **Journey 2:** Freehand Drawn Focus Area + Runner-Up Beaten (`S1` → `S2` [pointer drag loop] → `S3` → `S4` → `S5A_FlipRunnerUpCamera` → `S5B1_RunnerUpBeaten`).
3. **Journey 3:** Runner-Up Takes Lead + 1st Pick Wins Final Flip (`S1` → `S2` → `S3` → `S4` → `S5A` → `S5B2_RunnerUpTookLead` → `S6_FlipFirstPickCamera` → `S7A_FirstPickWonFinal`).
4. **Journey 4:** Runner-Up Takes Lead + 1st Pick Loses Final Flip (`...` → `S5B2_RunnerUpTookLead` → `S6_FlipFirstPickCamera` → `S7B_FirstPickLostFinal`).
5. **Journey 5:** Light (`Crisp Daylight`) and Dark (`Deep Forest`) theme toggle + `@axe-core/playwright` WCAG 2.2 AA scan across each state.

- [ ] **Step 2: Run Playwright E2E tests and verify all 5 journeys pass**

Run: `pnpm --filter @pomona/web test:e2e`
Expected: PASS (5 passed, 0 axe violations).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml apps/web/playwright.config.ts apps/web/e2e
git commit -m "test(e2e): add Playwright E2E journeys and axe WCAG 2.2 AA checks across all 10 states"
```

---

### Task 10: Promptfoo Evaluation Suite & Automated Cloudflare CLI Provisioning Script (`packages/evals` & `scripts/setup-cloudflare.sh`)

**Files:**
- Create: `packages/evals/package.json`
- Create: `packages/evals/promptfooconfig.yaml`
- Create: `packages/evals/assertions/verify-contract.ts`
- Create: `packages/evals/test/eval-assertions.test.ts`
- Create: `scripts/setup-cloudflare.sh`

**Interfaces:**
- Consumes: `@pomona/contract`, `verifyAndResolveScanResponse` from `@pomona/proxy`
- Produces:
  - `verifyPromptfooOutput(output: string, context: { vars: Record<string, any> }): { pass: boolean; score: number; reason: string }` in `packages/evals/assertions/verify-contract.ts`
  - Executable `scripts/setup-cloudflare.sh` (`chmod +x`) for one-command agent-driven Cloudflare KV, secret, and Worker deployment

- [ ] **Step 1: Write the failing eval assertion test in `packages/evals/test/eval-assertions.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { verifyPromptfooOutput } from "../assertions/verify-contract";

describe("promptfoo contract & focus-polygon assertion", () => {
  it("passes when the model output satisfies ScanResponseSchema, focusPolygon containment, and expected winnerId", () => {
    const res = verifyPromptfooOutput(
      JSON.stringify({
        status: "ok",
        message: null,
        produce: { type: "watermelon", displayName: "Watermelon", variety: null },
        candidates: [
          { id: "c1", box: [385, 370, 625, 655], score: 8.6, ripeness: "ripe", traits: ["Yellow field spot"], flipSummary: null },
        ],
        verdict: { winnerId: "c1", runnerUpId: null, confidence: "high", headline: "Buy it." },
        followUp: null,
        afterPurchase: {
          readyInDays: { min: 0, max: 0 },
          eatWithinDays: { min: 3, max: 5 },
          eatWithinLabel: "3–5 days",
          storage: {
            beforeCut: { where: "counter", whereLabel: "Counter", summary: "Counter · whole", tip: "Room temp" },
            afterCut: { where: "fridge", whereLabel: "Fridge", summary: "Fridge · wrapped", tip: "Wrap" },
          },
        },
      }),
      {
        vars: {
          round: 1,
          expectedProduceType: "watermelon",
          focusPolygon: [[200, 200], [800, 200], [800, 800], [200, 800]],
        },
      }
    );
    expect(res.pass).toBe(true);
  });
});
```

- [ ] **Step 2: Run eval assertion test to verify it fails**

Run: `pnpm --filter @pomona/evals test`
Expected: FAIL with module `../assertions/verify-contract` not found.

- [ ] **Step 3: Implement `packages/evals` and `scripts/setup-cloudflare.sh`**

Implement `verifyPromptfooOutput` calling `verifyAndResolveScanResponse`, configure `promptfooconfig.yaml` comparing `google:gemini-2.5-flash`, `google:gemini-2.5-flash-lite`, and `openai:gpt-4o-mini` across Round 1 pile, Round 1 drawn `focusPolygon`, Round 2 Runner-Up flip, and Round 3 1st Pick final flip cases, and create `scripts/setup-cloudflare.sh` (verifying `wrangler whoami`, creating `POMONA_QUOTA_KV`, patching `apps/proxy/wrangler.jsonc`, setting secrets, building `@pomona/web`, and deploying via `wrangler deploy`).

- [ ] **Step 4: Run full monorepo unit, integration, and E2E test suites**

Run: `pnpm test && pnpm --filter @pomona/web test:e2e && pnpm build`
Expected: All unit, integration, eval-assertion, and Playwright E2E tests PASS, and `pnpm build` succeeds cleanly.

- [ ] **Step 5: Commit**

```bash
git add packages/evals scripts/setup-cloudflare.sh package.json pnpm-lock.yaml
git commit -m "feat(evals,ops): add promptfoo contract evals and automated Cloudflare setup script"
```
