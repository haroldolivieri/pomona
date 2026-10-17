import type { ScanRequest, ScanResponse } from "@pomona/contract";
import type { PomonaApiClient, QuotaInfo } from "./api-client";

export function createMockApiClient(): PomonaApiClient {
  let mockRemainingScans = 10;

  return {
    async getQuota(): Promise<QuotaInfo> {
      return {
        remainingDeviceScans: mockRemainingScans,
        budgetOpen: true,
      };
    },

    async overrideQuota(
      params: { remainingScans?: number; deviceDailyLimit?: number; reset?: boolean } | number
    ) {
      if (typeof params === "number") {
        mockRemainingScans = Math.max(0, params);
      } else if (params.reset) {
        mockRemainingScans = 10;
      } else if (typeof params.remainingScans === "number") {
        mockRemainingScans = Math.max(0, params.remainingScans);
      }
      return {
        success: true,
        deviceId: "mock-device-id",
        deviceLimit: 10,
        remainingDeviceScans: mockRemainingScans,
      };
    },

    async submitScan(request: ScanRequest): Promise<{
      remainingScans: number;
      response: ScanResponse;
    }> {
      // Simulate natural AI latency (800ms)
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Allow simulating error states via localStorage in mock mode
      let forcedError: string | null = null;
      try {
        if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
          forcedError = localStorage.getItem("pomona-force-error");
        }
      } catch {}

      if (forcedError === "unclear_photo") {
        return {
          remainingScans: mockRemainingScans, // Errors do not burn daily quota
          response: {
            schemaVersion: "1.0",
            promptVersion: "v1",
            modelId: "gemini-2.5-flash (mocked)",
            round: request.round,
            status: "unclear_photo",
            message: "The captured photo is too blurry or dark to accurately grade produce ripeness.",
            produce: null,
            candidates: [],
            verdict: null,
            followUp: null,
            afterPurchase: null,
          },
        };
      }

      if (forcedError === "no_produce") {
        return {
          remainingScans: mockRemainingScans, // Errors do not burn daily quota
          response: {
            schemaVersion: "1.0",
            promptVersion: "v1",
            modelId: "gemini-2.5-flash (mocked)",
            round: request.round,
            status: "no_produce",
            message: "Couldn't spot any produce clearly. Move closer and try again.",
            produce: null,
            candidates: [],
            verdict: null,
            followUp: null,
            afterPurchase: null,
          },
        };
      }

      // Successful scans decrement daily scan quota
      mockRemainingScans = Math.max(0, mockRemainingScans - 1);

      if (request.round === 1) {
        // Round 1 mock: Watermelon pile with 2 candidates (winner & runner-up)
        // If focusPolygon was drawn, candidates fit inside it or central crop
        return {
          remainingScans: mockRemainingScans,
          response: {
            schemaVersion: "1.0",
            promptVersion: "v1",
            modelId: "gemini-2.5-flash (mocked)",
            round: 1,
            status: "ok",
            message: null,
            produce: {
              type: "watermelon",
              displayName: "Watermelon",
              variety: null,
            },
            candidates: [
              {
                id: "c1",
                box: [360, 240, 680, 560],
                score: 8.6,
                ripeness: "ripe",
                traits: ["Creamy-yellow ground spot", "Matte rind", "Heavy web lines"],
                flipSummary: null,
              },
              {
                id: "c2",
                box: [320, 580, 660, 900],
                score: 8.1,
                ripeness: "almost_ripe",
                traits: ["Slightly glossy rind", "Small field spot"],
                flipSummary: null,
              },
              {
                id: "c3",
                box: [180, 420, 440, 720],
                score: 7.2,
                ripeness: "underripe",
                traits: ["Bright glossy green", "Small white spot"],
                flipSummary: null,
              },
              {
                id: "c4",
                box: [620, 310, 880, 610],
                score: 6.8,
                ripeness: "underripe",
                traits: ["Firm striped rind", "Chalky white spot"],
                flipSummary: null,
              },
            ],
            verdict: {
              winnerId: "c1",
              runnerUpId: "c2",
              confidence: "high",
              headline: "Buy this one.",
            },
            followUp: {
              targetCandidateId: "c2",
              targetRole: "runner_up",
              bannerText: "The blue-marked Watermelon could be sweeter. Flip it and snap.",
              flipHeadline: "Flip the Watermelon over",
              instruction: "Turn the blue-marked Watermelon to show its ground spot.",
            },
            afterPurchase: {
              readyInDays: { min: 0, max: 0 },
              eatWithinDays: { min: 4, max: 6 },
              eatWithinLabel: "4–6 days",
              storage: {
                beforeCut: {
                  where: "counter",
                  whereLabel: "Counter",
                  summary: "Counter · whole",
                  tip: "Keep out of direct sunlight",
                },
                afterCut: {
                  where: "fridge",
                  whereLabel: "Fridge",
                  summary: "Fridge · sealed",
                  tip: "Cover cut surface with wrap or store in airtight container",
                },
              },
            },
          },
        };
      }

      if (request.round === 2) {
        // Round 2 mock: Runner-Up took the lead (9.0 beats 8.6)
        return {
          remainingScans: mockRemainingScans,
          response: {
            schemaVersion: "1.0",
            promptVersion: "v1",
            modelId: "gemini-2.5-flash (mocked)",
            round: 2,
            status: "ok",
            message: null,
            produce: {
              type: "watermelon",
              displayName: "Watermelon",
              variety: null,
            },
            candidates: [
              {
                id: "c2",
                box: [150, 150, 850, 850],
                score: 9.0,
                ripeness: "ripe",
                traits: ["Deep buttery field spot", "Rich brown webbing", "Dull thud skin"],
                flipSummary: "deep creamy field spot with excellent webbing",
              },
            ],
            verdict: {
              winnerId: "c2",
              runnerUpId: "c1",
              confidence: "high",
              headline: "Buy this one.",
            },
            followUp: {
              targetCandidateId: "c1",
              targetRole: "first_pick",
              bannerText: "1st Winner (8.6) was only graded from the top. Flip it too for a fair final check, or take this one now.",
              flipHeadline: "Flip your 1st winner over",
              instruction: "Turn the yellow-marked Watermelon to show its underside.",
            },
            afterPurchase: {
              readyInDays: { min: 0, max: 0 },
              eatWithinDays: { min: 4, max: 6 },
              eatWithinLabel: "4–6 days",
              storage: {
                beforeCut: {
                  where: "counter",
                  whereLabel: "Counter",
                  summary: "Counter · whole",
                  tip: "Room temperature",
                },
                afterCut: {
                  where: "fridge",
                  whereLabel: "Fridge",
                  summary: "Fridge · sealed",
                  tip: "Keep chilled in container",
                },
              },
            },
          },
        };
      }

      // Round 3 mock: 1st Winner reclaims the win (9.3 beats 9.0)
      return {
        remainingScans: mockRemainingScans,
        response: {
          schemaVersion: "1.0",
          promptVersion: "v1",
          modelId: "gemini-2.5-flash (mocked)",
          round: 3,
          status: "ok",
          message: null,
          produce: {
            type: "watermelon",
            displayName: "Watermelon",
            variety: null,
          },
          candidates: [
            {
              id: "c1",
              box: [150, 150, 850, 850],
              score: 9.3,
              ripeness: "ripe",
              traits: ["Large golden field spot", "Heavy bee stings", "Dry brown stem"],
              flipSummary: "vibrant golden ground spot with extensive pollination scarring",
            },
          ],
          verdict: {
            winnerId: "c1",
            runnerUpId: "c2",
            confidence: "high",
            headline: "Buy your 1st winner.",
          },
          followUp: null,
          afterPurchase: {
            readyInDays: { min: 0, max: 0 },
            eatWithinDays: { min: 4, max: 6 },
            eatWithinLabel: "4–6 days",
            storage: {
              beforeCut: {
                where: "counter",
                whereLabel: "Counter",
                summary: "Counter · whole",
                tip: "Room temperature",
              },
              afterCut: {
                where: "fridge",
                whereLabel: "Fridge",
                summary: "Fridge · sealed",
                tip: "Wrap tightly",
              },
            },
          },
        },
      };
    },
  };
}
