import { z } from "zod";

export const PointSchema = z.tuple([
  z.number().int().min(0).max(1000), // x (0-1000)
  z.number().int().min(0).max(1000), // y (0-1000)
]);

export const BoundingBoxSchema = z.tuple([
  z.number().int().min(0).max(1000), // ymin
  z.number().int().min(0).max(1000), // xmin
  z.number().int().min(0).max(1000), // ymax
  z.number().int().min(0).max(1000), // xmax
]);

export const CandidateMemorySchema = z.object({
  id: z.string(),
  role: z.enum(["first_pick", "runner_up"]),
  score: z.number().min(0).max(10),
  ripeness: z.enum(["underripe", "almost_ripe", "ripe", "overripe"]),
  traits: z.array(z.string()).max(5),
  anglesInspected: z.number().int().min(1).max(2),
});

export const StorageStageSchema = z.object({
  where: z.enum(["counter", "fridge", "pantry", "cool_dark"]),
  whereLabel: z.string().max(24), // e.g. "Counter" / "Fridge"
  summary: z.string().max(32), // e.g. "Counter · whole" / "Fridge · wrapped"
  tip: z.string().max(90),
});

export const ProduceInfoSchema = z.object({
  type: z.string(), // normalized slug, e.g. "watermelon", "avocado"
  displayName: z.string(), // parameterized UI name, e.g. "Watermelon", "Hass Avocado"
  variety: z.string().nullable(),
});

export const CandidateSchema = z.object({
  id: z.string(), // e.g. "c1", "c2"; preserved across rounds
  box: BoundingBoxSchema, // [ymin, xmin, ymax, xmax] 0-1000
  score: z.number().min(0).max(10), // 1 decimal place
  ripeness: z.enum(["underripe", "almost_ripe", "ripe", "overripe"]),
  traits: z.array(z.string().max(28)).min(1).max(4), // e.g. ["Yellow field spot", "Matte rind", "Even form"]
  flipSummary: z.string().max(80).nullable(), // short note on Round 2/3 close-up, e.g. "pale underside"
});

export const VerdictSchema = z.object({
  winnerId: z.string().nullable(),
  runnerUpId: z.string().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  headline: z.string().max(32), // e.g. "Buy it." / "Buy this one." / "Buy your 1st pick."
});

export const FollowUpSchema = z.object({
  targetCandidateId: z.string(),
  targetRole: z.enum(["runner_up", "first_pick"]),
  bannerText: z.string().max(110), // shown in the result sheet amber banner
  flipHeadline: z.string().max(48), // e.g. "Flip the Watermelon over"
  instruction: z.string().max(120), // produce-specific angle & trait to show next
});

export const AfterPurchaseSchema = z.object({
  readyInDays: z.object({ min: z.number().int().min(0), max: z.number().int().min(0) }),
  eatWithinDays: z.object({ min: z.number().int().min(1), max: z.number().int().min(1).max(60) }),
  eatWithinLabel: z.string().max(28), // e.g. "3–5 days"
  storage: z.object({
    beforeCut: StorageStageSchema,
    afterCut: StorageStageSchema,
  }),
});

export const TargetRipenessWindowSchema = z.enum([
  "ready_now",
  "in_2_3_days",
  "later_this_week",
]);
export type TargetRipenessWindow = z.infer<typeof TargetRipenessWindowSchema>;

// Server-injected seasonality (never part of ScanResponseModelSchema / the LLM prompt)
export const SeasonalityStatusSchema = z.enum(["peak", "in_season", "off_season", "imported_year_round"]);

export const OriginSeasonOptionSchema = z.object({
  code: z.string(), // e.g. "BR", "PE", "ES"
  name: z.string(), // e.g. "Brazil"
  flag: z.string(), // e.g. "🇧🇷"
  status: SeasonalityStatusSchema,
  peakWindowLabel: z.string(), // e.g. "Oct–Jan", "Year-round"
  badgeText: z.string().max(48),
  noteText: z.string().max(90),
});

export const SeasonalityInfoSchema = z.object({
  produceSlug: z.string(),
  month: z.number().int().min(1).max(12),
  shopperCountry: z.string(),
  shopperZone: z.string(),
  status: SeasonalityStatusSchema,
  peakWindowLabel: z.string(),
  badgeText: z.string().max(48),
  noteText: z.string().max(90),
  origins: z.array(OriginSeasonOptionSchema).max(8),
});


export const ScanRequestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  sessionId: z.string().uuid(),
  round: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  locale: z.string().default("en-GB"),
  imageBase64: z.string(), // compressed <=768px WebP/JPEG
  imageMimeType: z.enum(["image/webp", "image/jpeg"]),
  focusPolygon: z.array(PointSchema).min(3).max(40).nullable(), // normalized 0-1000 in uploaded image space
  followUpContext: z
    .object({
      produceType: z.string(),
      produceDisplayName: z.string(),
      targetCandidateId: z.string(),
      targetRole: z.enum(["runner_up", "first_pick"]),
      requestedInstruction: z.string(),
      previousWinner: CandidateMemorySchema,
      previousRunnerUp: CandidateMemorySchema,
      targetRipeness: TargetRipenessWindowSchema.optional(),
    })
    .nullable(), // non-null on rounds 2 and 3
});

export const ModelStatusSchema = z.enum([
  "ok",
  "no_produce",
  "unclear_photo",
  "multiple_types",
  "analysis_failed",
]);

export const ScanStatusSchema = z.enum([
  "ok",
  "no_produce",
  "unclear_photo",
  "multiple_types",
  "analysis_failed",
  "rate_limited",
]);

// Model schema: omits server-injected fields (schemaVersion, promptVersion, modelId, round) for LLM generateObject calls
export const ScanResponseModelSchema = z.object({
  status: ModelStatusSchema,
  message: z.string().max(160).nullable(),
  produce: ProduceInfoSchema.nullable(),
  candidates: z.array(CandidateSchema),
  verdict: VerdictSchema.nullable(),
  followUp: FollowUpSchema.nullable(),
  afterPurchase: AfterPurchaseSchema.nullable(),
});

// Full response schema: includes server-injected metadata + rate_limited status
export const ScanResponseSchema = z.object({
  schemaVersion: z.literal("1.0"),
  promptVersion: z.string(),
  modelId: z.string(),
  round: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  status: ScanStatusSchema,
  message: z.string().max(160).nullable(),
  produce: ProduceInfoSchema.nullable(),
  candidates: z.array(CandidateSchema),
  verdict: VerdictSchema.nullable(),
  followUp: FollowUpSchema.nullable(),
  afterPurchase: AfterPurchaseSchema.nullable(),
  seasonality: SeasonalityInfoSchema.nullable().optional(),
});

export type Point = z.infer<typeof PointSchema>;
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;
export type CandidateMemory = z.infer<typeof CandidateMemorySchema>;
export type StorageStage = z.infer<typeof StorageStageSchema>;
export type ProduceInfo = z.infer<typeof ProduceInfoSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type FollowUp = z.infer<typeof FollowUpSchema>;
export type AfterPurchase = z.infer<typeof AfterPurchaseSchema>;
export type SeasonalityStatus = z.infer<typeof SeasonalityStatusSchema>;
export type OriginSeasonOption = z.infer<typeof OriginSeasonOptionSchema>;
export type SeasonalityInfo = z.infer<typeof SeasonalityInfoSchema>;
export type ModelStatus = z.infer<typeof ModelStatusSchema>;
export type ScanStatus = z.infer<typeof ScanStatusSchema>;
export type ScanRequest = z.infer<typeof ScanRequestSchema>;
export type ScanResponse = z.infer<typeof ScanResponseSchema>;
export type ScanResponseModel = z.infer<typeof ScanResponseModelSchema>;
